const express = require('express');
const { db, transaction } = require('../db');
const wrap = require('./wrap');

const router = express.Router();

async function carregarVenda(id) {
  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').get(id);
  if (!venda) return null;
  const itens = await db
    .prepare(
      `SELECT vi.*, p.codigo AS produto_codigo, p.descricao AS produto_descricao
       FROM venda_itens vi
       JOIN produtos p ON p.id = vi.produto_id
       WHERE vi.venda_id = ?`
    )
    .all(id);
  return { ...venda, itens };
}

router.get('/', wrap(async (req, res) => {
  const { data_de, data_ate, tipo_cliente, local } = req.query;
  let sql = 'SELECT * FROM vendas WHERE 1=1';
  const params = [];

  if (data_de) {
    sql += ' AND data >= ?';
    params.push(data_de);
  }
  if (data_ate) {
    sql += ' AND data <= ?';
    params.push(data_ate);
  }
  if (tipo_cliente === 'B2B' || tipo_cliente === 'CPF') {
    sql += ' AND tipo_cliente = ?';
    params.push(tipo_cliente);
  }
  if (local === 'NOSSO' || local === 'BASE01') {
    sql += ' AND local = ?';
    params.push(local);
  }

  sql += ' ORDER BY data DESC, id DESC';

  const vendas = await db.prepare(sql).all(...params);
  const vendasComItens = await Promise.all(vendas.map((v) => carregarVenda(v.id)));
  res.json(vendasComItens);
}));

router.get('/:id', wrap(async (req, res) => {
  const venda = await carregarVenda(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });
  res.json(venda);
}));

