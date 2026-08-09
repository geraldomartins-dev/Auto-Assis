'use strict';

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool, validacao } = require('../server');

async function criarAdministradorInicial() {
  const nome = validacao.texto(process.env.ADMIN_NAME, 'ADMIN_NAME', 2, 100);
  const email = validacao.emailValido(process.env.ADMIN_EMAIL);
  const senha = validacao.senhaGerenteValida(process.env.ADMIN_PASSWORD);

  const [gerentes] = await pool.execute(
    "SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'gerente'"
  );
  if (Number(gerentes[0]?.total || 0) > 0) {
    throw new Error('Já existe um gerente. Cadastre novos responsáveis pela tela Gerentes.');
  }

  const [emailExistente] = await pool.execute(
    'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  if (emailExistente.length) {
    throw new Error('O ADMIN_EMAIL já pertence a uma conta existente.');
  }

  const hash = await bcrypt.hash(senha, 12);
  await pool.execute(
    "INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, 'gerente')",
    [nome, email, hash]
  );
  console.log('Gerente inicial criado com sucesso. Remova ADMIN_PASSWORD do ambiente.');
}

criarAdministradorInicial()
  .catch((error) => {
    console.error(`Não foi possível criar o gerente inicial: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
