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

test('cliente recebe somente o histórico dos próprios atendimentos sem dados internos', () => {
  const server = ler('server.js');
  const rota = server.match(/app\.get\('\/api\/auditoria\/meus-atendimentos'[\s\S]*?\n\}\)\);/)?.[0] || '';
  assert.match(rota, /s\.emailCliente = \?/);
  assert.match(rota, /CASE a\.usuarioTipo WHEN 'cliente' THEN 'Você' ELSE 'Oficina'/);
  assert.doesNotMatch(rota.match(/res\.json[\s\S]*/)?.[0] || '', /usuarioEmail|\bip\b|usuarioNome/);
});

test('mecânico cadastra peça com preço protegido e autoria auditada', () => {
  const server = ler('server.js');
  const rota = server.match(/app\.post\('\/api\/pecas'[\s\S]*?\n\}\)\);/)?.[0] || '';
  assert.match(rota, /somenteEquipe/);
  assert.match(rota, /req\.usuario\.tipo === 'gerente'[^\n]+: 0/);
  assert.match(rota, /registrarAuditoria\(conn, req/);
});

test('arquivamento de serviço pertence à equipe, persiste no banco e gera auditoria', () => {
  const server = ler('server.js');
  const auth = ler('auth.js');
  const servicos = ler('servicos.html');
  const cliente = ler('cliente.html');
  assert.match(auth, /'services\.quote'/);
  assert.match(auth, /'services\.archive'/);
  assert.match(server, /\/api\/solicitacoes\/:id\/arquivar'[\s\S]*somenteEquipe/);
  assert.match(server, /acao: 'ARQUIVAR'/);
  assert.match(servicos, /\/api\/solicitacoes\/\$\{Number\(id\)\}\/arquivar/);
  assert.doesNotMatch(cliente, /Ocultar registro|lerOcultosCliente|salvarOcultosCliente/);
});

test('login e portal do cliente priorizam somente conteúdo essencial', () => {
  const login = ler('login.html');
  const cliente = ler('cliente.html');
  assert.doesNotMatch(login, /<div class="rail-spec"|Terminal \/ acesso|<div class="station-index"|<footer class="station-footer"/);
  assert.match(login, />Acesse sua conta</);
  assert.doesNotMatch(cliente, /<div class="client-module-tag"|<div class="document-code"|>Atualizar dados<|<section class="service-ledger"/);
  assert.match(cliente, />Novo atendimento</);
  assert.match(cliente, /id="contPendente"/);
});
