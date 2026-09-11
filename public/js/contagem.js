const contagemBody = document.getElementById('contagem-body');
const contagemFeedback = document.getElementById('contagem-feedback');
const contagemAjustarTodosBtn = document.getElementById('contagem-ajustar-todos');

let ultimoEstoqueContagem = [];
const contagemSortable = createSortable(document.getElementById('contagem-thead'), () => {
  const valores = capturarValoresDigitados();
  renderContagem(contagemSortable.sort(ultimoEstoqueContagem), valores);
});

function capturarValoresDigitados() {
  const valores = {};
  contagemBody.querySelectorAll('tr[data-id]').forEach((row) => {
    const input = row.querySelector('.contagem-input');
    if (input && input.value !== '') valores[row.dataset.id] = input.value;
  });
  return valores;
}

async function carregarContagem() {
  const estoque = await api('/estoque?ativo=1');
  ultimoEstoqueContagem = estoque;
  renderContagem(contagemSortable.sort(estoque));
}

function renderContagem(estoque, valoresDigitados = {}) {
  contagemBody.innerHTML = '';

  if (estoque.length === 0) {
    contagemBody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum produto encontrado.</td></tr>';
    return;
  }

  estoque.forEach((p) => {
    const row = document.createElement('tr');
    row.dataset.id = p.id;
    row.dataset.saldo = p.saldo;
    row.innerHTML = `
      <td data-label="Código"><strong>${p.codigo}</strong></td>
      <td data-label="Descrição">${p.descricao}</td>
      <td data-label="Saldo Sistema">${p.saldo}</td>
      <td data-label="Contagem Física"><input type="number" class="contagem-input" min="0" placeholder="Contagem"></td>
      <td data-label="Diferença" class="contagem-diferenca">—</td>
    `;
    contagemBody.appendChild(row);

    const valorAnterior = valoresDigitados[p.id];
    if (valorAnterior != null) {
      const input = row.querySelector('.contagem-input');
      input.value = valorAnterior;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

contagemBody.addEventListener('input', (e) => {
  if (!e.target.classList.contains('contagem-input')) return;
  const row = e.target.closest('tr');
  const saldo = Number(row.dataset.saldo);
  const diffCell = row.querySelector('.contagem-diferenca');

  if (e.target.value === '') {
    diffCell.textContent = '—';
    diffCell.className = 'contagem-diferenca';
    return;
  }

  const contado = Number(e.target.value);
  const diferenca = contado - saldo;
  diffCell.textContent = diferenca > 0 ? `+${diferenca}` : diferenca;
  diffCell.className = `contagem-diferenca ${diferenca > 0 ? 'diff-positivo' : diferenca < 0 ? 'diff-negativo' : ''}`;
});

contagemAjustarTodosBtn.addEventListener('click', async () => {
  showFeedback(contagemFeedback, '');

  const pendentes = [];
  contagemBody.querySelectorAll('tr[data-id]').forEach((row) => {
    const input = row.querySelector('.contagem-input');
    if (!input || input.value === '') return;
    const saldo = Number(row.dataset.saldo);
    const contado = Number(input.value);
    if (contado !== saldo) {
      pendentes.push({ produto_id: Number(row.dataset.id), saldo_contado: contado });
    }
  });

  if (pendentes.length === 0) {
    showFeedback(contagemFeedback, 'Nenhuma contagem diferente do saldo do sistema foi digitada.');
    return;
  }

  contagemAjustarTodosBtn.disabled = true;
  contagemAjustarTodosBtn.textContent = 'Ajustando...';

  try {
    for (const item of pendentes) {
      await api('/ajustes', {
        method: 'POST',
        body: JSON.stringify({
          produto_id: item.produto_id,
          saldo_contado: item.saldo_contado,
          data: todayISO(),
          observacao: 'Ajuste via contagem física',
        }),
      });
    }
    showFeedback(contagemFeedback, `${pendentes.length} ajuste(s) registrado(s) com sucesso.`, true);
    carregarContagem();
  } catch (err) {
    showFeedback(contagemFeedback, err.message);
  } finally {
    contagemAjustarTodosBtn.disabled = false;
    contagemAjustarTodosBtn.textContent = 'Ajustar Todos';
  }
});

document.addEventListener('tab:contagem', carregarContagem);
