'use strict';
const { test, expect } = require('@playwright/test');
async function equipe(page, tipo = 'gerente') {
  await page.addInitScript((tipo) => {
    sessionStorage.setItem('authToken', 'teste-interface');
    sessionStorage.setItem('authUsuario', JSON.stringify({ id: 1, nome: 'Rafael Oliveira', email: 'rafael@teste.local', tipo }));
  }, tipo);
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
}
test('painel conta o dia local e não desenha movimentações inexistentes', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  await equipe(page);
  await page.clock.setFixedTime(new Date('2026-09-06T01:30:00Z'));
  await page.route('**/api/movimentacoes', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{id: 1, data: '2026-09-05', tipo: 'Entrada', quantidade: 3}]) }));
  await page.goto('/dashboard.html');
  await expect(page.locator('#valMovHoje')).toHaveText('1');
  await page.locator('.secondary-insights > summary').click();
  await expect(page.locator('.bar-exit').first()).toHaveCSS('height', '0px');
  await expect(page.locator('#valAguardando')).toHaveText('Nenhum orçamento pendente');
  await page.screenshot({ path: 'output/tg-painel.png', fullPage: true });
  await context.close();
});
test('falha da API encerra os avisos de carregamento', async ({ page }) => {
  await equipe(page);
  await page.route('**/api/pecas', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/dashboard.html');
  await expect(page.locator('#valAlertaPecas')).toHaveText('Dados indisponíveis');
  await expect(page.locator('#dashboardError')).toContainText('Não foi possível carregar');
});
test('menu móvel fecha com Escape e mecânico não recebe links de gerente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await equipe(page, 'mecanico');
  await page.goto('/dashboard.html');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fechar menu', exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeFocused();
  await expect(page.locator('aside a[href="gerentes.html"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/tg-mobile.png', fullPage: true });
});
test('telas da equipe carregam sem erros de JavaScript nos dois temas', async ({ page }) => {
  await equipe(page);
  const erros=[];
  page.on('pageerror', error => erros.push(error.message));
  for(const tema of ['light', 'dark']) {
    await page.addInitScript(tema => localStorage.setItem('autoassis:theme', tema), tema);
    for(const tela of ['dashboard', 'estoque', 'movimentacao', 'servicos', 'relatorio', 'consultas', 'gerentes', 'auditoria']) {
      await page.goto(`/${tela}.html`);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tela}: ${tema}`).toBe(true);
    }
  }
  expect(erros).toEqual([]);
});
test('login cabe no celular e apresenta formulário legível', async ({ page }) => {
  for(const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login.html');
    await expect(page.getByRole('button', { name: /^Entrar/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/tg-login-${width}.png`, fullPage: true });
  }
});

// A falha de rede precisa permitir recuperação sem recarregar a página inteira.
test('estoque informa falha e permite tentar novamente', async ({ page }) => {
  await equipe(page);
  let falhar = true;
  await page.route('**/api/pecas', route => route.fulfill({ status: falhar ? 503 : 200, contentType: 'application/json', body: falhar ? '{}' : '[]' }));
  await page.goto('/estoque.html');
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar o estoque');
  falhar = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('controles compartilhados nas quatro telas em computador e celular', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tema of ['light', 'dark']) {
      for (const tela of ['login', 'estoque', 'servicos', 'cliente']) {
        await page.goto('/login.html');
        await page.evaluate(({ tema, tela }) => {
          localStorage.setItem('autoassis:theme', tema);
          sessionStorage.clear();
          if (tela !== 'login') {
            sessionStorage.setItem('authUsuario', JSON.stringify({ id: 1, nome: 'Rafael Oliveira', tipo: tela === 'cliente' ? 'cliente' : 'gerente' }));
          }
        }, { tema, tela });
        await page.goto(`/${tela}.html`);
        await expect(page.locator('main')).toBeVisible();
        const botao = page.locator(tela === 'login' ? '#submitBtn' : tela === 'estoque' ? '#novaPecaBtn' : tela === 'servicos' ? '.button-primary' : '.client-button.primary');
        await expect(botao).toHaveCSS('border-radius', '6px');
        await expect(botao).toHaveCSS('font-size', '14px');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tela} ${width} ${tema}`).toBe(true);
        await page.screenshot({ path: `output/padrao-${tela}-${tema}-${width}.png`, fullPage: true });
      }
    }
  }
});
