'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { app, pool } = require('../server');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const executarOriginal = pool.execute;
let servidor;
let baseUrl;

function idParaTipo(tipo) {
  return { gerente: 1, mecanico: 2, cliente: 3 }[tipo];
}

function usuarioPara(tipo) {
  return {
    id: idParaTipo(tipo),
    nome: `Usuário ${tipo}`,
    email: `${tipo}@teste.local`,
    tipo,
    auth_version: 1
  };
}

function tokenPara(tipo) {
  const payload = {
    aud: 'autoassis',
    sub: idParaTipo(tipo),
    nome: 'Usuário de teste',
    email: `${tipo}@teste.local`,
    tipo,
    ver: 1,
    exp: Math.floor(Date.now() / 1000) + 300
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = process.env.AUTH_SECRET || 'DESENVOLVIMENTO-ALTERE-ESTA-CHAVE-IMEDIATAMENTE';
  const assinatura = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${assinatura}`;
}

function mockComUsuario(tipo, executarRota = async (sql) => {
  throw new Error(`SQL não esperado no teste: ${sql}`);
}) {
  pool.execute = async (sql, parametros = []) => {
    if (/SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = \? LIMIT 1/.test(sql)) {
      return [[usuarioPara(tipo)], []];
    }
    if (/INSERT INTO auditoria/.test(sql)) return [{ insertId: 1 }, []];
    return executarRota(sql, parametros);
  };
}

test.before(async () => {
  await new Promise((resolve) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

test.afterEach(() => {
  pool.execute = executarOriginal;
});

test.after(async () => {
  await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

test('API bloqueia o gerenciamento sem autenticação e para clientes', async () => {
  const semToken = await fetch(`${baseUrl}/api/gerentes`);
  assert.equal(semToken.status, 401);

  mockComUsuario('cliente');
  const comoCliente = await fetch(`${baseUrl}/api/gerentes`, {
    headers: { Authorization: `Bearer ${tokenPara('cliente')}` }
  });
  assert.equal(comoCliente.status, 403);
});

test('servidor publica somente os arquivos da interface', async () => {
  const css = await fetch(`${baseUrl}/product.css`);
  assert.equal(css.status, 200);

  for (const arquivoInterno of ['server.js', 'package.json', 'autoassis_db.sql', 'test/gerentes.test.js']) {
    const resposta = await fetch(`${baseUrl}/${arquivoInterno}`);
    assert.equal(resposta.status, 404, `${arquivoInterno} não pode ser público`);
  }
});

test('API lista os gerentes sem expor credenciais', async () => {
  mockComUsuario('gerente', async (sql) => {
    assert.match(sql, /SELECT id, nome, email, tipo/);
    return [[{
      id: 1,
      nome: 'Gerente Teste',
      email: 'gerente@teste.local',
      tipo: 'gerente'
    }], []];
  });

  const resposta = await fetch(`${baseUrl}/api/gerentes`, {
    headers: { Authorization: `Bearer ${tokenPara('gerente')}` }
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo, [{
    id: 1,
    nome: 'Gerente Teste',
    email: 'gerente@teste.local',
    tipo: 'gerente'
  }]);
  assert.equal('senha' in corpo[0], false);
});

test('API cadastra gerente com hash bcrypt e responde sem a senha', async () => {
  let hashGravado;
  mockComUsuario('gerente', async (sql, parametros = []) => {
    if (sql.startsWith('SELECT id FROM usuarios')) return [[], []];
    if (sql.startsWith('INSERT INTO usuarios')) {
      hashGravado = parametros[2];
      return [{ insertId: 42 }, []];
    }
    throw new Error(`SQL não esperado no teste: ${sql}`);
  });

  const resposta = await fetch(`${baseUrl}/api/gerentes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenPara('gerente')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nome: 'Mariana Oliveira',
      email: 'MARIANA@EXEMPLO.COM',
      senha: 'Gerente@2026'
    })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.deepEqual(corpo.gerente, {
    id: 42,
    nome: 'Mariana Oliveira',
    email: 'mariana@exemplo.com',
    tipo: 'gerente'
  });
  assert.equal('senha' in corpo.gerente, false);
  assert.match(hashGravado, /^\$2[aby]\$12\$/);
  assert.equal(await bcrypt.compare('Gerente@2026', hashGravado), true);
});

test('rotas de gerentes exigem autenticação e perfil de gerente', () => {
  const servidor = ler('server.js');
  assert.match(servidor, /app\.get\('\/api\/gerentes', autenticar, somenteGerente/);
  assert.match(servidor, /app\.post\('\/api\/gerentes', autenticar, somenteGerente/);
});

test('estoque permite cadastro pela equipe e mantém edição e exclusão exclusivas do gerente', () => {
  const servidor = ler('server.js');
  assert.match(servidor, /app\.get\('\/api\/pecas', autenticar, somenteEquipe/);
  assert.match(servidor, /app\.post\('\/api\/pecas', autenticar, somenteEquipe/);
  assert.match(servidor, /req\.usuario\.tipo === 'gerente' \? decimal\(req\.body\.preco/);
  assert.match(servidor, /app\.put\('\/api\/pecas\/:id', autenticar, somenteGerente/);
  assert.match(servidor, /app\.delete\('\/api\/pecas\/:id', autenticar, somenteGerente/);
});

test('cadastro de gerente usa bcrypt 12 e não devolve o hash', () => {
  const servidor = ler('server.js');
  const inicio = servidor.indexOf("app.post('/api/gerentes'");
  const fim = servidor.indexOf("app.post('/api/recuperar-senha'", inicio);
  const rota = servidor.slice(inicio, fim);

  assert.match(rota, /criarMembroEquipe\(req, res, 'gerente'\)/);
  assert.doesNotMatch(rota, /gerente:\s*\{[^}]*hash/s);
});

test('listagem seleciona somente campos públicos dos gerentes', () => {
  const servidor = ler('server.js');
  const inicio = servidor.indexOf("app.get('/api/gerentes'");
  const fim = servidor.indexOf("app.post('/api/gerentes'", inicio);
  const rota = servidor.slice(inicio, fim);

  assert.match(rota, /SELECT id, nome, email, tipo/);
  assert.doesNotMatch(rota, /SELECT[^;]*senha/i);
});

test('tela de gerentes carrega autenticação e identidade visual compartilhada', () => {
  const pagina = ler('gerentes.html');
  assert.match(pagina, /<script src="auth\.js"><\/script>/);
  assert.match(pagina, /<link rel="stylesheet" href="product\.css">/);
  assert.match(pagina, /<script src="ui\.js" defer><\/script>/);
  assert.match(pagina, /fetch\('\/api\/equipe'/);
  assert.match(pagina, /requireAuth\('gerente'\)/);
});

test('auth.js reconhece a tela de gerentes como administrativa', () => {
  assert.match(ler('auth.js'), /'gerentes\.html'/);
});
