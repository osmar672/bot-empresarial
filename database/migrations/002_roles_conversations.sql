-- Existing sources are confidential until reviewed by an administrator.
ALTER TABLE pb_users MODIFY role ENUM('admin','rrhh','supervisor','colaborador') NOT NULL DEFAULT 'colaborador';
ALTER TABLE pb_documents ADD COLUMN allowed_roles JSON NOT NULL DEFAULT (JSON_ARRAY('admin'));
ALTER TABLE pb_messages
 ADD COLUMN error_message VARCHAR(350) NULL,
 ADD COLUMN finished_at DATETIME(3) NULL,
 ADD COLUMN role_at_request VARCHAR(20) NULL,
 ADD INDEX ix_msg_user_history (company_id,user_id,created_at,id);
CREATE TABLE IF NOT EXISTS pb_conversations (
 id CHAR(36) PRIMARY KEY,
 company_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 title VARCHAR(120) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_conversation_owner (id,company_id,user_id),
 INDEX ix_conversation_user (company_id,user_id,created_at),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id),
 FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;
ALTER TABLE pb_messages ADD COLUMN conversation_id CHAR(36) NULL,
 ADD INDEX ix_msg_conversation (conversation_id,created_at,id),
 ADD FOREIGN KEY (conversation_id,company_id,user_id) REFERENCES pb_conversations(id,company_id,user_id);
