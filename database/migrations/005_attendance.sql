CREATE TABLE IF NOT EXISTS pb_attendance (
 id CHAR(36) PRIMARY KEY,
 company_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 checked_in_at DATETIME(3) NOT NULL,
 checked_out_at DATETIME(3) NULL,
 open_marker TINYINT GENERATED ALWAYS AS (CASE WHEN checked_out_at IS NULL THEN 1 ELSE NULL END) STORED,
 UNIQUE KEY uq_attendance_open (company_id,user_id,open_marker),
 INDEX ix_attendance_history (company_id,user_id,checked_in_at,id),
 CONSTRAINT fk_attendance_user FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE,
 CONSTRAINT ck_attendance_order CHECK (checked_out_at IS NULL OR checked_out_at>=checked_in_at)
) ENGINE=InnoDB;
