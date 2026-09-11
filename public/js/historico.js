const historicoBody = document.getElementById('historico-body');
const historicoTipo = document.getElementById('historico-tipo');
const historicoDe = document.getElementById('historico-de');
const historicoAte = document.getElementById('historico-ate');
const historicoFiltrarBtn = document.getElementById('historico-filtrar');

const ORIGEM_LABEL = {
  MANUAL: 'Manual',
  LOTE: 'Lançamento Rápido',
  KIT: 'Saída de Kit',
  AJUSTE: 'Ajuste de Contagem',
};

let ultimoHistorico = [];
const historicoSortable = createSortable(document.getElementById('historico-thead'), () => {
  renderHistorico(historicoSortable.sort(ultimoHistorico));
});

async function carregarHistorico() {
  const params = new URLSearchParams();
  if (historicoTipo.value) params.set('tipo', historicoTipo.value);
  if (historicoDe.value) params.set('data_de', historicoDe.value);
  if (historicoAte.value) params.set('data_ate', historicoAte.value);

  const movimentacoes = await api(`/movimentacoes?${params.toString()}`);
  ultimoHistorico = movimentacoes;
  renderHistorico(historicoSortable.sort(movimentacoes));
}

function renderHistorico(movimentacoes) {
  historicoBody.innerHTML = '';

  if (movimentacoes.length === 0) {
    historicoBody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhuma movimentação encontrada.</td></tr>';
    return;
  }

  movimentacoes.forEach((m) => {
    const row = document.createElement('tr');
    row.innerHTML = `
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

historicoFiltrarBtn.addEventListener('click', carregarHistorico);
document.addEventListener('tab:historico', carregarHistorico);
