const loteTipo = document.getElementById('lote-tipo');
const loteData = document.getElementById('lote-data');
const loteFreezer = document.getElementById('lote-freezer');
const loteCliente = document.getElementById('lote-cliente');
const loteLocal = document.getElementById('lote-local');
const loteBody = document.getElementById('lote-body');
const loteEnviarBtn = document.getElementById('lote-enviar');
const loteFeedback = document.getElementById('lote-feedback');
const loteBusca = document.getElementById('lote-busca');

let ultimosProdutosLote = [];
const loteSortable = createSortable(document.getElementById('lote-thead'), () => {
  atualizarListaLote();
});

function aplicarFiltroLote(produtos) {
  const termo = loteBusca.value.trim().toLowerCase();
  if (!termo) return produtos;
  return produtos.filter(
    (p) => p.codigo.toLowerCase().includes(termo) || p.descricao.toLowerCase().includes(termo)
  );
}

function atualizarListaLote() {
  const selecoes = capturarSelecoesLote();
  const filtrados = aplicarFiltroLote(ultimosProdutosLote);
  renderListaLote(loteSortable.sort(filtrados), selecoes);
}

function capturarSelecoesLote() {
  const selecoes = {};
  loteBody.querySelectorAll('tr').forEach((row) => {
    const chk = row.querySelector('.lote-check');
    if (chk && chk.checked) {
      const qtd = row.querySelector('.lote-qtd');
      selecoes[chk.dataset.id] = qtd.value;
    }
  });
  return selecoes;
}

async function carregarListaLote() {
  const produtos = await api('/produtos?ativo=1');
  ultimosProdutosLote = produtos;
  atualizarListaLote();
}

function renderListaLote(produtos, selecoes = {}) {
  loteBody.innerHTML = '';

  if (produtos.length === 0) {
    loteBody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum produto ativo cadastrado.</td></tr>';
    return;
  }

  produtos.forEach((p) => {
    const selecionado = selecoes[p.id] != null;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" class="lote-check" data-id="${p.id}" ${selecionado ? 'checked' : ''}></td>
      <td>${p.codigo}</td>
      <td>${p.descricao}</td>
      <td>${p.marca}</td>
      <td><input type="number" class="lote-qtd" data-id="${p.id}" min="1" placeholder="Qtd" value="${selecionado ? selecoes[p.id] : ''}" ${selecionado ? '' : 'disabled'}></td>
    `;
    loteBody.appendChild(row);
  });
}

function alternarCamposLotePorTipo() {
  const isEntrada = loteTipo.value === 'ENTRADA';
  loteFreezer.hidden = !isEntrada;
  loteCliente.hidden = isEntrada;
}

loteTipo.addEventListener('change', alternarCamposLotePorTipo);
loteBusca.addEventListener('input', atualizarListaLote);

loteBody.addEventListener('change', (e) => {
  if (!e.target.classList.contains('lote-check')) return;
  const id = e.target.dataset.id;
  const qtdInput = loteBody.querySelector(`.lote-qtd[data-id="${id}"]`);
  qtdInput.disabled = !e.target.checked;
  if (e.target.checked) qtdInput.focus();
  else qtdInput.value = '';
});

loteEnviarBtn.addEventListener('click', async () => {
  showFeedback(loteFeedback, '');

  const tipo = loteTipo.value;
  const data = loteData.value;
  const freezer = loteFreezer.value.trim();
  const cliente = loteCliente.value.trim();

  if (!data) return showFeedback(loteFeedback, 'Informe a data do lote.');
  if (tipo === 'ENTRADA' && !freezer) return showFeedback(loteFeedback, 'Informe o freezer do lote.');
  if (tipo === 'SAIDA' && !cliente) return showFeedback(loteFeedback, 'Informe o cliente/destino do lote.');

  const itens = [];
  loteBody.querySelectorAll('.lote-check:checked').forEach((chk) => {
    const id = chk.dataset.id;
    const qtdInput = loteBody.querySelector(`.lote-qtd[data-id="${id}"]`);
    const quantidade = Number(qtdInput.value);
    if (quantidade > 0) itens.push({ produto_id: Number(id), quantidade });
  });

  if (itens.length === 0) {
    return showFeedback(loteFeedback, 'Marque ao menos um produto e informe a quantidade.');
  }

  try {
    const resultado = await api('/movimentacoes/lote', {
      method: 'POST',
      body: JSON.stringify({ tipo, data, freezer: freezer || null, cliente: cliente || null, local: loteLocal.value, itens }),
    });
    showFeedback(loteFeedback, `${resultado.criados} lançamento(s) registrado(s) com sucesso.`, true);
    carregarListaLote();
  } catch (err) {
    showFeedback(loteFeedback, err.message);
  }
});

document.addEventListener('tab:lote', carregarListaLote);
document.addEventListener('DOMContentLoaded', () => {
  loteData.value = todayISO();
  alternarCamposLotePorTipo();
});
