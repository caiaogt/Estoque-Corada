const vendaForm = document.getElementById('venda-form');
const vendaFormTitle = document.getElementById('venda-form-title');
const vendaSubmitBtn = document.getElementById('venda-submit-btn');
const vendaCancelarBtn = document.getElementById('venda-cancelar');
const vendaFeedback = document.getElementById('venda-feedback');
const vendaTotalPreview = document.getElementById('venda-total-preview');
const vendaSubtotalPreview = document.getElementById('venda-subtotal-preview');
const vendaDescontoInput = document.getElementById('venda-desconto-input');
const vendaVoltarBtn = document.getElementById('venda-voltar-btn');
const vendaLimparItensBtn = document.getElementById('venda-limpar-itens-btn');
const vendasBody = document.getElementById('vendas-body');

const vendaEntradaCodigo = document.getElementById('venda-entrada-codigo');
const vendaEntradaDescricao = document.getElementById('venda-entrada-descricao');
const vendaEntradaQtd = document.getElementById('venda-entrada-qtd');
const vendaEntradaValor = document.getElementById('venda-entrada-valor');
const vendaEntradaAdicionar = document.getElementById('venda-entrada-adicionar');
const vendaEntradaFeedback = document.getElementById('venda-entrada-feedback');
const vendaItensBody = document.getElementById('venda-itens-body');

const vendasTotalQtd = document.getElementById('vendas-total-qtd');
const vendasTotalValor = document.getElementById('vendas-total-valor');
const vendasTicketMedio = document.getElementById('vendas-ticket-medio');
const vendasHojeQtd = document.getElementById('vendas-hoje-qtd');
const vendasMesQtd = document.getElementById('vendas-mes-qtd');
const vendasBusca = document.getElementById('vendas-busca');

const vendasFiltroTipo = document.getElementById('vendas-filtro-tipo');
const vendasFiltroDe = document.getElementById('vendas-filtro-de');
const vendasFiltroAte = document.getElementById('vendas-filtro-ate');
const vendasFiltrarBtn = document.getElementById('vendas-filtrar');

const STATUS_LABEL = { NOVO: '🟡 Novo', ENTREGUE: '🟢 Entregue', CANCELADO: '🔴 Cancelado' };

function opcoesStatusHtml(atual) {
  return Object.keys(STATUS_LABEL)
    .map((s) => `<option value="${s}" ${s === atual ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`)
    .join('');
}

let produtosParaVenda = [];
let ultimasVendas = [];
let vendasListaFiltrada = [];
let vendasPaginaAtual = 1;
let itensVendaAtual = [];
let produtoResolvidoEntrada = null;

const VENDAS_POR_PAGINA = 15;
const vendasPaginacaoEl = document.getElementById('vendas-paginacao');

const vendasSortable = createSortable(document.getElementById('vendas-thead'), () => {
  vendasListaFiltrada = vendasSortable.sort(vendasListaFiltrada);
  irParaPaginaVendas(vendasPaginaAtual);
});

function normalizarCodigoProduto(valor) {
  const limpo = String(valor || '').trim();
  if (/^\d{1,3}$/.test(limpo)) {
    return `700${limpo.padStart(3, '0')}`;
  }
  return limpo;
}

function buscarProdutoPorCodigoVenda(codigo) {
  const normalizado = normalizarCodigoProduto(codigo);
  return produtosParaVenda.find((p) => p.codigo.toLowerCase() === normalizado.toLowerCase());
}

async function carregarProdutosParaVenda() {
  produtosParaVenda = await api('/produtos?ativo=1');
}

function resolverProdutoEntrada() {
  showFeedback(vendaEntradaFeedback, '');
  const bruto = vendaEntradaCodigo.value;
  if (!bruto.trim()) {
    produtoResolvidoEntrada = null;
    return false;
  }

  const produto = buscarProdutoPorCodigoVenda(bruto);
  if (!produto) {
    produtoResolvidoEntrada = null;
    vendaEntradaDescricao.value = '';
    showFeedback(vendaEntradaFeedback, `Produto não encontrado para o código ${normalizarCodigoProduto(bruto)}.`);
    return false;
  }

  produtoResolvidoEntrada = produto;
  vendaEntradaDescricao.value = `${produto.descricao} (${produto.marca})`;
  if (!vendaEntradaValor.value) {
    const ehCpf = vendaForm.tipo_cliente.value === 'CPF';
    const preco = ehCpf ? produto.preco_cpf ?? produto.preco_b2b : produto.preco_b2b ?? produto.preco_cpf;
    if (preco != null) vendaEntradaValor.value = preco;
  }
  return true;
}

