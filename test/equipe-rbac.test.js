'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { app, pool } = require('../server');

const metodosOriginais = {
  execute: pool.execute,
  query: pool.query,
  getConnection: pool.getConnection
};
let servidor;
let baseUrl;

function usuario(tipo = 'gerente', id = tipo === 'gerente' ? 1 : tipo === 'mecanico' ? 2 : 3) {
  return { id, nome: `Usuário ${tipo}`, email: `${tipo}@teste.local`, tipo, auth_version: 1 };
}

function tokenPara(tipo = 'gerente', id) {
  const atual = usuario(tipo, id);
  const payload = {
    aud: 'autoassis',
    sub: atual.id,
    nome: atual.nome,
    email: atual.email,
    tipo: atual.tipo,
    ver: atual.auth_version,
    exp: Math.floor(Date.now() / 1000) + 300
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = crypto
    .createHmac('sha256', process.env.AUTH_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${assinatura}`;
}

function autorizar(tipo, opcoes = {}) {
  const atual = opcoes.usuarioAtual || usuario(tipo);
  pool.execute = async (sql, parametros = []) => {
    if (/SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = \? LIMIT 1/.test(sql)) {
      return [[atual], []];
    }
    if (/INSERT INTO auditoria/.test(sql)) return [{ insertId: 1 }, []];
    if (opcoes.execute) return opcoes.execute(sql, parametros);
    throw new Error(`SQL execute não esperado: ${sql}`);
  };
  pool.query = opcoes.query || (async (sql) => {
    throw new Error(`SQL query não esperado: ${sql}`);
  });
  if (opcoes.getConnection) pool.getConnection = opcoes.getConnection;
}

function headers(tipo, id) {
  return { Authorization: `Bearer ${tokenPara(tipo, id)}` };
}

test.before(async () => {
  await new Promise(resolve => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

test.afterEach(() => {
  pool.execute = metodosOriginais.execute;
  pool.query = metodosOriginais.query;
  pool.getConnection = metodosOriginais.getConnection;
});

test.after(async () => {
  await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

test('login aceita mecânico e devolve perfil sem hash', async () => {
  const hash = await bcrypt.hash('Mecanico@2026', 12);
  pool.execute = async sql => {
    assert.match(sql, /SELECT id, nome, email, senha, tipo/);
    return [[{ ...usuario('mecanico'), senha: hash }], []];
  };

  const resposta = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mecanico@teste.local', senha: 'Mecanico@2026' })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.usuario.tipo, 'mecanico');
  assert.equal('senha' in corpo.usuario, false);
  assert.equal(typeof corpo.token, 'string');
  const payload = JSON.parse(Buffer.from(corpo.token.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(payload.ver, 1);
});

test('redefinição de senha incrementa a versão e invalida a sessão anterior', async () => {
  let senhaRedefinida = false;
  pool.execute = async sql => {
    if (sql.startsWith('UPDATE usuarios SET senha')) {
      assert.match(sql, /auth_version = auth_version \+ 1/);
      senhaRedefinida = true;
      return [{ affectedRows: 1 }, []];
    }
    if (/SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = \? LIMIT 1/.test(sql)) {
      return [[{ ...usuario('gerente'), auth_version: senhaRedefinida ? 2 : 1 }], []];
    }
    throw new Error(`SQL inesperado: ${sql}`);
  };

  const tokenAntigo = tokenPara('gerente');
  const redefinicao = await fetch(`${baseUrl}/api/resetar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'a'.repeat(64), novaSenha: 'NovaSenha@2026' })
  });
  assert.equal(redefinicao.status, 200);
  assert.equal(senhaRedefinida, true);

  const reutilizacao = await fetch(`${baseUrl}/api/configuracao-oficina`, {
    headers: { Authorization: `Bearer ${tokenAntigo}` }
  });
  assert.equal(reutilizacao.status, 401);
});

