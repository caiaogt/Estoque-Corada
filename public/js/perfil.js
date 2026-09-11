const avatarBtn = document.getElementById('avatar-btn');
const avatarCircle = document.getElementById('avatar-circle');
const perfilOverlay = document.getElementById('perfil-overlay');
const perfilModal = document.getElementById('perfil-modal');
const perfilFecharBtn = document.getElementById('perfil-fechar-btn');
const perfilAvatarPreview = document.getElementById('perfil-avatar-preview');
const perfilFotoInput = document.getElementById('perfil-foto-input');
const perfilUsuarioInput = document.getElementById('perfil-usuario');
const perfilNomeExibicaoInput = document.getElementById('perfil-nome-exibicao');
const perfilDadosForm = document.getElementById('perfil-dados-form');
const perfilDadosFeedback = document.getElementById('perfil-dados-feedback');
const perfilSenhaForm = document.getElementById('perfil-senha-form');
const perfilSenhaFeedback = document.getElementById('perfil-senha-feedback');

let fotoSelecionadaBase64 = null;

function renderAvatar(el, usuario) {
  if (usuario.foto_perfil) {
    el.innerHTML = `<img src="${usuario.foto_perfil}" alt="">`;
  } else {
    const letra = (usuario.nome_exibicao || usuario.usuario || '?').trim().charAt(0).toUpperCase();
    el.innerHTML = '';
    el.textContent = letra;
  }
}

async function abrirPerfil() {
  fotoSelecionadaBase64 = null;
  showFeedback(perfilDadosFeedback, '');
  showFeedback(perfilSenhaFeedback, '');
  perfilSenhaForm.reset();

  const usuario = await api('/perfil');
  perfilUsuarioInput.value = usuario.usuario;
  perfilNomeExibicaoInput.value = usuario.nome_exibicao || '';
  renderAvatar(perfilAvatarPreview, usuario);

  perfilOverlay.classList.add('open');
  perfilModal.classList.add('open');
}

function fecharPerfil() {
  perfilOverlay.classList.remove('open');
  perfilModal.classList.remove('open');
}

avatarBtn.addEventListener('click', abrirPerfil);
perfilFecharBtn.addEventListener('click', fecharPerfil);
perfilOverlay.addEventListener('click', fecharPerfil);

perfilFotoInput.addEventListener('change', () => {
  const arquivo = perfilFotoInput.files[0];
  if (!arquivo) return;

  const leitor = new FileReader();
  leitor.onload = () => {
    fotoSelecionadaBase64 = leitor.result;
    perfilAvatarPreview.innerHTML = `<img src="${fotoSelecionadaBase64}" alt="">`;
  };
  leitor.readAsDataURL(arquivo);
});

perfilDadosForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback(perfilDadosFeedback, '');

  const payload = { nome_exibicao: perfilNomeExibicaoInput.value };
  if (fotoSelecionadaBase64) payload.foto_base64 = fotoSelecionadaBase64;

  try {
    const usuario = await api('/perfil', { method: 'PUT', body: JSON.stringify(payload) });
    showFeedback(perfilDadosFeedback, 'Perfil atualizado.', true);
    fotoSelecionadaBase64 = null;
    renderAvatar(avatarCircle, usuario);
    document.getElementById('usuario-logado').textContent = usuario.nome_exibicao || usuario.usuario;
  } catch (err) {
    showFeedback(perfilDadosFeedback, err.message);
  }
});

perfilSenhaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback(perfilSenhaFeedback, '');

  const senhaAtual = document.getElementById('perfil-senha-atual').value;
  const senhaNova = document.getElementById('perfil-senha-nova').value;

  try {
    await api('/perfil/senha', { method: 'PUT', body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }) });
    showFeedback(perfilSenhaFeedback, 'Senha alterada com sucesso.', true);
    perfilSenhaForm.reset();
  } catch (err) {
    showFeedback(perfilSenhaFeedback, err.message);
  }
});
