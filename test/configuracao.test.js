'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.join(__dirname, '..');
const baseProducao = {
  ...process.env,
  NODE_ENV: 'production',
  AUTH_SECRET: 'uma-chave-realmente-aleatoria-com-mais-de-32-caracteres',
  FRONTEND_URL: 'https://autoassis.exemplo.com',
  CORS_ORIGIN: 'https://autoassis.exemplo.com',
  DB_USER: 'autoassis_app',
  DB_PASSWORD: 'senha-de-banco-forte-2026',
  SMTP_USER: 'smtp@exemplo.com',
  SMTP_PASSWORD: 'senha-smtp-forte',
  SMTP_FROM: 'Auto+Assis <smtp@exemplo.com>',
  SMTP_REPLY_TO: 'suporte@exemplo.com'
};

function carregarServidor(env) {
  return spawnSync(
    process.execPath,
    ['-e', "require('./server').pool.end()"],
    { cwd: raiz, env, encoding: 'utf8', timeout: 15_000 }
  );
}

test('produção rejeita segredo de autenticação fraco', () => {
  const resultado = carregarServidor({ ...baseProducao, AUTH_SECRET: 'curta' });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /AUTH_SECRET/i);
});

test('produção exige HTTPS', () => {
  const resultado = carregarServidor({
    ...baseProducao,
    FRONTEND_URL: 'http://autoassis.exemplo.com',
    CORS_ORIGIN: 'http://autoassis.exemplo.com'
  });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /HTTPS/i);
});

test('produção aceita configuração mínima segura', () => {
  const resultado = carregarServidor(baseProducao);
  assert.equal(resultado.status, 0, resultado.stderr);
});

test('rejeita SMTP_REPLY_TO inválido quando configurado', () => {
  const resultado = carregarServidor({ ...baseProducao, SMTP_REPLY_TO: 'resposta-invalida' });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /SMTP_REPLY_TO/i);
});
