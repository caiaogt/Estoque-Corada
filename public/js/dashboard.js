const dashTotalItens = document.getElementById('dash-total-itens');
const dashTotalUnidades = document.getElementById('dash-total-unidades');
const dashTotalValor = document.getElementById('dash-total-valor');
const dashTotalSaidas = document.getElementById('dash-total-saidas');
const dashTrendUnidades = document.getElementById('dash-trend-unidades');
const dashTrendValor = document.getElementById('dash-trend-valor');
const dashTrendSaidas = document.getElementById('dash-trend-saidas');
const chartLocal = document.getElementById('chart-local');
const rankingSaldo = document.getElementById('ranking-saldo');
const rankingSaidas = document.getElementById('ranking-saidas');
const dashParadosBody = document.getElementById('dash-parados-body');
const dashDicaTexto = document.getElementById('dash-dica-texto');

let ultimoEstoqueDashboard = [];
let chartEvolucaoInstancia = null;

function calcularProdutosParados(estoque) {
  const hojeMs = Date.now();
  return estoque
    .filter((p) => p.saldo > 0)
    .map((p) => {
      const diasSemSaida = p.ultima_saida
        ? Math.floor((hojeMs - new Date(`${p.ultima_saida}T00:00:00`).getTime()) / (24 * 60 * 60 * 1000))
        : Infinity;
      return { ...p, dias_sem_saida: diasSemSaida };
    })
    .sort((a, b) => b.dias_sem_saida - a.dias_sem_saida)
    .slice(0, 5);
}

const dashParadosSortable = createSortable(document.getElementById('dash-parados-thead'), () => {
  const parados = calcularProdutosParados(ultimoEstoqueDashboard);
  renderParados(dashParadosSortable.sort(parados));
});

function renderBarChart(container, itens, valueField) {
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
    const icone = item.icone ? `<img src="${item.icone}" class="bar-icon" alt="">` : '';
    const valorHtml =
      item.percentual != null
        ? `<span class="bar-value bar-value-stack"><strong>${item.percentual}%</strong><small>${item[valueField]} unidades</small></span>`
        : `<span class="bar-value">${item[valueField]}</span>`;
    row.innerHTML = `
      <span class="bar-label" title="${item.descricao}">${icone}${item.descricao}</span>
      <span class="bar-track"><span class="bar-fill ${item.barClass || ''}" style="width: ${largura}%"></span></span>
      ${valorHtml}
    `;
    container.appendChild(row);
  });
}

function renderRankedList(container, itens, valueField) {
  container.innerHTML = '';

  if (itens.length === 0) {
    container.innerHTML = '<p class="bar-empty">Sem dados suficientes ainda.</p>';
    return;
  }

  const max = Math.max(...itens.map((i) => i[valueField]), 1);

  itens.forEach((item, index) => {
    const largura = Math.max((item[valueField] / max) * 100, 4);
    const row = document.createElement('div');
    row.className = 'ranked-item';
    row.innerHTML = `
      <span class="ranked-posicao">${index + 1}</span>
      <div class="ranked-info">
        <span class="ranked-nome" title="${item.codigo} — ${item.descricao}">${item.descricao}</span>
        <span class="ranked-track"><span class="ranked-fill" style="width: ${largura}%"></span></span>
      </div>
      <span class="ranked-valor">${item[valueField]}</span>
    `;
    container.appendChild(row);
  });
}

function renderParados(produtos) {
  dashParadosBody.innerHTML = '';

  if (produtos.length === 0) {
    dashParadosBody.innerHTML = '<tr class="empty-row"><td colspan="3">Nenhum produto com estoque parado no momento.</td></tr>';
    return;
  }

  produtos.forEach((p) => {
    const row = document.createElement('tr');
    const ultimaSaidaTexto = p.ultima_saida
      ? `${formatarDataBR(p.ultima_saida)} (há ${p.dias_sem_saida} dia${p.dias_sem_saida === 1 ? '' : 's'})`
      : 'Nunca saiu';
    row.innerHTML = `
      <td>${p.codigo} — ${p.descricao}</td>
      <td>${p.saldo}</td>
      <td>${ultimaSaidaTexto}</td>
    `;
    dashParadosBody.appendChild(row);
  });
}

function renderTrend(el, atual, anterior) {
  if (anterior == null || anterior <= 0) {
    el.textContent = '';
    el.className = 'kpi-trend';
    return;
  }
  const variacao = ((atual - anterior) / anterior) * 100;
  const positivo = variacao >= 0;
  el.textContent = `${positivo ? '↑' : '↓'} ${Math.abs(variacao).toFixed(0)}% vs. período anterior`;
  el.className = `kpi-trend ${positivo ? 'kpi-trend-up' : 'kpi-trend-down'}`;
}

