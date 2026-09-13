const express = require('express');
const { db, transaction } = require('../db');
const wrap = require('./wrap');

const router = express.Router();

async function carregarKit(id) {
  const kit = await db.prepare('SELECT * FROM kits WHERE id = ?').get(id);
  if (!kit) return null;
  const itens = await db
    .prepare(
      `SELECT ki.id, ki.produto_id, ki.quantidade, p.codigo AS produto_codigo, p.descricao AS produto_descricao, p.marca AS produto_marca
       FROM kit_itens ki
       JOIN produtos p ON p.id = ki.produto_id
       WHERE ki.kit_id = ?`
    )
    .all(id);
  return { ...kit, itens };
}

router.get('/', wrap(async (req, res) => {
  const { ativo } = req.query;
  let sql = 'SELECT * FROM kits WHERE 1=1';
  const params = [];
  if (ativo === '0' || ativo === '1') {
    sql += ' AND ativo = ?';
    params.push(Number(ativo));
  }
  sql += ' ORDER BY nome';
  const kits = await db.prepare(sql).all(...params);
  res.json(await Promise.all(kits.map((k) => carregarKit(k.id))));
}));

router.get('/:id', wrap(async (req, res) => {
  const kit = await carregarKit(req.params.id);
  if (!kit) return res.status(404).json({ error: 'Kit não encontrado.' });
  res.json(kit);
}));

router.post('/', wrap(async (req, res) => {
  const { codigo, nome, itens } = req.body;

  if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios.' });
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'O kit precisa de ao menos um produto.' });
  }
  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || Number(item.quantidade) <= 0) {
      return res.status(400).json({ error: 'Cada item do kit precisa de produto e quantidade maior que zero.' });
    }
  }

  const existente = await db.prepare('SELECT id FROM kits WHERE codigo = ?').get(codigo.trim());
  if (existente) return res.status(409).json({ error: 'Já existe um kit com esse código.' });

  const kitId = await transaction(async () => {
    const info = await db.prepare('INSERT INTO kits (codigo, nome) VALUES (?, ?)').run(codigo.trim(), nome.trim());
    const insertItem = db.prepare('INSERT INTO kit_itens (kit_id, produto_id, quantidade) VALUES (?, ?, ?)');
    for (const item of itens) {
      await insertItem.run(info.lastInsertRowid, item.produto_id, Number(item.quantidade));
    }
    return info.lastInsertRowid;
  });

  res.status(201).json(await carregarKit(kitId));
}));

router.put('/:id', wrap(async (req, res) => {
  const { codigo, nome, itens } = req.body;
  const kit = await db.prepare('SELECT * FROM kits WHERE id = ?').get(req.params.id);
  if (!kit) return res.status(404).json({ error: 'Kit não encontrado.' });

  if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios.' });
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'O kit precisa de ao menos um produto.' });
  }

  const conflito = await db.prepare('SELECT id FROM kits WHERE codigo = ? AND id != ?').get(codigo.trim(), req.params.id);
  if (conflito) return res.status(409).json({ error: 'Já existe outro kit com esse código.' });

  await transaction(async () => {
    await db.prepare('UPDATE kits SET codigo = ?, nome = ? WHERE id = ?').run(codigo.trim(), nome.trim(), req.params.id);
    await db.prepare('DELETE FROM kit_itens WHERE kit_id = ?').run(req.params.id);
    const insertItem = db.prepare('INSERT INTO kit_itens (kit_id, produto_id, quantidade) VALUES (?, ?, ?)');
    for (const item of itens) {
      await insertItem.run(req.params.id, item.produto_id, Number(item.quantidade));
    }
  });

  res.json(await carregarKit(req.params.id));
}));

router.patch('/:id/status', wrap(async (req, res) => {
  const { ativo } = req.body;
  const kit = await db.prepare('SELECT * FROM kits WHERE id = ?').get(req.params.id);
  if (!kit) return res.status(404).json({ error: 'Kit não encontrado.' });

  await db.prepare('UPDATE kits SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, req.params.id);
  res.json(await carregarKit(req.params.id));
}));

router.delete('/:id', wrap(async (req, res) => {
  const kit = await db.prepare('SELECT * FROM kits WHERE id = ?').get(req.params.id);
  if (!kit) return res.status(404).json({ error: 'Kit não encontrado.' });

  const temMovimentacoes =
    (await db.prepare('SELECT COUNT(*)::int AS n FROM movimentacoes WHERE kit_id = ?').get(req.params.id)).n > 0;

  if (temMovimentacoes) {
    await db.prepare('UPDATE kits SET ativo = 0 WHERE id = ?').run(req.params.id);
    return res.json({
      arquivado: true,
      mensagem: 'Este kit já tem saídas registradas, então não pode ser excluído sem apagar esse histórico. Ele foi arquivado em vez disso.',
    });
  }

  await transaction(async () => {
    await db.prepare('DELETE FROM kit_itens WHERE kit_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM kits WHERE id = ?').run(req.params.id);
  });

  res.status(204).end();
}));

router.post('/:id/saida', wrap(async (req, res) => {
  const { quantidade, data, cliente, local } = req.body;
  const kit = await carregarKit(req.params.id);
  if (!kit) return res.status(404).json({ error: 'Kit não encontrado.' });

  if (!quantidade || Number(quantidade) <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
  if (!data) return res.status(400).json({ error: 'Data é obrigatória.' });
  if (!cliente) return res.status(400).json({ error: 'Cliente/destino é obrigatório.' });
  if (local && local !== 'NOSSO' && local !== 'BASE01') return res.status(400).json({ error: 'Local inválido.' });

  const insertStmt = db.prepare(
    'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, cliente, local, origem, kit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  await transaction(async () => {
    for (const item of kit.itens) {
      await insertStmt.run(item.produto_id, 'SAIDA', item.quantidade * Number(quantidade), data, cliente, local || 'NOSSO', 'KIT', kit.id);
    }
  });

  res.status(201).json({ ok: true });
}));

module.exports = router;
