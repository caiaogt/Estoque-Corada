const estoqueBody = document.getElementById('estoque-body');
const estoqueBusca = document.getElementById('estoque-busca');
const estoqueUltimasMovBody = document.getElementById('estoque-ultimas-mov-body');

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
      <td data-label="Saldo Nosso" class="${p.saldo_nosso < 0 ? 'saldo-negativo' : ''}">${p.saldo_nosso}</td>
      <td data-label="Entradas (mês)">${p.entradas_mes}</td>
      <td data-label="Saídas (mês)">${p.saidas_mes}</td>
      <td data-label="Saldo Total" class="${p.saldo < 0 ? 'saldo-negativo' : ''} celula-destaque">${p.saldo}</td>
      <td data-label="Saldo Base 01" class="${p.saldo_base01 < 0 ? 'saldo-negativo' : ''}">${p.saldo_base01}</td>
      <td data-label="Preço B2B">${p.preco_b2b != null ? `R$ ${formatMoney(p.preco_b2b)}` : '—'}</td>
      <td data-label="Valor Total" class="celula-destaque">${p.valor_total != null ? `R$ ${formatMoney(p.valor_total)}` : '—'}</td>
    `;
    estoqueBody.appendChild(row);
  });
}

async function carregarUltimasMovimentacoes() {
  const movs = await api('/movimentacoes?limit=8');
  estoqueUltimasMovBody.innerHTML = '';

  if (movs.length === 0) {
    estoqueUltimasMovBody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhuma movimentação registrada.</td></tr>';
    return;
  }

  movs.forEach((m) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span class="status-badge ${m.tipo === 'ENTRADA' ? 'ativo' : 'arquivado'}">${m.tipo === 'ENTRADA' ? '↑ Entrada' : '↓ Saída'}</span></td>
      <td>${m.produto_codigo} — ${m.produto_descricao}</td>
      <td>${m.quantidade}</td>
      <td>${m.data}</td>
    `;
    estoqueUltimasMovBody.appendChild(row);
  });
}

estoqueBusca.addEventListener('input', () => carregarEstoque());
document.addEventListener('tab:estoque', () => {
  carregarEstoque();
  carregarUltimasMovimentacoes();
});
