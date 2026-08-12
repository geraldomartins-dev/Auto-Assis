'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bcrypt = require('bcrypt');
const { app, pool, fluxoServico } = require('../server');

const originais = {
  execute: pool.execute,
  query: pool.query,
  getConnection: pool.getConnection
};
let servidor;
let baseUrl;

function usuario(tipo = 'gerente', id = tipo === 'gerente' ? 1 : tipo === 'mecanico' ? 2 : 3) {
  return { id, nome: `Usuário ${tipo}`, email: `${tipo}@contrato.local`, tipo, auth_version: 1 };
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
  const assinatura = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${assinatura}`;
}

function autorizar(tipo, opcoes = {}) {
  const atual = usuario(tipo, opcoes.id);
  pool.execute = async (sql, parametros = []) => {
    if (/SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = \? LIMIT 1/.test(sql)) {
      return [[atual], []];
    }
    if (/INSERT INTO auditoria/.test(sql)) return [{ insertId: 1 }, []];
    if (opcoes.execute) return opcoes.execute(sql, parametros);
    throw new Error(`SQL execute inesperado: ${sql}`);
  };
  if (opcoes.getConnection) pool.getConnection = async () => {
    const conexao = await opcoes.getConnection();
    const executar = conexao.execute.bind(conexao);
    conexao.execute = async (sql, parametros = []) => /INSERT INTO auditoria/.test(sql)
      ? [{ insertId: 1 }, []]
      : executar(sql, parametros);
    return conexao;
  };
}

function cabecalhos(tipo = 'gerente', id) {
  return { Authorization: `Bearer ${tokenPara(tipo, id)}` };
}

function payloadOs(sobrescritas = {}) {
  return {
    nomeCliente: 'Ana Martins',
    emailCliente: 'ana@exemplo.com',
    telefone: '(11) 99999-9999',
    veiculo: 'Honda Civic',
    ano: '2022',
    placa: 'ABC1D23',
    problema: 'Ruído na suspensão dianteira',
    urgencia: 'Média',
    status: 'Em Análise',
    custoSugerido: 780.5,
    responsavel: 'Carlos Andrade',
    dataInicio: '2026-08-07',
    ...sobrescritas
  };
}

test.before(async () => {
  await new Promise(resolve => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

test.afterEach(() => {
  pool.execute = originais.execute;
  pool.query = originais.query;
  pool.getConnection = originais.getConnection;
});

test.after(async () => {
  await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

test('senha cadastrada faz ida e volta pelo bcrypt e login sem transformação', async () => {
  const senha = 'Forte@2026!';
  let hashSalvo;
  pool.execute = async (sql, parametros = []) => {
    if (sql.startsWith('SELECT id FROM usuarios')) return [[], []];
    if (sql.startsWith('INSERT INTO usuarios')) {
      hashSalvo = parametros[2];
      return [{ insertId: 90 }, []];
    }
    if (sql.includes('SELECT id, nome, email, senha, tipo, auth_version')) {
      return [[{
        id: 90,
        nome: 'Conta Contrato',
        email: 'conta@contrato.local',
        senha: hashSalvo,
        tipo: 'cliente',
        auth_version: 1
      }], []];
    }
    throw new Error(`SQL inesperado: ${sql}`);
  };

  const cadastro = await fetch(`${baseUrl}/api/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Conta Contrato', email: 'conta@contrato.local', senha })
  });
  assert.equal(cadastro.status, 201);
  assert.equal(await bcrypt.compare(senha, hashSalvo), true);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'conta@contrato.local', senha })
  });
  assert.equal(login.status, 200);
});

test('login compara exatamente a senha recebida, sem trim', async () => {
  const senhaLegada = ' SenhaLegada@2026 ';
  const hash = await bcrypt.hash(senhaLegada, 12);
  pool.execute = async () => [[{
    id: 91,
    nome: 'Conta Legada',
    email: 'legada@contrato.local',
    senha: hash,
    tipo: 'cliente',
    auth_version: 1
  }], []];

  const exata = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'legada@contrato.local', senha: senhaLegada })
  });
  assert.equal(exata.status, 200);

  const alterada = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'legada@contrato.local', senha: senhaLegada.trim() })
  });
  assert.equal(alterada.status, 401);
});

