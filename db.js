const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new DatabaseSync(path.join(dataDir, 'estoque.db'));

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    marca TEXT NOT NULL CHECK (marca IN ('CORADA', 'MEALI')),
    linha TEXT,
    preco_b2b REAL,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS kits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS kit_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kit_id INTEGER NOT NULL REFERENCES kits(id),
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0)
  );

  CREATE TABLE IF NOT EXISTS movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data TEXT NOT NULL,
    freezer TEXT,
    cliente TEXT,
    local TEXT NOT NULL DEFAULT 'NOSSO' CHECK (local IN ('NOSSO', 'BASE01')),
    origem TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'LOTE', 'KIT', 'AJUSTE', 'VENDA')),
    kit_id INTEGER REFERENCES kits(id),
    venda_id INTEGER,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ajustes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    saldo_contado INTEGER NOT NULL,
    saldo_calculado INTEGER NOT NULL,
    diferenca INTEGER NOT NULL,
    data TEXT NOT NULL,
    observacao TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('B2B', 'CPF')),
    cliente_nome TEXT NOT NULL,
    nota_fiscal TEXT,
    forma_pagamento TEXT,
    local TEXT NOT NULL DEFAULT 'NOSSO' CHECK (local IN ('NOSSO', 'BASE01')),
    valor_total REAL NOT NULL,
    observacoes TEXT,
    origem TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'BLING')),
    bling_pedido_id INTEGER,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS venda_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL REFERENCES vendas(id),
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario REAL NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS etiquetas_impressao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    data_fabricacao TEXT NOT NULL,
    data_validade TEXT,
    movimentacao_id INTEGER REFERENCES movimentacoes(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    impresso_por TEXT,
    client_op_id TEXT UNIQUE,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bling_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    last_sync_at TEXT,
    updated_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    senha_salt TEXT NOT NULL,
    nome_exibicao TEXT,
    foto_perfil TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    expira_em TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);
  CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data);
  CREATE INDEX IF NOT EXISTS idx_venda_itens_venda ON venda_itens(venda_id);
  CREATE INDEX IF NOT EXISTS idx_etiquetas_produto ON etiquetas_impressao(produto_id);
  CREATE INDEX IF NOT EXISTS idx_etiquetas_criado ON etiquetas_impressao(criado_em);
`);

const produtoColunas = db.prepare("PRAGMA table_info(produtos)").all().map((c) => c.name);
if (!produtoColunas.includes('linha')) {
  db.exec('ALTER TABLE produtos ADD COLUMN linha TEXT');
}
if (!produtoColunas.includes('preco_b2b')) {
  db.exec('ALTER TABLE produtos ADD COLUMN preco_b2b REAL');
}
if (!produtoColunas.includes('preco_cpf')) {
  db.exec('ALTER TABLE produtos ADD COLUMN preco_cpf REAL');
}
if (!produtoColunas.includes('validade_meses')) {
  db.exec('ALTER TABLE produtos ADD COLUMN validade_meses INTEGER');
}

const etiquetaColunas = db.prepare("PRAGMA table_info(etiquetas_impressao)").all().map((c) => c.name);
if (!etiquetaColunas.includes('impresso_por')) {
  db.exec('ALTER TABLE etiquetas_impressao ADD COLUMN impresso_por TEXT');
}

const movColunas = db.prepare("PRAGMA table_info(movimentacoes)").all().map((c) => c.name);
if (!movColunas.includes('local')) {
  db.exec("ALTER TABLE movimentacoes ADD COLUMN local TEXT NOT NULL DEFAULT 'NOSSO' CHECK (local IN ('NOSSO', 'BASE01'))");
}

const movTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimentacoes'").get().sql;
if (!movTableSql.includes('VENDA')) {
  transaction(() => {
    db.exec(`
      CREATE TABLE movimentacoes_novo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
        quantidade INTEGER NOT NULL CHECK (quantidade > 0),
        data TEXT NOT NULL,
        freezer TEXT,
        cliente TEXT,
        local TEXT NOT NULL DEFAULT 'NOSSO' CHECK (local IN ('NOSSO', 'BASE01')),
        origem TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'LOTE', 'KIT', 'AJUSTE', 'VENDA')),
        kit_id INTEGER REFERENCES kits(id),
        venda_id INTEGER,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO movimentacoes_novo (id, produto_id, tipo, quantidade, data, freezer, cliente, local, origem, kit_id, criado_em)
        SELECT id, produto_id, tipo, quantidade, data, freezer, cliente, local, origem, kit_id, criado_em FROM movimentacoes;
      DROP TABLE movimentacoes;
      ALTER TABLE movimentacoes_novo RENAME TO movimentacoes;
      CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);
      CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data);
    `);
  });
}

const movTableSql2 = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimentacoes'").get().sql;
if (!movTableSql2.includes('ETIQUETA')) {
  transaction(() => {
    db.exec(`
      CREATE TABLE movimentacoes_novo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO movimentacoes_novo (id, produto_id, tipo, quantidade, data, freezer, cliente, local, origem, kit_id, venda_id, criado_em)
        SELECT id, produto_id, tipo, quantidade, data, freezer, cliente, local, origem, kit_id, venda_id, criado_em FROM movimentacoes;
      DROP TABLE movimentacoes;
      ALTER TABLE movimentacoes_novo RENAME TO movimentacoes;
      CREATE INDEX IF NOT EXISTS idx_mov_produto ON movimentacoes(produto_id);
      CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data);
    `);
  });
}

const usuarioColunas = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
if (!usuarioColunas.includes('nome_exibicao')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN nome_exibicao TEXT');
}
if (!usuarioColunas.includes('foto_perfil')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT');
}

const vendaColunas = db.prepare("PRAGMA table_info(vendas)").all().map((c) => c.name);
if (!vendaColunas.includes('bling_pedido_id')) {
  db.exec('ALTER TABLE vendas ADD COLUMN bling_pedido_id INTEGER');
}
if (!vendaColunas.includes('status')) {
  db.exec(
    "ALTER TABLE vendas ADD COLUMN status TEXT NOT NULL DEFAULT 'NOVO' CHECK (status IN ('NOVO', 'ENTREGUE', 'CANCELADO'))"
  );
}
if (!vendaColunas.includes('desconto')) {
  db.exec('ALTER TABLE vendas ADD COLUMN desconto REAL NOT NULL DEFAULT 0');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_bling_pedido ON vendas(bling_pedido_id) WHERE bling_pedido_id IS NOT NULL');

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function gerarHashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return { hash, salt };
}

function verificarSenha(senha, hash, salt) {
  const hashCalculado = crypto.scryptSync(senha, salt, 64);
  const hashArmazenado = Buffer.from(hash, 'hex');
  if (hashCalculado.length !== hashArmazenado.length) return false;
  return crypto.timingSafeEqual(hashCalculado, hashArmazenado);
}

const { count: totalUsuarios } = db.prepare('SELECT COUNT(*) AS count FROM usuarios').get();
if (totalUsuarios === 0) {
  const { hash, salt } = gerarHashSenha('caio123');
  db.prepare('INSERT INTO usuarios (usuario, senha_hash, senha_salt) VALUES (?, ?, ?)').run('caiovi20', hash, salt);
}

module.exports = { db, transaction, gerarHashSenha, verificarSenha };
