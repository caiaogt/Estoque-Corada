const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { ativo, marca, q } = req.query;
  const mesAtual = new Date().toISOString().slice(0, 7);

  let sql = `
    SELECT
      p.id, p.codigo, p.descricao, p.marca, p.linha, p.preco_b2b, p.ativo,
      COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade ELSE 0 END), 0) AS total_entradas,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade ELSE 0 END), 0) AS total_saidas,
      COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' AND SUBSTR(m.data, 1, 7) = ? THEN m.quantidade ELSE 0 END), 0) AS entradas_mes,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND SUBSTR(m.data, 1, 7) = ? THEN m.quantidade ELSE 0 END), 0) AS saidas_mes,
      COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' AND m.local = 'NOSSO' THEN m.quantidade ELSE 0 END), 0) AS entradas_nosso,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.local = 'NOSSO' THEN m.quantidade ELSE 0 END), 0) AS saidas_nosso,
      COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' AND m.local = 'BASE01' THEN m.quantidade ELSE 0 END), 0) AS entradas_base01,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.local = 'BASE01' THEN m.quantidade ELSE 0 END), 0) AS saidas_base01
    FROM produtos p
    LEFT JOIN movimentacoes m ON m.produto_id = p.id
    WHERE 1=1
  `;
  const params = [mesAtual, mesAtual];

  if (ativo === '0' || ativo === '1') {
    sql += ' AND p.ativo = ?';
    params.push(Number(ativo));
  }
  if (marca === 'CORADA' || marca === 'MEALI') {
    sql += ' AND p.marca = ?';
    params.push(marca);
  }
  if (q) {
    sql += ' AND (p.codigo LIKE ? OR p.descricao LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += ' GROUP BY p.id ORDER BY p.descricao';

  const rows = db.prepare(sql).all(...params);
  const estoque = rows.map((r) => {
    const saldo = r.total_entradas - r.total_saidas;
    const saldo_nosso = r.entradas_nosso - r.saidas_nosso;
    const saldo_base01 = r.entradas_base01 - r.saidas_base01;
    return {
      ...r,
      saldo,
      saldo_nosso,
      saldo_base01,
      valor_total: r.preco_b2b != null ? Number((saldo * r.preco_b2b).toFixed(2)) : null,
    };
  });

  res.json(estoque);
});

module.exports = router;
