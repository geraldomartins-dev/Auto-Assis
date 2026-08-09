-- Auto+Assis - schema seguro para instalação
-- Compatível com MariaDB 11.4 LTS+ e MySQL 8.4 LTS+
-- Este arquivo não remove tabelas, não apaga dados e não cria senhas padrão.

CREATE DATABASE IF NOT EXISTS autoassis_novo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE autoassis_novo;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  tipo ENUM('cliente', 'gerente', 'mecanico') NOT NULL DEFAULT 'cliente',
  auth_version INT UNSIGNED NOT NULL DEFAULT 1,
  reset_token VARCHAR(255) DEFAULT NULL,
  reset_token_expira DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migração idempotente para instalações existentes: preserva todos os usuários
-- e amplia a hierarquia sem recriar a tabela.
ALTER TABLE usuarios
  MODIFY COLUMN tipo ENUM('cliente', 'gerente', 'mecanico') NOT NULL DEFAULT 'cliente';

-- MySQL e MariaDB não compartilham a mesma sintaxe de ADD COLUMN IF NOT EXISTS
-- em todas as versões suportadas. A checagem no catálogo mantém a migração
-- segura e repetível nas duas famílias de banco.
SET @autoassis_auth_version_existe := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'auth_version'
);
SET @autoassis_auth_version_sql := IF(
  @autoassis_auth_version_existe = 0,
  'ALTER TABLE usuarios ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER tipo',
  'SELECT 1'
);
PREPARE autoassis_auth_version_stmt FROM @autoassis_auth_version_sql;
EXECUTE autoassis_auth_version_stmt;
DEALLOCATE PREPARE autoassis_auth_version_stmt;

-- Registro singleton da identidade documental da oficina. Variáveis de
-- ambiente servem apenas como fallback enquanto esta linha ainda não existir.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pecas (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT DEFAULT NULL,
  categoria VARCHAR(50) DEFAULT NULL,
  localizacao VARCHAR(100) DEFAULT NULL,
  quantidade INT NOT NULL DEFAULT 0,
  min INT NOT NULL DEFAULT 5,
  preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  CONSTRAINT chk_pecas_quantidade CHECK (quantidade >= 0),
  CONSTRAINT chk_pecas_min CHECK (min >= 0),
  CONSTRAINT chk_pecas_preco CHECK (preco >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS solicitacoes (
  id INT NOT NULL AUTO_INCREMENT,
  nomeCliente VARCHAR(100) NOT NULL,
  emailCliente VARCHAR(150) NOT NULL,
  telefone VARCHAR(20) DEFAULT NULL,
  veiculo VARCHAR(100) NOT NULL,
  ano VARCHAR(10) DEFAULT NULL,
  placa VARCHAR(20) DEFAULT NULL,
  problema TEXT NOT NULL,
  urgencia ENUM('Baixa', 'Média', 'Alta') NOT NULL DEFAULT 'Média',
  status ENUM(
    'Pendente',
    'Em Análise',
    'Aguardando Aprovação',
    'Aprovado',
    'Em Andamento',
    'Concluído',
    'Rejeitado'
  ) NOT NULL DEFAULT 'Pendente',
  dataCriacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  custoSugerido DECIMAL(10,2) DEFAULT NULL,
  osNumero VARCHAR(50) DEFAULT NULL,
  responsavel VARCHAR(100) DEFAULT NULL,
  dataInicio DATE DEFAULT NULL,
  orcamentoVersao INT UNSIGNED NOT NULL DEFAULT 0,
  orcamentoHash CHAR(64) DEFAULT NULL,
  decisao ENUM('Aprovado', 'Rejeitado') DEFAULT NULL,
  decisaoEm DATETIME DEFAULT NULL,
  decisaoUsuarioId INT DEFAULT NULL,
  decisaoOrigem ENUM('cliente', 'gerente') DEFAULT NULL,
  arquivado TINYINT(1) NOT NULL DEFAULT 0,
  arquivado_em DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_solicitacoes_osNumero (osNumero),
  KEY idx_solicitacoes_email (emailCliente),
  KEY idx_solicitacoes_status (status),
  KEY idx_solicitacoes_data (dataCriacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migração contratual idempotente para instalações existentes. As definições
-- ausentes são reunidas em um único ALTER TABLE, sem apagar ou reescrever OSs.
SET @autoassis_colunas_contratuais := (
  SELECT GROUP_CONCAT(d.definicao ORDER BY d.ordem SEPARATOR ', ')
  FROM (
    SELECT 1 AS ordem, 'responsavel' AS coluna,
      'ADD COLUMN responsavel VARCHAR(100) DEFAULT NULL' AS definicao
    UNION ALL SELECT 2, 'dataInicio',
      'ADD COLUMN dataInicio DATE DEFAULT NULL'
    UNION ALL SELECT 3, 'orcamentoVersao',
      'ADD COLUMN orcamentoVersao INT UNSIGNED NOT NULL DEFAULT 0'
    UNION ALL SELECT 4, 'orcamentoHash',
      'ADD COLUMN orcamentoHash CHAR(64) DEFAULT NULL'
    UNION ALL SELECT 5, 'decisao',
      'ADD COLUMN decisao ENUM(''Aprovado'', ''Rejeitado'') DEFAULT NULL'
    UNION ALL SELECT 6, 'decisaoEm',
      'ADD COLUMN decisaoEm DATETIME DEFAULT NULL'
    UNION ALL SELECT 7, 'decisaoUsuarioId',
      'ADD COLUMN decisaoUsuarioId INT DEFAULT NULL'
    UNION ALL SELECT 8, 'decisaoOrigem',
      'ADD COLUMN decisaoOrigem ENUM(''cliente'', ''gerente'') DEFAULT NULL'
  ) AS d
  LEFT JOIN information_schema.COLUMNS AS c
    ON c.TABLE_SCHEMA = DATABASE()
   AND c.TABLE_NAME = 'solicitacoes'
   AND c.COLUMN_NAME = d.coluna
  WHERE c.COLUMN_NAME IS NULL
);
SET @autoassis_migracao_contratual_sql := IF(
  @autoassis_colunas_contratuais IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE solicitacoes ', @autoassis_colunas_contratuais)
);
PREPARE autoassis_contrato_stmt FROM @autoassis_migracao_contratual_sql;
EXECUTE autoassis_contrato_stmt;
DEALLOCATE PREPARE autoassis_contrato_stmt;

CREATE TABLE IF NOT EXISTS movimentacoes (
  id INT NOT NULL AUTO_INCREMENT,
  tipo ENUM('Entrada', 'Saída') NOT NULL,
  pecaId INT NOT NULL,
  quantidade INT NOT NULL,
  data DATE NOT NULL,
  obs VARCHAR(500) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_movimentacoes_peca (pecaId),
  KEY idx_movimentacoes_data (data),
  CONSTRAINT fk_movimentacoes_pecas
    FOREIGN KEY (pecaId) REFERENCES pecas(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_movimentacoes_quantidade CHECK (quantidade > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trilha imutável de responsabilidade operacional. Não há chave estrangeira
-- para que a autoria permaneça preservada mesmo após a remoção de um acesso.
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuarioId INT DEFAULT NULL,
  usuarioNome VARCHAR(100) NOT NULL,
  usuarioEmail VARCHAR(150) DEFAULT NULL,
  usuarioTipo ENUM('cliente', 'gerente', 'mecanico', 'sistema') NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Depois da importação, execute `npm run create-admin` com as variáveis
-- ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD definidas apenas para esse comando.
