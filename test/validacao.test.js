'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validacao, pool } = require('../server');

test.after(async () => {
  await pool.end();
});

test('aceita e normaliza um e-mail válido', () => {
  assert.equal(validacao.emailValido('  CLIENTE@EXEMPLO.COM  '), 'cliente@exemplo.com');
});

test('rejeita um e-mail inválido', () => {
  assert.throws(() => validacao.emailValido('email-invalido'), /inválido/i);
});

test('rejeita quantidade negativa ou fracionada', () => {
  assert.throws(() => validacao.inteiro(-1, 'Quantidade'), /inválid/i);
  assert.throws(() => validacao.inteiro(1.5, 'Quantidade'), /inválid/i);
});

test('aceita valores monetários não negativos', () => {
  assert.equal(validacao.decimal('149.90', 'Preço'), 149.9);
  assert.throws(() => validacao.decimal(-0.01, 'Preço'), /inválid/i);
});

test('extrai identificadores numéricos legados', () => {
  assert.equal(validacao.idNumerico('PEC-123'), 123);
  assert.throws(() => validacao.idNumerico('sem-id'), /inválid/i);
});
