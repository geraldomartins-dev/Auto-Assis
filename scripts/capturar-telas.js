'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');

const raiz = path.join(__dirname, '..');
const saida = path.join(raiz, 'prints-do-sistema');
fs.mkdirSync(saida, { recursive: true });

const pecas = [
  { id: 1, codigo: 'FLT-001', nome: 'Filtro de óleo', categoria: 'Filtros', quantidade: 18, estoque_minimo: 5, preco: 42.9, localizacao: 'A1' },
  { id: 2, codigo: 'PAS-014', nome: 'Pastilha de freio dianteira', categoria: 'Freios', quantidade: 3, estoque_minimo: 6, preco: 189.9, localizacao: 'B3' },
  { id: 3, codigo: 'OLE-520', nome: 'Óleo 5W30 sintético', categoria: 'Lubrificantes', quantidade: 24, estoque_minimo: 10, preco: 55.0, localizacao: 'C2' }
];

const movimentacoes = [
  { id: 1, peca_id: 1, peca_nome: 'Filtro de óleo', tipo: 'Entrada', quantidade: 10, motivo: 'Reposição do fornecedor', responsavel: 'Rafael Oliveira', data: '2026-09-14T09:15:00' },
  { id: 2, peca_id: 2, peca_nome: 'Pastilha de freio dianteira', tipo: 'Saída', quantidade: 2, motivo: 'OS-2026-0042', responsavel: 'Carlos Souza', data: '2026-09-14T10:40:00' },
  { id: 3, peca_id: 3, peca_nome: 'Óleo 5W30 sintético', tipo: 'Saída', quantidade: 4, motivo: 'Troca de óleo', responsavel: 'Carlos Souza', data: '2026-09-13T16:20:00' }
];

const solicitacoes = [
  { id: 42, numero_os: 'OS-2026-0042', cliente_id: 7, cliente_nome: 'Mariana Alves', cliente_email: 'mariana@exemplo.com', telefone: '(11) 99999-1234', veiculo: 'Honda Civic 2020', placa: 'ABC1D23', servico: 'Revisão completa e troca de pastilhas', descricao: 'Ruído ao frear e revisão de 60 mil km.', status: 'Em andamento', custo: 780, valor_orcamento: 780, data: '2026-09-12T11:00:00', criado_em: '2026-09-12T11:00:00' },
  { id: 43, numero_os: 'OS-2026-0043', cliente_id: 8, cliente_nome: 'João Martins', cliente_email: 'joao@exemplo.com', telefone: '(11) 98888-1122', veiculo: 'Volkswagen Polo 2022', placa: 'DEF4G56', servico: 'Diagnóstico de suspensão', descricao: 'Barulho na dianteira em ruas irregulares.', status: 'Aguardando orçamento', custo: 0, valor_orcamento: null, data: '2026-09-14T08:30:00', criado_em: '2026-09-14T08:30:00' },
  { id: 44, numero_os: 'OS-2026-0044', cliente_id: 7, cliente_nome: 'Mariana Alves', cliente_email: 'mariana@exemplo.com', telefone: '(11) 99999-1234', veiculo: 'Honda Civic 2020', placa: 'ABC1D23', servico: 'Alinhamento e balanceamento', descricao: 'Manutenção preventiva.', status: 'Concluído', custo: 220, valor_orcamento: 220, data: '2026-09-02T14:00:00', criado_em: '2026-09-02T14:00:00', avaliacao_nota: 5, avaliacao_comentario: 'Atendimento excelente.' }
];

const auditoria = {
  itens: [
    { id: 1, acao: 'MOVIMENTACAO_ESTOQUE', entidade: 'peca', entidade_id: 2, autor_nome: 'Carlos Souza', autor_tipo: 'mecanico', ip: '127.0.0.1', criado_em: '2026-09-14T10:40:00', antes: { quantidade: 5 }, depois: { quantidade: 3 } },
    { id: 2, acao: 'STATUS_ATENDIMENTO', entidade: 'solicitacao', entidade_id: 42, autor_nome: 'Rafael Oliveira', autor_tipo: 'gerente', ip: '127.0.0.1', criado_em: '2026-09-14T09:50:00', antes: { status: 'Aprovado' }, depois: { status: 'Em andamento' } }
  ], total: 2, pagina: 1, limite: 20
};

const historicoCliente = [
  { id: 1, solicitacao_id: 42, acao: 'STATUS_ATENDIMENTO', criado_em: '2026-09-14T09:50:00', antes: { status: 'Aprovado' }, depois: { status: 'Em andamento' } }
];

