const express = require('express');
const { db, transaction } = require('../db');
const wrap = require('./wrap');

const router = express.Router();

const LINHAS_VALIDAS = ['ESSENCIAL', 'SABOR_TRADICAO', 'SELECAO_ESPECIAL', 'PREMIUM'];

router.get('/', wrap(async (req, res) => {
  const { q, ativo, marca, linha } = req.query;
  let sql = 'SELECT * FROM produtos WHERE 1=1';
  const params = [];

  if (ativo === '0' || ativo === '1') {
    sql += ' AND ativo = ?';
    params.push(Number(ativo));
  }

  if (marca === 'CORADA' || marca === 'MEALI') {
    sql += ' AND marca = ?';
    params.push(marca);
  }

  if (LINHAS_VALIDAS.includes(linha)) {
    sql += ' AND linha = ?';
    params.push(linha);
  }

  if (q) {
    sql += ' AND (codigo LIKE ? OR descricao LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY descricao';
  const produtos = await db.prepare(sql).all(...params);
  res.json(produtos);
}));

router.get('/:id', wrap(async (req, res) => {
  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json(produto);
}));

router.post('/', wrap(async (req, res) => {
  const { codigo, descricao, marca, linha, preco_b2b, preco_cpf, validade_meses } = req.body;
  if (!codigo || !descricao || !marca) {
    return res.status(400).json({ error: 'Código, descrição e marca são obrigatórios.' });
  }
  if (marca !== 'CORADA' && marca !== 'MEALI') {
    return res.status(400).json({ error: 'Marca deve ser CORADA ou MEALI.' });
  }
  if (linha && !LINHAS_VALIDAS.includes(linha)) {
    return res.status(400).json({ error: 'Linha inválida.' });
  }
  if (validade_meses != null && validade_meses !== '' && Number(validade_meses) <= 0) {
    return res.status(400).json({ error: 'Prazo de validade deve ser maior que zero.' });
  }

  const existente = await db.prepare('SELECT id FROM produtos WHERE codigo = ?').get(codigo.trim());
  if (existente) return res.status(409).json({ error: 'Já existe um produto com esse código.' });

  const info = await db
    .prepare(
      'INSERT INTO produtos (codigo, descricao, marca, linha, preco_b2b, preco_cpf, validade_meses) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      codigo.trim(),
      descricao.trim(),
      marca,
      linha || null,
      preco_b2b != null && preco_b2b !== '' ? Number(preco_b2b) : null,
      preco_cpf != null && preco_cpf !== '' ? Number(preco_cpf) : null,
      validade_meses != null && validade_meses !== '' ? Number(validade_meses) : null
    );

  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(produto);
}));

router.put('/:id', wrap(async (req, res) => {
  const { codigo, descricao, marca, linha, preco_b2b, preco_cpf, validade_meses } = req.body;
  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

  if (!codigo || !descricao || !marca) {
    return res.status(400).json({ error: 'Código, descrição e marca são obrigatórios.' });
  }
  if (marca !== 'CORADA' && marca !== 'MEALI') {
    return res.status(400).json({ error: 'Marca deve ser CORADA ou MEALI.' });
  }
  if (linha && !LINHAS_VALIDAS.includes(linha)) {
    return res.status(400).json({ error: 'Linha inválida.' });
  }
  if (validade_meses != null && validade_meses !== '' && Number(validade_meses) <= 0) {
    return res.status(400).json({ error: 'Prazo de validade deve ser maior que zero.' });
  }

  const conflito = await db
    .prepare('SELECT id FROM produtos WHERE codigo = ? AND id != ?')
    .get(codigo.trim(), req.params.id);
  if (conflito) return res.status(409).json({ error: 'Já existe outro produto com esse código.' });

  await db
    .prepare(
      'UPDATE produtos SET codigo = ?, descricao = ?, marca = ?, linha = ?, preco_b2b = ?, preco_cpf = ?, validade_meses = ? WHERE id = ?'
    )
    .run(
      codigo.trim(),
      descricao.trim(),
      marca,
      linha || null,
      preco_b2b != null && preco_b2b !== '' ? Number(preco_b2b) : null,
      preco_cpf != null && preco_cpf !== '' ? Number(preco_cpf) : null,
      validade_meses != null && validade_meses !== '' ? Number(validade_meses) : null,
      req.params.id
    );

  const atualizado = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  res.json(atualizado);
}));

router.patch('/:id/status', wrap(async (req, res) => {
  const { ativo } = req.body;
  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

  await db.prepare('UPDATE produtos SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, req.params.id);
  const atualizado = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  res.json(atualizado);
}));

router.delete('/:id', wrap(async (req, res) => {
  const produto = await db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

  const temMovimentacoes =
    (await db.prepare('SELECT COUNT(*)::int AS n FROM movimentacoes WHERE produto_id = ?').get(req.params.id)).n > 0;
  const temVendas =
    (await db.prepare('SELECT COUNT(*)::int AS n FROM venda_itens WHERE produto_id = ?').get(req.params.id)).n > 0;

  if (temMovimentacoes || temVendas) {
    await db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(req.params.id);
    return res.json({
      arquivado: true,
      mensagem: 'Este produto já tem movimentações ou vendas registradas, então não pode ser excluído sem apagar esse histórico. Ele foi arquivado em vez disso.',
    });
  }

  await transaction(async () => {
    await db.prepare('DELETE FROM ajustes_estoque WHERE produto_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM kit_itens WHERE produto_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
  });

  res.status(204).end();
}));

module.exports = router;
