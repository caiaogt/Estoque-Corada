const estoqueBody = document.getElementById('estoque-body');
const estoqueBusca = document.getElementById('estoque-busca');
const estoqueTotalItens = document.getElementById('estoque-total-itens');
const estoqueTotalUnidades = document.getElementById('estoque-total-unidades');
const estoqueTotalValor = document.getElementById('estoque-total-valor');

let ultimoEstoque = [];
const estoqueSortable = createSortable(document.getElementById('estoque-thead'), () => {
  renderEstoque(estoqueSortable.sort(ultimoEstoque));
});

createColumnToggle(
  document.getElementById('estoque-tabela'),
  'colunas-estoque',
  document.getElementById('estoque-colunas-mount')
);

async function carregarEstoque() {
  const params = new URLSearchParams({ ativo: '1' });
  if (estoqueBusca.value.trim()) params.set('q', estoqueBusca.value.trim());

  const estoque = await api(`/estoque?${params.toString()}`);
  ultimoEstoque = estoque;
  renderResumoEstoque(estoque);
  renderEstoque(estoqueSortable.sort(estoque));
}

function renderEstoque(estoque) {
  estoqueBody.innerHTML = '';

  if (estoque.length === 0) {
    estoqueBody.innerHTML = '<tr class="empty-row"><td colspan="11">Nenhum produto encontrado.</td></tr>';
    return;
  }

  estoque.forEach((p) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Código"><strong>${p.codigo}</strong></td>
      <td data-label="Descrição">${p.descricao}</td>
      <td data-label="Marca">${p.marca}</td>
      <td data-label="Linha">${p.linha ? LINHA_LABEL[p.linha] || p.linha : '—'}</td>
      <td data-label="Entradas">${p.total_entradas}</td>
      <td data-label="Saídas">${p.total_saidas}</td>
      <td data-label="Saldo Total" class="${p.saldo < 0 ? 'saldo-negativo' : ''} celula-destaque">${p.saldo}</td>
      <td data-label="Saldo Nosso" class="${p.saldo_nosso < 0 ? 'saldo-negativo' : ''}">${p.saldo_nosso}</td>
      <td data-label="Saldo Base 01" class="${p.saldo_base01 < 0 ? 'saldo-negativo' : ''}">${p.saldo_base01}</td>
      <td data-label="Preço B2B">${p.preco_b2b != null ? `R$ ${formatMoney(p.preco_b2b)}` : '—'}</td>
      <td data-label="Valor Total" class="celula-destaque">${p.valor_total != null ? `R$ ${formatMoney(p.valor_total)}` : '—'}</td>
    `;
    estoqueBody.appendChild(row);
  });
}

function renderResumoEstoque(estoque) {
  const totalUnidades = estoque.reduce((sum, p) => sum + p.saldo, 0);
  const totalValor = estoque.reduce((sum, p) => sum + (p.valor_total || 0), 0);

  estoqueTotalItens.textContent = estoque.length;
  estoqueTotalUnidades.textContent = totalUnidades;
  estoqueTotalValor.textContent = formatMoney(totalValor);
}

estoqueBusca.addEventListener('input', () => carregarEstoque());
document.addEventListener('tab:estoque', carregarEstoque);
