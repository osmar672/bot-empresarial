CREATE TABLE IF NOT EXISTS pb_profile_preferences (
 user_id CHAR(36) PRIMARY KEY,
 company_id CHAR(36) NOT NULL,
 settings JSON NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_profile_covers (
 user_id CHAR(36) PRIMARY KEY,
 company_id CHAR(36) NOT NULL,
 version CHAR(36) NOT NULL,
 image MEDIUMBLOB NOT NULL,
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pb_attendance_punctuality (
 attendance_id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 company_id CHAR(36) NOT NULL,
 expected_at DATETIME(3) NOT NULL,
 is_punctual BOOLEAN NOT NULL,
 INDEX ix_punctuality_user (company_id,user_id,expected_at),
 FOREIGN KEY (attendance_id) REFERENCES pb_attendance(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id,company_id) REFERENCES pb_users(id,company_id) ON DELETE CASCADE
) ENGINE=InnoDB;