test('logins válidos não acumulam bloqueio para a mesma conta', async () => {
  const senha = 'LoginValido@2026';
  const hash = await bcrypt.hash(senha, 12);
  pool.execute = async () => [[{
    id: 92,
    nome: 'Login Válido',
    email: 'sucesso-limite@contrato.local',
    senha: hash,
    tipo: 'cliente',
    auth_version: 1
  }], []];

  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const resposta = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sucesso-limite@contrato.local', senha })
    });
    assert.equal(resposta.status, 200, `login válido ${tentativa + 1} não deve acumular no limite`);
  }
});

test('contas distintas no mesmo IP não compartilham o limite de oito falhas', async () => {
  pool.execute = async () => [[], []];
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const resposta = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alvo-a@contrato.local', senha: 'Incorreta@2026' })
    });
    assert.equal(resposta.status, 401);
  }
  const outraConta = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alvo-b@contrato.local', senha: 'Incorreta@2026' })
  });
  assert.equal(outraConta.status, 401);
});

test('somente gerente pode criar ordem de serviço presencial', async () => {
  autorizar('mecanico');
  const resposta = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { ...cabecalhos('mecanico'), 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(resposta.status, 403);
});

test('máquina de estados permite somente o fluxo operacional previsto', () => {
  assert.deepEqual(fluxoServico.TRANSICOES_SERVICO, {
    Pendente: ['Em Análise', 'Rejeitado'],
    'Em Análise': ['Aguardando Aprovação', 'Rejeitado'],
    'Aguardando Aprovação': ['Aprovado', 'Rejeitado'],
    Aprovado: ['Em Andamento'],
    'Em Andamento': ['Concluído'],
    Concluído: [],
    Rejeitado: []
  });

  for (const [origem, destinos] of Object.entries(fluxoServico.TRANSICOES_SERVICO)) {
    for (const destino of Object.keys(fluxoServico.TRANSICOES_SERVICO)) {
      assert.equal(
        fluxoServico.transicaoServicoPermitida(origem, destino),
        destinos.includes(destino),
        `${origem} -> ${destino}`
      );
    }
  }
});

test('cria OS presencial em uma transação usando insertId e número do servidor', async () => {
  const chamadas = [];
  let parametrosInsert;
  let parametrosUpdate;
  let sqlUpdate;
  const conexao = {
    beginTransaction: async () => chamadas.push('begin'),
    execute: async (sql, parametros = []) => {
      chamadas.push(sql);
      if (sql.includes('INSERT INTO solicitacoes')) {
        parametrosInsert = parametros;
        return [{ insertId: 57 }, []];
      }
      if (sql.includes('SET osNumero = ?')) {
        sqlUpdate = sql;
        parametrosUpdate = parametros;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => chamadas.push('commit'),
    rollback: async () => chamadas.push('rollback'),
    release: () => chamadas.push('release')
  };
  autorizar('gerente', { getConnection: async () => conexao });

  const resposta = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nomeCliente: 'Ana Martins',
      emailCliente: 'ana@exemplo.com',
      telefone: '(11) 99999-9999',
      veiculo: 'Honda Civic',
      ano: '2022',
      placa: 'ABC1D23',
      problema: 'Ruído na suspensão dianteira',
      urgencia: 'Média',
      status: 'Em Análise',
      custoSugerido: 780.5,
      responsavel: 'Carlos Andrade',
      dataInicio: '2026-08-07'
    })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.deepEqual(corpo, {
    mensagem: 'Ordem de serviço criada com sucesso.',
    id: 57,
    osNumero: 'OS-2026-000057',
    orcamentoVersao: 0
  });
  assert.equal(parametrosInsert[9], 780.5);
  assert.equal(parametrosInsert[10], 'Carlos Andrade');
  assert.equal(parametrosInsert[11], '2026-08-07');
  assert.equal(parametrosInsert[12], 0);
  assert.equal(parametrosUpdate[0], corpo.osNumero);
  assert.equal(parametrosUpdate[1], 57);
  assert.match(sqlUpdate, /orcamentoHash = NULL/);
  assert.match(sqlUpdate, /orcamentoVersao = 0/);
  assert.deepEqual(chamadas.filter(item => item === 'begin' || item === 'commit' || item === 'rollback'), ['begin', 'commit']);
});

test('criação manual rejeita estados que pulam análise ou aprovação', async () => {
  autorizar('gerente');
  for (const status of ['Pendente', 'Aprovado', 'Em Andamento', 'Concluído', 'Rejeitado']) {
    const resposta = await fetch(`${baseUrl}/api/ordens-servico`, {
      method: 'POST',
      headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadOs({ status }))
    });
    assert.equal(resposta.status, 400, status);
  }
});

