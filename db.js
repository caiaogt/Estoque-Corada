const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL não configurada. Defina a connection string do Postgres (Supabase) no arquivo .env.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Guarda o client "ativo" de uma transação (ver transaction() abaixo) pra que todas as
// queries feitas dentro dela rodem na MESMA conexão — senão BEGIN/COMMIT não teriam efeito,
// já que o pool poderia abrir uma conexão diferente pra cada query.
const contextoTransacao = new AsyncLocalStorage();

function executor() {
  return contextoTransacao.getStore() || pool;
}

// SQLite usa "?" como placeholder; node-postgres usa "$1", "$2"... Isso deixa as queries
// já escritas nas rotas (todas em sintaxe "?") funcionando sem precisar reescrever cada uma.
function converterPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${(i += 1)}`);
}

// "sessoes" usa "token" como chave primária, não "id" — não dá pra pedir RETURNING id nela.
const TABELAS_SEM_ID = ['sessoes'];

function prepare(sql) {
  const sqlConvertido = converterPlaceholders(sql);
  const tabelaAlvo = /^\s*insert\s+into\s+(\w+)/i.exec(sql)?.[1];
  const ehInsertSemReturning =
    /^\s*insert/i.test(sql) && !/returning/i.test(sql) && !TABELAS_SEM_ID.includes(tabelaAlvo);

  return {
    async get(...params) {
      const { rows } = await executor().query(sqlConvertido, params);
      return rows[0];
    },
    async all(...params) {
      const { rows } = await executor().query(sqlConvertido, params);
      return rows;
    },
    async run(...params) {
      // SQLite retorna lastInsertRowid nativamente; no Postgres precisamos pedir de volta
      // o id gerado com RETURNING. Todas as tabelas daqui usam "id" como chave primária.
      const sqlFinal = ehInsertSemReturning ? `${sqlConvertido} RETURNING id` : sqlConvertido;
      const result = await executor().query(sqlFinal, params);
      return {
        lastInsertRowid: ehInsertSemReturning ? result.rows[0]?.id : undefined,
        changes: result.rowCount,
      };
    },
  };
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await contextoTransacao.run(client, fn);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const db = { prepare };

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    marca TEXT NOT NULL CHECK (marca IN ('CORADA', 'MEALI')),
    linha TEXT,
    preco_b2b DOUBLE PRECISION,
    preco_cpf DOUBLE PRECISION,
    validade_meses INTEGER,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS kits (
    id SERIAL PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS kit_itens (
    id SERIAL PRIMARY KEY,
    kit_id INTEGER NOT NULL REFERENCES kits(id),
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0)
  );

  CREATE TABLE IF NOT EXISTS movimentacoes (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data TEXT NOT NULL,
    freezer TEXT,
    cliente TEXT,
    local TEXT NOT NULL DEFAULT 'NOSSO' CHECK (local IN ('NOSSO', 'BASE01')),
    origem TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'LOTE', 'KIT', 'AJUSTE', 'VENDA', 'ETIQUETA')),
    kit_id INTEGER REFERENCES kits(id),
    venda_id INTEGER,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ajustes_estoque (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    saldo_contado INTEGER NOT NULL,
    saldo_calculado INTEGER NOT NULL,
    diferenca INTEGER NOT NULL,
    data TEXT NOT NULL,
    observacao TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS vendas (
    id SERIAL PRIMARY KEY,
    data TEXT NOT NULL,
    tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('B2B', 'CPF')),
    cliente_nome TEXT NOT NULL,
    nota_fiscal TEXT,
    forma_pagamento TEXT,
    local TEXT NOT NULL DEFAULT 'NOSSO' CHECK (local IN ('NOSSO', 'BASE01')),
    valor_total DOUBLE PRECISION NOT NULL,
    observacoes TEXT,
    origem TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'BLING')),
    bling_pedido_id BIGINT,
    status TEXT NOT NULL DEFAULT 'NOVO' CHECK (status IN ('NOVO', 'ENTREGUE', 'CANCELADO')),
    desconto DOUBLE PRECISION NOT NULL DEFAULT 0,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_bling_pedido ON vendas(bling_pedido_id) WHERE bling_pedido_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS venda_itens (
    id SERIAL PRIMARY KEY,
    venda_id INTEGER NOT NULL REFERENCES vendas(id),
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario DOUBLE PRECISION NOT NULL,
    subtotal DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    senha_salt TEXT NOT NULL,
    nome_exibicao TEXT,
    foto_perfil TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    expira_em TEXT NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS etiquetas_impressao (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data_fabricacao TEXT NOT NULL,
    data_validade TEXT,
    movimentacao_id INTEGER REFERENCES movimentacoes(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    impresso_por TEXT,
    client_op_id TEXT UNIQUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS bling_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    last_sync_at TEXT,
    updated_em TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);
  CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data);
  CREATE INDEX IF NOT EXISTS idx_venda_itens_venda ON venda_itens(venda_id);
  CREATE INDEX IF NOT EXISTS idx_etiquetas_produto ON etiquetas_impressao(produto_id);
  CREATE INDEX IF NOT EXISTS idx_etiquetas_criado ON etiquetas_impressao(criado_em);
`;

function gerarHashSenha(senha) {
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return { hash, salt };
}

function verificarSenha(senha, hash, salt) {
  const crypto = require('crypto');
  const hashCalculado = crypto.scryptSync(senha, salt, 64);
  const hashArmazenado = Buffer.from(hash, 'hex');
  if (hashCalculado.length !== hashArmazenado.length) return false;
  return crypto.timingSafeEqual(hashCalculado, hashArmazenado);
}

async function iniciar() {
  await pool.query(SCHEMA_SQL);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM usuarios');
  if (rows[0].count === 0) {
    const { hash, salt } = gerarHashSenha('caio123');
    await pool.query('INSERT INTO usuarios (usuario, senha_hash, senha_salt) VALUES ($1, $2, $3)', [
      'caiovi20',
      hash,
      salt,
    ]);
  }
}

const prontidao = iniciar().catch((err) => {
  console.error('Falha ao iniciar o banco de dados:', err);
  throw err;
});

module.exports = { db, transaction, gerarHashSenha, verificarSenha, prontidao, pool };
