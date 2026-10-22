'use strict';

const { test, expect } = require('@playwright/test');

const cliente = { id: 30, nome: 'Marina Cliente', email: 'marina@teste.local', tipo: 'cliente' };

async function responderJson(route, body, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function autenticarPelaTela(page, usuario = cliente) {
  await page.route('**/api/login', (route) => responderJson(route, { token: 'token-e2e-seguro', usuario }));
  await page.goto('/login.html');
  await page.locator('#email').fill(usuario.email);
  await page.getByLabel('Senha', { exact: true }).fill('Senha@Forte2026');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('cliente cria conta e entra no portal', async ({ page }) => {
  let cadastroRecebido;
  await page.route('**/api/cadastro', async (route) => {
    cadastroRecebido = route.request().postDataJSON();
    await responderJson(route, { mensagem: 'Cadastro realizado com sucesso.' }, 201);
  });

  await page.goto('/cadastro.html');
  await page.getByLabel(/nome/i).fill('Marina Cliente');
  await page.getByLabel('E-mail').fill(cliente.email);
  const senhas = page.locator('input[type="password"]');
  await senhas.nth(0).fill('Senha@Forte2026');
  await senhas.nth(1).fill('Senha@Forte2026');
  await page.getByRole('button', { name: /criar|cadastrar/i }).click();

  await expect(page.getByRole('status')).toContainText(/cadastro realizado/i);
  expect(cadastroRecebido).toEqual({ nome: 'Marina Cliente', email: cliente.email, senha: 'Senha@Forte2026' });
  await expect(page).toHaveURL(/login\.html/);

  await autenticarPelaTela(page);
  await expect(page).toHaveURL(/cliente\.html/);
  await expect(page.getByText(/acompanhe seus serviços/i)).toBeVisible();
});

test('cliente abre solicitação e acompanha o protocolo', async ({ page }) => {
  const solicitacoes = [];
  let payloadCriado;
  await page.route('**/api/auditoria/meus-atendimentos', (route) => responderJson(route, []));
  await page.route('**/api/solicitacoes', async (route) => {
    if (route.request().method() === 'POST') {
      payloadCriado = route.request().postDataJSON();
      solicitacoes.push({ ...payloadCriado, id: 81 });
      return responderJson(route, { id: 81, mensagem: 'Solicitação criada.' }, 201);
    }
    return responderJson(route, solicitacoes);
  });

  await autenticarPelaTela(page);
  await page.getByRole('button', { name: /novo atendimento/i }).click();
  await page.getByLabel(/nome completo/i).fill(cliente.nome);
  await page.getByLabel(/telefone/i).fill('(11) 99999-0000');
  await page.getByLabel(/marca e modelo/i).fill('Honda Civic');
  await page.getByLabel(/^ano/i).fill('2022');
  await page.getByLabel(/placa/i).fill('abc1d23');
  await page.getByLabel(/relato do problema/i).fill('Ruído metálico ao frear em baixa velocidade.');
  await page.getByLabel(/nível de urgência/i).selectOption('Alta');
  await page.getByRole('button', { name: /registrar solicitação/i }).click();

  await expect(page.getByRole('status')).toContainText(/registrada/i);
  await expect(page).toHaveURL(/cliente\.html/);
  await expect(page.getByText('SOL-81')).toBeVisible();
  await expect(page.getByText('Honda Civic')).toBeVisible();
  expect(payloadCriado).toMatchObject({ nomeCliente: cliente.nome, emailCliente: cliente.email, placa: 'ABC1D23', status: 'Pendente', urgencia: 'Alta' });
});

test('cliente aprova orçamento e vê o novo estado', async ({ page }) => {
  const solicitacao = { id: 92, nomeCliente: cliente.nome, emailCliente: cliente.email, veiculo: 'Toyota Corolla', problema: 'Revisão preventiva', status: 'Aguardando Aprovação', custoSugerido: 850, dataCriacao: '2026-08-13T12:00:00.000Z' };
  let decisao;
  await page.route('**/api/auditoria/meus-atendimentos', (route) => responderJson(route, []));
  await page.route('**/api/solicitacoes/92', async (route) => {
    decisao = route.request().postDataJSON();
    solicitacao.status = decisao.status;
    await responderJson(route, solicitacao);
  });
  await page.route('**/api/solicitacoes', (route) => responderJson(route, [solicitacao]));

  page.on('dialog', (dialog) => dialog.accept());
  await autenticarPelaTela(page);
  await expect(page.getByText('R$ 850,00')).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar' }).click();

  await expect(page.getByRole('status')).toContainText(/aceito/i);
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
  expect(decisao).toEqual({ status: 'Aprovado' });
});

test('cliente avalia um atendimento concluído', async ({ page }) => {
  const solicitacao = { id: 103, nomeCliente: cliente.nome, emailCliente: cliente.email, veiculo: 'Jeep Renegade', problema: 'Revisão concluída', status: 'Concluído', dataCriacao: '2026-08-20T12:00:00.000Z' };
  let avaliacao;
  await page.route('**/api/auditoria/meus-atendimentos', (route) => responderJson(route, []));
  await page.route('**/api/solicitacoes/103/avaliacao', async (route) => {
    avaliacao = route.request().postDataJSON();
    solicitacao.avaliacaoNota = avaliacao.nota;
    solicitacao.avaliacaoComentario = avaliacao.comentario;
    await responderJson(route, { mensagem: 'Obrigado pela sua avaliação.' }, 201);
  });
  await page.route('**/api/solicitacoes', (route) => responderJson(route, [solicitacao]));

  await autenticarPelaTela(page);
  await page.getByRole('link', { name: /histórico/i }).click();
  await page.getByRole('radio', { name: '5 estrelas' }).click();
  await page.getByLabel('Comentário sobre o atendimento').fill('Equipe cuidadosa e pontual.');
  await page.getByRole('button', { name: 'Enviar avaliação' }).click();

  await expect(page.getByRole('status')).toContainText(/obrigado/i);
  await expect(page.getByText('Sua avaliação: ★★★★★', { exact: true })).toBeVisible();
  expect(avaliacao).toEqual({ nota: 5, comentario: 'Equipe cuidadosa e pontual.' });
});

test('sessão inválida em página protegida volta ao login', async ({ page }) => {
  await page.goto('/novasoli.html');
  await expect(page).toHaveURL(/login\.html/);
});

test('cliente e gerente usam sessões independentes em duas abas do mesmo navegador', async ({ context }) => {
  const ids = { gerente: 'a'.repeat(32), cliente: 'b'.repeat(32) };
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (request.url().endsWith('/login')) {
      const tipo = request.postDataJSON().email.startsWith('gerente') ? 'gerente' : 'cliente';
      return responderJson(route, { sessionId: ids[tipo], usuario: { id: tipo === 'gerente' ? 1 : 2, nome: tipo, email: `${tipo}@teste.local`, tipo } });
    }
    if (request.url().endsWith('/prova-sessao')) return responderJson(route, { sessionId: request.headers()['x-autoassis-session'] });
    return responderJson(route, []);
  });
  const gerente = await context.newPage();
  const cliente = await context.newPage();
  for (const [tipo, page] of [['gerente', gerente], ['cliente', cliente]]) {
    await page.goto('/login.html');
    await page.locator('#email').fill(`${tipo}@teste.local`);
    await page.getByLabel('Senha', { exact: true }).fill('Abas@2026');
    await page.locator('#submitBtn').click();
    await expect(page).toHaveURL(tipo === 'gerente' ? /dashboard.html/ : /cliente.html/);
  }
  const sessao = page => page.evaluate(async () => (await (await fetch('/api/prova-sessao')).json()).sessionId);
  expect(await sessao(gerente)).toBe(ids.gerente);
  expect(await sessao(cliente)).toBe(ids.cliente);
  await gerente.reload();
  expect(await sessao(gerente)).toBe(ids.gerente);
  await cliente.evaluate(() => window.apiAuth.logout());
  await expect(cliente).toHaveURL(/login.html/);
  expect(await sessao(gerente)).toBe(ids.gerente);
});