test('sessão privilegiada é invalidada imediatamente após mudança de perfil', async () => {
  autorizar('gerente', { usuarioAtual: usuario('mecanico', 1) });
  const resposta = await fetch(`${baseUrl}/api/equipe`, { headers: headers('gerente', 1) });
  assert.equal(resposta.status, 401);
});

test('somente gerente pode acessar gestão da equipe', async () => {
  autorizar('mecanico');
  const resposta = await fetch(`${baseUrl}/api/equipe`, { headers: headers('mecanico') });
  assert.equal(resposta.status, 403);
});

test('lista equipe sem expor senha ou tokens de recuperação', async () => {
  autorizar('gerente', {
    execute: async sql => {
      assert.match(sql, /SELECT id, nome, email, tipo/);
      assert.doesNotMatch(sql, /senha|reset_token/i);
      const gerente = usuario('gerente');
      const mecanico = usuario('mecanico');
      delete gerente.auth_version;
      delete mecanico.auth_version;
      return [[gerente, mecanico], []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/equipe`, { headers: headers('gerente') });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(corpo.length, 2);
  assert.equal(corpo.some(membro => 'senha' in membro), false);
});

test('cadastra mecânico com bcrypt 12 e contrato público', async () => {
  let parametrosInsert;
  autorizar('gerente', {
    execute: async (sql, parametros) => {
      if (sql.startsWith('SELECT id FROM usuarios')) return [[], []];
      if (sql.startsWith('INSERT INTO usuarios')) {
        parametrosInsert = parametros;
        return [{ insertId: 22 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    }
  });

  const resposta = await fetch(`${baseUrl}/api/equipe`, {
    method: 'POST',
    headers: { ...headers('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Carlos Andrade',
      email: 'CARLOS@EXEMPLO.COM',
      senha: 'Mecanico@2026',
      tipo: 'mecanico'
    })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.deepEqual(corpo.membro, {
    id: 22,
    nome: 'Carlos Andrade',
    email: 'carlos@exemplo.com',
    tipo: 'mecanico'
  });
  assert.equal(await bcrypt.compare('Mecanico@2026', parametrosInsert[2]), true);
  assert.equal(parametrosInsert[3], 'mecanico');
  assert.equal('senha' in corpo.membro, false);
});

test('edita membro em transação sem exigir nova senha', async () => {
  const chamadas = [];
  let incrementouVersao = false;
  const conexao = {
    beginTransaction: async () => chamadas.push('begin'),
    execute: async (sql, parametros = []) => {
      chamadas.push(sql);
      if (sql.includes("WHERE tipo = 'gerente'")) return [[{ id: 1 }], []];
      if (sql.includes("tipo IN ('gerente', 'mecanico')")) return [[usuario('mecanico', 8)], []];
      if (sql.startsWith('UPDATE usuarios SET nome')) {
        assert.match(sql, /auth_version = auth_version \+ 1/);
        incrementouVersao = true;
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 1 }, []];
      throw new Error(`SQL inesperado: ${sql} ${parametros}`);
    },
    commit: async () => chamadas.push('commit'),
    rollback: async () => chamadas.push('rollback'),
    release: () => chamadas.push('release')
  };
  autorizar('gerente', { getConnection: async () => conexao });

  const resposta = await fetch(`${baseUrl}/api/equipe/8`, {
    method: 'PUT',
    headers: { ...headers('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Carlos Atualizado', email: 'novo@exemplo.com', tipo: 'mecanico' })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.membro.nome, 'Carlos Atualizado');
  assert.equal(corpo.membro.tipo, 'mecanico');
  assert.equal(corpo.token, undefined);
  assert.equal(incrementouVersao, true);
  assert.equal(chamadas.includes('commit'), true);
  assert.equal(chamadas.includes('rollback'), false);
});

test('autoedição revoga o token antigo e devolve uma sessão renovada', async () => {
  let versaoAtual = 1;
  pool.execute = async sql => {
    if (/SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = \? LIMIT 1/.test(sql)) {
      return [[{ ...usuario('gerente', 1), auth_version: versaoAtual }], []];
    }
    if (sql.includes('FROM configuracao_oficina')) return [[], []];
    throw new Error(`SQL inesperado: ${sql}`);
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async sql => {
      if (sql.includes("WHERE tipo = 'gerente'")) return [[{ id: 1 }], []];
      if (sql.includes("tipo IN ('gerente', 'mecanico')")) {
        return [[{ ...usuario('gerente', 1), auth_version: 1 }], []];
      }
      if (sql.startsWith('UPDATE usuarios SET nome')) {
        assert.match(sql, /auth_version = auth_version \+ 1/);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 1 }, []];
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => { versaoAtual = 2; },
    rollback: async () => {},
    release: () => {}
  });

  const tokenAntigo = tokenPara('gerente', 1);
  const resposta = await fetch(`${baseUrl}/api/equipe/1`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenAntigo}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Gerente Renovado', email: 'renovado@teste.local', tipo: 'gerente' })
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(typeof corpo.token, 'string');
  assert.equal(corpo.membro.nome, 'Gerente Renovado');
  const payloadNovo = JSON.parse(Buffer.from(corpo.token.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(payloadNovo.ver, 2);
  assert.equal(payloadNovo.nome, 'Gerente Renovado');

  const sessaoAntiga = await fetch(`${baseUrl}/api/configuracao-oficina`, {
    headers: { Authorization: `Bearer ${tokenAntigo}` }
  });
  assert.equal(sessaoAntiga.status, 401);

  const sessaoNova = await fetch(`${baseUrl}/api/configuracao-oficina`, {
    headers: { Authorization: `Bearer ${corpo.token}` }
  });
  assert.equal(sessaoNova.status, 200);
});

test('impede autoexclusão antes de abrir transação', async () => {
  let abriuConexao = false;
  autorizar('gerente', {
    getConnection: async () => {
      abriuConexao = true;
      throw new Error('não deveria abrir conexão');
    }
  });
  const resposta = await fetch(`${baseUrl}/api/equipe/1`, {
    method: 'DELETE',
    headers: headers('gerente', 1)
  });
  assert.equal(resposta.status, 409);
  assert.equal(abriuConexao, false);
});

test('impede autorrebaixamento do gerente, preservando a administração da oficina', async () => {
  autorizar('gerente');
  const resposta = await fetch(`${baseUrl}/api/equipe/1`, {
    method: 'PUT',
    headers: { ...headers('gerente', 1), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Gerente Principal',
      email: 'gerente@teste.local',
      tipo: 'mecanico'
    })
  });
  assert.equal(resposta.status, 409);
  assert.match((await resposta.json()).erro, /rebaixar o próprio perfil/i);
});

test('exclui outro membro da equipe em transação', async () => {
  let confirmou = false;
  const conexao = {
    beginTransaction: async () => {},
    execute: async sql => {
      if (sql.includes("WHERE tipo = 'gerente'")) return [[{ id: 1 }], []];
      if (sql.includes("tipo IN ('gerente', 'mecanico')")) return [[{ id: 8, nome: 'Carlos', email: 'carlos@teste.local', tipo: 'mecanico' }], []];
      if (sql.startsWith('DELETE FROM usuarios')) return [{ affectedRows: 1 }, []];
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 1 }, []];
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => { confirmou = true; },
    rollback: async () => {},
    release: () => {}
  };
  autorizar('gerente', { getConnection: async () => conexao });
  const resposta = await fetch(`${baseUrl}/api/equipe/8`, {
    method: 'DELETE',
    headers: headers('gerente')
  });
  assert.equal(resposta.status, 200);
  assert.equal(confirmou, true);
  assert.match((await resposta.json()).mensagem, /excluído/i);
});

test('mecânico consulta e cadastra peças sem acessar ou definir preço', async () => {
  autorizar('mecanico', {
    query: async sql => {
      assert.doesNotMatch(sql, /preco/i);
      return [[{
        id: 4,
        nome: 'Filtro de óleo',
        descricao: '',
        categoria: 'Filtros',
        localizacao: 'A-01',
        quantidade: 6,
        min: 2
      }], []];
    }
  });
  const leitura = await fetch(`${baseUrl}/api/pecas`, { headers: headers('mecanico') });
  const pecas = await leitura.json();
  assert.equal(leitura.status, 200);
  assert.equal('preco' in pecas[0], false);

  let parametrosCadastro;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.startsWith('INSERT INTO pecas')) { parametrosCadastro = parametros; return [{ insertId: 55 }, []]; }
      if (sql.startsWith('INSERT INTO movimentacoes')) return [{ insertId: 56 }, []];
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 57 }, []];
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {}, rollback: async () => {}, release: () => {}
  };
  autorizar('mecanico', { getConnection: async () => conexao });
  const cadastro = await fetch(`${baseUrl}/api/pecas`, {
    method: 'POST',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Pastilha de freio', descricao: '', categoria: 'Freios', localizacao: 'B-02', quantidade: 4, min: 2, preco: 999 })
  });
  assert.equal(cadastro.status, 201);
  assert.equal(parametrosCadastro[6], 0);
});

test('mecânico pode ler movimentações de estoque', async () => {
  autorizar('mecanico', {
    query: async sql => {
      assert.match(sql, /FROM movimentacoes/);
      return [[{ id: 1, tipo: 'Entrada', quantidade: 2, nome_peca: 'Filtro' }], []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/movimentacoes`, { headers: headers('mecanico') });
  assert.equal(resposta.status, 200);
});

test('resumo de consultas do mecânico devolve somente contagens operacionais', async () => {
  autorizar('mecanico', {
    query: async sql => {
      assert.match(sql, /COUNT\(\*\)/);
      assert.match(sql, /FROM solicitacoes/);
      assert.match(sql, /FROM movimentacoes/);
      assert.doesNotMatch(sql, /nomeCliente|emailCliente|telefone|placa|custoSugerido|preco/i);
      return [[{
        servicosAtivos: 7,
        aguardandoAprovacao: 2,
        movimentacoesHoje: 5,
        entradasHoje: 3
      }], []];
    }
  });

  const resposta = await fetch(`${baseUrl}/api/consultas/resumo-operacional`, {
    headers: headers('mecanico')
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo, {
    servicosAtivos: 7,
    aguardandoAprovacao: 2,
    movimentacoesHoje: 5,
    entradasHoje: 3,
    saidasHoje: 2
  });
  assert.doesNotMatch(JSON.stringify(corpo), /cliente|email|telefone|placa|custo|preco/i);

  autorizar('cliente');
  const comoCliente = await fetch(`${baseUrl}/api/consultas/resumo-operacional`, {
    headers: headers('cliente')
  });
  assert.equal(comoCliente.status, 403);
});

test('mecânico registra movimentação com bloqueio transacional de estoque', async () => {
  let confirmou = false;
  const conexao = {
    beginTransaction: async () => {},
    execute: async sql => {
      if (sql.startsWith('SELECT id, nome, quantidade FROM pecas')) return [[{ id: 4, nome: 'Filtro', quantidade: 10 }], []];
      if (sql.startsWith('UPDATE pecas SET quantidade')) return [{ affectedRows: 1 }, []];
      if (sql.startsWith('INSERT INTO movimentacoes')) return [{ insertId: 31 }, []];
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 1 }, []];
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => { confirmou = true; },
    rollback: async () => {},
    release: () => {}
  };
  autorizar('mecanico', { getConnection: async () => conexao });
  const resposta = await fetch(`${baseUrl}/api/movimentacoes`, {
    method: 'POST',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ pecaId: 4, tipo: 'saida', quantidade: 2, obs: 'Aplicada na OS' })
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 201);
  assert.equal(corpo.id, 31);
  assert.equal(confirmou, true);
});

test('listagem de serviços do mecânico não consulta nem devolve custo', async () => {
  autorizar('mecanico', {
    query: async sql => {
      assert.match(sql, /FROM solicitacoes/);
      assert.doesNotMatch(sql, /custoSugerido/);
      return [[{ id: 5, veiculo: 'Civic', status: 'Em Andamento' }], []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/solicitacoes`, { headers: headers('mecanico') });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal('custoSugerido' in corpo[0], false);
});

test('mecânico acessa somente o contrato versionado de uma OS específica', async () => {
  let sqlContrato;
  autorizar('mecanico', {
    execute: async (sql, parametros) => {
      sqlContrato = sql;
      assert.deepEqual(parametros, [17]);
      return [[{
        id: 17,
        nomeCliente: 'Cliente Contrato',
        status: 'Aprovado',
        osNumero: 'OS-2026-000017',
        custoSugerido: 950,
        orcamentoVersao: 1,
        orcamentoHash: 'a'.repeat(64),
        decisao: 'Aprovado',
        decisaoOrigem: 'cliente'
      }], []];
    }
  });

  const resposta = await fetch(`${baseUrl}/api/solicitacoes/17/contrato`, {
    headers: headers('mecanico')
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.custoSugerido, 950);
  assert.equal(corpo.orcamentoHash.length, 64);
  assert.match(sqlContrato, /WHERE id = \? AND arquivado = 0/);
  assert.match(sqlContrato, /osNumero IS NOT NULL/);
  assert.match(sqlContrato, /orcamentoVersao > 0/);
  assert.match(sqlContrato, /orcamentoHash IS NOT NULL/);
  assert.match(sqlContrato, /custoSugerido > 0/);
});

test('contrato incompleto fica indisponível e cliente não acessa contrato da equipe', async () => {
  autorizar('mecanico', { execute: async () => [[], []] });
  const rascunho = await fetch(`${baseUrl}/api/solicitacoes/18/contrato`, {
    headers: headers('mecanico')
  });
  assert.equal(rascunho.status, 404);
  assert.match((await rascunho.json()).erro, /não encontrado|não disponível/i);

  autorizar('cliente');
  const cliente = await fetch(`${baseUrl}/api/solicitacoes/17/contrato`, {
    headers: headers('cliente')
  });
  assert.equal(cliente.status, 403);
});

test('permissão de contrato do mecânico não libera a página de relatórios', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const auth = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
  assert.match(auth, /mecanico:[\s\S]*?'services\.contract'/);
  assert.match(auth, /const paginasGerente = new Set\(\[[\s\S]*?'relatorio\.html'/);
});

test('mecânico atualiza andamento, mas não injeta custo ou número da OS fora do orçamento', async () => {
  autorizar('mecanico', {
    execute: async sql => {
      if (sql.startsWith('SELECT status FROM solicitacoes')) {
        return [[{ status: 'Aprovado' }], []];
      }
      assert.match(sql, /UPDATE solicitacoes SET status/);
      return [{ affectedRows: 1 }, []];
    }
  });
  const andamento = await fetch(`${baseUrl}/api/solicitacoes/5`, {
    method: 'PUT',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Em Andamento' })
  });
  assert.equal(andamento.status, 200);

  const custo = await fetch(`${baseUrl}/api/solicitacoes/5`, {
    method: 'PUT',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Em Andamento', custoSugerido: 800 })
  });
  assert.equal(custo.status, 403);

  const os = await fetch(`${baseUrl}/api/solicitacoes/5`, {
    method: 'PUT',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Em Andamento', osNumero: 'OS-900' })
  });
  assert.equal(os.status, 403);
});

test('mecânico envia orçamento versionado para aprovação com autoria auditada', async () => {
  let parametrosUpdate;
  let auditoriaRegistrada = false;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.includes('FROM solicitacoes') && sql.includes('FOR UPDATE')) {
        return [[{
          status: 'Em Análise', custoSugerido: null, osNumero: null,
          orcamentoVersao: 0, orcamentoHash: null, anoOs: 2026
        }], []];
      }
      if (sql.includes("SET status = 'Aguardando Aprovação'")) {
        parametrosUpdate = parametros;
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO auditoria')) {
        auditoriaRegistrada = true;
        return [{ insertId: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
  autorizar('mecanico', { getConnection: async () => conexao });

  const resposta = await fetch(`${baseUrl}/api/solicitacoes/23`, {
    method: 'PUT',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Aguardando Aprovação', custoSugerido: 780 })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.osNumero, 'OS-2026-000023');
  assert.equal(corpo.orcamentoVersao, 1);
  assert.deepEqual(parametrosUpdate.slice(0, 3), [780, corpo.osNumero, 1]);
  assert.match(parametrosUpdate[3], /^[a-f0-9]{64}$/);
  assert.equal(auditoriaRegistrada, true);
});

test('configuração da oficina lê o singleton e expõe somente campos públicos', async () => {
  autorizar('mecanico', {
    execute: async sql => {
      assert.match(sql, /FROM configuracao_oficina/);
      return [[{
        nome: 'Oficina Teste',
        documento: '12.345.678/0001-90',
        telefone: '(11) 99999-9999',
        email: 'oficina@teste.local',
        endereco: 'Rua dos Testes, 100'
      }], []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/configuracao-oficina`, { headers: headers('mecanico') });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.deepEqual(Object.keys(corpo).sort(), [
    'OFICINA_DOCUMENTO',
    'OFICINA_EMAIL',
    'OFICINA_ENDERECO',
    'OFICINA_NOME',
    'OFICINA_TELEFONE',
    'cnpj',
    'completa',
    'documento',
    'email',
    'endereco',
    'nome',
    'telefone'
  ]);
  assert.equal(corpo.nome, 'Oficina Teste');
  assert.equal(corpo.completa, true);
  assert.equal(corpo.OFICINA_NOME, corpo.nome);
});

test('configuração usa ambiente somente enquanto o singleton ainda não existe', async () => {
  autorizar('mecanico', {
    execute: async sql => {
      assert.match(sql, /FROM configuracao_oficina/);
      return [[], []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/configuracao-oficina`, { headers: headers('mecanico') });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(corpo.nome, String(process.env.OFICINA_NOME || 'Auto+Assis').trim());
  assert.equal(typeof corpo.completa, 'boolean');
});

test('somente gerente persiste a configuração completa da oficina', async () => {
  autorizar('mecanico');
  const negada = await fetch(`${baseUrl}/api/configuracao-oficina`, {
    method: 'PUT',
    headers: { ...headers('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(negada.status, 403);

  let sqlUpsert;
  let parametrosUpsert;
  autorizar('gerente', {
    execute: async (sql, parametros) => {
      if (sql.includes('FROM configuracao_oficina')) return [[], []];
      if (sql.includes('INSERT INTO auditoria')) return [{ insertId: 1 }, []];
      sqlUpsert = sql; parametrosUpsert = parametros;
      return [{ affectedRows: 1 }, []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/configuracao-oficina`, {
    method: 'PUT',
    headers: { ...headers('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Auto Assis Centro',
      documento: '12.345.678/0001-90',
      telefone: '(11) 99999-9999',
      email: 'CONTATO@AUTOASSIS.COM',
      endereco: 'Avenida Central, 500 - São Paulo/SP'
    })
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.match(sqlUpsert, /INSERT INTO configuracao_oficina/);
  assert.match(sqlUpsert, /ON DUPLICATE KEY UPDATE/);
  assert.equal(parametrosUpsert[3], 'contato@autoassis.com');
  assert.equal(parametrosUpsert[5], 1);
  assert.equal(corpo.configuracao.completa, true);
});

test('configuração incompleta ou inválida não é persistida', async () => {
  let tentouPersistir = false;
  autorizar('gerente', {
    execute: async () => {
      tentouPersistir = true;
      return [{ affectedRows: 1 }, []];
    }
  });
  const resposta = await fetch(`${baseUrl}/api/configuracao-oficina`, {
    method: 'PUT',
    headers: { ...headers('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Auto Assis',
      documento: '***',
      telefone: '123',
      email: 'invalido',
      endereco: ''
    })
  });
  assert.equal(resposta.status, 400);
  assert.equal(tentouPersistir, false);
});
