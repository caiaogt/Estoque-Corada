const express = require('express');
const { db, transaction } = require('../db');

const router = express.Router();

const LOCAIS_VALIDOS = ['NOSSO', 'BASE01'];

function validarLancamento({ tipo, quantidade, data, freezer, cliente, local }) {
  if (tipo !== 'ENTRADA' && tipo !== 'SAIDA') return 'Tipo deve ser ENTRADA ou SAIDA.';
  if (!quantidade || Number(quantidade) <= 0) return 'Quantidade deve ser maior que zero.';
  if (!data) return 'Data é obrigatória.';
  if (tipo === 'ENTRADA' && !freezer) return 'Freezer é obrigatório para entrada.';
  if (tipo === 'SAIDA' && !cliente) return 'Cliente/destino é obrigatório para saída.';
  if (local && !LOCAIS_VALIDOS.includes(local)) return 'Local inválido.';
  return null;
}

router.get('/', (req, res) => {
  const { produto_id, tipo, data_de, data_ate, local, limit } = req.query;
  let sql = `
    SELECT m.*, p.codigo AS produto_codigo, p.descricao AS produto_descricao, p.marca AS produto_marca
    FROM movimentacoes m
    JOIN produtos p ON p.id = m.produto_id
    WHERE 1=1
  `;
  const params = [];

  if (produto_id) {
    sql += ' AND m.produto_id = ?';
    params.push(produto_id);
  }
  if (tipo === 'ENTRADA' || tipo === 'SAIDA') {
    sql += ' AND m.tipo = ?';
    params.push(tipo);
  }
  if (LOCAIS_VALIDOS.includes(local)) {
    sql += ' AND m.local = ?';
    params.push(local);
  }
  if (data_de) {
    sql += ' AND m.data >= ?';
    params.push(data_de);
  }
  if (data_ate) {
    sql += ' AND m.data <= ?';
    params.push(data_ate);
  }

  sql += ' ORDER BY m.data DESC, m.id DESC';
  sql += ' LIMIT ?';
  params.push(Math.min(Number(limit) || 200, 1000));

  const movimentacoes = db.prepare(sql).all(...params);
  res.json(movimentacoes);
});

router.post('/', (req, res) => {
  const { produto_id, tipo, quantidade, data, freezer, cliente, local } = req.body;

  const erro = validarLancamento({ tipo, quantidade, data, freezer, cliente, local });
  if (erro) return res.status(400).json({ error: erro });

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

  const info = db
    .prepare(
      'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, freezer, cliente, local, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(produto_id, tipo, Number(quantidade), data, freezer || null, cliente || null, local || 'NOSSO', 'MANUAL');

  const movimentacao = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(movimentacao);
});

router.post('/lote', (req, res) => {
  const { tipo, data, freezer, cliente, local, itens } = req.body;

  if (tipo !== 'ENTRADA' && tipo !== 'SAIDA') {
    return res.status(400).json({ error: 'Tipo deve ser ENTRADA ou SAIDA.' });
  }
  if (!data) return res.status(400).json({ error: 'Data é obrigatória.' });
  if (tipo === 'ENTRADA' && !freezer) return res.status(400).json({ error: 'Freezer é obrigatório para entrada.' });
  if (tipo === 'SAIDA' && !cliente) return res.status(400).json({ error: 'Cliente/destino é obrigatório para saída.' });
  if (local && !LOCAIS_VALIDOS.includes(local)) return res.status(400).json({ error: 'Local inválido.' });
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos um produto.' });
  }

  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || Number(item.quantidade) <= 0) {
      return res.status(400).json({ error: 'Todos os itens selecionados precisam de quantidade maior que zero.' });
    }
  }

  const insertStmt = db.prepare(
    'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, freezer, cliente, local, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  try {
    const criados = transaction(() => {
      const resultado = [];
      for (const item of itens) {
        const produto = db.prepare('SELECT id FROM produtos WHERE id = ?').get(item.produto_id);
        if (!produto) throw new Error(`Produto ${item.produto_id} não encontrado.`);
        const info = insertStmt.run(
          item.produto_id,
          tipo,
          Number(item.quantidade),
          data,
          freezer || null,
          cliente || null,
          local || 'NOSSO',
          'LOTE'
        );
        resultado.push(info.lastInsertRowid);
      }
      return resultado;
    });

    res.status(201).json({ criados: criados.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const mov = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(req.params.id);
  if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada.' });

  transaction(() => {
    // Se essa movimentação veio de uma impressão de etiqueta, desvincula em vez de apagar o
    // histórico da impressão — só o efeito no estoque é desfeito.
    db.prepare('UPDATE etiquetas_impressao SET movimentacao_id = NULL WHERE movimentacao_id = ?').run(req.params.id);
    db.prepare('DELETE FROM movimentacoes WHERE id = ?').run(req.params.id);
  });

  res.status(204).end();
});

module.exports = router;
