const express = require('express');
const { db, transaction } = require('../db');
const wrap = require('./wrap');

const router = express.Router();

const NOMES_VALIDOS = ['Thais', 'Caio', 'Anderson', 'Patricia', 'Dayele'];

function somarMeses(dataISO, meses) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const totalMeses = mes - 1 + Number(meses);
  const anoFinal = ano + Math.floor(totalMeses / 12);
  const mesFinal = (((totalMeses % 12) + 12) % 12) + 1;
  const ultimoDiaMesFinal = new Date(anoFinal, mesFinal, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDiaMesFinal);
  const pad = (n) => String(n).padStart(2, '0');
  return `${anoFinal}-${pad(mesFinal)}-${pad(diaFinal)}`;
}

async function buscarRegistro(id) {
  return db
    .prepare(
      `SELECT e.*, p.codigo AS produto_codigo, p.descricao AS produto_descricao, p.marca AS produto_marca,
              u.usuario AS usuario_login, u.nome_exibicao AS usuario_nome
       FROM etiquetas_impressao e
       JOIN produtos p ON p.id = e.produto_id
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE e.id = ?`
    )
    .get(id);
}

router.get('/', wrap(async (req, res) => {
  const { limit } = req.query;
  const rows = await db
    .prepare(
      `SELECT e.*, p.codigo AS produto_codigo, p.descricao AS produto_descricao, p.marca AS produto_marca,
              u.usuario AS usuario_login, u.nome_exibicao AS usuario_nome
       FROM etiquetas_impressao e
       JOIN produtos p ON p.id = e.produto_id
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       ORDER BY e.criado_em DESC, e.id DESC
       LIMIT ?`
    )
    .all(Math.min(Number(limit) || 200, 1000));
  res.json(rows);
}));

router.post('/calcular-validade', wrap(async (req, res) => {
  const { produto_id, data_fabricacao } = req.body;
  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  if (!data_fabricacao) return res.status(400).json({ error: 'Data de fabricação é obrigatória.' });
  if (!produto.validade_meses) {
    return res.json({ data_validade: null, validade_meses: null });
  }
  res.json({ data_validade: somarMeses(data_fabricacao, produto.validade_meses), validade_meses: produto.validade_meses });
}));

router.get('/nomes', (req, res) => {
  res.json(NOMES_VALIDOS);
});

router.post('/imprimir', wrap(async (req, res) => {
  const { produto_id, quantidade, data_fabricacao, impresso_por, lancar_estoque, client_op_id, impresso_direto } = req.body;
  const lancarEstoque = lancar_estoque !== false;

  if (!produto_id) return res.status(400).json({ error: 'Selecione um produto.' });
  const qtd = Number(quantidade);
  if (!quantidade || qtd <= 0 || !Number.isInteger(qtd)) {
    return res.status(400).json({ error: 'Quantidade deve ser um número inteiro maior que zero.' });
  }
  if (!data_fabricacao) return res.status(400).json({ error: 'Data de fabricação é obrigatória.' });
  if (!NOMES_VALIDOS.includes(impresso_por)) {
    return res.status(400).json({ error: 'Selecione quem está imprimindo as etiquetas.' });
  }
  if (!client_op_id) return res.status(400).json({ error: 'Requisição inválida (faltou identificador da operação).' });

  // Idempotência: se essa mesma operação já foi processada (ex.: clique duplo, reenvio de rede),
  // devolve o registro já criado em vez de lançar tudo de novo no estoque.
  const existente = await db.prepare('SELECT id FROM etiquetas_impressao WHERE client_op_id = ?').get(client_op_id);
  if (existente) {
    return res.status(200).json({ ...(await buscarRegistro(existente.id)), duplicado: true });
  }

  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  if (!produto.validade_meses) {
    return res.status(400).json({
      error: `"${produto.descricao}" não tem prazo de validade configurado. Defina em Cadastros → Produtos antes de imprimir as etiquetas.`,
    });
  }

  const dataValidade = somarMeses(data_fabricacao, produto.validade_meses);

  // A impressão em si acontece antes desta chamada, num agente local rodando no
  // computador ligado à impressora Zebra (este servidor roda na nuvem e não tem
  // acesso a ela). O front-end informa aqui se o envio pra impressora deu certo,
  // só pra guardarmos isso no histórico.
  const impressoDireto = Boolean(impresso_direto);

  const criadoId = await transaction(async () => {
    let movimentacaoId = null;

    if (lancarEstoque) {
      const movInfo = await db
        .prepare('INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, local, origem) VALUES (?, ?, ?, ?, ?, ?)')
        .run(produto_id, 'ENTRADA', qtd, data_fabricacao, 'NOSSO', 'ETIQUETA');
      movimentacaoId = movInfo.lastInsertRowid;
    }

    const etiquetaInfo = await db
      .prepare(
        `INSERT INTO etiquetas_impressao
          (produto_id, quantidade, data_fabricacao, data_validade, movimentacao_id, usuario_id, impresso_por, client_op_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(produto_id, qtd, data_fabricacao, dataValidade, movimentacaoId, req.usuario.id, impresso_por, client_op_id);

    return etiquetaInfo.lastInsertRowid;
  });

  res.status(201).json({ ...(await buscarRegistro(criadoId)), impresso_direto: impressoDireto, lancado_estoque: lancarEstoque });
}));

module.exports = router;