function resetarEntradaItem() {
  produtoResolvidoEntrada = null;
  vendaEntradaCodigo.value = '';
  vendaEntradaDescricao.value = '';
  vendaEntradaQtd.value = 1;
  vendaEntradaValor.value = '';
  showFeedback(vendaEntradaFeedback, '');
  vendaEntradaCodigo.focus();
}

function commitarItemEntrada() {
  if (!produtoResolvidoEntrada && !resolverProdutoEntrada()) return;

  const quantidade = Number(vendaEntradaQtd.value) || 1;
  const valorUnitario = Number(vendaEntradaValor.value);

  if (quantidade <= 0) {
    showFeedback(vendaEntradaFeedback, 'Informe uma quantidade válida.');
    return;
  }
  if (vendaEntradaValor.value === '' || valorUnitario < 0) {
    showFeedback(vendaEntradaFeedback, 'Informe um valor unitário válido.');
    return;
  }

  const existente = itensVendaAtual.find((i) => i.produto_id === produtoResolvidoEntrada.id);
  if (existente) {
    existente.quantidade += quantidade;
    existente.valor_unitario = valorUnitario;
    existente.subtotal = existente.quantidade * existente.valor_unitario;
  } else {
    itensVendaAtual.push({
      produto_id: produtoResolvidoEntrada.id,
      codigo: produtoResolvidoEntrada.codigo,
      descricao: `${produtoResolvidoEntrada.descricao} (${produtoResolvidoEntrada.marca})`,
      quantidade,
      valor_unitario: valorUnitario,
      subtotal: quantidade * valorUnitario,
    });
  }

  renderItensVendaAtual();
  atualizarTotalVenda();
  resetarEntradaItem();
}

vendaEntradaCodigo.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (resolverProdutoEntrada()) {
    vendaEntradaQtd.focus();
    vendaEntradaQtd.select();
  }
});

vendaEntradaCodigo.addEventListener('blur', () => {
  if (vendaEntradaCodigo.value.trim()) resolverProdutoEntrada();
});

vendaEntradaQtd.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  commitarItemEntrada();
});

vendaEntradaValor.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  commitarItemEntrada();
});

vendaEntradaAdicionar.addEventListener('click', commitarItemEntrada);

function renderItensVendaAtual() {
  vendaItensBody.innerHTML = '';

  if (itensVendaAtual.length === 0) {
    vendaItensBody.innerHTML = `
      <tr class="empty-row" id="venda-itens-vazio">
        <td colspan="6">
          <div class="carrinho-vazio">
            <span class="carrinho-vazio-icone"><img src="img/icons/icon-vendas.png" alt=""></span>
            <strong>Nenhum item adicionado ainda.</strong>
            <p>Busque um produto pelo código e clique em adicionar.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  itensVendaAtual.forEach((item, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.codigo}</td>
      <td>${item.descricao}</td>
      <td>${item.quantidade}</td>
      <td>R$ ${formatMoney(item.valor_unitario)}</td>
      <td>R$ ${formatMoney(item.subtotal)}</td>
      <td class="actions-cell"><button type="button" class="btn btn-ghost btn-small" data-action="remover-item" data-index="${index}">Remover</button></td>
    `;
    vendaItensBody.appendChild(row);
  });
}

vendaItensBody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remover-item"]');
  if (!btn) return;
  itensVendaAtual.splice(Number(btn.dataset.index), 1);
  renderItensVendaAtual();
  atualizarTotalVenda();
});

function atualizarTotalVenda() {
  const subtotal = itensVendaAtual.reduce((sum, i) => sum + i.subtotal, 0);
  const desconto = Math.min(Number(vendaDescontoInput.value) || 0, subtotal);
  const total = Math.max(0, subtotal - desconto);
  vendaSubtotalPreview.textContent = `R$ ${formatMoney(subtotal)}`;
  vendaTotalPreview.textContent = `R$ ${formatMoney(total)}`;
}

vendaDescontoInput.addEventListener('input', atualizarTotalVenda);

vendaVoltarBtn.addEventListener('click', () => {
  document.querySelector('.nav-dropdown-menu button[data-tab="vendas-registradas"]')?.click();
});

vendaLimparItensBtn.addEventListener('click', () => {
  itensVendaAtual = [];
  renderItensVendaAtual();
  atualizarTotalVenda();
});