test('OS manual aguardando aprovação exige custo positivo e cria orçamento versão 1', async () => {
  autorizar('gerente');
  for (const custoSugerido of ['', 0, -1]) {
    const resposta = await fetch(`${baseUrl}/api/ordens-servico`, {
      method: 'POST',
      headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadOs({ status: 'Aguardando Aprovação', custoSugerido }))
    });
    assert.equal(resposta.status, 400, `custo ${String(custoSugerido)}`);
  }

  let parametrosInsert;
  let parametrosUpdate;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.includes('INSERT INTO solicitacoes')) {
        parametrosInsert = parametros;
        return [{ insertId: 58 }, []];
      }
      if (sql.includes('SET osNumero = ?, orcamentoHash = ?')) {
        parametrosUpdate = parametros;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
  autorizar('gerente', { getConnection: async () => conexao });
  const resposta = await fetch(`${baseUrl}/api/ordens-servico`, {
    method: 'POST',
    headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadOs({ status: 'Aguardando Aprovação', custoSugerido: 500 }))
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 201);
  assert.equal(corpo.orcamentoVersao, 1);
  assert.equal(parametrosInsert[12], 1);
  assert.equal(parametrosUpdate[0], 'OS-2026-000058');
  assert.match(parametrosUpdate[1], /^[a-f0-9]{64}$/);
  assert.equal(parametrosUpdate[2], 58);
});

