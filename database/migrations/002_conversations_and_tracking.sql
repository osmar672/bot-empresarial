-- Migración 002: Persistencia conversacional, trazabilidad y control de tokens
-- Compatible con MySQL 8.4 e incremental respecto a 001_init.sql

CREATE TABLE IF NOT EXISTS pb_conversations (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Nueva conversación',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_conv_tenant (id, company_id),
  INDEX ix_conv_user_time (company_id, user_id, updated_at),
  FOREIGN KEY (user_id, company_id) REFERENCES pb_users(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Columnas de trazabilidad, tokens y modelo en pb_messages
ALTER TABLE pb_messages
  ADD COLUMN conversation_id CHAR(36) NULL AFTER user_id,
  ADD COLUMN model VARCHAR(100) NULL AFTER sources,
  ADD COLUMN provider VARCHAR(50) NOT NULL DEFAULT 'groq' AFTER model,
  ADD COLUMN total_tokens INT NOT NULL DEFAULT 0 AFTER output_tokens,
  ADD COLUMN duration_ms INT NULL AFTER total_tokens,
  ADD COLUMN intent VARCHAR(100) NULL AFTER duration_ms,
  ADD COLUMN agent VARCHAR(100) NULL DEFAULT 'policybot-rag' AFTER intent,
  ADD COLUMN escalated BOOLEAN NOT NULL DEFAULT FALSE AFTER agent,
  ADD COLUMN error_message VARCHAR(500) NULL AFTER escalated;

-- Índice para consultas de mensajes por conversación respetando tenant
ALTER TABLE pb_messages
  ADD INDEX ix_msg_conv (company_id, conversation_id, created_at);

-- Clave foránea compuesta hacia pb_conversations
-- ON DELETE CASCADE elimina los mensajes asociados si se borra la conversación
ALTER TABLE pb_messages
  ADD CONSTRAINT fk_msg_conv
  FOREIGN KEY (conversation_id, company_id, user_id)
  REFERENCES pb_conversations(id, company_id, user_id)
  ON DELETE CASCADE;

-- Backfill seguro: si existen mensajes previos sin conversación, agruparlos en una conversación por defecto
INSERT IGNORE INTO pb_conversations (id, company_id, user_id, title, created_at, updated_at)
SELECT
  UUID() AS id,
  m.company_id,
  m.user_id,
  'Historial anterior' AS title,
  MIN(m.created_at) AS created_at,
  MAX(m.created_at) AS updated_at
FROM pb_messages m
WHERE m.conversation_id IS NULL
GROUP BY m.company_id, m.user_id;

UPDATE pb_messages m
JOIN pb_conversations c ON c.company_id = m.company_id AND c.user_id = m.user_id AND c.title = 'Historial anterior'
SET m.conversation_id = c.id
WHERE m.conversation_id IS NULL;

-- Asegurar que total_tokens refleje la suma de tokens existentes
UPDATE pb_messages
SET total_tokens = input_tokens + output_tokens
WHERE total_tokens = 0 AND (input_tokens > 0 OR output_tokens > 0);