function coletarItensVenda() {
  return itensVendaAtual.map((i) => ({
    produto_id: i.produto_id,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
  }));
}

const VENDA_SUBMIT_ICONE = '<img class="icon-inline" src="img/icons/icon-registrar-venda.png" alt="">';

function resetarFormularioVenda() {
  vendaForm.reset();
  vendaForm.id.value = '';
  vendaFormTitle.textContent = 'Nova Venda';
  vendaSubmitBtn.innerHTML = `${VENDA_SUBMIT_ICONE} Registrar Venda`;
  vendaCancelarBtn.hidden = true;
  itensVendaAtual = [];
  vendaDescontoInput.value = 0;
  renderItensVendaAtual();
  resetarEntradaItem();
  atualizarTotalVenda();
  vendaForm.data.value = todayISO();
}

function iniciarEdicaoVenda(venda) {
  vendaForm.id.value = venda.id;
  vendaForm.tipo_cliente.value = venda.tipo_cliente;
  vendaForm.cliente_nome.value = venda.cliente_nome;
  vendaForm.data.value = venda.data;
  vendaForm.nota_fiscal.value = venda.nota_fiscal || '';
  vendaForm.forma_pagamento.value = venda.forma_pagamento || '';
  vendaForm.local.value = venda.local || 'NOSSO';
  vendaForm.observacoes.value = venda.observacoes || '';
  vendaDescontoInput.value = venda.desconto || 0;

  itensVendaAtual = venda.itens.map((item) => {
    const produto = buscarProdutoPorCodigoVenda(item.produto_codigo);
    const descricao = produto ? `${produto.descricao} (${produto.marca})` : item.produto_descricao;
    return {
      produto_id: item.produto_id,
      codigo: item.produto_codigo,
      descricao,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      subtotal: item.quantidade * item.valor_unitario,
    };
  });
  renderItensVendaAtual();
  resetarEntradaItem();
  atualizarTotalVenda();

  vendaFormTitle.textContent = `Editar Venda — ${venda.cliente_nome}`;
  vendaSubmitBtn.innerHTML = `${VENDA_SUBMIT_ICONE} Salvar Alterações`;
  vendaCancelarBtn.hidden = false;

  document.querySelector('.nav-dropdown-menu button[data-tab="vendas-nova"]')?.click();
  vendaForm.scrollIntoView({ behavior: 'smooth' });
}

vendaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback(vendaFeedback, '');

  const itens = coletarItensVenda();
  if (itens.length === 0) {
    showFeedback(vendaFeedback, 'Adicione ao menos um item com produto, quantidade e valor.');
    return;
  }

  const id = vendaForm.id.value;
  const payload = {
    data: vendaForm.data.value,
    tipo_cliente: vendaForm.tipo_cliente.value,
    cliente_nome: vendaForm.cliente_nome.value.trim(),
    nota_fiscal: vendaForm.nota_fiscal.value.trim() || null,
    forma_pagamento: vendaForm.forma_pagamento.value || null,
    local: vendaForm.local.value,
    observacoes: vendaForm.observacoes.value.trim() || null,
    desconto: Number(vendaDescontoInput.value) || 0,
    itens,
  };

  vendaSubmitBtn.disabled = true;
  const htmlOriginal = vendaSubmitBtn.innerHTML;
  vendaSubmitBtn.textContent = id ? 'Salvando...' : 'Registrando...';

  try {
    if (id) {
      const venda = await api(`/vendas/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showFeedback(vendaFeedback, `Venda atualizada — total R$ ${formatMoney(venda.valor_total)}.`, true);
    } else {
      const venda = await api('/vendas', { method: 'POST', body: JSON.stringify(payload) });
      showFeedback(vendaFeedback, `Venda registrada — total R$ ${formatMoney(venda.valor_total)}.`, true);
    }
    resetarFormularioVenda();
    carregarVendas();
  } catch (err) {
    showFeedback(vendaFeedback, err.message);
  } finally {
    vendaSubmitBtn.disabled = false;
    vendaSubmitBtn.innerHTML = htmlOriginal;
  }
});

vendaCancelarBtn.addEventListener('click', resetarFormularioVenda);

async function carregarVendas() {
  const params = new URLSearchParams();
  if (vendasFiltroTipo.value) params.set('tipo_cliente', vendasFiltroTipo.value);
  if (vendasFiltroDe.value) params.set('data_de', vendasFiltroDe.value);
  if (vendasFiltroAte.value) params.set('data_ate', vendasFiltroAte.value);

  const vendas = await api(`/vendas?${params.toString()}`);
  ultimasVendas = vendas;

  const totalValor = vendas.reduce((sum, v) => sum + v.valor_total, 0);
  vendasTotalQtd.textContent = vendas.length;
  vendasTotalValor.textContent = formatMoney(totalValor);
  vendasTicketMedio.textContent = formatMoney(vendas.length ? totalValor / vendas.length : 0);

  const hoje = todayISO();
  const mesAtual = hoje.slice(0, 7);
  vendasHojeQtd.textContent = vendas.filter((v) => v.data === hoje).length;
  vendasMesQtd.textContent = vendas.filter((v) => v.data.slice(0, 7) === mesAtual).length;

  aplicarFiltroBuscaEOrdenacao();
}

function aplicarFiltroBuscaEOrdenacao() {
  const termo = vendasBusca.value.trim().toLowerCase();
  let lista = ultimasVendas;
  if (termo) {
    lista = lista.filter(
      (v) =>
        v.cliente_nome.toLowerCase().includes(termo) ||
        String(v.id).includes(termo) ||
        v.itens.some((i) => i.produto_codigo.toLowerCase().includes(termo))
    );
  }
  vendasListaFiltrada = vendasSortable.sort(lista);
  irParaPaginaVendas(1);
}

function irParaPaginaVendas(pagina) {
  const totalPaginas = Math.max(1, Math.ceil(vendasListaFiltrada.length / VENDAS_POR_PAGINA));
  vendasPaginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (vendasPaginaAtual - 1) * VENDAS_POR_PAGINA;
  renderVendas(vendasListaFiltrada.slice(inicio, inicio + VENDAS_POR_PAGINA));
  renderPaginacaoVendas(totalPaginas);
}

function renderPaginacaoVendas(totalPaginas) {
  if (vendasListaFiltrada.length === 0) {
    vendasPaginacaoEl.innerHTML = '';
    return;
  }

  const paginas = [];
  const janela = 2;
  for (let p = 1; p <= totalPaginas; p += 1) {
    if (p === 1 || p === totalPaginas || Math.abs(p - vendasPaginaAtual) <= janela) {
      paginas.push(p);
    } else if (paginas[paginas.length - 1] !== '...') {
      paginas.push('...');
    }
  }

  const botoesPagina = paginas
    .map((p) =>
      p === '...'
        ? '<span class="pagination-reticencias">…</span>'
        : `<button type="button" class="btn btn-small ${p === vendasPaginaAtual ? 'btn-primary' : 'btn-ghost'}" data-pagina="${p}">${p}</button>`
    )
    .join('');

  vendasPaginacaoEl.innerHTML = `
    <button type="button" class="btn btn-ghost btn-small" id="vendas-pag-anterior" ${vendasPaginaAtual === 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span class="pagination-paginas">${botoesPagina}</span>
    <button type="button" class="btn btn-ghost btn-small" id="vendas-pag-proxima" ${vendasPaginaAtual === totalPaginas ? 'disabled' : ''}>Próxima ›</button>
    <span class="pagination-info">Página ${vendasPaginaAtual} de ${totalPaginas} — ${vendasListaFiltrada.length} venda(s)</span>
  `;

  document.getElementById('vendas-pag-anterior').addEventListener('click', () => irParaPaginaVendas(vendasPaginaAtual - 1));
  document.getElementById('vendas-pag-proxima').addEventListener('click', () => irParaPaginaVendas(vendasPaginaAtual + 1));
  vendasPaginacaoEl.querySelectorAll('button[data-pagina]').forEach((btn) => {
    btn.addEventListener('click', () => irParaPaginaVendas(Number(btn.dataset.pagina)));
  });
}

function renderVendas(vendas) {
  vendasBody.innerHTML = '';

  if (vendas.length === 0) {
    vendasBody.innerHTML = '<tr class="empty-row"><td colspan="9">Nenhuma venda registrada.</td></tr>';
    return;
  }

  vendas.forEach((v) => {
    const composicao = v.itens.map((i) => `${i.quantidade}x ${i.produto_codigo}`).join(', ');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${v.data}</td>
      <td class="cliente-clicavel" data-action="ver" data-id="${v.id}" title="Ver pedido completo">${v.cliente_nome}</td>
      <td><span class="status-badge ${v.tipo_cliente === 'B2B' ? 'b2b' : 'cpf'}">${v.tipo_cliente}</span></td>
      <td>${composicao}</td>
      <td>${v.forma_pagamento || '—'}</td>
      <td>
        ${v.nota_fiscal || '—'}
        ${v.bling_pedido_id ? `<button type="button" class="btn btn-ghost btn-small btn-nf" data-action="ver-nota-bling" data-id="${v.id}" title="Ver nota fiscal no Bling">NF</button>` : ''}
      </td>
      <td>R$ ${formatMoney(v.valor_total)}</td>
      <td>
        <select class="status-select status-select-${v.status.toLowerCase()}" data-action="mudar-status" data-id="${v.id}">
          ${opcoesStatusHtml(v.status)}
        </select>
      </td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-small" data-action="editar" data-id="${v.id}">Editar</button>
        <button class="btn btn-ghost btn-small" data-action="excluir" data-id="${v.id}">Excluir</button>
      </td>
    `;
    vendasBody.appendChild(row);
  });
}

const vendaDetalheOverlay = document.getElementById('venda-detalhe-overlay');
const vendaDetalheModal = document.getElementById('venda-detalhe-modal');

let vendaDetalheIdAtual = null;
const vendaDetalheStatus = document.getElementById('venda-detalhe-status');

function abrirDetalheVenda(venda) {
  vendaDetalheIdAtual = venda.id;
  vendaDetalheStatus.innerHTML = opcoesStatusHtml(venda.status);
  vendaDetalheStatus.className = `status-select status-select-${venda.status.toLowerCase()}`;

  document.getElementById('venda-detalhe-id').textContent = venda.id;
  document.getElementById('venda-detalhe-cliente').textContent = venda.cliente_nome;
  document.getElementById('venda-detalhe-tipo').textContent = venda.tipo_cliente;
  document.getElementById('venda-detalhe-data').textContent = venda.data;
  document.getElementById('venda-detalhe-pagamento').textContent = venda.forma_pagamento || '—';
  document.getElementById('venda-detalhe-nota').textContent = venda.nota_fiscal || '—';
  document.getElementById('venda-detalhe-local').textContent = venda.local === 'BASE01' ? 'Base 01' : 'Nosso Estoque';

  const obsWrapper = document.getElementById('venda-detalhe-observacoes-wrapper');
  obsWrapper.hidden = !venda.observacoes;
  document.getElementById('venda-detalhe-observacoes').textContent = venda.observacoes || '';

  document.getElementById('venda-detalhe-itens').innerHTML = venda.itens
    .map(
      (i) => `
        <tr>
          <td>${i.produto_codigo}</td>
          <td>${i.produto_descricao}</td>
          <td>${i.quantidade}</td>
          <td>R$ ${formatMoney(i.valor_unitario)}</td>
          <td>R$ ${formatMoney(i.subtotal)}</td>
        </tr>
      `
    )
    .join('');
  document.getElementById('venda-detalhe-total').textContent = `R$ ${formatMoney(venda.valor_total)}`;

  vendaDetalheOverlay.classList.add('open');
  vendaDetalheModal.classList.add('open');
}

function fecharDetalheVenda() {
  vendaDetalheOverlay.classList.remove('open');
  vendaDetalheModal.classList.remove('open');
}

document.getElementById('venda-detalhe-fechar-btn').addEventListener('click', fecharDetalheVenda);
vendaDetalheOverlay.addEventListener('click', fecharDetalheVenda);

vendaDetalheStatus.addEventListener('change', async () => {
  const novoStatus = vendaDetalheStatus.value;
  await api(`/vendas/${vendaDetalheIdAtual}/status`, { method: 'PATCH', body: JSON.stringify({ status: novoStatus }) });
  vendaDetalheStatus.className = `status-select status-select-${novoStatus.toLowerCase()}`;
  const venda = ultimasVendas.find((v) => v.id === vendaDetalheIdAtual);
  if (venda) venda.status = novoStatus;
  const linhaSelect = vendasBody.querySelector(`select[data-id="${vendaDetalheIdAtual}"]`);
  if (linhaSelect) {
    linhaSelect.value = novoStatus;
    linhaSelect.className = `status-select status-select-${novoStatus.toLowerCase()}`;
  }
});

vendasBody.addEventListener('change', async (e) => {
  const select = e.target.closest('select[data-action="mudar-status"]');
  if (!select) return;
  const { id } = select.dataset;
  const novoStatus = select.value;

  await api(`/vendas/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: novoStatus }) });
  select.className = `status-select status-select-${novoStatus.toLowerCase()}`;
  const venda = ultimasVendas.find((v) => v.id === Number(id));
  if (venda) venda.status = novoStatus;
});

vendasBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'ver') {
    const venda = await api(`/vendas/${id}`);
    abrirDetalheVenda(venda);
  }

  if (action === 'editar') {
    const venda = await api(`/vendas/${id}`);
    iniciarEdicaoVenda(venda);
  }

  if (action === 'excluir') {
    const confirmado = await confirmarAcao('Excluir esta venda? O estoque baixado por ela será devolvido.', {
      titulo: 'Excluir venda',
      textoConfirmar: 'Excluir',
    });
    if (!confirmado) return;
    await api(`/vendas/${id}`, { method: 'DELETE' });
    showFeedback(vendaFeedback, 'Venda excluída.', true);
    carregarVendas();
  }

  if (action === 'ver-nota-bling') {
    const venda = ultimasVendas.find((v) => v.id === Number(id));
    abrirNotaBling(venda);
  }
});

const notaBlingOverlay = document.getElementById('nota-bling-overlay');
const notaBlingModal = document.getElementById('nota-bling-modal');
const notaBlingCarregando = document.getElementById('nota-bling-carregando');
const notaBlingVazio = document.getElementById('nota-bling-vazio');
const notaBlingErro = document.getElementById('nota-bling-erro');
const notaBlingInfo = document.getElementById('nota-bling-info');
const notaBlingLinks = document.getElementById('nota-bling-links');

function fecharNotaBling() {
  notaBlingOverlay.classList.remove('open');
  notaBlingModal.classList.remove('open');
}

async function abrirNotaBling(venda) {
  document.getElementById('nota-bling-pedido-id').textContent = venda.bling_pedido_id;
  notaBlingCarregando.hidden = false;
  notaBlingVazio.hidden = true;
  notaBlingErro.hidden = true;
  notaBlingInfo.hidden = true;
  notaBlingLinks.hidden = true;

  notaBlingOverlay.classList.add('open');
  notaBlingModal.classList.add('open');

  try {
    const resultado = await api(`/bling/vendas/${venda.id}/nota`);
    notaBlingCarregando.hidden = true;

    if (!resultado.emitida) {
      notaBlingVazio.textContent = resultado.indisponivel
        ? 'A nota fiscal deste pedido não está mais disponível no Bling (pode ter sido cancelada).'
        : 'Este pedido ainda não tem nota fiscal emitida no Bling.';
      notaBlingVazio.hidden = false;
      return;
    }

    document.getElementById('nota-bling-numero').textContent = resultado.numero || '—';
    document.getElementById('nota-bling-serie').textContent = resultado.serie || '—';
    document.getElementById('nota-bling-situacao').textContent = resultado.situacao_label || '—';
    document.getElementById('nota-bling-emissao').textContent = resultado.data_emissao || '—';
    document.getElementById('nota-bling-chave').textContent = resultado.chave_acesso || '—';
    notaBlingInfo.hidden = false;

    const linkDanfe = document.getElementById('nota-bling-link-danfe');
    const linkPdf = document.getElementById('nota-bling-link-pdf');
    if (resultado.link_danfe || resultado.link_pdf) {
      linkDanfe.hidden = !resultado.link_danfe;
      if (resultado.link_danfe) linkDanfe.href = resultado.link_danfe;
      linkPdf.hidden = !resultado.link_pdf;
      if (resultado.link_pdf) linkPdf.href = resultado.link_pdf;
      notaBlingLinks.hidden = false;
    }
  } catch (err) {
    notaBlingCarregando.hidden = true;
    notaBlingErro.hidden = false;
    notaBlingErro.textContent = err.message;
  }
}

document.getElementById('nota-bling-fechar-btn').addEventListener('click', fecharNotaBling);
notaBlingOverlay.addEventListener('click', fecharNotaBling);

vendasFiltrarBtn.addEventListener('click', carregarVendas);
vendasBusca.addEventListener('input', aplicarFiltroBuscaEOrdenacao);

document.getElementById('vendas-nova-btn').addEventListener('click', () => {
  document.querySelector('.nav-dropdown-menu button[data-tab="vendas-nova"]')?.click();
});

document.addEventListener('tab:vendas-nova', () => {
  carregarProdutosParaVenda();
});
document.addEventListener('tab:vendas-registradas', () => {
  carregarVendas();
});

document.addEventListener('DOMContentLoaded', () => {
  vendaForm.data.value = todayISO();
  carregarProdutosParaVenda();
});