test('envio para aprovação gera OS ausente e persiste nova versão e hash', async () => {
  let update;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.includes('FROM solicitacoes') && sql.includes('FOR UPDATE')) {
        return [[{
          status: 'Em Análise',
          custoSugerido: null,
          osNumero: null,
          orcamentoVersao: 0,
          orcamentoHash: null,
          anoOs: 2026
        }], []];
      }
      if (sql.includes("SET status = 'Aguardando Aprovação'")) {
        update = parametros;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
  autorizar('gerente', { getConnection: async () => conexao });
  const resposta = await fetch(`${baseUrl}/api/solicitacoes/44`, {
    method: 'PUT',
    headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Aguardando Aprovação', custoSugerido: 1250 })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.osNumero, 'OS-2026-000044');
  assert.equal(corpo.orcamentoVersao, 1);
  assert.deepEqual(update.slice(0, 3), [1250, corpo.osNumero, 1]);
  assert.match(update[3], /^[a-f0-9]{64}$/);
  assert.equal(update[4], 44);
});

test('cliente não altera contrato e decisão registra autor, origem e timestamp', async () => {
  let sqlDecisao;
  let parametrosDecisao;
  autorizar('cliente', {
    execute: async (sql, parametros) => {
      sqlDecisao = sql;
      parametrosDecisao = parametros;
      return [{ affectedRows: 1 }, []];
    }
  });

  const adulterada = await fetch(`${baseUrl}/api/solicitacoes/9`, {
    method: 'PUT',
    headers: { ...cabecalhos('cliente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Aprovado', custoSugerido: 1, osNumero: 'OS-FALSA' })
  });
  assert.equal(adulterada.status, 403);
  assert.equal(sqlDecisao, undefined);

  const resposta = await fetch(`${baseUrl}/api/solicitacoes/9`, {
    method: 'PUT',
    headers: { ...cabecalhos('cliente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Aprovado' })
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo.decisao, { status: 'Aprovado', origem: 'cliente' });
  assert.match(sqlDecisao, /decisaoEm = NOW\(\)/);
  assert.match(sqlDecisao, /decisaoUsuarioId/);
  assert.match(sqlDecisao, /decisaoOrigem = 'cliente'/);
  assert.equal(parametrosDecisao[2], 3);
});

test('decisão do gerente persiste explicitamente sua origem', async () => {
  let sqlUpdate;
  let parametrosUpdate;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.includes('FROM solicitacoes') && sql.includes('FOR UPDATE')) {
        return [[{
          status: 'Aguardando Aprovação',
          custoSugerido: 500,
          osNumero: 'OS-2026-000010',
          orcamentoVersao: 1,
          orcamentoHash: 'a'.repeat(64),
          anoOs: 2026
        }], []];
      }
      if (sql.includes("decisaoOrigem = 'gerente'")) {
        sqlUpdate = sql;
        parametrosUpdate = parametros;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
  autorizar('gerente', { getConnection: async () => conexao });
  const resposta = await fetch(`${baseUrl}/api/solicitacoes/10`, {
    method: 'PUT',
    headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Aprovado' })
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.deepEqual(corpo.decisao, { status: 'Aprovado', origem: 'gerente' });
  assert.match(sqlUpdate, /decisaoEm = NOW\(\)/);
  assert.equal(parametrosUpdate[2], 1);
});

test('gerente rejeita antes do orçamento com trilha e condição no status de origem', async () => {
  let sqlUpdate;
  let parametrosUpdate;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.includes('FROM solicitacoes') && sql.includes('FOR UPDATE')) {
        return [[{
          status: 'Pendente',
          custoSugerido: null,
          osNumero: null,
          orcamentoVersao: 0,
          orcamentoHash: null,
          anoOs: 2026
        }], []];
      }
      if (sql.includes("decisaoOrigem = 'gerente'")) {
        sqlUpdate = sql;
        parametrosUpdate = parametros;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
  autorizar('gerente', { getConnection: async () => conexao });
  const resposta = await fetch(`${baseUrl}/api/solicitacoes/12`, {
    method: 'PUT',
    headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Rejeitado' })
  });

  assert.equal(resposta.status, 200);
  assert.match(sqlUpdate, /decisaoEm = NOW\(\)/);
  assert.match(sqlUpdate, /AND status = \?/);
  assert.deepEqual(parametrosUpdate, ['Rejeitado', 'Rejeitado', 1, 12, 'Pendente']);
});

test('estados terminais não reabrem e orçamento não é reversionado fora de análise', async () => {
  for (const caso of [
    { atual: 'Concluído', novo: 'Em Análise', corpo: {} },
    { atual: 'Rejeitado', novo: 'Em Análise', corpo: {} },
    { atual: 'Aguardando Aprovação', novo: 'Aguardando Aprovação', corpo: { custoSugerido: 900 } }
  ]) {
    let atualizou = false;
    const conexao = {
      beginTransaction: async () => {},
      execute: async (sql) => {
        if (sql.includes('FROM solicitacoes') && sql.includes('FOR UPDATE')) {
          return [[{
            status: caso.atual,
            custoSugerido: 800,
            osNumero: 'OS-2026-000030',
            orcamentoVersao: 1,
            orcamentoHash: 'c'.repeat(64),
            anoOs: 2026
          }], []];
        }
        atualizou = true;
        return [{ affectedRows: 1 }, []];
      },
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };
    autorizar('gerente', { getConnection: async () => conexao });
    const resposta = await fetch(`${baseUrl}/api/solicitacoes/30`, {
      method: 'PUT',
      headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: caso.novo, ...caso.corpo })
    });
    assert.equal(resposta.status, 409, `${caso.atual} -> ${caso.novo}`);
    assert.equal(atualizou, false, `${caso.atual} não deve executar UPDATE`);
  }
});

test('gerente inicia serviço aprovado sem reenviar custo ou número da OS', async () => {
  let parametrosUpdate;
  const conexao = {
    beginTransaction: async () => {},
    execute: async (sql, parametros = []) => {
      if (sql.includes('FROM solicitacoes') && sql.includes('FOR UPDATE')) {
        return [[{
          status: 'Aprovado',
          custoSugerido: 850,
          osNumero: 'OS-2026-000021',
          orcamentoVersao: 1,
          orcamentoHash: 'b'.repeat(64),
          anoOs: 2026
        }], []];
      }
      if (sql.includes('UPDATE solicitacoes SET status = ?')) {
        parametrosUpdate = parametros;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
  autorizar('gerente', { getConnection: async () => conexao });

  const resposta = await fetch(`${baseUrl}/api/solicitacoes/21`, {
    method: 'PUT',
    headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Em Andamento' })
  });

  assert.equal(resposta.status, 200);
  assert.deepEqual(parametrosUpdate, ['Em Andamento', 21, 'Aprovado']);
});

test('gerente não injeta custo ou número da OS ao iniciar e concluir', async () => {
  autorizar('gerente');
  for (const payload of [
    { status: 'Em Andamento', custoSugerido: 850 },
    { status: 'Em Andamento', osNumero: 'OS-FALSA' },
    { status: 'Concluído', custoSugerido: 850 },
    { status: 'Concluído', osNumero: 'OS-FALSA' }
  ]) {
    const resposta = await fetch(`${baseUrl}/api/solicitacoes/21`, {
      method: 'PUT',
      headers: { ...cabecalhos('gerente'), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(resposta.status, 400, JSON.stringify(payload));
  }
});

test('painel envia custo somente ao submeter o orçamento para aprovação', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'gerenciar_solicitacao.html'), 'utf8');
  const trecho = html.match(/function montarAtualizacao[\s\S]*?(?=\n\s*async function atualizarStatus)/);
  assert.ok(trecho, 'A função de montagem da atualização deve existir.');

  const contexto = vm.createContext({ podeGerenciarOrcamento: true });
  vm.runInContext(`${trecho[0]}; globalThis.montarAtualizacaoTeste = montarAtualizacao;`, contexto);

  assert.deepEqual(
    { ...contexto.montarAtualizacaoTeste('Aguardando Aprovação', 850) },
    { status: 'Aguardando Aprovação', custoSugerido: 850 }
  );
  assert.deepEqual(
    { ...contexto.montarAtualizacaoTeste('Em Andamento', 850) },
    { status: 'Em Andamento' }
  );
  assert.deepEqual(
    { ...contexto.montarAtualizacaoTeste('Concluído', 850) },
    { status: 'Concluído' }
  );
});

test('painel separa análise de orçamento e a OS manual orienta custo obrigatório', () => {
  const gerenciamento = fs.readFileSync(path.join(__dirname, '..', 'gerenciar_solicitacao.html'), 'utf8');
  const pendente = gerenciamento.match(
    /if \(solicitacao\.status === 'Pendente'\) \{([\s\S]*?)\} else if \(solicitacao\.status === 'Em Análise'\)/
  );
  assert.ok(pendente, 'O estado pendente deve possuir ações próprias.');
  assert.match(pendente[1], /atualizarStatus\('Em Análise'\)/);
  assert.match(pendente[1], /atualizarStatus\('Rejeitado'\)/);
  assert.doesNotMatch(pendente[1], /Enviar orçamento|mostrarOrcamento/);

  const novaOs = fs.readFileSync(path.join(__dirname, '..', 'novaos.html'), 'utf8');
  assert.match(novaOs, /statusEscolhido === 'Aguardando Aprovação'/);
  assert.match(novaOs, /Number\(custo\) <= 0/);
  assert.match(novaOs, /gera a versão 1 do orçamento/);
});

test('schema contém campos contratuais e migração idempotente', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'autoassis_db.sql'), 'utf8');
  for (const coluna of [
    'responsavel',
    'dataInicio',
    'orcamentoVersao',
    'orcamentoHash',
    'decisao',
    'decisaoEm',
    'decisaoUsuarioId',
    'decisaoOrigem'
  ]) {
    assert.match(schema, new RegExp(coluna));
  }
  assert.match(schema, /information_schema\.COLUMNS/);
  assert.match(schema, /PREPARE autoassis_contrato_stmt/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS configuracao_oficina/);
  assert.match(schema, /CHECK \(id = 1\)/);
});
