'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionTokenService } = require('../lib/session-token');

const usuario = { id: 7, nome: 'Ana', email: 'ana@example.com', tipo: 'gerente', auth_version: 2 };

test('token de sessão assinado pode ser validado', () => {
  const service = createSessionTokenService({ secret: 'segredo-de-teste-comprido', expiresInSeconds: 60, now: () => 1_000_000 });
  assert.equal(service.verify(service.sign(usuario)).sub, 7);
});

test('token adulterado ou expirado é rejeitado', () => {
  const active = createSessionTokenService({ secret: 'segredo-de-teste-comprido', expiresInSeconds: 60, now: () => 1_000_000 });
  const token = active.sign(usuario);
  assert.throws(() => active.verify(`${token}x`), /assinatura/i);
  const expired = createSessionTokenService({ secret: 'segredo-de-teste-comprido', expiresInSeconds: 60, now: () => 2_000_000 });
  assert.throws(() => expired.verify(token), /expirado/i);
});
