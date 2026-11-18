CREATE TABLE IF NOT EXISTS pb_employee_profiles (
 user_id CHAR(36) PRIMARY KEY,
 company_id CHAR(36) NOT NULL,
 job_title VARCHAR(150) NULL,
 department VARCHAR(100) NULL,
 vacation_days DECIMAL(7,2) NULL,
 work_schedule VARCHAR(255) NULL,
 rest_days VARCHAR(150) NULL,
 start_date DATE NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE,
 FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;
ALTER TABLE pb_documents ADD COLUMN storage_path VARCHAR(100) NULL;
ALTER TABLE pb_documents ADD COLUMN size_bytes BIGINT NULL;
UPDATE pb_plans SET max_documents=0;
