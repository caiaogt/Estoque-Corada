const kitForm = document.getElementById('kit-form');
const kitFormTitle = document.getElementById('kit-form-title');
const kitCancelarBtn = document.getElementById('kit-cancelar');
const kitItensWrapper = document.getElementById('kit-itens-wrapper');
const kitAddItemBtn = document.getElementById('kit-add-item');
const kitFeedback = document.getElementById('kit-feedback');
const kitsBody = document.getElementById('kits-body');

const kitSaidaPanel = document.getElementById('kit-saida-panel');
const kitSaidaNome = document.getElementById('kit-saida-nome');
const kitSaidaQuantidade = document.getElementById('kit-saida-quantidade');
const kitSaidaData = document.getElementById('kit-saida-data');
const kitSaidaCliente = document.getElementById('kit-saida-cliente');
const kitSaidaLocal = document.getElementById('kit-saida-local');
const kitSaidaFeedback = document.getElementById('kit-saida-feedback');
let kitSaidaAlvoId = null;

let produtosParaKit = [];

function opcoesProdutoHtml(selecionadoId) {
  return (
    '<option value="" disabled selected>Selecione um produto</option>' +
    produtosParaKit
      .map((p) => `<option value="${p.id}" ${p.id === selecionadoId ? 'selected' : ''}>${p.codigo} — ${p.descricao}</option>`)
      .join('')
  );
}

function novaLinhaKitItem(produtoId, quantidade) {
  const row = document.createElement('div');
  row.className = 'kit-item-row';
  row.innerHTML = `
    <select class="kit-item-produto">${opcoesProdutoHtml(produtoId)}</select>
    <input type="number" class="kit-item-qtd" min="1" value="${quantidade || 1}" placeholder="Qtd">
    <button type="button" class="btn btn-ghost btn-small kit-item-remover">Remover</button>
  `;
  return row;
}

async function carregarProdutosParaKit() {
  produtosParaKit = await api('/produtos?ativo=1');
  kitItensWrapper.querySelectorAll('.kit-item-produto').forEach((select) => {
    const atual = select.value ? Number(select.value) : null;
    select.innerHTML = opcoesProdutoHtml(atual);
  });
}

kitAddItemBtn.addEventListener('click', () => {
  kitItensWrapper.appendChild(novaLinhaKitItem());
});

kitItensWrapper.addEventListener('click', (e) => {
  if (!e.target.classList.contains('kit-item-remover')) return;
  if (kitItensWrapper.children.length === 1) return;
  e.target.closest('.kit-item-row').remove();
});

function coletarItensKit() {
  const itens = [];
  kitItensWrapper.querySelectorAll('.kit-item-row').forEach((row) => {
    const produtoId = row.querySelector('.kit-item-produto').value;
    const quantidade = row.querySelector('.kit-item-qtd').value;
    if (produtoId && quantidade) {
      itens.push({ produto_id: Number(produtoId), quantidade: Number(quantidade) });
    }
  });
  return itens;
}

function resetarFormularioKit() {
  kitForm.reset();
  kitForm.id.value = '';
  kitFormTitle.textContent = 'Novo Kit';
  kitCancelarBtn.hidden = true;
  kitItensWrapper.innerHTML = '';
  kitItensWrapper.appendChild(novaLinhaKitItem());
}

function iniciarEdicaoKit(kit) {
  kitForm.id.value = kit.id;
  kitForm.codigo.value = kit.codigo;
  kitForm.nome.value = kit.nome;
  kitFormTitle.textContent = `Editar Kit — ${kit.codigo}`;
  kitCancelarBtn.hidden = false;

  kitItensWrapper.innerHTML = '';
  kit.itens.forEach((item) => {
    kitItensWrapper.appendChild(novaLinhaKitItem(item.produto_id, item.quantidade));
  });
  kitForm.scrollIntoView({ behavior: 'smooth' });
}

kitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback(kitFeedback, '');

  const id = kitForm.id.value;
  const itens = coletarItensKit();

  if (itens.length === 0) {
    showFeedback(kitFeedback, 'Adicione ao menos um produto ao kit.');
    return;
  }

  const payload = { codigo: kitForm.codigo.value.trim(), nome: kitForm.nome.value.trim(), itens };

  try {
    if (id) {
      await api(`/kits/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showFeedback(kitFeedback, 'Kit atualizado.', true);
    } else {
      await api('/kits', { method: 'POST', body: JSON.stringify(payload) });
      showFeedback(kitFeedback, 'Kit cadastrado.', true);
    }
    resetarFormularioKit();
    carregarKits();
  } catch (err) {
    showFeedback(kitFeedback, err.message);
  }
});

kitCancelarBtn.addEventListener('click', resetarFormularioKit);

let ultimosKits = [];
const kitsSortable = createSortable(document.getElementById('kits-thead'), () => {
  renderKits(kitsSortable.sort(ultimosKits));
});

async function carregarKits() {
  const kits = await api('/kits');
  ultimosKits = kits;
  renderKits(kitsSortable.sort(kits));
}

function renderKits(kits) {
  kitsBody.innerHTML = '';

  if (kits.length === 0) {
    kitsBody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum kit cadastrado.</td></tr>';
    return;
  }

  kits.forEach((kit) => {
    const composicao = kit.itens.map((i) => `${i.quantidade}x ${i.produto_codigo}`).join(', ');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${kit.codigo}</td>
      <td>${kit.nome} ${kit.ativo ? '' : '<span class="status-badge arquivado">Arquivado</span>'}</td>
      <td>${composicao}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-small" data-action="editar" data-id="${kit.id}">Editar</button>
        <button class="btn btn-ghost btn-small" data-action="saida" data-id="${kit.id}" data-nome="${kit.nome}">Dar Saída</button>
        <button class="btn btn-ghost btn-small" data-action="status" data-id="${kit.id}" data-ativo="${kit.ativo}">
          ${kit.ativo ? 'Arquivar' : 'Reativar'}
        </button>
      </td>
    `;
    kitsBody.appendChild(row);
  });
}

kitsBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, id, ativo, nome } = btn.dataset;

  if (action === 'editar') {
    const kit = await api(`/kits/${id}`);
    iniciarEdicaoKit(kit);
  }

  if (action === 'status') {
    await api(`/kits/${id}/status`, { method: 'PATCH', body: JSON.stringify({ ativo: ativo === 'true' ? 0 : 1 }) });
    carregarKits();
  }

  if (action === 'saida') {
    kitSaidaAlvoId = id;
    kitSaidaNome.textContent = nome;
    kitSaidaQuantidade.value = 1;
    kitSaidaData.value = todayISO();
    kitSaidaCliente.value = '';
    showFeedback(kitSaidaFeedback, '');
    kitSaidaPanel.hidden = false;
    kitSaidaPanel.scrollIntoView({ behavior: 'smooth' });
  }
});

document.getElementById('kit-saida-cancelar').addEventListener('click', () => {
  kitSaidaPanel.hidden = true;
  kitSaidaAlvoId = null;
});

document.getElementById('kit-saida-confirmar').addEventListener('click', async () => {
  showFeedback(kitSaidaFeedback, '');
  const payload = {
    quantidade: kitSaidaQuantidade.value,
    data: kitSaidaData.value,
    cliente: kitSaidaCliente.value.trim(),
    local: kitSaidaLocal.value,
  };

  try {
    await api(`/kits/${kitSaidaAlvoId}/saida`, { method: 'POST', body: JSON.stringify(payload) });
    showFeedback(kitSaidaFeedback, 'Saída do kit registrada.', true);
    setTimeout(() => {
      kitSaidaPanel.hidden = true;
    }, 800);
  } catch (err) {
    showFeedback(kitSaidaFeedback, err.message);
  }
});

document.addEventListener('tab:kits', () => {
  carregarProdutosParaKit();
  carregarKits();
});

document.addEventListener('DOMContentLoaded', () => {
  carregarProdutosParaKit();
});
