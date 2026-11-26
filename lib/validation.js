'use strict';

function texto(value, campo, min = 1, max = 255) {
  const normalized = String(value ?? '').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${campo} deve ter entre ${min} e ${max} caracteres.`);
  }
  return normalized;
}

function emailValido(value) {
  const email = texto(value, 'E-mail', 5, 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  return email;
}

function senhaGerenteValida(value) {
  const senha = typeof value === 'string' ? value : '';
  if (senha.length < 10 || senha.length > 128) throw new Error('A senha deve ter entre 10 e 128 caracteres.');
  if (/\s/u.test(senha)) throw new Error('Senha inválida: não use espaços ou outros caracteres em branco.');
  if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
    throw new Error('Senha inválida: use letra maiúscula, letra minúscula, número e caractere especial.');
  }
  return senha;
}

function nomePessoaValido(value) {
  const nome = texto(value, 'Nome', 2, 100).replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’. -]*$/u.test(nome)) {
    throw new Error('Nome inválido. Use apenas letras, espaços, apóstrofo, ponto ou hífen.');
  }
  return nome;
}

function tipoEquipeValido(value) {
  const tipo = String(value || '').trim().toLowerCase();
  if (!['gerente', 'mecanico'].includes(tipo)) throw new Error('Perfil inválido. Use gerente ou mecanico.');
  return tipo;
}

function inteiro(value, campo, min = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) throw new Error(`${campo} inválido.`);
  return number;
}

function decimal(value, campo, min = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) throw new Error(`${campo} inválido.`);
  return number;
}

function idNumerico(value) {
  const normalized = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(normalized)) throw new Error('ID inválido.');
  const number = Number(normalized);
  if (!Number.isSafeInteger(number)) throw new Error('ID inválido.');
  return number;
}

module.exports = { texto, emailValido, senhaGerenteValida, nomePessoaValido, tipoEquipeValido, inteiro, decimal, idNumerico };
