const express = require('express');
const crypto = require('crypto');
const { db, verificarSenha } = require('../db');
const wrap = require('./wrap');

const router = express.Router();

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

async function criarSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS).toISOString();
  await db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)').run(token, usuarioId, expiraEm);
  return { token, expiraEm };
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((par) => {
    const [chave, ...valor] = par.trim().split('=');
    cookies[chave] = decodeURIComponent(valor.join('='));
  });
  return cookies;
}

async function obterUsuarioDaSessao(req) {
  const cookies = parseCookies(req);
  const token = cookies.sessao;
  if (!token) return null;

  const sessao = await db.prepare('SELECT * FROM sessoes WHERE token = ?').get(token);
  if (!sessao) return null;
  if (new Date(sessao.expira_em).getTime() < Date.now()) {
    await db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    return null;
  }

  return db
    .prepare('SELECT id, usuario, nome_exibicao, foto_perfil FROM usuarios WHERE id = ?')
    .get(sessao.usuario_id);
}

async function exigirAutenticacao(req, res, next) {
  const usuario = await obterUsuarioDaSessao(req);
  if (!usuario) return res.status(401).json({ error: 'Não autenticado.' });
  req.usuario = usuario;
  next();
}

router.post('/login', wrap(async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const registro = await db.prepare('SELECT * FROM usuarios WHERE LOWER(usuario) = LOWER(?)').get(usuario.trim());
  if (!registro || !verificarSenha(senha, registro.senha_hash, registro.senha_salt)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const { token, expiraEm } = await criarSessao(registro.id);
  res.setHeader(
    'Set-Cookie',
    `sessao=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${new Date(expiraEm).toUTCString()}`
  );
  res.json({ usuario: registro.usuario });
}));

router.post('/logout', wrap(async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sessao) {
    await db.prepare('DELETE FROM sessoes WHERE token = ?').run(cookies.sessao);
  }
  res.setHeader('Set-Cookie', 'sessao=; HttpOnly; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.status(204).end();
}));

router.get('/me', wrap(async (req, res) => {
  const usuario = await obterUsuarioDaSessao(req);
  if (!usuario) return res.status(401).json({ error: 'Não autenticado.' });
  res.json(usuario);
}));

module.exports = { router, exigirAutenticacao };