function respostaApi(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/api/pecas') return pecas;
  if (pathname === '/api/movimentacoes') return movimentacoes;
  if (pathname === '/api/solicitacoes') return solicitacoes;
  if (pathname === '/api/auditoria') return auditoria;
  if (pathname === '/api/auditoria/meus-atendimentos') return historicoCliente;
  if (pathname === '/api/equipe') return [
    { id: 1, nome: 'Rafael Oliveira', email: 'rafael@oficina.com', tipo: 'gerente' },
    { id: 2, nome: 'Carlos Souza', email: 'carlos@oficina.com', tipo: 'mecanico' }
  ];
  if (pathname === '/api/configuracao-oficina') return { nome: 'Auto+Assis Centro Automotivo', documento: '12.345.678/0001-90', telefone: '(11) 3333-4444', email: 'contato@autoassis.com.br', endereco: 'Av. das Oficinas, 1000 - São Paulo/SP' };
  if (pathname === '/api/consultas/resumo-operacional') return { pecas_baixo_estoque: 1, servicos_abertos: 2, movimentacoes_hoje: 2, concluidos_mes: 8 };
  if (pathname === '/api/avaliacoes/resumo') return { media: 4.8, total: 12, distribuicao: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 10 } };
  if (pathname === '/api/informacoes-legais') return { oficina_nome: 'Auto+Assis Centro Automotivo', privacy_email: 'privacidade@autoassis.com.br', terms_city: 'São Paulo' };
  return [];
}

async function main() {
  const app = express();
  app.use(express.static(raiz, { index: 'login.html' }));
  const servidor = await new Promise((resolve, reject) => {
    const instancia = app.listen(4173, '127.0.0.1', () => resolve(instancia));
    instancia.once('error', reject);
  });

  const chromeLocal = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch(fs.existsSync(chromeLocal) ? { executablePath: chromeLocal } : {});
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo' });
  await contexto.addInitScript(() => localStorage.setItem('autoassis:theme', 'light'));
  const page = await contexto.newPage();
  await page.route('**/api/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(respostaApi(route.request().url())) }));

  const telas = [
    ['01-login', '/login.html', null],
    ['02-cadastro-cliente', '/cadastro.html', null],
    ['03-recuperar-senha', '/recuperar.html', null],
    ['04-nova-senha', '/nova-senha.html?token=demonstracao', null],
    ['05-dashboard-gerente', '/dashboard.html', 'gerente'],
    ['06-estoque', '/estoque.html', 'gerente'],
    ['07-nova-peca', '/criarpeca.html', 'gerente'],
    ['08-movimentacoes', '/movimentacao.html', 'gerente'],
    ['09-nova-movimentacao', '/novamovimentacao.html', 'gerente'],
    ['10-servicos', '/servicos.html', 'gerente'],
    ['11-nova-ordem-servico', '/novaos.html', 'gerente'],
    ['12-gerenciar-solicitacao', '/gerenciar_solicitacao.html?id=42', 'gerente'],
    ['13-relatorios', '/relatorio.html', 'gerente'],
    ['14-consultas', '/consultas.html', 'gerente'],
    ['15-equipe-e-permissoes', '/gerentes.html', 'gerente'],
    ['16-auditoria', '/auditoria.html', 'gerente'],
    ['17-dashboard-mecanico', '/dashboard.html', 'mecanico'],
    ['18-portal-cliente', '/cliente.html', 'cliente'],
    ['19-nova-solicitacao-cliente', '/novasoli.html', 'cliente'],
    ['20-termos-de-uso', '/termos-uso.html', null],
    ['21-politica-de-privacidade', '/politica-privacidade.html', null]
  ];

  for (const [nome, url, tipo] of telas) {
    await page.goto('http://127.0.0.1:4173/login.html');
    await page.evaluate((perfil) => {
      sessionStorage.clear();
      if (perfil) {
        sessionStorage.setItem('authToken', 'modo-apresentacao');
        sessionStorage.setItem('authUsuario', JSON.stringify({ id: perfil === 'cliente' ? 7 : 1, nome: perfil === 'cliente' ? 'Mariana Alves' : perfil === 'mecanico' ? 'Carlos Souza' : 'Rafael Oliveira', email: `${perfil}@exemplo.com`, tipo: perfil }));
      }
    }, tipo);
    await page.goto(`http://127.0.0.1:4173${url}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(saida, `${nome}.png`), fullPage: true });
    process.stdout.write(`${nome}.png\n`);
  }

  await browser.close();
  await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
