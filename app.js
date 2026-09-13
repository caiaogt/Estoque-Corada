const express = require('express');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // .env é opcional; sem ele, a integração com o Bling fica desabilitada.
}

require('./db');
const wrap = require('./routes/wrap');
const { router: authRouter, exigirAutenticacao } = require('./routes/auth');

const app = express();

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);

const autenticado = wrap(exigirAutenticacao);
app.use('/api/produtos', autenticado, require('./routes/produtos'));
app.use('/api/movimentacoes', autenticado, require('./routes/movimentacoes'));
app.use('/api/kits', autenticado, require('./routes/kits'));
app.use('/api/estoque', autenticado, require('./routes/estoque'));
app.use('/api/ajustes', autenticado, require('./routes/ajustes'));
app.use('/api/vendas', autenticado, require('./routes/vendas'));
app.use('/api/etiquetas', autenticado, require('./routes/etiquetas'));
app.use('/api/bling', autenticado, require('./routes/bling'));
app.use('/api/perfil', autenticado, require('./routes/perfil'));

// Rede de segurança: um erro (ex.: falha de conexão com o banco) agora sempre vira uma
// resposta 500 pra quem fez aquela requisição, em vez de derrubar o servidor inteiro.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
