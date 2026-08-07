'use strict';

(() => {
  // Evita inicializar o arquivo mais de uma vez.
  if (window.apiAuth?.__initialized) return;

  const nativeFetch = window.fetch.bind(window);

  const TOKEN_KEY = 'authToken';
  const USER_KEY = 'authUsuario';

  // A autenticação fica separada por aba.
  function setSession(token, usuario) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(usuario));
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUsuario() {
    try {
      return JSON.parse(
        sessionStorage.getItem(USER_KEY) || 'null'
      );
    } catch {
      return null;
    }
  }

  function clearSession() {
    // Limpa somente a sessão desta aba.
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    // Remove dados antigos usados pelas páginas legadas.
    [
      'nomeUsuario',
      'emailUsuario',
      'nomeClienteLogado',
      'emailClienteLogado',
      'nomeGerenteLogado',
      'emailGerenteLogado'
    ].forEach((key) => localStorage.removeItem(key));
  }

  function logout() {
    clearSession();
    window.location.href = '/login.html';
  }

  function isApiRequest(input) {
    const value =
      typeof input === 'string'
        ? input
        : input?.url;

    if (!value) return false;

    try {
      const url = new URL(
        value,
        window.location.origin
      );

      return (
        url.origin === window.location.origin &&
        url.pathname.startsWith('/api/')
      );
    } catch {
      return false;
    }
  }

  async function authenticatedFetch(
    input,
    options = {}
  ) {
    const headers = new Headers(
      options.headers ||
      (
        input instanceof Request
          ? input.headers
          : undefined
      )
    );

    const token = getToken();

    if (
      isApiRequest(input) &&
      token &&
      !headers.has('Authorization')
    ) {
      headers.set(
        'Authorization',
        `Bearer ${token}`
      );
    }

    const response = await nativeFetch(
      input,
      {
        ...options,
        headers
      }
    );

    if (
      response.status === 401 &&
      isApiRequest(input)
    ) {
      clearSession();

      const publicPages = [
        '/login.html',
        '/cadastro.html',
        '/recuperar.html',
        '/nova-senha.html'
      ];

      if (
        !publicPages.includes(
          window.location.pathname
        )
      ) {
        window.location.href =
          '/login.html';
      }
    }

    return response;
  }

  function requireAuth(
    tipoPermitido = null
  ) {
    const token = getToken();
    const usuario = getUsuario();

    if (!token || !usuario) {
      window.location.href =
        '/login.html';

      return null;
    }

    if (
      tipoPermitido &&
      usuario.tipo !== tipoPermitido
    ) {
      window.location.href =
        usuario.tipo === 'gerente'
          ? '/dashboard.html'
          : '/cliente.html';

      return null;
    }

    return usuario;
  }

  window.apiAuth = {
    __initialized: true,
    setSession,
    getToken,
    getUsuario,
    clearSession,
    logout,
    fetch: authenticatedFetch,
    requireAuth
  };


  window.fetch = authenticatedFetch;

  // Protege as telas mesmo quando o endereço é digitado diretamente.
  const paginaAtual = window.location.pathname.split('/').pop() || '';
  const paginasGerente = new Set([
    'dashboard.html',
    'estoque.html',
    'movimentacao.html',
    'servicos.html',
    'relatorio.html',
    'consultas.html',
    'novaos.html',
    'novamovimentacao.html',
    'criarpeca.html',
    'gerenciar_solicitacao.html'
  ]);
  const paginasCliente = new Set(['cliente.html', 'novasoli.html']);

  if (paginasGerente.has(paginaAtual)) requireAuth('gerente');
  if (paginasCliente.has(paginaAtual)) requireAuth('cliente');
})();