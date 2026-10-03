'use strict';

const crypto = require('node:crypto');

function createSessionTokenService({ secret, expiresInSeconds, now = () => Date.now() }) {
  function sign(usuario) {
    const payload = {
      aud: 'autoassis',
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      tipo: usuario.tipo,
      ver: Number(usuario.auth_version),
      exp: Math.floor(now() / 1000) + expiresInSeconds
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  function verify(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Token inválido.');
    const [encoded, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new Error('Assinatura inválida.');
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const validVersion = Number.isSafeInteger(Number(payload.ver)) && Number(payload.ver) >= 1;
    if (payload.aud !== 'autoassis' || !Number.isSafeInteger(Number(payload.sub)) || !validVersion
      || !['cliente', 'gerente', 'mecanico'].includes(payload.tipo)) throw new Error('Token inválido.');
    if (!payload.exp || payload.exp < Math.floor(now() / 1000)) throw new Error('Token expirado.');
    return payload;
  }

  return { sign, verify };
}

module.exports = { createSessionTokenService };
