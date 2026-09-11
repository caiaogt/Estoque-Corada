const vendaForm = document.getElementById('venda-form');
const vendaFormTitle = document.getElementById('venda-form-title');
const vendaSubmitBtn = document.getElementById('venda-submit-btn');
const vendaCancelarBtn = document.getElementById('venda-cancelar');
const vendaFeedback = document.getElementById('venda-feedback');
const vendaTotalPreview = document.getElementById('venda-total-preview');
const vendaSubtotalPreview = document.getElementById('venda-subtotal-preview');
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
  if (produto.preco_b2b != null && !vendaEntradaValor.value) {
    vendaEntradaValor.value = produto.preco_b2b;
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
    vendaItensBody.innerHTML = '<tr class="empty-row" id="venda-itens-vazio"><td colspan="6">Nenhum item adicionado ainda.</td></tr>';
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
  const total = itensVendaAtual.reduce((sum, i) => sum + i.subtotal, 0);
  vendaSubtotalPreview.textContent = `R$ ${formatMoney(total)}`;
  vendaTotalPreview.textContent = `R$ ${formatMoney(total)}`;
}

function coletarItensVenda() {
  return itensVendaAtual.map((i) => ({
    produto_id: i.produto_id,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
  }));
}

function resetarFormularioVenda() {
  vendaForm.reset();
  vendaForm.id.value = '';
  vendaFormTitle.textContent = 'Nova Venda';
  vendaSubmitBtn.textContent = 'Registrar Venda';
  vendaCancelarBtn.hidden = true;
  itensVendaAtual = [];
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
  vendaSubmitBtn.textContent = 'Salvar Alterações';
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
    itens,
  };

  vendaSubmitBtn.disabled = true;
  const textoOriginal = vendaSubmitBtn.textContent;
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
    vendaSubmitBtn.textContent = textoOriginal;
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
    vendasBody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhuma venda registrada.</td></tr>';
    return;
  }

  vendas.forEach((v) => {
    const composicao = v.itens.map((i) => `${i.quantidade}x ${i.produto_codigo}`).join(', ');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${v.data}</td>
      <td>${v.cliente_nome}</td>
      <td><span class="status-badge ${v.tipo_cliente === 'B2B' ? 'b2b' : 'cpf'}">${v.tipo_cliente}</span></td>
      <td>${composicao}</td>
      <td>${v.forma_pagamento || '—'}</td>
      <td>${v.nota_fiscal || '—'}</td>
      <td>R$ ${formatMoney(v.valor_total)}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-small" data-action="editar" data-id="${v.id}">Editar</button>
        <button class="btn btn-ghost btn-small" data-action="excluir" data-id="${v.id}">Excluir</button>
      </td>
    `;
    vendasBody.appendChild(row);
  });
}

vendasBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'editar') {
    const venda = await api(`/vendas/${id}`);
    iniciarEdicaoVenda(venda);
  }

  if (action === 'excluir') {
    if (!confirm('Excluir esta venda? O estoque baixado por ela será devolvido.')) return;
    await api(`/vendas/${id}`, { method: 'DELETE' });
    showFeedback(vendaFeedback, 'Venda excluída.', true);
    carregarVendas();
  }
});

vendasFiltrarBtn.addEventListener('click', carregarVendas);
vendasBusca.addEventListener('input', aplicarFiltroBuscaEOrdenacao);

document.querySelectorAll('.action-card[data-goto]').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelector(`[data-tab="${card.dataset.goto}"]`)?.click();
  });
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
