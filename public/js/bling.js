const blingStatusBadge = document.getElementById('bling-status-badge');
const blingHint = document.getElementById('bling-hint');
const blingConectarBtn = document.getElementById('bling-conectar-btn');
const blingSincronizarBtn = document.getElementById('bling-sincronizar-btn');
const blingFeedback = document.getElementById('bling-feedback');
const blingResultado = document.getElementById('bling-resultado');
const blingResEncontrados = document.getElementById('bling-res-encontrados');
const blingResImportados = document.getElementById('bling-res-importados');
const blingResNaoEncontradosWrapper = document.getElementById('bling-res-nao-encontrados-wrapper');
const blingResNaoEncontrados = document.getElementById('bling-res-nao-encontrados');
const blingResErrosWrapper = document.getElementById('bling-res-erros-wrapper');
const blingResErros = document.getElementById('bling-res-erros');

async function carregarStatusBling() {
  const status = await api('/bling/status');

  blingConectarBtn.hidden = true;
  blingSincronizarBtn.hidden = true;

  if (!status.configurado) {
    blingStatusBadge.textContent = 'Não configurado';
    blingStatusBadge.className = 'status-badge arquivado';
    blingHint.textContent = 'Preencha BLING_CLIENT_ID, BLING_CLIENT_SECRET e BLING_REDIRECT_URI no arquivo .env (veja .env.example) e reinicie o servidor.';
    return;
  }

  if (!status.conectado) {
    blingStatusBadge.textContent = 'Não conectado';
    blingStatusBadge.className = 'status-badge arquivado';
    blingHint.textContent = 'Clique em "Conectar ao Bling" para autorizar o acesso à sua conta.';
    blingConectarBtn.hidden = false;
    return;
  }

  blingStatusBadge.textContent = 'Conectado';
  blingStatusBadge.className = 'status-badge ativo';
  blingHint.textContent = status.ultima_sincronizacao
    ? `Última sincronização: ${new Date(status.ultima_sincronizacao).toLocaleString('pt-BR')}`
    : 'Ainda não sincronizado. Clique em "Sincronizar Agora" para puxar os pedidos de venda do Bling.';
  blingSincronizarBtn.hidden = false;
}

blingConectarBtn.addEventListener('click', () => {
  window.location.href = '/api/bling/connect';
});

blingSincronizarBtn.addEventListener('click', async () => {
  showFeedback(blingFeedback, '');
  blingResultado.hidden = true;
  blingSincronizarBtn.disabled = true;
  blingSincronizarBtn.textContent = 'Sincronizando...';

  try {
    const resultado = await api('/bling/sync', { method: 'POST', body: JSON.stringify({}) });

    blingResEncontrados.textContent = resultado.encontrados;
    blingResImportados.textContent = resultado.importados;

    blingResNaoEncontradosWrapper.hidden = resultado.itens_nao_encontrados.length === 0;
    blingResNaoEncontrados.innerHTML = resultado.itens_nao_encontrados.map((i) => `<li>${i}</li>`).join('');

    blingResErrosWrapper.hidden = resultado.erros.length === 0;
    blingResErros.innerHTML = resultado.erros.map((e) => `<li>${e}</li>`).join('');

    blingResultado.hidden = false;
    showFeedback(blingFeedback, `Sincronização concluída: ${resultado.importados} venda(s) nova(s) importada(s).`, true);

    carregarStatusBling();
    carregarVendas();
  } catch (err) {
    showFeedback(blingFeedback, err.message);
  } finally {
    blingSincronizarBtn.disabled = false;
    blingSincronizarBtn.textContent = 'Sincronizar Agora';
  }
});

document.addEventListener('tab:vendas-bling', carregarStatusBling);
document.addEventListener('DOMContentLoaded', () => {
  carregarStatusBling();

  const params = new URLSearchParams(window.location.search);
  if (params.get('bling') === 'conectado') {
    window.history.replaceState({}, '', window.location.pathname);
    document.querySelector('button[data-tab="vendas-bling"]').click();
  }
});
