const express = require('express');
const crypto = require('crypto');
const { db, transaction } = require('../db');
const wrap = require('./wrap');

const router = express.Router();

const BLING_AUTHORIZE_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize';
const BLING_TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token';
const BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

let estadoOAuthPendente = null;

function credenciaisConfiguradas() {
  return Boolean(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET && process.env.BLING_REDIRECT_URI);
}

function authHeaderBasic() {
  const raw = `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function getConfig() {
  return db.prepare('SELECT * FROM bling_config WHERE id = 1').get();
}

async function salvarTokens(tokenJson) {
  const expiresAt = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO bling_config (id, access_token, refresh_token, expires_at, updated_em)
       VALUES (1, ?, ?, ?, NOW())
       ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, updated_em = NOW()`
    )
    .run(tokenJson.access_token, tokenJson.refresh_token, expiresAt);
}

function extrairMensagemErroBling(json) {
  if (!json) return 'Falha ao obter token do Bling.';
  if (typeof json.error_description === 'string') return json.error_description;
  if (typeof json.error === 'string') return json.error;
  if (json.error && typeof json.error === 'object') {
    return json.error.message || json.error.description || JSON.stringify(json.error);
  }
  return 'Falha ao obter token do Bling.';
}

async function trocarCodePorToken(code) {
  const res = await fetch(BLING_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      Authorization: authHeaderBasic(),
      'enable-jwt': '1',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('Erro ao trocar code por token no Bling:', JSON.stringify(json));
    throw new Error(extrairMensagemErroBling(json));
  }
  return json;
}

async function renovarToken(refreshToken) {
  const res = await fetch(BLING_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      Authorization: authHeaderBasic(),
      'enable-jwt': '1',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('Erro ao renovar token no Bling:', JSON.stringify(json));
    throw new Error(extrairMensagemErroBling(json));
  }
  return json;
}

async function obterAccessTokenValido() {
  const config = await getConfig();
  if (!config || !config.access_token) {
    throw new Error('BLING_NAO_CONECTADO');
  }

  const expiraEm = new Date(config.expires_at).getTime();
  if (Date.now() < expiraEm - 60000) {
    return config.access_token;
  }

  const novoToken = await renovarToken(config.refresh_token);
  await salvarTokens(novoToken);
  return novoToken.access_token;
}

