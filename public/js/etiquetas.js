const etiquetaProdutoSelect = document.getElementById('etiqueta-produto');
const etiquetaQuantidade = document.getElementById('etiqueta-quantidade');
const etiquetaFabricacao = document.getElementById('etiqueta-fabricacao');
const etiquetaImpressoPor = document.getElementById('etiqueta-impresso-por');
const etiquetaLancarEstoque = document.getElementById('etiqueta-lancar-estoque');
const etiquetaValidadePreview = document.getElementById('etiqueta-validade-preview');
const etiquetaCalcA = document.getElementById('etiqueta-calc-a');
const etiquetaCalcOp = document.getElementById('etiqueta-calc-op');
const etiquetaCalcB = document.getElementById('etiqueta-calc-b');
const etiquetaCalcResultado = document.getElementById('etiqueta-calc-resultado');
const etiquetaCalcUsar = document.getElementById('etiqueta-calc-usar');
const etiquetaRevisarBtn = document.getElementById('etiqueta-revisar-btn');
const etiquetaFeedback = document.getElementById('etiqueta-feedback');
const etiquetasHistoricoBody = document.getElementById('etiquetas-historico-body');

const etiquetaPreviewOverlay = document.getElementById('etiqueta-preview-overlay');
const etiquetaPreviewModal = document.getElementById('etiqueta-preview-modal');
const etiquetaPreviewProduto = document.getElementById('etiqueta-preview-produto');
const etiquetaPreviewQuantidade = document.getElementById('etiqueta-preview-quantidade');
const etiquetaPreviewFabricacao = document.getElementById('etiqueta-preview-fabricacao');
const etiquetaPreviewValidade = document.getElementById('etiqueta-preview-validade');
const etiquetaPreviewImpressoPor = document.getElementById('etiqueta-preview-impresso-por');
const etiquetaPreviewLancarEstoque = document.getElementById('etiqueta-preview-lancar-estoque');
const etiquetaPreviewConfirmar = document.getElementById('etiqueta-preview-confirmar');
const etiquetaPreviewCancelar = document.getElementById('etiqueta-preview-cancelar');
const etiquetaPreviewFechar = document.getElementById('etiqueta-preview-fechar-btn');
const etiquetaPreviewFeedback = document.getElementById('etiqueta-preview-feedback');
const etiquetasPrintArea = document.getElementById('etiquetas-print-area');

let produtosParaEtiqueta = [];
let etiquetaValidadeAtual = null;
let etiquetaOperacaoAtual = null;

function opcoesProdutoEtiquetaHtml(selecionadoId) {
  return (
    `<option value="" disabled ${selecionadoId ? '' : 'selected'}>Buscar produto...</option>` +
    produtosParaEtiqueta
      .map((p) => `<option value="${p.id}" ${p.id === selecionadoId ? 'selected' : ''}>${p.codigo} — ${p.descricao}</option>`)
      .join('')
  );
}

async function carregarProdutosParaEtiqueta() {
  produtosParaEtiqueta = await api('/produtos?ativo=1');
  const atual = etiquetaProdutoSelect.value ? Number(etiquetaProdutoSelect.value) : null;
  etiquetaProdutoSelect.innerHTML = opcoesProdutoEtiquetaHtml(atual);
}

