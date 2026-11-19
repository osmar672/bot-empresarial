CREATE TABLE IF NOT EXISTS pb_attendance_corrections (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,attendance_id CHAR(36) NULL,
 original_in DATETIME(3) NULL,original_out DATETIME(3) NULL,proposed_in DATETIME(3) NOT NULL,proposed_out DATETIME(3) NOT NULL,
 reason VARCHAR(2000) NOT NULL,status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
 reviewer_id CHAR(36) NULL,review_comment VARCHAR(1000) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),reviewed_at DATETIME(3) NULL,
 INDEX ix_correction_review(company_id,status,created_at),
 FOREIGN KEY(user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE,
 FOREIGN KEY(attendance_id) REFERENCES pb_attendance(id) ON DELETE SET NULL,
 FOREIGN KEY(reviewer_id) REFERENCES pb_users(id) ON DELETE SET NULL,
 CHECK(proposed_out>proposed_in)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_hr_reminders (
 company_id CHAR(36) NOT NULL,kind VARCHAR(20) NOT NULL,request_id CHAR(36) NOT NULL,last_sent_at DATETIME(3) NOT NULL,
 PRIMARY KEY(company_id,kind,request_id),FOREIGN KEY(company_id) REFERENCES pb_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_knowledge_gaps (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,question_hash CHAR(64) NOT NULL,question VARCHAR(2000) NOT NULL,
 status ENUM('pending','published','dismissed') NOT NULL DEFAULT 'pending',answer TEXT NULL,source_url VARCHAR(1000) NULL,
 allowed_roles JSON NULL,document_id CHAR(36) NULL,reviewer_id CHAR(36) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_gap(company_id,question_hash),FOREIGN KEY(company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
 FOREIGN KEY(document_id) REFERENCES pb_documents(id) ON DELETE SET NULL,FOREIGN KEY(reviewer_id) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_knowledge_askers (
 gap_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,PRIMARY KEY(gap_id,user_id),
 FOREIGN KEY(gap_id) REFERENCES pb_knowledge_gaps(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES pb_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_policy_editions (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,document_id CHAR(36) NULL,title VARCHAR(255) NOT NULL,
 revision VARCHAR(64) NOT NULL,content_hash CHAR(64) NOT NULL,content LONGTEXT NOT NULL,allowed_roles JSON NOT NULL,
 state ENUM('active','retired') NOT NULL DEFAULT 'active',created_by CHAR(36) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX ix_policy_company(company_id,state),FOREIGN KEY(document_id) REFERENCES pb_documents(id) ON DELETE SET NULL,FOREIGN KEY(company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
 FOREIGN KEY(created_by) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_policy_acceptances (
 edition_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,company_id CHAR(36) NOT NULL,accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 content_hash CHAR(64) NOT NULL,statement VARCHAR(200) NOT NULL,
 PRIMARY KEY(edition_id,user_id),FOREIGN KEY(edition_id) REFERENCES pb_policy_editions(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_onboarding_tasks (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,title VARCHAR(200) NOT NULL,
 category ENUM('document','training','task') NOT NULL,description VARCHAR(2000) NOT NULL,link VARCHAR(1000) NULL,due_date DATE NULL,
 state ENUM('pending','submitted','completed') NOT NULL DEFAULT 'pending',created_by CHAR(36) NULL,completed_by CHAR(36) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),submitted_at DATETIME(3) NULL,completed_at DATETIME(3) NULL,
 INDEX ix_onboarding_user(company_id,user_id,state),FOREIGN KEY(user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE,
 FOREIGN KEY(created_by) REFERENCES pb_users(id) ON DELETE SET NULL,FOREIGN KEY(completed_by) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_mfa (
 user_id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,secret_encrypted TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,
 last_counter BIGINT NOT NULL DEFAULT -1,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_mfa_recovery (
 user_id CHAR(36) NOT NULL,code_hash CHAR(64) NOT NULL,used_at DATETIME(3) NULL,PRIMARY KEY(user_id,code_hash),
 FOREIGN KEY(user_id) REFERENCES pb_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_mfa_challenges (
 id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,token_hash CHAR(64) NOT NULL,attempts INT NOT NULL DEFAULT 0,
 expires_at DATETIME(3) NOT NULL,used_at DATETIME(3) NULL,UNIQUE KEY uq_mfa_token(token_hash),
 FOREIGN KEY(user_id) REFERENCES pb_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_external_backup_checks (
 id CHAR(36) PRIMARY KEY,filename VARCHAR(200) NOT NULL,provider VARCHAR(10) NOT NULL,object_key VARCHAR(500) NOT NULL,
 state ENUM('verified','failed') NOT NULL,error_code VARCHAR(80) NULL,verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
