'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function connectionOptions() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autoassis_novo',
    charset: 'utf8mb4'
  };
}

function identifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

async function backupDatabase() {
  const options = connectionOptions();
  const connection = await mysql.createConnection(options);
  try {
    const [tableRows] = await connection.query('SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\'');
    const tables = tableRows.map((row) => Object.values(row)[0]);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDirectory = path.join(__dirname, '..', 'backups');
    const outputPath = path.join(backupDirectory, `autoassis-${timestamp}.sql.bak`);
    fs.mkdirSync(backupDirectory, { recursive: true });

    const lines = [
      '-- Backup privado Auto+Assis. Pode conter dados pessoais e hashes de senha.',
      `-- Gerado em ${new Date().toISOString()}.`,
      'SET NAMES utf8mb4;',
      'SET FOREIGN_KEY_CHECKS=0;',
      `CREATE DATABASE IF NOT EXISTS ${identifier(options.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `USE ${identifier(options.database)};`,
      ''
    ];

    for (const table of tables) {
      const [createRows] = await connection.query(`SHOW CREATE TABLE ${identifier(table)}`);
      const createSql = createRows[0]['Create Table'];
      lines.push(`DROP TABLE IF EXISTS ${identifier(table)};`, `${createSql};`, '');
      const [rows, fields] = await connection.query(`SELECT * FROM ${identifier(table)}`);
      if (!rows.length) continue;
      const columns = fields.map((field) => identifier(field.name)).join(', ');
      for (let offset = 0; offset < rows.length; offset += 250) {
        const values = rows.slice(offset, offset + 250).map((row) =>
          `(${fields.map((field) => connection.escape(row[field.name])).join(', ')})`
        );
        lines.push(`INSERT INTO ${identifier(table)} (${columns}) VALUES`, `${values.join(',\n')};`, '');
      }
    }

    lines.push('SET FOREIGN_KEY_CHECKS=1;', '');
    fs.writeFileSync(outputPath, lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
    return outputPath;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  backupDatabase()
    .then((outputPath) => console.log(`Backup criado com segurança em: ${outputPath}`))
    .catch((error) => {
      console.error(`Não foi possível criar o backup: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { backupDatabase, connectionOptions, identifier };
