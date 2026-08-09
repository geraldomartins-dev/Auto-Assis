'use strict';

(() => {
  const page = window.location.pathname.split('/').pop() || 'login.html';
  const pageName = page.replace('.html', '');
  const authPages = new Set(['login.html', 'cadastro.html', 'recuperar.html', 'nova-senha.html']);
  const clientPages = new Set(['cliente.html', 'novasoli.html']);

  const pageMeta = {
    'dashboard.html': ['AA/OPS-01', 'Visão geral'],
    'estoque.html': ['AA/INV-02', 'Inventário'],
    'movimentacao.html': ['AA/LOG-03', 'Rastreabilidade'],
    'servicos.html': ['AA/OS-04', 'Ordens de serviço'],
    'relatorio.html': ['AA/DAT-05', 'Inteligência operacional'],
    'consultas.html': ['AA/QRY-06', 'Consultas rápidas'],
    'gerentes.html': ['AA/ACL-07', 'Controle de acesso'],
    'auditoria.html': ['AA/AUD-08', 'Auditoria operacional'],
    'novaos.html': ['AA/OS-N', 'Nova ordem de serviço'],
    'novamovimentacao.html': ['AA/LOG-N', 'Novo lançamento'],
    'criarpeca.html': ['AA/INV-N', 'Ficha de peça'],
    'gerenciar_solicitacao.html': ['AA/OS-G', 'Gestão de atendimento'],
    'cliente.html': ['AA/CLI-01', 'Portal do cliente'],
    'novasoli.html': ['AA/CLI-N', 'Solicitar atendimento'],
    'login.html': ['AA/SEC-01', 'Acesso seguro'],
    'cadastro.html': ['AA/SEC-02', 'Nova conta'],
    'recuperar.html': ['AA/SEC-03', 'Recuperar acesso'],
    'nova-senha.html': ['AA/SEC-04', 'Redefinir senha']
  };

  const managerNavigation = [
    ['dashboard.html', 'Painel de operação'],
    ['estoque.html', 'Estoque'],
    ['movimentacao.html', 'Movimentações'],
    ['servicos.html', 'Serviços'],
    ['relatorio.html', 'Relatórios'],
    ['consultas.html', 'Consultas'],
    ['gerentes.html', 'Acessos'],
    ['auditoria.html', 'Auditoria']
  ];
  const mechanicNavigation = [
    ['dashboard.html', 'Painel de operação'],
    ['estoque.html', 'Estoque'],
    ['movimentacao.html', 'Movimentações'],
    ['servicos.html', 'Serviços'],
    ['consultas.html', 'Consultas']
  ];
  const clientNavigation = [
    ['cliente.html', 'Meus atendimentos'],
    ['novasoli.html', 'Solicitar atendimento']
  ];
  const navigationParent = {
    'criarpeca.html': 'estoque.html',
    'novamovimentacao.html': 'movimentacao.html',
    'novaos.html': 'servicos.html',
    'gerenciar_solicitacao.html': 'servicos.html'
  };

  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const THEME_KEY = 'autoassis:theme';

  function getTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme, persist = true) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = normalized;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, normalized); } catch { /* Preferência opcional. */ }
    }
    window.dispatchEvent(new CustomEvent('autoassis:themechange', { detail: { theme: normalized } }));
    return normalized;
  }

  function createThemeToggle(extraClass = '') {
    const button = create('button', `theme-toggle${extraClass ? ` ${extraClass}` : ''}`);
    button.type = 'button';
    const label = create('span', 'theme-toggle-label', 'TEMA');
    const value = create('strong', 'theme-toggle-value');
    button.append(label, value);

    const update = () => {
      const dark = getTheme() === 'dark';
      value.textContent = dark ? 'ESCURO' : 'CLARO';
      button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.setAttribute('aria-pressed', String(dark));
      button.dataset.theme = dark ? 'dark' : 'light';
    };
    button.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));
    window.addEventListener('autoassis:themechange', update);
    update();
    return button;
  }

  function notify(message, type = 'info') {
    let region = document.querySelector('.product-notifications');
    if (!region) {
      region = create('div', 'product-notifications');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const toast = create('div', `product-toast toast-${type}`, String(message || ''));
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 180);
    }, 4200);
  }

  window.productUI = { notify, getTheme, setTheme, toggleTheme: () => setTheme(getTheme() === 'dark' ? 'light' : 'dark') };
  document.documentElement.classList.add('aa-ui');
  document.body.classList.add(`page-${pageName}`);
  document.body.dataset.pageCode = pageMeta[page]?.[0] || 'AA/SYS';

  if (authPages.has(page)) {
    document.body.classList.add('auth-page');
    document.body.appendChild(createThemeToggle('theme-toggle-auth'));
    document.documentElement.classList.add('aa-shell-ready');
    requestAnimationFrame(() => document.documentElement.classList.add('aa-ready'));
    return;
  }

  const isClient = clientPages.has(page);
  const currentUser = window.apiAuth?.getUsuario?.();
  const currentRole = currentUser?.tipo || (isClient ? 'cliente' : 'gerente');
  document.body.classList.add('app-page', isClient ? 'client-page' : 'manager-page');
  document.body.classList.add(`role-${currentRole}`);
  const main = document.querySelector('main');
  const aside = document.querySelector('aside');

  if (aside) {
    aside.setAttribute('aria-label', 'Navegação principal');
    aside.dataset.rail = isClient ? 'portal-cliente' : 'oficina';

    const logo = aside.querySelector('.logo');
    if (logo && !logo.querySelector('.brand-code') && !logo.querySelector('small')) {
      logo.appendChild(create('small', 'brand-code', isClient ? 'PORTAL / CLIENTE' : 'WORKSHOP / SYSTEM'));
    }

    const nav = aside.querySelector('nav, .nav');
    if (nav) {
      nav.setAttribute('aria-label', isClient ? 'Navegação do cliente' : 'Módulos da oficina');
      const items = isClient
        ? clientNavigation
        : (currentRole === 'mecanico' ? mechanicNavigation : managerNavigation);
      nav.replaceChildren(...items.map(([href, label], index) => {
        const link = create('a', '', label);
        link.href = href;
        link.dataset.index = String(index + 1).padStart(2, '0');
        link.dataset.module = href.replace('.html', '');
        return link;
      }));

      nav.querySelectorAll('a[href]').forEach((link) => {
        const target = link.getAttribute('href')?.split('?')[0];
        if (target === (navigationParent[page] || page)) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      });
    }

    const userCard = aside.querySelector('.user, .perfil, .profile, .profile-card');
    if (userCard) {
      userCard.classList.add('profile-card');
      const usuario = currentUser;
      const nameElement = userCard.querySelector('strong, b, [data-user-name]');
      if (usuario?.nome && nameElement) nameElement.textContent = usuario.nome;
      const roleElement = userCard.querySelector('small');
      const roleLabels = { gerente: 'Gerente', mecanico: 'Mecânico', cliente: 'Cliente' };
      if (roleElement) roleElement.textContent = roleLabels[currentRole] || 'Usuário';
      userCard.dataset.label = isClient ? 'CONDUTOR' : 'PERFIL DE ACESSO';
    }

    const logoutControl = aside.querySelector(':scope > button, :scope > .logout, :scope > a.logout');
    aside.insertBefore(createThemeToggle('theme-toggle-rail'), userCard || logoutControl || null);

    const topbar = create('header', 'mobile-topbar');
    const mobileBrand = create('div', 'mobile-brand');
    mobileBrand.append(create('span', 'mark', 'A+'), create('span', '', 'Auto+Assis'));
    const menuButton = create('button', 'mobile-menu', 'MENU');
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', 'Abrir menu');
    menuButton.setAttribute('aria-expanded', 'false');
    const mobileControls = create('div', 'mobile-controls');
    mobileControls.append(createThemeToggle('theme-toggle-mobile'), menuButton);
    topbar.append(mobileBrand, mobileControls);
    document.body.prepend(topbar);

    const backdrop = create('button', 'nav-backdrop');
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Fechar menu');
    document.body.appendChild(backdrop);

    const toggleMenu = (open) => {
      document.body.classList.toggle('nav-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.textContent = open ? 'FECHAR' : 'MENU';
    };
    menuButton.addEventListener('click', () => toggleMenu(!document.body.classList.contains('nav-open')));
    backdrop.addEventListener('click', () => toggleMenu(false));
    nav?.addEventListener('click', (event) => {
      if (event.target.closest('a')) toggleMenu(false);
    });
  }

  if (main) {
    main.id ||= 'conteudo-principal';
    main.dataset.sheet = pageMeta[page]?.[0] || 'AA/SYS';

    const skipLink = create('a', 'skip-link', 'Pular para o conteúdo');
    skipLink.href = '#conteudo-principal';
    document.body.prepend(skipLink);

    const h1 = main.querySelector('h1');
    const hasStructuredHeading = Boolean(h1?.closest('.page-heading') || h1?.parentElement?.querySelector('.page-overline'));
    if (h1 && !hasStructuredHeading && !h1.previousElementSibling?.classList.contains('product-kicker')) {
      const kicker = create('div', 'product-kicker');
      kicker.append(create('span', 'kicker-code', pageMeta[page]?.[0] || 'AA/SYS'), create('span', '', pageMeta[page]?.[1] || 'Auto+Assis'));
      h1.before(kicker);
    }

    const headingContainer = h1?.closest('.header, .header-top');
    if (headingContainer && !headingContainer.querySelector('.system-chip')) {
      headingContainer.appendChild(create('span', 'system-chip', 'BASE ONLINE'));
    }

    const footer = create('footer', 'product-footer');
    footer.append(
      create('span', '', 'AUTO+ASSIS // SISTEMA OPERACIONAL DE OFICINA'),
      create('span', 'footer-code', `${pageMeta[page]?.[0] || 'AA/SYS'} · DADOS SINCRONIZADOS`)
    );
    main.appendChild(footer);
  }

  document.querySelectorAll('button:not([aria-label])').forEach((button) => {
    const label = button.textContent.trim();
    if (label) button.setAttribute('aria-label', label);
  });
  document.querySelectorAll('button').forEach((button) => {
    if (/atualizar/i.test(button.textContent)) button.classList.add('secondary-action');
  });

  if (currentRole === 'mecanico') {
    document.querySelectorAll('[data-manager-only], .manager-only').forEach((element) => element.remove());
    document.querySelector('.metric-value-card')?.setAttribute('hidden', '');
    document.getElementById('novaPecaBtn')?.setAttribute('hidden', '');
  }

  // Protege formulários editados contra saídas acidentais. A janela curta de
  // envio permite o redirecionamento após salvar; se a API falhar, a proteção volta.
  const guardedForms = [...document.querySelectorAll('form:not([data-dirty-guard="false"])')];
  let formularioAlterado = null;
  let enviandoAte = 0;
  guardedForms.forEach((form) => {
    form.addEventListener('input', () => { formularioAlterado = form; });
    form.addEventListener('change', () => { formularioAlterado = form; });
    form.addEventListener('reset', () => { if (formularioAlterado === form) formularioAlterado = null; });
    form.addEventListener('submit', () => { enviandoAte = Date.now() + 5000; });
  });
  const deveConfirmarSaida = () => Boolean(formularioAlterado) && Date.now() > enviandoAte;
  window.productUI.markSaved = (form = formularioAlterado) => {
    if (!form || formularioAlterado === form) formularioAlterado = null;
  };
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || !deveConfirmarSaida() || link.target === '_blank' || link.hasAttribute('download')) return;
    const destino = new URL(link.href, window.location.href);
    if (destino.href === window.location.href || destino.origin !== window.location.origin) return;
    if (!window.confirm('Existem alterações que ainda não foram salvas. Descartar alterações e sair?')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      formularioAlterado = null;
    }
  }, true);
  window.addEventListener('beforeunload', (event) => {
    if (!deveConfirmarSaida()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.documentElement.classList.add('aa-shell-ready');
  requestAnimationFrame(() => document.documentElement.classList.add('aa-ready'));
})();
