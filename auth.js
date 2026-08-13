'use strict';

// Aplica o tema antes do carregamento do CSS para evitar um clarão na troca
// de páginas. A preferência é local ao navegador e não contém dados pessoais.
const AUTOASSIS_THEME_KEY = 'autoassis:theme';
try {
  const temaSalvo = localStorage.getItem(AUTOASSIS_THEME_KEY);
  const temaInicial = ['light', 'dark'].includes(temaSalvo)
    ? temaSalvo
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = temaInicial;
} catch {
  document.documentElement.dataset.theme = 'light';
}

// Mantém a página invisível somente durante a montagem inicial do shell.
// Isso evita que o HTML antigo apareça por um instante antes do ui.js aplicar
// a navegação e as classes compartilhadas.
document.documentElement.classList.add('aa-booting');
const revelarAutoAssis = () => document.documentElement.classList.add('aa-ready');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(revelarAutoAssis), { once: true });
} else {
  requestAnimationFrame(revelarAutoAssis);
}
// Fallback defensivo: a interface nunca fica oculta caso outro script falhe.
setTimeout(revelarAutoAssis, 1200);

(() => {
  // Evita inicializar o arquivo mais de uma vez.
  if (window.apiAuth?.__initialized) return;

  const nativeFetch = window.fetch.bind(window);

  const TOKEN_KEY = 'authToken';
  const USER_KEY = 'authUsuario';
  const LEGACY_SENSITIVE_KEYS = new Set([
    TOKEN_KEY,
    USER_KEY,
    'token',
    'jwt',
    'usuario',
    'usuarioLogado',
    'dadosUsuario',
    'nomeUsuario',
    'emailUsuario',
    'nomeClienteLogado',
    'emailClienteLogado',
    'nomeGerenteLogado',
    'emailGerenteLogado',
    'autoassis:remember-email',
    'estoque',
    'solicitacoes',
    'servicos',
    'movimentacoes',
    'faturamento',
    'ocultosGerente',
    'ocultosCliente',
    'pecaEditandoId'
  ]);
  const LEGACY_SENSITIVE_PREFIXES = [
    'autoassis:auth:',
    'autoassis:session:',
    'autoassis:sessao:',
    'autoassis:user:',
    'autoassis:usuario:',
    'autoassis:cliente:',
    'autoassis:gerente:',
    'autoassis:cache:',
    'autoassis:estoque:',
    'autoassis:solicitacoes:',
    'autoassis:servicos:',
    'autoassis:movimentacoes:',
    'autoassis:faturamento:',
    'autoassis:ocultos-cliente:'
  ];
  const ROLE_PERMISSIONS = Object.freeze({
    gerente: ['*'],
    mecanico: [
      'dashboard.read',
      'inventory.read',
      'inventory.create',
      'movements.read',
      'movements.write',
      'services.read',
      'services.write',
      'services.quote',
      'services.archive',
      'services.contract',
      'consultations.read'
    ],
    cliente: ['client.requests.read', 'client.requests.write']
  });

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

  function isLegacySensitiveKey(key) {
    if (!key || key === AUTOASSIS_THEME_KEY) return false;
    const normalized = String(key).toLowerCase();
    return LEGACY_SENSITIVE_KEYS.has(key) ||
      LEGACY_SENSITIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  function clearLegacySensitiveStorage() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key) keys.push(key);
      }
      keys.filter(isLegacySensitiveKey).forEach((key) => localStorage.removeItem(key));
    } catch (erro) {
      console.warn('Não foi possível limpar todos os dados locais legados.');
    }
  }

  function clearSession() {
    // Limpa somente a sessão desta aba.
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    // Remove PII, credenciais, dados financeiros e caches de versões antigas.
    // A preferência de tema é deliberadamente preservada.
    clearLegacySensitiveStorage();
  }

  function logout() {
    clearSession();
    window.location.href = '/login.html';
  }

  function homeForRole(tipo) {
    return tipo === 'cliente' ? '/cliente.html' : '/dashboard.html';
  }

  function can(permission) {
    const role = getUsuario()?.tipo;
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes('*') || permissions.includes(permission);
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

    const tiposPermitidos = tipoPermitido
      ? (Array.isArray(tipoPermitido) ? tipoPermitido : [tipoPermitido])
      : [];

    if (tiposPermitidos.length && !tiposPermitidos.includes(usuario.tipo)) {
      window.location.href = homeForRole(usuario.tipo);

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
    requireAuth,
    can,
    homeForRole
  };

  // Mantém compatibilidade com páginas antigas
  // que usam fetch diretamente.
  window.fetch = authenticatedFetch;

  // Protege as telas mesmo quando o endereço é digitado diretamente.
  const paginaAtual = window.location.pathname.split('/').pop() || '';
  const paginasOperacionais = new Set([
    'dashboard.html',
    'estoque.html',
    'movimentacao.html',
    'servicos.html',
    'consultas.html',
    'novamovimentacao.html',
    'gerenciar_solicitacao.html',
    'criarpeca.html'
  ]);
  const paginasGerente = new Set([
    'relatorio.html',
    'novaos.html',
    'gerentes.html'
    ,'auditoria.html'
  ]);
  const paginasCliente = new Set(['cliente.html', 'novasoli.html']);

  if (paginasOperacionais.has(paginaAtual)) requireAuth(['gerente', 'mecanico']);
  if (paginasGerente.has(paginaAtual)) requireAuth('gerente');
  if (paginasCliente.has(paginaAtual)) requireAuth('cliente');
})();
