const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginFeedback = document.getElementById('login-feedback');
const usuarioLogado = document.getElementById('usuario-logado');
const logoutBtn = document.getElementById('logout-btn');
const senhaInput = document.getElementById('login-senha');
const senhaToggleBtn = document.getElementById('senha-toggle-btn');

const senhaToggleImg = senhaToggleBtn.querySelector('img');

senhaToggleBtn.addEventListener('click', () => {
  const oculta = senhaInput.type === 'password';
  senhaInput.type = oculta ? 'text' : 'password';
  senhaToggleImg.src = oculta ? 'img/icons/icon-ocultar-senha.png' : 'img/icons/icon-mostrar-senha.png';
  senhaToggleBtn.setAttribute('aria-label', oculta ? 'Ocultar senha' : 'Mostrar senha');
});

function mostrarApp(usuario) {
  loginScreen.classList.remove('visivel');
  appShell.classList.add('visivel');
  usuarioLogado.textContent = usuario.nome_exibicao || usuario.usuario;
  renderAvatar(document.getElementById('avatar-circle'), usuario);
}

function mostrarLogin() {
  appShell.classList.remove('visivel');
  loginScreen.classList.add('visivel');
}

async function verificarSessao() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) throw new Error();
    const usuario = await res.json();
    mostrarApp(usuario);
  } catch {
    mostrarLogin();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginFeedback.textContent = '';

  const formData = new FormData(loginForm);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: formData.get('usuario'), senha: formData.get('senha') }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erro ao entrar.');
    }
    window.location.reload();
  } catch (err) {
    loginFeedback.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.reload();
});

verificarSessao();
