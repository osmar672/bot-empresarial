CREATE TABLE IF NOT EXISTS pb_permission_requests (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 category ENUM('medical','personal','other') NOT NULL,starts_at DATETIME(3) NOT NULL,ends_at DATETIME(3) NOT NULL,
 minutes INT NOT NULL,reason TEXT NOT NULL,status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
 reviewer_id CHAR(36) NULL,review_comment VARCHAR(1000) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),reviewed_at DATETIME(3) NULL,
 INDEX ix_permission_user (company_id,user_id,starts_at),INDEX ix_permission_review (company_id,status,created_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE,
 FOREIGN KEY (reviewer_id) REFERENCES pb_users(id) ON DELETE SET NULL,
 CHECK (ends_at>starts_at),CHECK (minutes>0 AND minutes<=1440)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_leave_policy (
 company_id CHAR(36) PRIMARY KEY,automatic BOOLEAN NOT NULL DEFAULT FALSE,
 count_mode ENUM('schedule','weekdays') NOT NULL DEFAULT 'schedule',weekdays JSON NOT NULL,
 updated_by CHAR(36) NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
 FOREIGN KEY (updated_by) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_leave_ledger (
 id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,request_id CHAR(36) NULL,
 kind ENUM('opening','adjustment','debit','refund') NOT NULL,days_delta DECIMAL(7,2) NOT NULL,balance_after DECIMAL(7,2) NOT NULL,
 note VARCHAR(500) NOT NULL,actor_id CHAR(36) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_leave_request_entry (request_id,kind),INDEX ix_leave_user (company_id,user_id,created_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE,
 FOREIGN KEY (request_id) REFERENCES pb_vacation_requests(id) ON DELETE SET NULL,
 FOREIGN KEY (actor_id) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_document_extractions (
 document_id CHAR(36) PRIMARY KEY,company_id CHAR(36) NOT NULL,
 method ENUM('text','ocr','mixed') NOT NULL,pages INT NOT NULL,ocr_pages INT NOT NULL DEFAULT 0,
 confidence DECIMAL(5,2) NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (document_id,company_id) REFERENCES pb_documents(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
