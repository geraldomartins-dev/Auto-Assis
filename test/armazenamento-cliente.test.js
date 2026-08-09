'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');

class StorageMock {
  constructor(inicial = {}) {
    this.dados = new Map(Object.entries(inicial));
    this.gravacoes = [];
  }

  get length() { return this.dados.size; }
  key(index) { return [...this.dados.keys()][index] ?? null; }
  getItem(key) { return this.dados.has(String(key)) ? this.dados.get(String(key)) : null; }
  setItem(key, value) {
    this.gravacoes.push([String(key), String(value)]);
    this.dados.set(String(key), String(value));
  }
  removeItem(key) { this.dados.delete(String(key)); }
  clear() { this.dados.clear(); }
}

function contextoBase(localStorage, sessionStorage = new StorageMock()) {
  const documentElement = {
    dataset: {},
    classList: { add() {} }
  };
  const document = {
    documentElement,
    readyState: 'complete',
    title: '',
    getElementById: () => null,
    createElement: () => ({
      style: {},
      append() {},
      appendChild() {},
      addEventListener() {}
    }),
    createTextNode: (texto) => ({ textContent: texto })
  };
  const location = {
    origin: 'http://localhost:3000',
    pathname: '/login.html',
    href: 'http://localhost:3000/login.html'
  };
  const window = {
    location,
    matchMedia: () => ({ matches: false }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
    apiAuth: { can: () => true },
    productUI: { notify() {} }
  };

  return vm.createContext({
    window,
    document,
    localStorage,
    sessionStorage,
    Headers,
    Request,
    URL,
    console,
    confirm: () => true,
    alert() {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => { callback(); return 1; },
    clearTimeout() {}
  });
}

test('logout remove dados sensíveis legados e preserva o tema', () => {
  const localStorage = new StorageMock({
    'autoassis:theme': 'dark',
    'autoassis:layout-density': 'compact',
    'autoassis:remember-email': 'cliente@example.com',
    'autoassis:ocultos-cliente:cliente%40example.com': '[1,2]',
    authToken: 'token-legado',
    authUsuario: '{"email":"cliente@example.com"}',
    nomeUsuario: 'Cliente',
    emailUsuario: 'cliente@example.com',
    estoque: '{"1":{"preco":199.9}}',
    solicitacoes: '{"1":{"nomeCliente":"Cliente","custoSugerido":500}}',
    movimentacoes: '[{"valor":50}]',
    faturamento: '{"total":1000}',
    ocultosGerente: '[1]',
    pecaEditandoId: '5'
  });
  const sessionStorage = new StorageMock({
    authToken: 'token-atual',
    authUsuario: '{"tipo":"gerente"}'
  });
  const contexto = contextoBase(localStorage, sessionStorage);
  const codigo = fs.readFileSync(path.join(raiz, 'auth.js'), 'utf8');

  vm.runInContext(codigo, contexto, { filename: 'auth.js' });
  contexto.window.apiAuth.logout();

  assert.equal(localStorage.getItem('autoassis:theme'), 'dark');
  assert.equal(localStorage.getItem('autoassis:layout-density'), 'compact');
  assert.equal(contexto.document.documentElement.dataset.theme, 'dark');
  [
    'autoassis:remember-email',
    'autoassis:ocultos-cliente:cliente%40example.com',
    'authToken',
    'authUsuario',
    'nomeUsuario',
    'emailUsuario',
    'estoque',
    'solicitacoes',
    'movimentacoes',
    'faturamento',
    'ocultosGerente',
    'pecaEditandoId'
  ].forEach((key) => assert.equal(localStorage.getItem(key), null, `${key} deveria ser removida`));
  assert.equal(sessionStorage.getItem('authToken'), null);
  assert.equal(sessionStorage.getItem('authUsuario'), null);
  assert.equal(contexto.window.location.href, '/login.html');
});
test('sincronização de estoque mantém respostas somente em memória e não consulta solicitações', async () => {
  const localStorage = new StorageMock({
    estoque: '{"1":{"preco":99.9}}',
    solicitacoes: '{"1":{"nomeCliente":"Pessoa","telefone":"11999999999"}}'
  });
  const contexto = contextoBase(localStorage);
  const requisicoes = [];
  contexto.fetch = contexto.window.fetch = async (url) => {
    requisicoes.push(url);
    return {
      ok: true,
      json: async () => [{
        id: 7,
        nome: 'Filtro de óleo',
        categoria: 'Filtros',
        quantidade: 4,
        min: 2,
        preco: 49.9,
        fornecedor: 'Dado não persistente'
      }]
    };
  };
  const codigo = fs.readFileSync(path.join(raiz, 'scripts.js'), 'utf8');

  vm.runInContext(codigo, contexto, { filename: 'scripts.js' });
  await vm.runInContext('sincronizarEstoqueComBanco()', contexto);

  assert.deepEqual(requisicoes, ['/api/pecas']);
  assert.equal(localStorage.getItem('estoque'), null);
  assert.equal(localStorage.getItem('solicitacoes'), null);
  assert.equal(localStorage.gravacoes.length, 0, 'a resposta da API não deve ser persistida');
  assert.doesNotMatch(codigo, /fetch\(\s*['"]\/api\/solicitacoes/);
  assert.doesNotMatch(codigo, /localStorage\.setItem\(\s*['"](?:estoque|solicitacoes)['"]/);
});
