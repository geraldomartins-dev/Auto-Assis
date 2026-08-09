'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { emailTemplates, pool } = require('../server');

test.after(async () => {
  await pool.end();
});
test('template de recuperação entrega HTML profissional e texto equivalente', () => {
  const link = 'https://app.autoassis.com.br/nova-senha.html?token=abc123';
  const email = emailTemplates.criarEmailRecuperacao({
    nome: 'Mariana Oliveira',
    link
  });

  assert.equal(email.subject, 'Redefina sua senha com segurança | Auto+Assis');
  assert.match(email.html, /<table role="presentation"/i);
  assert.match(email.html, />A\+<\/div>/);
  assert.match(email.html, /Olá, Mariana!/);
  assert.doesNotMatch(email.html, /Mariana Oliveira/);
  assert.match(email.html, /Redefinir minha senha/);
  assert.match(email.html, /expira em 1 hora/i);
  assert.match(email.html, /Ignore este e-mail/i);
  assert.match(email.html, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(email.html, /<(?:img|script|link|iframe)\b/i);
  assert.doesNotMatch(email.html, /url\s*\(/i);

  assert.match(email.text, /^Olá, Mariana!/);
  assert.match(email.text, /Redefina sua senha pelo endereço abaixo:/);
  assert.match(email.text, /expira em 1 hora/i);
  assert.match(email.text, /ignore este e-mail/i);
  assert.match(email.text, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(email.text, /<[^>]+>/);
});

test('template usa saudação neutra para nome vazio ou semelhante a e-mail', () => {
  const link = 'https://app.autoassis.com.br/nova-senha.html?token=seguro';
  const semNome = emailTemplates.criarEmailRecuperacao({ nome: '   ', link });
  const nomeEmail = emailTemplates.criarEmailRecuperacao({ nome: 'pessoa@example.com', link });

  assert.match(semNome.html, />Olá!</);
  assert.match(semNome.text, /^Olá!/);
  assert.match(nomeEmail.html, />Olá!</);
  assert.match(nomeEmail.text, /^Olá!/);
  assert.doesNotMatch(nomeEmail.html, /pessoa@example\.com/);
  assert.doesNotMatch(nomeEmail.text, /pessoa@example\.com/);
});

test('template escapa URL no HTML e rejeita protocolos inseguros', () => {
  const link = 'https://app.autoassis.com.br/nova-senha.html?token=a&origem=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E';
  const email = emailTemplates.criarEmailRecuperacao({
    nome: '<script>alert(1)</script>',
    link
  });

  assert.doesNotMatch(email.html, /<script>alert\(1\)<\/script>/i);
  assert.match(email.html, /token=a&amp;origem=/);
  assert.doesNotMatch(email.html, /token=a&origem=/);
  assert.throws(
    () => emailTemplates.criarEmailRecuperacao({ nome: 'Ana', link: 'javascript:alert(1)' }),
    /URL de recuperação inválida/i
  );
  assert.throws(
    () => emailTemplates.criarEmailRecuperacao({ nome: 'Ana', link: 'https://usuario:senha@app.autoassis.com.br/' }),
    /URL de recuperação inválida/i
  );
});
