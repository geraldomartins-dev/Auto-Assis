'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('mecânico recebe permissão e navegação para consultas operacionais', () => {
  const auth = ler('auth.js');
  const ui = ler('ui.js');
  const blocoMecanico = auth.match(/mecanico:\s*\[([\s\S]*?)\]\s*,\s*cliente:/)?.[1] || '';
  const navegacaoMecanico = ui.match(/const mechanicNavigation = \[([\s\S]*?)\];/)?.[1] || '';
  const navegacaoCliente = ui.match(/const clientNavigation = \[([\s\S]*?)\];/)?.[1] || '';

  assert.match(blocoMecanico, /'consultations\.read'/);
  assert.match(navegacaoMecanico, /\['consultas\.html', 'Consultas'\]/);
  assert.doesNotMatch(navegacaoCliente, /consultas\.html/);
  assert.match(auth, /const paginasOperacionais = new Set\(\[[\s\S]*?'consultas\.html'/);

  const blocoGerente = auth.match(/const paginasGerente = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.doesNotMatch(blocoGerente, /consultas\.html/);
});

test('consultas protege os dados financeiros do mecânico e explica a restrição', () => {
  const pagina = ler('consultas.html');
  const botoesFinanceiros = pagina.match(/<button[^>]+data-financial-consultation/g) || [];

  assert.match(pagina, /requireAuth\(\['gerente', 'mecanico'\]\)/);
  assert.equal(botoesFinanceiros.length, 2);
  botoesFinanceiros.forEach((botao) => assert.match(botao, /data-manager-only/));
  assert.match(pagina, /Valores de estoque e faturamento ficam restritos ao gerente/);
  assert.match(pagina, /fetch\(`\$\{API_BASE\}\/consultas\/resumo-operacional`\)/);
  assert.match(pagina, /if \(ehMecanico\)[\s\S]*?Consulta financeira restrita ao perfil de gerente/);
  assert.match(pagina, /if \(ehMecanico\)[\s\S]*?dados pessoais permanecem restritos/);
  assert.doesNotMatch(pagina, /localStorage\.getItem\('nomeGerenteLogado'\)/);
});

test('backend já filtra preço e custo das respostas destinadas ao mecânico', () => {
  const servidor = ler('server.js');
  const rotaPecas = servidor.slice(
    servidor.indexOf("app.get('/api/pecas'"),
    servidor.indexOf("app.post('/api/pecas'")
  );
  const rotaSolicitacoes = servidor.slice(
    servidor.indexOf("app.get('/api/solicitacoes'"),
    servidor.indexOf("app.post('/api/solicitacoes'")
  );

  assert.match(rotaPecas, /req\.usuario\.tipo === 'gerente'/);
  assert.match(rotaPecas, /: 'id, nome, descricao, categoria, localizacao, quantidade, min'/);
  assert.match(rotaSolicitacoes, /req\.usuario\.tipo === 'mecanico'/);

  const selecaoMecanico = rotaSolicitacoes.match(/if \(req\.usuario\.tipo === 'mecanico'\) \{([\s\S]*?)return res\.json\(rows\);/)?.[1] || '';
  assert.doesNotMatch(selecaoMecanico, /custoSugerido/);
  assert.doesNotMatch(selecaoMecanico, /orcamentoHash|decisao/i);
});
