'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (nome) => fs.readFileSync(path.join(raiz, nome), 'utf8');

test('schema e migração criam a trilha de auditoria sem vínculo destrutivo', () => {
  const schema = ler('autoassis_db.sql');
  const migration = ler('scripts/migrate.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS auditoria/);
  assert.match(schema, /dadosAntes JSON/);
  assert.match(schema, /dadosDepois JSON/);
  assert.doesNotMatch(schema.match(/CREATE TABLE IF NOT EXISTS auditoria[\s\S]*?ENGINE=InnoDB/)?.[0] || '', /FOREIGN KEY/);
  assert.match(migration, /1\.2\.0_auditoria/);
});

test('movimentação atualiza estoque e registra auditoria na mesma transação', () => {
  const server = ler('server.js');
  const rota = server.match(/app\.post\('\/api\/movimentacoes'[\s\S]*?\n\}\)\);/)?.[0] || '';
  assert.match(rota, /beginTransaction/);
  assert.match(rota, /UPDATE pecas SET quantidade/);
  assert.match(rota, /registrarAuditoria\(conn, req/);
  assert.match(rota, /acao: 'MOVIMENTAR'/);
  assert.ok(rota.indexOf('registrarAuditoria') < rota.indexOf('commit()'));
});

test('tela de auditoria é exclusiva do gerente e renderiza dados como texto', () => {
  const html = ler('auditoria.html');
  const auth = ler('auth.js');
  assert.match(auth, /paginasGerente[\s\S]*auditoria\.html/);
  assert.match(html, /textContent = registro\.resumo/);
  assert.doesNotMatch(html, /innerHTML/);
});

test('UI confirma antes de descartar alterações não salvas', () => {
  const ui = ler('ui.js');
  assert.match(ui, /beforeunload/);
  assert.match(ui, /Descartar alterações e sair/);
  assert.match(ui, /productUI\.markSaved/);
});