async function blingFetch(caminho) {
  const token = await obterAccessTokenValido();
  const res = await fetch(`${BLING_API_BASE}${caminho}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'enable-jwt': '1',
    },
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || json?.error_description || `Erro ${res.status} ao consultar o Bling.`;
    throw new Error(msg);
  }
  return json;
}

const SITUACAO_NFE = {
  1: 'Pendente',
  2: 'Cancelada',
  3: 'Aguardando recibo',
  4: 'Rejeitada',
  5: 'Autorizada',
  6: 'Emitida DANFE',
  7: 'Registrada',
  8: 'Aguardando protocolo',
  9: 'Denegada',
  10: 'Consulta situação',
  11: 'Bloqueada',
};

router.get('/vendas/:vendaId/nota', wrap(async (req, res) => {
  if (!credenciaisConfiguradas()) {
    return res.status(400).json({ error: 'Credenciais do Bling não configuradas no arquivo .env.' });
  }

  const venda = await db.prepare('SELECT id, bling_pedido_id FROM vendas WHERE id = ?').get(req.params.vendaId);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });
  if (!venda.bling_pedido_id) {
    return res.status(400).json({ error: 'Esta venda não está vinculada a um pedido do Bling.' });
  }

  try {
    const pedidoJson = await blingFetch(`/pedidos/vendas/${venda.bling_pedido_id}`);
    const notaFiscalId = pedidoJson.data?.notaFiscal?.id;
    if (!notaFiscalId) {
      return res.json({ emitida: false });
    }

    let notaJson;
    try {
      notaJson = await blingFetch(`/nfe/${notaFiscalId}`);
    } catch (err) {
      if (err.message === 'Não encontrado.') {
        return res.json({ emitida: false, indisponivel: true });
      }
      throw err;
    }

    const nota = notaJson.data;
    res.json({
      emitida: true,
      numero: nota.numero,
      serie: nota.serie,
      situacao: nota.situacao,
      situacao_label: SITUACAO_NFE[nota.situacao] || 'Desconhecida',
      chave_acesso: nota.chaveAcesso,
      data_emissao: nota.dataEmissao,
      link_danfe: nota.linkDanfe,
      link_pdf: nota.linkPDF,
    });
  } catch (err) {
    if (err.message === 'BLING_NAO_CONECTADO') {
      return res.status(400).json({ error: 'Bling não conectado.' });
    }
    res.status(502).json({ error: `Erro ao buscar nota fiscal no Bling: ${err.message}` });
  }
}));

router.get('/status', wrap(async (req, res) => {
  const config = await getConfig();
  res.json({
    configurado: credenciaisConfiguradas(),
    conectado: Boolean(config && config.access_token),
    ultima_sincronizacao: config ? config.last_sync_at : null,
  });
}));

router.get('/connect', (req, res) => {
  if (!credenciaisConfiguradas()) {
    return res.status(400).json({ error: 'Credenciais do Bling não configuradas no arquivo .env.' });
  }

  estadoOAuthPendente = crypto.randomBytes(16).toString('hex');
  const url = new URL(BLING_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.BLING_CLIENT_ID);
  url.searchParams.set('state', estadoOAuthPendente);
  res.redirect(url.toString());
});

router.get('/callback', wrap(async (req, res) => {
  const { code, state } = req.query;

  if (!state || state !== estadoOAuthPendente) {
    return res.status(400).send('Estado inválido (possível CSRF). Tente conectar novamente pelo sistema.');
  }
  estadoOAuthPendente = null;

  if (!code) {
    return res.status(400).send('Autorização não concedida pelo Bling.');
  }

  try {
    const tokenJson = await trocarCodePorToken(code);
    await salvarTokens(tokenJson);
    res.redirect('/?bling=conectado');
  } catch (err) {
    res.status(400).send(`Erro ao conectar com o Bling: ${err.message}`);
  }
}));

router.post('/sync', wrap(async (req, res) => {
  if (!credenciaisConfiguradas()) {
    return res.status(400).json({ error: 'Credenciais do Bling não configuradas no arquivo .env.' });
  }

  const config = await getConfig();
  if (!config || !config.access_token) {
    return res.status(400).json({ error: 'Bling ainda não foi conectado. Clique em "Conectar ao Bling" primeiro.' });
  }

  const dataInicial =
    req.body.data_inicial ||
    (config.last_sync_at ? config.last_sync_at.slice(0, 10) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  const produtos = await db.prepare('SELECT id, codigo FROM produtos').all();
  const produtoPorCodigo = new Map();
  for (const p of produtos) {
    const codigo = String(p.codigo).trim().toUpperCase();
    produtoPorCodigo.set(codigo, p.id);
    // No Bling, muitos produtos estão cadastrados só com os 3 dígitos finais
    // (ex: "906" em vez de "700906") — aceita os dois formatos.
    const semPrefixo = codigo.match(/^700(\d{3})$/);
    if (semPrefixo) {
      produtoPorCodigo.set(semPrefixo[1], p.id);
    }
  }

  // bling_pedido_id é BIGINT no Postgres e volta como string do driver — converte pra
  // número aqui pra bater com o id (numérico) que a API do Bling devolve no JSON.
  const linhasImportadas = await db
    .prepare('SELECT bling_pedido_id FROM vendas WHERE bling_pedido_id IS NOT NULL')
    .all();
  const jaImportados = new Set(linhasImportadas.map((r) => Number(r.bling_pedido_id)));

  let pedidosResumo = [];
  try {
    let pagina = 1;
    const limite = 100;
    while (pagina <= 20) {
      const resultado = await blingFetch(`/pedidos/vendas?pagina=${pagina}&limite=${limite}&dataInicial=${dataInicial}`);
      const lote = resultado.data || [];
      pedidosResumo = pedidosResumo.concat(lote);
      if (lote.length < limite) break;
      pagina += 1;
    }
  } catch (err) {
    if (err.message === 'BLING_NAO_CONECTADO') {
      return res.status(400).json({ error: 'Bling não conectado.' });
    }
    return res.status(502).json({ error: `Erro ao buscar pedidos no Bling: ${err.message}` });
  }

  const novos = pedidosResumo.filter((p) => !jaImportados.has(p.id));

  let importados = 0;
  const itensNaoEncontrados = [];
  const erros = [];

  for (const resumo of novos) {
    try {
      const detalheJson = await blingFetch(`/pedidos/vendas/${resumo.id}`);
      const pedido = detalheJson.data;

      const itensValidos = [];
      for (const item of pedido.itens || []) {
        const codigoNormalizado = String(item.codigo || '').trim().toUpperCase();
        const produtoId = produtoPorCodigo.get(codigoNormalizado);
        if (!produtoId) {
          itensNaoEncontrados.push(`${item.codigo || '(sem código)'} — ${item.descricao || ''} (pedido #${pedido.numero})`);
          continue;
        }
        itensValidos.push({
          produto_id: produtoId,
          quantidade: Number(item.quantidade),
          valor_unitario: Number(item.valor),
          subtotal: Number((Number(item.quantidade) * Number(item.valor)).toFixed(2)),
        });
      }

      if (itensValidos.length === 0) continue;

      await transaction(async () => {
        const tipoCliente = pedido.contato?.tipoPessoa === 'F' ? 'CPF' : 'B2B';
        const infoVenda = await db
          .prepare(
            `INSERT INTO vendas (data, tipo_cliente, cliente_nome, forma_pagamento, local, valor_total, observacoes, origem, bling_pedido_id)
             VALUES (?, ?, ?, NULL, 'NOSSO', ?, ?, 'BLING', ?)`
          )
          .run(
            pedido.data,
            tipoCliente,
            pedido.contato?.nome || 'Cliente Bling',
            Number(pedido.total),
            `Importado do Bling — Pedido #${pedido.numero}`,
            pedido.id
          );

        const vendaId = infoVenda.lastInsertRowid;
        const insertItem = db.prepare(
          'INSERT INTO venda_itens (venda_id, produto_id, quantidade, valor_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
        );
        const insertMov = db.prepare(
          'INSERT INTO movimentacoes (produto_id, tipo, quantidade, data, cliente, local, origem, venda_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        for (const item of itensValidos) {
          await insertItem.run(vendaId, item.produto_id, item.quantidade, item.valor_unitario, item.subtotal);
          await insertMov.run(item.produto_id, 'SAIDA', item.quantidade, pedido.data, pedido.contato?.nome || 'Cliente Bling', 'NOSSO', 'VENDA', vendaId);
        }
      });

      importados += 1;
    } catch (err) {
      erros.push(`Pedido #${resumo.numero || resumo.id}: ${err.message}`);
    }
  }

  await db.prepare("UPDATE bling_config SET last_sync_at = NOW() WHERE id = 1").run();

  res.json({
    encontrados: pedidosResumo.length,
    novos: novos.length,
    importados,
    itens_nao_encontrados: [...new Set(itensNaoEncontrados)],
    erros,
  });
}));

module.exports = router;
