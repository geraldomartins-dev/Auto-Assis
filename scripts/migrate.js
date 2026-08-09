'use strict';

const mysql = require('mysql2/promise');
const { backupDatabase, connectionOptions, identifier } = require('./backup-database');

const MIGRATION_ID = '2026-08-09_1.2.0_auditoria';

async function tableExists(connection, table) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  );
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(connection, table, index) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, index]
  );
  return rows.length > 0;
}

async function ensureColumn(connection, table, column, definition) {
  if (!await columnExists(connection, table, column)) {
    await connection.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`);
  }
}

async function migrate() {
  const connection = await mysql.createConnection(connectionOptions());
  let lockAcquired = false;
  try {
    if (!await tableExists(connection, 'usuarios')) {
      throw new Error('Banco ainda não instalado. Importe autoassis_db.sql antes de executar a migração.');
    }
    const migrationTableExists = await tableExists(connection, 'schema_migrations');
    if (migrationTableExists) {
      const [existing] = await connection.execute('SELECT id FROM schema_migrations WHERE id = ? LIMIT 1', [MIGRATION_ID]);
      if (existing.length) {
        console.log(`Migração ${MIGRATION_ID} já aplicada. Nenhuma alteração necessária.`);
        return;
      }
    }

    const [lockRows] = await connection.query("SELECT GET_LOCK('autoassis_schema_migration', 10) AS acquired");
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error('Outra migração está em andamento. Tente novamente em instantes.');

    const backupPath = await backupDatabase();
    console.log(`Backup pré-migração: ${backupPath}`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(100) NOT NULL,
        aplicadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query("ALTER TABLE usuarios MODIFY COLUMN tipo ENUM('cliente','gerente','mecanico') NOT NULL DEFAULT 'cliente'");
    await ensureColumn(connection, 'usuarios', 'auth_version', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER tipo');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS configuracao_oficina (
        id TINYINT UNSIGNED NOT NULL,
        nome VARCHAR(150) NOT NULL,
        documento VARCHAR(30) NOT NULL,
        telefone VARCHAR(30) NOT NULL,
        email VARCHAR(150) NOT NULL,
        endereco VARCHAR(250) NOT NULL,
        atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizadoPor INT DEFAULT NULL,
        PRIMARY KEY (id),
        CONSTRAINT chk_configuracao_oficina_singleton CHECK (id = 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        usuarioId INT DEFAULT NULL,
        usuarioNome VARCHAR(100) NOT NULL,
        usuarioEmail VARCHAR(150) DEFAULT NULL,
        usuarioTipo ENUM('cliente','gerente','mecanico','sistema') NOT NULL,
        acao VARCHAR(30) NOT NULL,
        entidade VARCHAR(50) NOT NULL,
        entidadeId VARCHAR(64) DEFAULT NULL,
        resumo VARCHAR(255) NOT NULL,
        dadosAntes JSON DEFAULT NULL,
        dadosDepois JSON DEFAULT NULL,
        ip VARCHAR(45) DEFAULT NULL,
        requisicaoId VARCHAR(64) DEFAULT NULL,
        criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_auditoria_criadoEm (criadoEm),
        KEY idx_auditoria_usuario (usuarioId),
        KEY idx_auditoria_entidade (entidade, entidadeId),
        KEY idx_auditoria_acao (acao)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const solicitationColumns = [
      ['responsavel', 'VARCHAR(100) DEFAULT NULL'],
      ['dataInicio', 'DATE DEFAULT NULL'],
      ['orcamentoVersao', 'INT UNSIGNED NOT NULL DEFAULT 0'],
      ['orcamentoHash', 'CHAR(64) DEFAULT NULL'],
      ['decisao', "ENUM('Aprovado','Rejeitado') DEFAULT NULL"],
      ['decisaoEm', 'DATETIME DEFAULT NULL'],
      ['decisaoUsuarioId', 'INT DEFAULT NULL'],
      ['decisaoOrigem', "ENUM('cliente','gerente') DEFAULT NULL"],
      ['arquivado', 'TINYINT(1) NOT NULL DEFAULT 0'],
      ['arquivado_em', 'DATETIME DEFAULT NULL']
    ];
    for (const [column, definition] of solicitationColumns) {
      await ensureColumn(connection, 'solicitacoes', column, definition);
    }
    if (!await indexExists(connection, 'solicitacoes', 'uq_solicitacoes_osNumero')) {
      await connection.query('ALTER TABLE solicitacoes ADD UNIQUE KEY uq_solicitacoes_osNumero (osNumero)');
    }

    if (await tableExists(connection, 'movimentacoes')) {
      await connection.query("UPDATE movimentacoes SET tipo = CASE LOWER(TRIM(tipo)) WHEN 'entrada' THEN 'Entrada' WHEN 'saida' THEN 'Saída' WHEN 'saída' THEN 'Saída' ELSE tipo END");
      const [invalidMovement] = await connection.query(`
        SELECT COUNT(*) AS total FROM movimentacoes
        WHERE tipo NOT IN ('Entrada','Saída')
           OR CAST(pecaId AS CHAR) NOT REGEXP '^[1-9][0-9]*$'
           OR STR_TO_DATE(LEFT(CAST(data AS CHAR), 10), '%Y-%m-%d') IS NULL
      `);
      if (Number(invalidMovement[0].total) > 0) {
        throw new Error('Existem movimentações antigas com tipo, peça ou data inválidos. O backup foi preservado; corrija esses registros antes de repetir.');
      }
      await connection.query("ALTER TABLE movimentacoes MODIFY COLUMN tipo ENUM('Entrada','Saída') NOT NULL");
      await connection.query('ALTER TABLE movimentacoes MODIFY COLUMN pecaId INT NOT NULL');
      await connection.query("UPDATE movimentacoes SET data = STR_TO_DATE(LEFT(CAST(data AS CHAR), 10), '%Y-%m-%d')");
      await connection.query('ALTER TABLE movimentacoes MODIFY COLUMN data DATE NOT NULL');
    }

    await connection.execute('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log(`Migração ${MIGRATION_ID} aplicada com sucesso.`);
  } finally {
    if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('autoassis_schema_migration')").catch(() => {});
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error(`Migração interrompida: ${error.message}`);
  process.exitCode = 1;
});
