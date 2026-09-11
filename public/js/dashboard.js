const dashTotalItens = document.getElementById('dash-total-itens');
const dashTotalUnidades = document.getElementById('dash-total-unidades');
const dashTotalValor = document.getElementById('dash-total-valor');
const dashTotalSaidas = document.getElementById('dash-total-saidas');
const chartSaldo = document.getElementById('chart-saldo');
const chartSaidas = document.getElementById('chart-saidas');
const chartLocal = document.getElementById('chart-local');
const dashParadosBody = document.getElementById('dash-parados-body');

let ultimoEstoqueDashboard = [];
const dashParadosSortable = createSortable(document.getElementById('dash-parados-thead'), () => {
  const parados = ultimoEstoqueDashboard.filter((p) => p.total_saidas === 0);
  renderParados(dashParadosSortable.sort(parados));
});

function renderBarChart(container, itens, valueField, altColor = false) {
  container.innerHTML = '';

  if (itens.length === 0) {
    container.innerHTML = '<p class="bar-empty">Sem dados suficientes ainda.</p>';
    return;
  }

  const max = Math.max(...itens.map((i) => i[valueField]), 1);

  itens.forEach((item) => {
    const largura = Math.max((item[valueField] / max) * 100, 2);
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = item.codigo ? `${item.codigo} — ${item.descricao}` : item.descricao;
    const icone = item.icone ? `<img src="${item.icone}" class="bar-icon" alt="">` : '';
    const corClasse = item.barClass || (altColor ? 'bar-fill-alt' : '');
    row.innerHTML = `
      <span class="bar-label" title="${label}">${icone}${label}</span>
      <span class="bar-track"><span class="bar-fill ${corClasse}" style="width: ${largura}%"></span></span>
      <span class="bar-value">${item[valueField]}</span>
    `;
    container.appendChild(row);
  });
}

function renderParados(produtos) {
  dashParadosBody.innerHTML = '';

  if (produtos.length === 0) {
    dashParadosBody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum produto parado — todos os produtos ativos já tiveram saída.</td></tr>';
    return;
  }

  produtos.forEach((p) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${p.codigo}</td>
      <td>${p.descricao}</td>
      <td>${p.marca}</td>
      <td>${p.linha ? LINHA_LABEL[p.linha] || p.linha : '—'}</td>
      <td>${p.saldo}</td>
    `;
    dashParadosBody.appendChild(row);
  });
}

async function carregarDashboard() {
  const estoque = await api('/estoque?ativo=1');
  ultimoEstoqueDashboard = estoque;

  const totalUnidades = estoque.reduce((sum, p) => sum + p.saldo, 0);
  const totalValor = estoque.reduce((sum, p) => sum + (p.valor_total || 0), 0);
  const totalSaidas = estoque.reduce((sum, p) => sum + p.total_saidas, 0);

  dashTotalItens.textContent = estoque.length;
  dashTotalUnidades.textContent = totalUnidades;
  dashTotalValor.textContent = formatMoney(totalValor);
  dashTotalSaidas.textContent = totalSaidas;

  const totalNosso = estoque.reduce((sum, p) => sum + p.saldo_nosso, 0);
  const totalBase01 = estoque.reduce((sum, p) => sum + p.saldo_base01, 0);
  renderBarChart(
    chartLocal,
    [
      { descricao: 'Nosso Estoque', saldo_local: totalNosso },
      { descricao: 'Base 01', saldo_local: totalBase01, icone: 'img/base01-logo.png', barClass: 'bar-fill-sky' },
    ],
    'saldo_local'
  );

  const topSaldo = [...estoque].sort((a, b) => b.saldo - a.saldo).slice(0, 15);
  renderBarChart(chartSaldo, topSaldo, 'saldo');

  const topSaidas = [...estoque]
    .filter((p) => p.total_saidas > 0)
    .sort((a, b) => b.total_saidas - a.total_saidas)
    .slice(0, 10);
  renderBarChart(chartSaidas, topSaidas, 'total_saidas', true);

  const parados = estoque.filter((p) => p.total_saidas === 0);
  renderParados(dashParadosSortable.sort(parados));
}

document.addEventListener('tab:dashboard', carregarDashboard);
document.addEventListener('DOMContentLoaded', carregarDashboard);
