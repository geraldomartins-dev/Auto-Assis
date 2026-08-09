// -----------------------------------------------------------
// 1. BASE DE DADOS (Sincronização com MySQL)
// -----------------------------------------------------------

// Dados vindos da API permanecem apenas na memória desta página. Respostas de
// solicitações contêm PII e valores financeiros; o estoque também pode conter
// preços. Nenhuma dessas respostas deve sobreviver ao fechamento da aba.
let estoqueEmMemoria = Object.create(null);

function removerCachesPersistentesLegados() {
    try {
        [
            'estoque',
            'solicitacoes',
            'autoassis:cache:estoque',
            'autoassis:cache:solicitacoes'
        ].forEach((chave) => localStorage.removeItem(chave));
    } catch (erro) {
        console.warn('Não foi possível remover caches locais legados.');
    }
}

removerCachesPersistentesLegados();

function normalizarId(valor) {
    const id = Number(valor);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizarNumero(valor, padrao = 0) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : padrao;
}

function normalizarTexto(valor, padrao = '', limite = 160) {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    return (texto || padrao).slice(0, limite);
}

function criarNo(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function podeGerenciarEstoque() {
    return Boolean(window.apiAuth?.can?.('inventory.write'));
}

const getEstoque = () => estoqueEmMemoria;
const setEstoque = (dados) => {
    estoqueEmMemoria = dados && typeof dados === 'object' && !Array.isArray(dados)
        ? dados
        : Object.create(null);
};

// -- SINCRONIZAR ESTOQUE --
async function sincronizarEstoqueComBanco() {
    try {
        const resposta = await fetch('/api/pecas');
        if (!resposta.ok) throw new Error('Não foi possível carregar o estoque');
        const pecas = await resposta.json();
        if (!Array.isArray(pecas)) throw new Error('Resposta de estoque inválida');
        const estoqueAtualizado = Object.create(null);
        pecas.forEach(p => {
            const id = normalizarId(p?.id);
            if (id) estoqueAtualizado[id] = p;
        });
        setEstoque(estoqueAtualizado);
        if (typeof aplicarFiltrosEstoque === 'function') aplicarFiltrosEstoque();
    } catch (e) { console.error('Erro ao sincronizar estoque'); }
}

// -- DELETAR PEÇA --
async function deletarPeca(id) {
    if (!podeGerenciarEstoque()) {
        window.productUI?.notify?.('Seu perfil possui acesso somente à consulta do estoque.', 'warning');
        return;
    }
    const pecaId = normalizarId(id);
    if (!pecaId) {
        (typeof mostrarToast === "function" ? mostrarToast : alert)("Identificador de peça inválido.");
        return;
    }
    if (!confirm("Deseja realmente excluir esta peça?")) return;
    try {
        const res = await fetch(`/api/pecas/${pecaId}`, { method: 'DELETE' });
        if (res.ok) {
            (typeof mostrarToast === "function" ? mostrarToast : alert)("Peça excluída!");
            sincronizarEstoqueComBanco();
        } else {
            const dados = await res.json().catch(() => ({}));
            window.productUI?.notify?.(dados.erro || 'Não foi possível excluir a peça.', 'error');
        }
    } catch (e) { (typeof mostrarToast === "function" ? mostrarToast : alert)("Erro ao deletar"); }
}

// -----------------------------------------------------------
// 2. RENDERIZAÇÃO DO ESTOQUE
// -----------------------------------------------------------

function aplicarFiltrosEstoque() {
    const estoque = getEstoque();
    const container = document.getElementById('pecasContainer');
    if (!container) return;

    const busca = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const cat = document.getElementById('categoriaFilter')?.value || 'todas';

    let pecas = Object.values(estoque).filter(p => p && typeof p === 'object');

    if (busca) pecas = pecas.filter(p => normalizarTexto(p.nome).toLowerCase().includes(busca) || String(normalizarId(p.id) || '').includes(busca));
    if (cat !== 'todas') pecas = pecas.filter(p => normalizarTexto(p.categoria) === cat);

    container.replaceChildren();
    
    if (pecas.length === 0) {
        const vazio = criarNo('p', '', 'Nenhuma peça encontrada.');
        vazio.style.padding = '20px';
        vazio.style.color = '#888';
        container.appendChild(vazio);
        return;
    }

    pecas.forEach(p => {
        const id = normalizarId(p.id);
        const quantidade = Math.max(0, normalizarNumero(p.quantidade));
        const minimo = Math.max(0, normalizarNumero(p.min));
        const precoDisponivel = p.preco !== undefined && p.preco !== null && podeGerenciarEstoque();
        const preco = Math.max(0, normalizarNumero(p.preco));
        const isLow = quantidade <= minimo;
        const card = criarNo('div', 'card');
        card.style.borderLeft = `5px solid ${isLow ? 'var(--danger)' : 'var(--success)'}`;

        const titulo = criarNo('h3', '', `${normalizarTexto(p.nome, 'Peça sem nome')} `);
        const codigo = criarNo('span', '', `#${id || '—'}`);
        codigo.style.color = 'var(--accent)';
        titulo.appendChild(codigo);

        const categoria = criarNo('p', '', `Categoria: ${normalizarTexto(p.categoria, 'Sem categoria')}`);
        const estoque = criarNo('p', '', 'Qtd: ');
        const quantidadeNo = criarNo('b', '', String(quantidade));
        quantidadeNo.style.color = isLow ? 'var(--danger)' : 'var(--success)';
        estoque.append(quantidadeNo, document.createTextNode(` (Min: ${minimo})`));
        const valor = precoDisponivel
            ? criarNo('p', '', `Preço: ${preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
            : null;

        const conteudo = [titulo, categoria, estoque];
        if (valor) conteudo.push(valor);

        if (podeGerenciarEstoque()) {
            const acoes = criarNo('div', 'inventory-card-actions');
            const editar = criarNo('button', '', 'Editar');
            editar.type = 'button';
            const excluir = criarNo('button', 'danger-action', 'Excluir');
            excluir.type = 'button';

            if (id) {
                editar.addEventListener('click', () => prepararEdicao(id));
                excluir.addEventListener('click', () => deletarPeca(id));
            } else {
                editar.disabled = true;
                excluir.disabled = true;
            }
            acoes.append(editar, excluir);
            conteudo.push(acoes);
        }

        card.append(...conteudo);
        container.appendChild(card);
    });
}

// Função para levar o ID para a página de edição
window.prepararEdicao = function(id) {
    if (!podeGerenciarEstoque()) {
        window.productUI?.notify?.('Seu perfil não pode editar peças.', 'warning');
        return;
    }
    const pecaId = normalizarId(id);
    if (!pecaId) return;
    localStorage.setItem('pecaEditandoId', String(pecaId));
    window.location.href = 'criarpeca.html';
};

// -----------------------------------------------------------
// 3. INICIALIZAÇÃO
// -----------------------------------------------------------

window.onload = function() {
    sincronizarEstoqueComBanco();
    
    // Configura busca em tempo real
    document.getElementById('searchInput')?.addEventListener('input', aplicarFiltrosEstoque);
    document.getElementById('categoriaFilter')?.addEventListener('change', aplicarFiltrosEstoque);

    // Exporta funções para o escopo global
    window.sincronizarEstoqueComBanco = sincronizarEstoqueComBanco;
    window.deletarPeca = deletarPeca;
    window.aplicarFiltrosEstoque = aplicarFiltrosEstoque;
};