async function renderChartEvolucao() {
  const de = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const movs = await api(`/movimentacoes?data_de=${de}&limit=1000`);

  const dias = [];
  for (let i = 13; i >= 0; i -= 1) {
    dias.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const entradasPorDia = Object.fromEntries(dias.map((d) => [d, 0]));
  const saidasPorDia = Object.fromEntries(dias.map((d) => [d, 0]));

  movs.forEach((m) => {
    if (m.tipo === 'ENTRADA' && entradasPorDia[m.data] != null) entradasPorDia[m.data] += m.quantidade;
    if (m.tipo === 'SAIDA' && saidasPorDia[m.data] != null) saidasPorDia[m.data] += m.quantidade;
  });

  const labels = dias.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);

  const canvas = document.getElementById('chart-evolucao');
  if (chartEvolucaoInstancia) chartEvolucaoInstancia.destroy();
  chartEvolucaoInstancia = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Entradas',
          data: dias.map((d) => entradasPorDia[d]),
          borderColor: '#3CB878',
          backgroundColor: 'rgba(60, 184, 120, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: 2,
        },
        {
          label: 'Saídas',
          data: dias.map((d) => saidasPorDia[d]),
          borderColor: '#4978BC',
          backgroundColor: 'rgba(73, 120, 188, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

async function carregarDashboard() {
  const estoque = await api('/estoque?ativo=1');
  ultimoEstoqueDashboard = estoque;

  const totalUnidades = estoque.reduce((sum, p) => sum + p.saldo, 0);
  const totalValor = estoque.reduce((sum, p) => sum + (p.valor_total || 0), 0);

  dashTotalItens.textContent = estoque.length;
  dashTotalUnidades.textContent = totalUnidades;
  dashTotalValor.textContent = formatMoney(totalValor);

  const totalNosso = estoque.reduce((sum, p) => sum + p.saldo_nosso, 0);
  const totalBase01 = estoque.reduce((sum, p) => sum + p.saldo_base01, 0);
  const totalLocal = totalNosso + totalBase01;
  renderBarChart(chartLocal, [
    {
      descricao: 'Nosso Estoque',
      saldo_local: totalNosso,
      percentual: totalLocal ? Math.round((totalNosso / totalLocal) * 100) : 0,
    },
    {
      descricao: 'Base 01',
      saldo_local: totalBase01,
      icone: 'img/base01-logo.png',
      barClass: 'bar-fill-sky',
      percentual: totalLocal ? Math.round((totalBase01 / totalLocal) * 100) : 0,
    },
  ], 'saldo_local');

  const topSaldo = [...estoque].sort((a, b) => b.saldo - a.saldo).slice(0, 5);
  renderRankedList(rankingSaldo, topSaldo, 'saldo');

  const topSaidas = [...estoque]
    .filter((p) => p.total_saidas > 0)
    .sort((a, b) => b.total_saidas - a.total_saidas)
    .slice(0, 5);
  renderRankedList(rankingSaidas, topSaidas, 'total_saidas');

  const parados = calcularProdutosParados(estoque);
  renderParados(dashParadosSortable.sort(parados));

  dashDicaTexto.textContent =
    parados.length > 0
      ? `Os produtos com estoque parado há mais tempo estão na tabela abaixo. Revise-os e considere criar promoções para aumentar a rotatividade.`
      : 'Nenhum produto com estoque parado no momento — bom giro de estoque!';

  const de60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const de30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const movs60 = await api(`/movimentacoes?data_de=${de60}&limit=1000`);

  const precoPorProduto = new Map(estoque.map((p) => [p.id, p.preco_b2b]));
  let netUnidades30d = 0;
  let netValor30d = 0;
  let saidas30d = 0;
  let saidasAnteriores30d = 0;

  movs60.forEach((m) => {
    const sinal = m.tipo === 'ENTRADA' ? 1 : -1;
    if (m.data >= de30) {
      netUnidades30d += sinal * m.quantidade;
      const preco = precoPorProduto.get(m.produto_id);
      if (preco != null) netValor30d += sinal * m.quantidade * preco;
      if (m.tipo === 'SAIDA') saidas30d += m.quantidade;
    } else if (m.tipo === 'SAIDA') {
      saidasAnteriores30d += m.quantidade;
    }
  });

  dashTotalSaidas.textContent = saidas30d;

  renderTrend(dashTrendUnidades, totalUnidades, totalUnidades - netUnidades30d);
  renderTrend(dashTrendValor, totalValor, totalValor - netValor30d);
  renderTrend(dashTrendSaidas, saidas30d, saidasAnteriores30d);

  renderChartEvolucao();
}

document.addEventListener('tab:dashboard', carregarDashboard);
document.addEventListener('DOMContentLoaded', carregarDashboard);
