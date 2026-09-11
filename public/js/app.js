async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    if (typeof mostrarLogin === 'function') mostrarLogin();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error((data && data.error) || 'Erro inesperado.');
  }
  return data;
}

function showFeedback(el, message, isSuccess = false) {
  el.textContent = message;
  el.classList.toggle('success', isSuccess);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function createSortable(theadEl, onChange) {
  const state = { field: null, direction: 'asc' };

  theadEl.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      if (state.field === th.dataset.sort) {
        state.direction = state.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.field = th.dataset.sort;
        state.direction = 'asc';
      }
      updateIndicators();
      onChange();
    });
  });

  function updateIndicators() {
    theadEl.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === state.field) {
        th.classList.add(state.direction === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  function sort(data) {
    if (!state.field) return data;
    const factor = state.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      let va = a[state.field];
      let vb = b[state.field];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }

  return { state, sort, updateIndicators };
}

function createColumnToggle(table, storageKey, mountEl) {
  const colunas = Array.from(table.querySelectorAll('thead th')).map((th, i) => ({
    index: i + 1,
    chave: th.dataset.sort || `col-${i}`,
    rotulo: th.textContent.trim(),
  }));

  let ocultas = [];
  try {
    ocultas = JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    ocultas = [];
  }

  const estiloTag = document.createElement('style');
  document.head.appendChild(estiloTag);

  function aplicarEstilo() {
    estiloTag.textContent = colunas
      .filter((c) => ocultas.includes(c.chave))
      .map((c) => `#${table.id} th:nth-child(${c.index}), #${table.id} td:nth-child(${c.index}) { display: none !important; }`)
      .join('\n');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'col-toggle';
  wrapper.innerHTML = `
    <button type="button" class="btn btn-ghost col-toggle-btn">☰ Colunas</button>
    <div class="col-toggle-painel">
      ${colunas
        .map(
          (c) => `
            <label class="col-toggle-item">
              <input type="checkbox" data-chave="${c.chave}" ${ocultas.includes(c.chave) ? '' : 'checked'}>
              ${c.rotulo}
            </label>`
        )
        .join('')}
    </div>
  `;

  const btn = wrapper.querySelector('.col-toggle-btn');
  const painel = wrapper.querySelector('.col-toggle-painel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapper.classList.toggle('aberto');
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove('aberto');
  });

  painel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const chave = cb.dataset.chave;
      if (cb.checked) {
        ocultas = ocultas.filter((c) => c !== chave);
      } else if (!ocultas.includes(chave)) {
        ocultas.push(chave);
      }
      localStorage.setItem(storageKey, JSON.stringify(ocultas));
      aplicarEstilo();
    });
  });

  aplicarEstilo();
  mountEl.appendChild(wrapper);
}

const navToggleBtn = document.getElementById('nav-toggle-btn');
const navCurrentLabel = document.getElementById('nav-current-label');
const tabsNav = document.getElementById('tabs-nav');

navToggleBtn.addEventListener('click', () => {
  tabsNav.classList.toggle('nav-open');
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const panel = document.getElementById(`tab-${btn.dataset.tab}`);
    panel.classList.add('active');

    navCurrentLabel.textContent = btn.textContent;
    tabsNav.classList.remove('nav-open');

    document.querySelectorAll('.nav-dropdown').forEach((d) => {
      d.classList.remove('aberto');
      d.classList.toggle('tem-ativo', d.contains(btn));
    });

    document.dispatchEvent(new CustomEvent(`tab:${btn.dataset.tab}`));
  });
});

document.querySelectorAll('.nav-dropdown-toggle').forEach((toggle) => {
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = toggle.closest('.nav-dropdown');
    const jaAberto = dropdown.classList.contains('aberto');
    document.querySelectorAll('.nav-dropdown').forEach((d) => d.classList.remove('aberto'));
    dropdown.classList.toggle('aberto', !jaAberto);
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-dropdown')) {
    document.querySelectorAll('.nav-dropdown').forEach((d) => d.classList.remove('aberto'));
  }
});
