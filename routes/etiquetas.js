const express = require('express');
const { db, transaction } = require('../db');
const { existeTemplate, imprimirEtiquetaZebra } = require('../services/zplEtiqueta');

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

function buscarRegistro(id) {
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

router.get('/', (req, res) => {
  const { limit } = req.query;
  const rows = db
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
});

router.post('/calcular-validade', (req, res) => {
  const { produto_id, data_fabricacao } = req.body;
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  if (!data_fabricacao) return res.status(400).json({ error: 'Data de fabricação é obrigatória.' });
  if (!produto.validade_meses) {
    return res.json({ data_validade: null, validade_meses: null });
  }
  res.json({ data_validade: somarMeses(data_fabricacao, produto.validade_meses), validade_meses: produto.validade_meses });
});

router.get('/nomes', (req, res) => {
  res.json(NOMES_VALIDOS);
});

router.post('/imprimir', async (req, res) => {
  const { produto_id, quantidade, data_fabricacao, impresso_por, lancar_estoque, client_op_id } = req.body;
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
  const existente = db.prepare('SELECT id FROM etiquetas_impressao WHERE client_op_id = ?').get(client_op_id);
  if (existente) {
    return res.status(200).json({ ...buscarRegistro(existente.id), duplicado: true });
  }

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  if (!produto.validade_meses) {
    return res.status(400).json({
      error: `"${produto.descricao}" não tem prazo de validade configurado. Defina em Cadastros → Produtos antes de imprimir as etiquetas.`,
    });
  }

  const dataValidade = somarMeses(data_fabricacao, produto.validade_meses);

  // Se existe o modelo ZPL real desse produto, manda pra impressora Zebra ANTES de mexer no
  // estoque: se a impressão falhar, nada fica registrado (evita "fantasma" de estoque sem etiqueta).
  let impressoDireto = false;
  if (existeTemplate(produto.codigo)) {
    try {
      await imprimirEtiquetaZebra(produto.codigo, qtd, { dataFabricacao: data_fabricacao, dataValidade });
      impressoDireto = true;
    } catch (err) {
      return res.status(502).json({
        error: `Não consegui enviar a etiqueta para a impressora Zebra (${err.message}). Nada foi registrado no estoque — tente novamente.`,
      });
    }
  }

  const criadoId = transaction(() => {
    let movimentacaoId = null;

    if (lancarEstoque) {
      const movInfo = db
        .prepare('INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, local, origem) VALUES (?, ?, ?, ?, ?, ?)')
        .run(produto_id, 'ENTRADA', qtd, data_fabricacao, 'NOSSO', 'ETIQUETA');
      movimentacaoId = movInfo.lastInsertRowid;
    }

    const etiquetaInfo = db
      .prepare(
        `INSERT INTO etiquetas_impressao
          (produto_id, quantidade, data_fabricacao, data_validade, movimentacao_id, usuario_id, impresso_por, client_op_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(produto_id, qtd, data_fabricacao, dataValidade, movimentacaoId, req.usuario.id, impresso_por, client_op_id);

    return etiquetaInfo.lastInsertRowid;
  });

  res.status(201).json({ ...buscarRegistro(criadoId), impresso_direto: impressoDireto, lancado_estoque: lancarEstoque });
});

module.exports = router;