router.post('/', wrap(async (req, res) => {
  const { data, tipo_cliente, cliente_nome, nota_fiscal, forma_pagamento, local, observacoes, desconto, itens } = req.body;

  if (!data) return res.status(400).json({ error: 'Data é obrigatória.' });
  if (tipo_cliente !== 'B2B' && tipo_cliente !== 'CPF') {
    return res.status(400).json({ error: 'Tipo de cliente deve ser B2B ou CPF.' });
  }
  if (!cliente_nome) return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
  if (local && local !== 'NOSSO' && local !== 'BASE01') {
    return res.status(400).json({ error: 'Local inválido.' });
  }
  if (desconto != null && Number(desconto) < 0) {
    return res.status(400).json({ error: 'Desconto não pode ser negativo.' });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'A venda precisa de ao menos um item.' });
  }
  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || Number(item.quantidade) <= 0) {
      return res.status(400).json({ error: 'Todos os itens precisam de produto e quantidade maior que zero.' });
    }
    if (item.valor_unitario == null || Number(item.valor_unitario) < 0) {
      return res.status(400).json({ error: 'Todos os itens precisam de um valor unitário válido.' });
    }
  }

  try {
    const vendaId = await transaction(async () => {
      let subtotalVenda = 0;
      const itensResolvidos = [];

      for (const item of itens) {
        const produto = await db.prepare('SELECT id FROM produtos WHERE id = ?').get(item.produto_id);
        if (!produto) throw new Error(`Produto ${item.produto_id} não encontrado.`);

        const quantidade = Number(item.quantidade);
        const valorUnitario = Number(item.valor_unitario);
        const subtotal = Number((quantidade * valorUnitario).toFixed(2));
        subtotalVenda += subtotal;
        itensResolvidos.push({ produto_id: item.produto_id, quantidade, valorUnitario, subtotal });
      }

      const descontoValor = Math.min(Number(desconto) || 0, subtotalVenda);
      const valorTotal = Number((subtotalVenda - descontoValor).toFixed(2));

      const infoVenda = await db
        .prepare(
          `INSERT INTO vendas (data, tipo_cliente, cliente_nome, nota_fiscal, forma_pagamento, local, valor_total, desconto, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          data,
          tipo_cliente,
          cliente_nome.trim(),
          nota_fiscal ? nota_fiscal.trim() : null,
          forma_pagamento || null,
          local || 'NOSSO',
          valorTotal,
          Number(descontoValor.toFixed(2)),
          observacoes ? observacoes.trim() : null
        );

      const novaVendaId = infoVenda.lastInsertRowid;

      const insertItem = db.prepare(
        'INSERT INTO venda_itens (venda_id, produto_id, quantidade, valor_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
      );
      const insertMovimentacao = db.prepare(
        'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, cliente, local, origem, venda_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );

      for (const item of itensResolvidos) {
        await insertItem.run(novaVendaId, item.produto_id, item.quantidade, item.valorUnitario, item.subtotal);
        await insertMovimentacao.run(
          item.produto_id,
          'SAIDA',
          item.quantidade,
          data,
          cliente_nome.trim(),
          local || 'NOSSO',
          'VENDA',
          novaVendaId
        );
      }

      return novaVendaId;
    });

    res.status(201).json(await carregarVenda(vendaId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const { data, tipo_cliente, cliente_nome, nota_fiscal, forma_pagamento, local, observacoes, desconto, itens } = req.body;
  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });

  if (!data) return res.status(400).json({ error: 'Data é obrigatória.' });
  if (tipo_cliente !== 'B2B' && tipo_cliente !== 'CPF') {
    return res.status(400).json({ error: 'Tipo de cliente deve ser B2B ou CPF.' });
  }
  if (!cliente_nome) return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
  if (local && local !== 'NOSSO' && local !== 'BASE01') {
    return res.status(400).json({ error: 'Local inválido.' });
  }
  if (desconto != null && Number(desconto) < 0) {
    return res.status(400).json({ error: 'Desconto não pode ser negativo.' });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'A venda precisa de ao menos um item.' });
  }
  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || Number(item.quantidade) <= 0) {
      return res.status(400).json({ error: 'Todos os itens precisam de produto e quantidade maior que zero.' });
    }
    if (item.valor_unitario == null || Number(item.valor_unitario) < 0) {
      return res.status(400).json({ error: 'Todos os itens precisam de um valor unitário válido.' });
    }
  }

  try {
    await transaction(async () => {
      await db.prepare('DELETE FROM movimentacoes WHERE venda_id = ?').run(req.params.id);
      await db.prepare('DELETE FROM venda_itens WHERE venda_id = ?').run(req.params.id);

      let subtotalVenda = 0;
      const insertItem = db.prepare(
        'INSERT INTO venda_itens (venda_id, produto_id, quantidade, valor_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
      );
      const insertMovimentacao = db.prepare(
        'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, cliente, local, origem, venda_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );

      for (const item of itens) {
        const produto = await db.prepare('SELECT id FROM produtos WHERE id = ?').get(item.produto_id);
        if (!produto) throw new Error(`Produto ${item.produto_id} não encontrado.`);

        const quantidade = Number(item.quantidade);
        const valorUnitario = Number(item.valor_unitario);
        const subtotal = Number((quantidade * valorUnitario).toFixed(2));
        subtotalVenda += subtotal;

        await insertItem.run(req.params.id, item.produto_id, quantidade, valorUnitario, subtotal);
        await insertMovimentacao.run(
          item.produto_id,
          'SAIDA',
          quantidade,
          data,
          cliente_nome.trim(),
          local || 'NOSSO',
          'VENDA',
          req.params.id
        );
      }

      const descontoValor = Math.min(Number(desconto) || 0, subtotalVenda);
      const valorTotal = Number((subtotalVenda - descontoValor).toFixed(2));

      await db
        .prepare(
          `UPDATE vendas SET data = ?, tipo_cliente = ?, cliente_nome = ?, nota_fiscal = ?, forma_pagamento = ?, local = ?, valor_total = ?, desconto = ?, observacoes = ?
           WHERE id = ?`
        )
        .run(
          data,
          tipo_cliente,
          cliente_nome.trim(),
          nota_fiscal ? nota_fiscal.trim() : null,
          forma_pagamento || null,
          local || 'NOSSO',
          valorTotal,
          Number(descontoValor.toFixed(2)),
          observacoes ? observacoes.trim() : null,
          req.params.id
        );
    });

    res.json(await carregarVenda(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

const STATUS_VALIDOS = ['NOVO', 'ENTREGUE', 'CANCELADO'];

router.patch('/:id/status', wrap(async (req, res) => {
  const { status } = req.body;
  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  await db.prepare('UPDATE vendas SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(await carregarVenda(req.params.id));
}));

router.delete('/:id', wrap(async (req, res) => {
  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });

  await transaction(async () => {
    await db.prepare('DELETE FROM movimentacoes WHERE venda_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM venda_itens WHERE venda_id = ?').run(req.params.id);
    await db.prepare('DELETE FROM vendas WHERE id = ?').run(req.params.id);
  });

  res.json({ ok: true });
}));

module.exports = router;
