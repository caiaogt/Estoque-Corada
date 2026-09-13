const express = require('express');
const { existeTemplate, imprimirEtiquetaZebra } = require('../services/zplEtiqueta');

const PORT = process.env.PRINT_BRIDGE_PORT || 4001;

const app = express();
app.use(express.json());

// O site fica no Netlify (https://...) e este agente roda só na rede local, em
// http://localhost. O navegador exige CORS liberado e, por ser HTTPS chamando um
// endereço "privado" (localhost), também manda um preflight de Private Network
// Access — sem esses dois cabeçalhos o navegador bloqueia a chamada silenciosamente.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/status', (req, res) => {
  res.json({ ok: true });
});

app.post('/imprimir', async (req, res) => {
  const { produto_codigo, quantidade, data_fabricacao, data_validade } = req.body;

  if (!produto_codigo) return res.status(400).json({ error: 'produto_codigo é obrigatório.' });
  const qtd = Number(quantidade);
  if (!quantidade || qtd <= 0 || !Number.isInteger(qtd)) {
    return res.status(400).json({ error: 'Quantidade deve ser um número inteiro maior que zero.' });
  }
  if (!data_fabricacao || !data_validade) {
    return res.status(400).json({ error: 'data_fabricacao e data_validade são obrigatórias.' });
  }

  if (!existeTemplate(produto_codigo)) {
    return res.status(404).json({ impresso: false, motivo: 'sem-template' });
  }

  try {
    await imprimirEtiquetaZebra(produto_codigo, qtd, { dataFabricacao: data_fabricacao, dataValidade: data_validade });
    res.json({ impresso: true });
  } catch (err) {
    res.status(502).json({ impresso: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Agente de impressão rodando em http://localhost:${PORT}`);
});