function formatarDataBR(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraBR(sqlDatetime) {
  if (!sqlDatetime) return '—';
  const data = new Date(`${sqlDatetime.replace(' ', 'T')}Z`);
  const dataTexto = data.toLocaleDateString('pt-BR');
  const horaTexto = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dataTexto} ${horaTexto}`;
}

async function atualizarValidadePreview() {
  const produtoId = etiquetaProdutoSelect.value;
  const dataFabricacao = etiquetaFabricacao.value;
  etiquetaValidadeAtual = null;

  if (!produtoId || !dataFabricacao) {
    etiquetaValidadePreview.textContent = 'Selecione o produto e a data de fabricação';
    return;
  }

  try {
    const resultado = await api('/etiquetas/calcular-validade', {
      method: 'POST',
      body: JSON.stringify({ produto_id: Number(produtoId), data_fabricacao: dataFabricacao }),
    });
    if (!resultado.data_validade) {
      etiquetaValidadePreview.textContent = 'Produto sem prazo de validade configurado (defina em Produtos)';
      return;
    }
    etiquetaValidadeAtual = resultado.data_validade;
    etiquetaValidadePreview.textContent = formatarDataBR(resultado.data_validade);
  } catch {
    etiquetaValidadePreview.textContent = 'Não foi possível calcular a validade.';
  }
}

etiquetaProdutoSelect.addEventListener('change', atualizarValidadePreview);
etiquetaFabricacao.addEventListener('change', atualizarValidadePreview);

function recalcularCalculadoraEtiqueta() {
  const aPreenchido = etiquetaCalcA.value !== '';
  const bPreenchido = etiquetaCalcB.value !== '';

  if (!aPreenchido || !bPreenchido) {
    etiquetaCalcResultado.textContent = '—';
    etiquetaCalcUsar.disabled = true;
    return;
  }

  const a = Number(etiquetaCalcA.value);
  const b = Number(etiquetaCalcB.value);
  const op = etiquetaCalcOp.value;

  let resultado;
  if (op === 'multiplicar') resultado = a * b;
  else if (op === 'dividir') resultado = b !== 0 ? a / b : NaN;
  else if (op === 'somar') resultado = a + b;
  else resultado = a - b;

  if (!Number.isFinite(resultado)) {
    etiquetaCalcResultado.textContent = 'Não é possível dividir por zero';
    etiquetaCalcUsar.disabled = true;
    return;
  }

  const resultadoArredondado = Math.round(resultado * 100) / 100;
  etiquetaCalcResultado.textContent = resultadoArredondado.toLocaleString('pt-BR');
  etiquetaCalcUsar.disabled = resultadoArredondado <= 0;
  etiquetaCalcUsar.dataset.valor = resultadoArredondado;
}

[etiquetaCalcA, etiquetaCalcB, etiquetaCalcOp].forEach((el) => el.addEventListener('input', recalcularCalculadoraEtiqueta));

etiquetaCalcUsar.addEventListener('click', () => {
  const valor = Math.round(Number(etiquetaCalcUsar.dataset.valor));
  if (valor > 0) etiquetaQuantidade.value = valor;
});

etiquetaRevisarBtn.addEventListener('click', () => {
  showFeedback(etiquetaFeedback, '');

  const produtoId = etiquetaProdutoSelect.value;
  const quantidade = Number(etiquetaQuantidade.value);
  const dataFabricacao = etiquetaFabricacao.value;

  if (!produtoId) return showFeedback(etiquetaFeedback, 'Selecione um produto.');
  if (!quantidade || quantidade <= 0 || !Number.isInteger(quantidade)) {
    return showFeedback(etiquetaFeedback, 'Informe uma quantidade de etiquetas válida (número inteiro maior que zero).');
  }
  if (!dataFabricacao) return showFeedback(etiquetaFeedback, 'Selecione a data de fabricação.');
  if (!etiquetaValidadeAtual) {
    return showFeedback(
      etiquetaFeedback,
      'Não foi possível calcular a validade — verifique se o produto tem prazo de validade configurado em Produtos.'
    );
  }
  if (!etiquetaImpressoPor.value) return showFeedback(etiquetaFeedback, 'Selecione quem está imprimindo as etiquetas.');

  const produto = produtosParaEtiqueta.find((p) => p.id === Number(produtoId));

  etiquetaOperacaoAtual = {
    produto_id: Number(produtoId),
    quantidade,
    data_fabricacao: dataFabricacao,
    data_validade: etiquetaValidadeAtual,
    impresso_por: etiquetaImpressoPor.value,
    lancar_estoque: etiquetaLancarEstoque.checked,
    client_op_id: crypto.randomUUID(),
    produto_codigo: produto.codigo,
    produto_descricao: produto.descricao,
  };

  etiquetaPreviewProduto.textContent = `${produto.codigo} — ${produto.descricao}`;
  etiquetaPreviewQuantidade.textContent = `${quantidade} etiqueta${quantidade === 1 ? '' : 's'}`;
  etiquetaPreviewFabricacao.textContent = formatarDataBR(dataFabricacao);
  etiquetaPreviewValidade.textContent = formatarDataBR(etiquetaValidadeAtual);
  etiquetaPreviewImpressoPor.textContent = etiquetaImpressoPor.value;
  etiquetaPreviewLancarEstoque.textContent = etiquetaLancarEstoque.checked ? 'Sim' : 'Não';
  showFeedback(etiquetaPreviewFeedback, '');

  etiquetaPreviewOverlay.classList.add('open');
  etiquetaPreviewModal.classList.add('open');
});

function fecharPreviewEtiqueta() {
  etiquetaPreviewOverlay.classList.remove('open');
  etiquetaPreviewModal.classList.remove('open');
}

etiquetaPreviewCancelar.addEventListener('click', fecharPreviewEtiqueta);
etiquetaPreviewFechar.addEventListener('click', fecharPreviewEtiqueta);
etiquetaPreviewOverlay.addEventListener('click', fecharPreviewEtiqueta);

function montarEtiquetasParaImpressao(op) {
  const label = `
    <div class="etiqueta-label">
      <div class="etiqueta-label-produto">${op.produto_descricao}</div>
      <div class="etiqueta-label-codigo">Código: ${op.produto_codigo}</div>
      <div class="etiqueta-label-datas">
        <span>Fab.: ${formatarDataBR(op.data_fabricacao)}</span>
        <span>Val.: ${formatarDataBR(op.data_validade)}</span>
      </div>
    </div>
  `;
  etiquetasPrintArea.innerHTML = `<div class="etiqueta-print-grid">${label.repeat(op.quantidade)}</div>`;
}

function resetarFormularioEtiqueta() {
  etiquetaProdutoSelect.value = '';
  etiquetaQuantidade.value = '';
  etiquetaFabricacao.value = todayISO();
  etiquetaValidadePreview.textContent = 'Selecione o produto e a data de fabricação';
  etiquetaValidadeAtual = null;
  etiquetaOperacaoAtual = null;
  etiquetaCalcA.value = '';
  etiquetaCalcB.value = '';
  etiquetaCalcResultado.textContent = '—';
  etiquetaCalcUsar.disabled = true;
  etiquetaLancarEstoque.checked = true;
}

etiquetaPreviewConfirmar.addEventListener('click', async () => {
  if (!etiquetaOperacaoAtual) return;
  showFeedback(etiquetaPreviewFeedback, '');
  etiquetaPreviewConfirmar.disabled = true;

  try {
    const registro = await api('/etiquetas/imprimir', {
      method: 'POST',
      body: JSON.stringify({
        produto_id: etiquetaOperacaoAtual.produto_id,
        quantidade: etiquetaOperacaoAtual.quantidade,
        data_fabricacao: etiquetaOperacaoAtual.data_fabricacao,
        impresso_por: etiquetaOperacaoAtual.impresso_por,
        lancar_estoque: etiquetaOperacaoAtual.lancar_estoque,
        client_op_id: etiquetaOperacaoAtual.client_op_id,
      }),
    });

    if (!registro.impresso_direto) {
      montarEtiquetasParaImpressao(etiquetaOperacaoAtual);
      window.print();
    }

    const quantidadeImpressa = etiquetaOperacaoAtual.quantidade;
    fecharPreviewEtiqueta();
    const mensagemEstoque = registro.lancado_estoque
      ? ` — ✓ ${quantidadeImpressa} unidade(s) adicionada(s) ao estoque.`
      : ' — estoque não foi alterado (opção desmarcada).';
    // Na impressão direta na Zebra não dá pra confirmar 100% que o papel saiu de verdade
    // (só pegamos falhas rápidas de configuração) — por isso o texto é "enviada(s)", não "impressa(s)".
    const mensagemImpressao = registro.impresso_direto
      ? `✓ ${quantidadeImpressa} etiqueta(s) enviada(s) para a impressora`
      : `✓ ${quantidadeImpressa} etiqueta(s) impressa(s) com sucesso`;
    showFeedback(etiquetaFeedback, `${mensagemImpressao}${mensagemEstoque}`, true);

    resetarFormularioEtiqueta();
    carregarHistoricoEtiquetas();
  } catch (err) {
    showFeedback(etiquetaPreviewFeedback, err.message);
  } finally {
    etiquetaPreviewConfirmar.disabled = false;
  }
});

async function carregarHistoricoEtiquetas() {
  const registros = await api('/etiquetas?limit=200');
  etiquetasHistoricoBody.innerHTML = '';

  if (registros.length === 0) {
    etiquetasHistoricoBody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhuma impressão registrada ainda.</td></tr>';
    return;
  }

  registros.forEach((r) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatarDataHoraBR(r.criado_em)}</td>
      <td>${r.produto_codigo} — ${r.produto_descricao}</td>
      <td>${r.quantidade}</td>
      <td>${formatarDataBR(r.data_fabricacao)}</td>
      <td>${formatarDataBR(r.data_validade)}</td>
      <td>${r.impresso_por || r.usuario_nome || r.usuario_login || '—'}</td>
    `;
    etiquetasHistoricoBody.appendChild(row);
  });
}

document.addEventListener('tab:etiquetas', () => {
  carregarProdutosParaEtiqueta();
  carregarHistoricoEtiquetas();
  if (!etiquetaFabricacao.value) etiquetaFabricacao.value = todayISO();
});
