const express = require('express');
const path = require('path');
const fs = require('fs');
const { db, gerarHashSenha, verificarSenha } = require('../db');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'perfil');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const TIPOS_PERMITIDOS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

router.get('/', (req, res) => {
  const usuario = db
    .prepare('SELECT id, usuario, nome_exibicao, foto_perfil FROM usuarios WHERE id = ?')
    .get(req.usuario.id);
  res.json(usuario);
});

router.put('/', (req, res) => {
  const { nome_exibicao, foto_base64 } = req.body;

  let fotoPath;
  if (foto_base64) {
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(foto_base64);
    if (!match) return res.status(400).json({ error: 'Formato de imagem inválido.' });

    const [, mime, base64] = match;
    const extensao = TIPOS_PERMITIDOS[mime];
    if (!extensao) return res.status(400).json({ error: 'Use uma imagem PNG, JPEG, WEBP ou GIF.' });

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagem muito grande (máximo 3MB).' });
    }

    const nomeArquivo = `${req.usuario.id}-${Date.now()}.${extensao}`;
    fs.writeFileSync(path.join(uploadsDir, nomeArquivo), buffer);
    fotoPath = `/uploads/perfil/${nomeArquivo}`;

    const antigo = db.prepare('SELECT foto_perfil FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (antigo?.foto_perfil) {
      const caminhoAntigo = path.join(__dirname, '..', 'public', antigo.foto_perfil);
      fs.unlink(caminhoAntigo, () => {});
    }
  }

  const usuarioAtual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);

  db.prepare('UPDATE usuarios SET nome_exibicao = ?, foto_perfil = ? WHERE id = ?').run(
    nome_exibicao !== undefined ? (nome_exibicao.trim() || null) : usuarioAtual.nome_exibicao,
    fotoPath || usuarioAtual.foto_perfil,
    req.usuario.id
  );

  const atualizado = db
    .prepare('SELECT id, usuario, nome_exibicao, foto_perfil FROM usuarios WHERE id = ?')
    .get(req.usuario.id);
  res.json(atualizado);
});

router.put('/senha', (req, res) => {
  const { senha_atual, senha_nova } = req.body;
  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
  }
  if (senha_nova.length < 4) {
    return res.status(400).json({ error: 'A nova senha precisa ter ao menos 4 caracteres.' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!verificarSenha(senha_atual, usuario.senha_hash, usuario.senha_salt)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }

  const { hash, salt } = gerarHashSenha(senha_nova);
  db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?').run(hash, salt, req.usuario.id);
  res.status(204).end();
});

module.exports = router;
