'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { app, pool } = require('../server');

const originals = { execute: pool.execute, getConnection: pool.getConnection };
let server;
let baseUrl;

function token(tipo, id) {
  const payload = { aud: 'autoassis', sub: id, nome: 'Cliente Teste', email: `${tipo}@teste.local`, tipo, ver: 1, exp: Math.floor(Date.now() / 1000) + 300 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterEach(() => {
  pool.execute = originals.execute;
  pool.getConnection = originals.getConnection;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test('cliente avalia uma única OS concluída sem expor a rota à equipe', async () => {
  pool.execute = async () => [[{ id: 3, nome: 'Cliente Teste', email: 'cliente@teste.local', tipo: 'cliente', auth_version: 1 }], []];
  const calls = [];
  pool.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push(sql);
      if (sql.includes('SELECT id, status FROM solicitacoes')) return [[{ id: 42, status: 'Concluído' }], []];
      if (sql.includes('INSERT INTO pesquisas_satisfacao')) {
        assert.deepEqual(params, [42, 3, 5, 'Atendimento excelente']);
        return [{ insertId: 1 }, []];
      }
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 2 }, []];
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  });

  const response = await fetch(`${baseUrl}/api/solicitacoes/42/avaliacao`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token('cliente', 3)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nota: 5, comentario: 'Atendimento excelente' })
  });
  assert.equal(response.status, 201);
  assert.equal(calls.includes('commit'), true);

  pool.execute = async () => [[{ id: 1, nome: 'Gerente', email: 'gerente@teste.local', tipo: 'gerente', auth_version: 1 }], []];
  const forbidden = await fetch(`${baseUrl}/api/solicitacoes/42/avaliacao`, {
    method: 'POST', headers: { Authorization: `Bearer ${token('gerente', 1)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nota: 5 })
  });
  assert.equal(forbidden.status, 403);
});

test('avaliação exige nota de 1 a 5', async () => {
  pool.execute = async () => [[{ id: 3, nome: 'Cliente Teste', email: 'cliente@teste.local', tipo: 'cliente', auth_version: 1 }], []];
  const response = await fetch(`${baseUrl}/api/solicitacoes/42/avaliacao`, {
    method: 'POST', headers: { Authorization: `Bearer ${token('cliente', 3)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nota: 6 })
  });
  assert.equal(response.status, 400);
});
