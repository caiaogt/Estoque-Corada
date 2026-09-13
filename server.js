const express = require('express');
const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // .env é opcional; sem ele, a integração com o Bling fica desabilitada.
}

require('./db');
const { router: authRouter, exigirAutenticacao } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);

app.use('/api/produtos', exigirAutenticacao, require('./routes/produtos'));
app.use('/api/movimentacoes', exigirAutenticacao, require('./routes/movimentacoes'));
app.use('/api/kits', exigirAutenticacao, require('./routes/kits'));
app.use('/api/estoque', exigirAutenticacao, require('./routes/estoque'));
app.use('/api/ajustes', exigirAutenticacao, require('./routes/ajustes'));
app.use('/api/vendas', exigirAutenticacao, require('./routes/vendas'));
app.use('/api/etiquetas', exigirAutenticacao, require('./routes/etiquetas'));
app.use('/api/bling', exigirAutenticacao, require('./routes/bling'));
app.use('/api/perfil', exigirAutenticacao, require('./routes/perfil'));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
