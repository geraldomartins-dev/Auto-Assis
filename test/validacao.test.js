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

test('aceita somente identificadores numéricos estritos', () => {
  assert.equal(validacao.idNumerico('123'), 123);
  assert.throws(() => validacao.idNumerico('PEC-123'), /inválid/i);
  assert.throws(() => validacao.idNumerico('1abc2'), /inválid/i);
  assert.throws(() => validacao.idNumerico('0'), /inválid/i);
});

test('aceita senha forte para uma nova conta de gerente', () => {
  assert.equal(validacao.senhaGerenteValida('Gerente@2026'), 'Gerente@2026');
});

test('rejeita senha fraca para uma nova conta de gerente', () => {
  assert.throws(() => validacao.senhaGerenteValida('senha123'), /senha/i);
  assert.throws(() => validacao.senhaGerenteValida('SEM-MINUSCULA-123'), /maiúscula|caractere/i);
  assert.throws(() => validacao.senhaGerenteValida('SemNumero@forte'), /maiúscula|caractere/i);
  assert.throws(() => validacao.senhaGerenteValida(' Forte@2026'), /espaços|branco/i);
  assert.throws(() => validacao.senhaGerenteValida('Forte@2026 '), /espaços|branco/i);
  assert.throws(() => validacao.senhaGerenteValida('Forte\t@2026'), /espaços|branco/i);
});

test('normaliza nomes da equipe e rejeita caracteres impróprios', () => {
  assert.equal(validacao.nomePessoaValido('  Maria   D’Ávila  '), 'Maria D’Ávila');
  assert.throws(() => validacao.nomePessoaValido('Gerente <script>'), /nome inválido/i);
  assert.throws(() => validacao.nomePessoaValido('Usuário 123'), /nome inválido/i);
});

test('aceita somente os perfis internos previstos na hierarquia', () => {
  assert.equal(validacao.tipoEquipeValido(' GERENTE '), 'gerente');
  assert.equal(validacao.tipoEquipeValido('mecanico'), 'mecanico');
  assert.throws(() => validacao.tipoEquipeValido('administrador'), /perfil inválido/i);
  assert.throws(() => validacao.tipoEquipeValido('cliente'), /perfil inválido/i);
});
