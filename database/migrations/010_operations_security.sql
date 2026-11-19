CREATE TABLE IF NOT EXISTS pb_notifications (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 kind VARCHAR(30) NOT NULL,title VARCHAR(160) NOT NULL,body VARCHAR(500) NOT NULL,
 target VARCHAR(30) NOT NULL DEFAULT 'profile',entity_id CHAR(36) NULL,event_key VARCHAR(180) NULL,
 read_at DATETIME(3) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_notification_event (user_id,event_key),INDEX ix_notification_user (company_id,user_id,created_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_audit_events (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,actor_id CHAR(36) NULL,
 action VARCHAR(80) NOT NULL,target_type VARCHAR(40) NOT NULL,target_id CHAR(36) NULL,detail JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX ix_audit_company (company_id,created_at),
 FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
 FOREIGN KEY (actor_id) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_holidays (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,day DATE NOT NULL,title VARCHAR(120) NOT NULL,
 created_by CHAR(36) NULL,UNIQUE KEY uq_company_holiday (company_id,day),
 FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
 FOREIGN KEY (created_by) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_answer_feedback (
 message_id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 rating ENUM('helpful','unhelpful') NOT NULL,comment VARCHAR(500) NOT NULL DEFAULT '',
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (message_id) REFERENCES pb_messages(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_document_jobs (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NULL,document_id CHAR(36) NULL,
 kind ENUM('upload','replace','reindex') NOT NULL,state ENUM('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
 name VARCHAR(255) NOT NULL,mime_type VARCHAR(130) NULL,storage_path CHAR(36) NULL,size_bytes BIGINT NULL,
 content_hash CHAR(64) NULL,allowed_roles JSON NULL,progress INT NOT NULL DEFAULT 0,stage VARCHAR(160) NOT NULL DEFAULT 'En cola',
 error_message VARCHAR(350) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),finished_at DATETIME(3) NULL,
 INDEX ix_jobs_state (state,created_at),INDEX ix_jobs_company (company_id,created_at),
 FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES pb_users(id) ON DELETE SET NULL,
 FOREIGN KEY (document_id) REFERENCES pb_documents(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_document_assets (
 document_id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,content_hash CHAR(64) NOT NULL,
 UNIQUE KEY uq_document_hash (company_id,content_hash),
 FOREIGN KEY (document_id,company_id) REFERENCES pb_documents(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_document_versions (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,document_id CHAR(36) NOT NULL,
 version INT NOT NULL,name VARCHAR(255) NOT NULL,mime_type VARCHAR(130) NOT NULL,storage_path CHAR(36) NOT NULL,
 size_bytes BIGINT NOT NULL,content_hash CHAR(64) NOT NULL,created_by CHAR(36) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY uq_doc_version (document_id,version),
 FOREIGN KEY (document_id,company_id) REFERENCES pb_documents(id,company_id) ON DELETE CASCADE,
 FOREIGN KEY (created_by) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_login_sessions (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 label VARCHAR(180) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),expires_at DATETIME(3) NOT NULL,revoked_at DATETIME(3) NULL,
 INDEX ix_sessions_user (company_id,user_id,expires_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_account_security (
 user_id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,email_verified_at DATETIME(3) NULL,legacy_revoked_before BIGINT NULL,
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_account_tokens (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 purpose ENUM('reset','verify') NOT NULL,token_hash CHAR(64) NOT NULL,expires_at DATETIME(3) NOT NULL,used_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY uq_account_token (token_hash),
 INDEX ix_token_user (user_id,purpose,expires_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_security_mail (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,recipient VARCHAR(190) NOT NULL,
 subject VARCHAR(200) NOT NULL,body TEXT NOT NULL,state ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0,next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),sent_at DATETIME(3) NULL,last_error VARCHAR(120) NULL,
 INDEX ix_security_mail_pending (state,next_attempt_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_backup_runs (
 id CHAR(36) PRIMARY KEY,state ENUM('running','done','failed') NOT NULL,filename VARCHAR(100) NULL,
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),finished_at DATETIME(3) NULL,error_code VARCHAR(80) NULL
) ENGINE=InnoDB;
