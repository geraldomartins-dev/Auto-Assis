// -----------------------------------------------------------
// 1. BASE DE DADOS (Sincronização com MySQL)
// -----------------------------------------------------------

// Auxiliares para Cache Local (Apenas para não quebrar funções legadas)
const getEstoque = () => JSON.parse(localStorage.getItem('estoque') || '{}');
const setEstoque = (dados) => localStorage.setItem('estoque', JSON.stringify(dados));
const getSolicitacoes = () => JSON.parse(localStorage.getItem('solicitacoes') || '{}');
const setSolicitacoes = (dados) => localStorage.setItem('solicitacoes', JSON.stringify(dados));

// -- SINCRONIZAR ESTOQUE --
async function sincronizarEstoqueComBanco() {
    try {
        const resposta = await fetch('http://localhost:3000/api/pecas');
        const pecas = await resposta.json();
        const estoqueAtualizado = {};
        pecas.forEach(p => {
            estoqueAtualizado[p.id] = p;
        });
        setEstoque(estoqueAtualizado);
        if (typeof aplicarFiltrosEstoque === 'function') aplicarFiltrosEstoque();
    } catch (e) { console.error('Erro ao sincronizar estoque'); }
}

// -- SINCRONIZAR SOLICITAÇÕES --
async function sincronizarSolicitacoesComBanco() {
    try {
        const resposta = await fetch('http://localhost:3000/api/solicitacoes');
        const dados = await resposta.json();
        const atualizadas = {};
        dados.forEach(sol => {
            atualizadas[sol.id] = sol;
        });
        setSolicitacoes(atualizadas);

        // Dispara atualizações de UI dependendo da página
        if (document.title.includes("Serviços")) {
            if (typeof carregarServicos === 'function') carregarServicos();
        } 
        if (document.title.includes("Minhas Solicitações")) {
            if (typeof carregarDadosCliente === 'function') carregarDadosCliente();
        }
    } catch (e) { console.error('Erro ao sincronizar solicitações'); }
}

// -- DELETAR PEÇA --
async function deletarPeca(id) {
    if (!confirm("Deseja realmente excluir esta peça?")) return;
    try {
        const res = await fetch(`http://localhost:3000/api/pecas/${id}`, { method: 'DELETE' });
        if (res.ok) {
            (typeof mostrarToast === "function" ? mostrarToast : alert)("Peça excluída!");
            sincronizarEstoqueComBanco();
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

    let pecas = Object.values(estoque);

    if (busca) pecas = pecas.filter(p => p.nome.toLowerCase().includes(busca) || String(p.id).includes(busca));
    if (cat !== 'todas') pecas = pecas.filter(p => p.categoria === cat);

    container.innerHTML = '';
    
    if (pecas.length === 0) {
        container.innerHTML = '<p style="padding:20px; color:#888;">Nenhuma peça encontrada.</p>';
        return;
    }

    pecas.forEach(p => {
        const isLow = p.quantidade <= p.min;
        const card = `
            <div class="card" style="border-left: 5px solid ${isLow ? 'var(--danger)' : 'var(--success)'}">
                <h3>${p.nome} <span style="color:var(--accent)">#${p.id}</span></h3>
                <p>Categoria: ${p.categoria}</p>
                <p>Qtd: <b style="color:${isLow ? 'var(--danger)' : 'var(--success)'}">${p.quantidade}</b> (Min: ${p.min})</p>
                <p>Preço: R$ ${parseFloat(p.preco).toFixed(2)}</p>
                <div style="display:flex; gap:5px; margin-top:10px;">
                    <button onclick="prepararEdicao(${p.id})" style="flex:1; background:rgba(255,255,255,0.1); border-radius:5px; padding:5px; cursor:pointer; color:white; border:none;">Editar</button>
                    <button onclick="deletarPeca(${p.id})" style="flex:1; background:rgba(255,77,77,0.2); color:var(--danger); border-radius:5px; padding:5px; cursor:pointer; border:none;">Excluir</button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });
}

// Função para levar o ID para a página de edição
window.prepararEdicao = function(id) {
    localStorage.setItem('pecaEditandoId', id);
    window.location.href = 'criarpeca.html';
};

// -----------------------------------------------------------
// 3. INICIALIZAÇÃO
// -----------------------------------------------------------

window.onload = function() {
    sincronizarEstoqueComBanco();
    sincronizarSolicitacoesComBanco();
    
    // Configura busca em tempo real
    document.getElementById('searchInput')?.addEventListener('input', aplicarFiltrosEstoque);
    document.getElementById('categoriaFilter')?.addEventListener('change', aplicarFiltrosEstoque);

    // Exporta funções para o escopo global
    window.sincronizarEstoqueComBanco = sincronizarEstoqueComBanco;
    window.deletarPeca = deletarPeca;
    window.aplicarFiltrosEstoque = aplicarFiltrosEstoque;
};