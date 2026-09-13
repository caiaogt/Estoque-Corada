const historicoBody = document.getElementById('historico-body');
const historicoTipo = document.getElementById('historico-tipo');
const historicoDe = document.getElementById('historico-de');
const historicoAte = document.getElementById('historico-ate');
const historicoFiltrarBtn = document.getElementById('historico-filtrar');
const historicoPaginacaoEl = document.getElementById('historico-paginacao');

const ORIGEM_LABEL = {
  MANUAL: 'Manual',
  LOTE: 'Lançamento Rápido',
  KIT: 'Saída de Kit',
  AJUSTE: 'Ajuste de Contagem',
  VENDA: 'Venda',
  BLING: 'Bling',
  ETIQUETA: 'Impressão de Etiquetas',
};

const HISTORICO_POR_PAGINA = 15;
let ultimoHistorico = [];
let historicoListaOrdenada = [];
let historicoPaginaAtual = 1;

const historicoSortable = createSortable(document.getElementById('historico-thead'), () => {
  historicoListaOrdenada = historicoSortable.sort(historicoListaOrdenada);
  irParaPaginaHistorico(historicoPaginaAtual);
});

async function carregarHistorico() {
  const params = new URLSearchParams({ limit: '1000' });
  if (historicoTipo.value) params.set('tipo', historicoTipo.value);
  if (historicoDe.value) params.set('data_de', historicoDe.value);
  if (historicoAte.value) params.set('data_ate', historicoAte.value);

  const movimentacoes = await api(`/movimentacoes?${params.toString()}`);
  ultimoHistorico = movimentacoes;
  historicoListaOrdenada = historicoSortable.sort(movimentacoes);
  irParaPaginaHistorico(1);
}

function irParaPaginaHistorico(pagina) {
  const totalPaginas = Math.max(1, Math.ceil(historicoListaOrdenada.length / HISTORICO_POR_PAGINA));
  historicoPaginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (historicoPaginaAtual - 1) * HISTORICO_POR_PAGINA;
  renderHistorico(historicoListaOrdenada.slice(inicio, inicio + HISTORICO_POR_PAGINA));
  renderPaginacaoHistorico(totalPaginas);
}

function renderPaginacaoHistorico(totalPaginas) {
  if (historicoListaOrdenada.length === 0) {
    historicoPaginacaoEl.innerHTML = '';
    return;
  }

  const paginas = [];
  const janela = 2;
  for (let p = 1; p <= totalPaginas; p += 1) {
    if (p === 1 || p === totalPaginas || Math.abs(p - historicoPaginaAtual) <= janela) {
      paginas.push(p);
    } else if (paginas[paginas.length - 1] !== '...') {
      paginas.push('...');
    }
  }

  const botoesPagina = paginas
    .map((p) =>
      p === '...'
        ? '<span class="pagination-reticencias">…</span>'
        : `<button type="button" class="btn btn-small ${p === historicoPaginaAtual ? 'btn-primary' : 'btn-ghost'}" data-pagina="${p}">${p}</button>`
    )
    .join('');

  historicoPaginacaoEl.innerHTML = `
    <button type="button" class="btn btn-ghost btn-small" id="historico-pag-anterior" ${historicoPaginaAtual === 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span class="pagination-paginas">${botoesPagina}</span>
    <button type="button" class="btn btn-ghost btn-small" id="historico-pag-proxima" ${historicoPaginaAtual === totalPaginas ? 'disabled' : ''}>Próxima ›</button>
    <span class="pagination-info">Página ${historicoPaginaAtual} de ${totalPaginas} — ${historicoListaOrdenada.length} movimentação(ões)</span>
  `;

  document.getElementById('historico-pag-anterior').addEventListener('click', () => irParaPaginaHistorico(historicoPaginaAtual - 1));
  document.getElementById('historico-pag-proxima').addEventListener('click', () => irParaPaginaHistorico(historicoPaginaAtual + 1));
  historicoPaginacaoEl.querySelectorAll('button[data-pagina]').forEach((btn) => {
    btn.addEventListener('click', () => irParaPaginaHistorico(Number(btn.dataset.pagina)));
  });
}

function renderHistorico(movimentacoes) {
  historicoBody.innerHTML = '';

  if (movimentacoes.length === 0) {
    historicoBody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhuma movimentação encontrada.</td></tr>';
    return;
  }

  movimentacoes.forEach((m) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="actions-cell">
        <button class="btn btn-danger btn-small" data-action="excluir" data-id="${m.id}">Excluir</button>
      </td>
      <td>${m.data}</td>
      <td>${m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</td>
      <td>${m.produto_codigo}</td>
      <td>${m.produto_descricao}</td>
      <td>${m.quantidade}</td>
      <td>${m.freezer || m.cliente || '—'}</td>
      <td>${ORIGEM_LABEL[m.origem] || m.origem}</td>
    `;
    historicoBody.appendChild(row);
  });
}

historicoBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="excluir"]');
  if (!btn) return;
  const { id } = btn.dataset;

  const confirmado = await confirmarAcao(
    'Excluir esta movimentação? O efeito dela no saldo do estoque será desfeito. Essa ação não pode ser desfeita.',
    { titulo: 'Excluir movimentação', textoConfirmar: 'Excluir' }
  );
  if (!confirmado) return;

  try {
    await api(`/movimentacoes/${id}`, { method: 'DELETE' });
    carregarHistorico();
  } catch (err) {
    alert(err.message);
  }
});

historicoFiltrarBtn.addEventListener('click', carregarHistorico);
document.addEventListener('tab:historico', carregarHistorico);
