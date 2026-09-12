CREATE DATABASE IF NOT EXISTS fincoach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fincoach;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  account_number VARCHAR(32) NULL,
  type ENUM('savings','current','cash','wallet','investment','fixed_deposit','other') NOT NULL,
  institution VARCHAR(100) NULL,
  balance DECIMAL(19,4) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT accounts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX accounts_user_idx (user_id),
  UNIQUE KEY accounts_user_number_uq (user_id, account_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  type ENUM('income','expense','transfer') NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  description VARCHAR(160) NOT NULL,
  merchant VARCHAR(120) NULL,
  category VARCHAR(80) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  fingerprint CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT transactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT transactions_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  INDEX transactions_user_date_idx (user_id, occurred_at),
  INDEX transactions_account_idx (account_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS goals (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  target_amount DECIMAL(19,4) NOT NULL,
  current_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  target_date DATE NOT NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT goals_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX goals_user_idx (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS statement_uploads (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  status ENUM('uploaded','processing','review','imported','failed') NOT NULL DEFAULT 'uploaded',
  bank_name VARCHAR(120) NULL,
  account_number VARCHAR(32) NULL,
  account_holder VARCHAR(120) NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  closing_balance DECIMAL(19,4) NULL,
  extracted_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT statement_uploads_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX statement_uploads_user_idx (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS statement_processing_jobs (
  id CHAR(36) PRIMARY KEY,
  upload_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
  current_step VARCHAR(64) NOT NULL DEFAULT 'Statement uploaded',
  step_index INT NOT NULL DEFAULT 1,
  total_steps INT NOT NULL DEFAULT 8,
  progress_percent INT NOT NULL DEFAULT 10,
  error_details TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT jobs_upload_fk FOREIGN KEY (upload_id) REFERENCES statement_uploads(id) ON DELETE CASCADE,
  CONSTRAINT jobs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX jobs_upload_idx (upload_id),
  INDEX jobs_user_idx (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS extracted_transactions (
  id CHAR(36) PRIMARY KEY,
  upload_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  description VARCHAR(255) NOT NULL,
  merchant VARCHAR(120) NULL,
  reference VARCHAR(120) NULL,
  amount DECIMAL(19,4) NOT NULL,
  type ENUM('income','expense','transfer') NOT NULL,
  category VARCHAR(80) NOT NULL,
  confidence DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  balance DECIMAL(19,4) NULL,
  duplicate_status ENUM('new','possible_duplicate','keep_existing','imported') NOT NULL DEFAULT 'new',
  selected TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT extracted_upload_fk FOREIGN KEY (upload_id) REFERENCES statement_uploads(id) ON DELETE CASCADE,
  CONSTRAINT extracted_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX extracted_upload_idx (upload_id),
  INDEX extracted_user_idx (user_id)
) ENGINE=InnoDB;