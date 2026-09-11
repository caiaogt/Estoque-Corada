const express = require('express');
const { db, transaction } = require('../db');

const router = express.Router();

function calcularSaldo(produtoId) {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN quantidade ELSE 0 END), 0) AS saidas
       FROM movimentacoes WHERE produto_id = ?`
    )
    .get(produtoId);
  return row.entradas - row.saidas;
}

router.get('/', (req, res) => {
  const { produto_id, limit } = req.query;
  let sql = `
    SELECT a.*, p.codigo AS produto_codigo, p.descricao AS produto_descricao
    FROM ajustes_estoque a
    JOIN produtos p ON p.id = a.produto_id
    WHERE 1=1
  `;
  const params = [];
  if (produto_id) {
    sql += ' AND a.produto_id = ?';
    params.push(produto_id);
  }
  sql += ' ORDER BY a.criado_em DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 200, 1000));

  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { produto_id, saldo_contado, data, observacao } = req.body;

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  if (saldo_contado == null || Number(saldo_contado) < 0) {
    return res.status(400).json({ error: 'Saldo contado deve ser um número maior ou igual a zero.' });
  }
  if (!data) return res.status(400).json({ error: 'Data é obrigatória.' });

  const saldoCalculado = calcularSaldo(produto_id);
  const contado = Number(saldo_contado);
  const diferenca = contado - saldoCalculado;

  const resultado = transaction(() => {
    if (diferenca !== 0) {
      db.prepare(
        'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, origem) VALUES (?, ?, ?, ?, ?)'
      ).run(produto_id, diferenca > 0 ? 'ENTRADA' : 'SAIDA', Math.abs(diferenca), data, 'AJUSTE');
    }

    const info = db
      .prepare(
        'INSERT INTO ajustes_estoque (produto_id, saldo_contado, saldo_calculado, diferenca, data, observacao) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(produto_id, contado, saldoCalculado, diferenca, data, observacao || null);

    return db.prepare('SELECT * FROM ajustes_estoque WHERE id = ?').get(info.lastInsertRowid);
  });

  res.status(201).json(resultado);
});

module.exports = router;
