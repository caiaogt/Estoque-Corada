const produtoForm = document.getElementById('produto-form');
const produtoFeedback = document.getElementById('produto-feedback');
const produtoFormTitle = document.getElementById('produto-form-title');
const produtoCancelarBtn = document.getElementById('produto-cancelar');
const produtosBody = document.getElementById('produtos-body');
const produtoBusca = document.getElementById('produto-busca');
const produtoFiltroMarca = document.getElementById('produto-filtro-marca');
const produtoMostrarArquivados = document.getElementById('produto-mostrar-arquivados');

const LINHA_LABEL = {
  ESSENCIAL: 'Essencial',
  SABOR_TRADICAO: 'Sabor & Tradição',
  SELECAO_ESPECIAL: 'Seleção Especial',
  PREMIUM: 'Premium',
};

function formatMoney(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let ultimosProdutos = [];
const produtosSortable = createSortable(document.getElementById('produtos-thead'), () => {
  renderProdutos(produtosSortable.sort(ultimosProdutos));
});

async function carregarProdutos() {
  const params = new URLSearchParams();
  if (produtoBusca.value.trim()) params.set('q', produtoBusca.value.trim());
  if (produtoFiltroMarca.value) params.set('marca', produtoFiltroMarca.value);
  if (!produtoMostrarArquivados.checked) params.set('ativo', '1');

  const produtos = await api(`/produtos?${params.toString()}`);
  ultimosProdutos = produtos;
  renderProdutos(produtosSortable.sort(produtos));
  return produtos;
}

function renderProdutos(produtos) {
  produtosBody.innerHTML = '';

  if (produtos.length === 0) {
    produtosBody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum produto encontrado.</td></tr>';
    return;
  }

  produtos.forEach((p) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${p.codigo}</td>
      <td>${p.descricao}</td>
      <td>${p.marca}</td>
      <td>${p.linha ? LINHA_LABEL[p.linha] || p.linha : '—'}</td>
      <td>${p.preco_b2b != null ? `R$ ${formatMoney(p.preco_b2b)}` : '—'}</td>
      <td><span class="status-badge ${p.ativo ? 'ativo' : 'arquivado'}">${p.ativo ? 'Ativo' : 'Arquivado'}</span></td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-small" data-action="editar" data-id="${p.id}">Editar</button>
        <button class="btn btn-ghost btn-small" data-action="status" data-id="${p.id}" data-ativo="${p.ativo}">
          ${p.ativo ? 'Arquivar' : 'Reativar'}
        </button>
        <button class="btn btn-danger btn-small" data-action="excluir" data-id="${p.id}" data-codigo="${p.codigo}">Excluir</button>
      </td>
    `;
    produtosBody.appendChild(row);
  });
}

function iniciarEdicaoProduto(produto) {
  produtoForm.id.value = produto.id;
  produtoForm.codigo.value = produto.codigo;
  produtoForm.descricao.value = produto.descricao;
  produtoForm.marca.value = produto.marca;
  produtoForm.linha.value = produto.linha || '';
  produtoForm.preco_b2b.value = produto.preco_b2b != null ? produto.preco_b2b : '';
  produtoFormTitle.textContent = `Editar Produto — ${produto.codigo}`;
  produtoCancelarBtn.hidden = false;
  produtoForm.codigo.focus();
}

function resetarFormularioProduto() {
  produtoForm.reset();
  produtoForm.id.value = '';
  produtoFormTitle.textContent = 'Novo Produto';
  produtoCancelarBtn.hidden = true;
}

produtoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback(produtoFeedback, '');

  const id = produtoForm.id.value;
  const payload = {
    codigo: produtoForm.codigo.value.trim(),
    descricao: produtoForm.descricao.value.trim(),
    marca: produtoForm.marca.value,
    linha: produtoForm.linha.value || null,
    preco_b2b: produtoForm.preco_b2b.value || null,
  };

  try {
    if (id) {
      await api(`/produtos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showFeedback(produtoFeedback, 'Produto atualizado.', true);
    } else {
      await api('/produtos', { method: 'POST', body: JSON.stringify(payload) });
      showFeedback(produtoFeedback, 'Produto cadastrado.', true);
    }
    resetarFormularioProduto();
    carregarProdutos();
  } catch (err) {
    showFeedback(produtoFeedback, err.message);
  }
});

produtoCancelarBtn.addEventListener('click', resetarFormularioProduto);

produtosBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, id, ativo, codigo } = btn.dataset;

  if (action === 'editar') {
    const produto = await api(`/produtos/${id}`);
    iniciarEdicaoProduto(produto);
  }

  if (action === 'status') {
    await api(`/produtos/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: ativo === 'true' ? 0 : 1 }),
    });
    carregarProdutos();
  }

  if (action === 'excluir') {
    const confirmado = confirm(
      `Excluir o produto "${codigo}"? Isso apaga também todo o histórico de movimentações e ajustes desse produto, e não pode ser desfeito.`
    );
    if (!confirmado) return;

    try {
      await api(`/produtos/${id}`, { method: 'DELETE' });
      showFeedback(produtoFeedback, 'Produto excluído.', true);
      carregarProdutos();
    } catch (err) {
      showFeedback(produtoFeedback, err.message);
    }
  }
});

produtoBusca.addEventListener('input', () => carregarProdutos());
produtoFiltroMarca.addEventListener('change', () => carregarProdutos());
produtoMostrarArquivados.addEventListener('change', () => carregarProdutos());

document.addEventListener('tab:produtos', carregarProdutos);
document.addEventListener('DOMContentLoaded', carregarProdutos);
