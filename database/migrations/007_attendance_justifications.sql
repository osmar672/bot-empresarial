-- 007_attendance_justifications.sql
-- Sistema integral de puntualidad, justificaciones con comprobantes y auditoría

ALTER TABLE pb_attendance
  MODIFY COLUMN checked_in_at DATETIME(3) NULL,
  MODIFY COLUMN open_marker TINYINT GENERATED ALWAYS AS (CASE WHEN checked_in_at IS NOT NULL AND checked_out_at IS NULL THEN 1 ELSE NULL END) STORED,
  ADD COLUMN schedule_id CHAR(36) NULL,
  ADD COLUMN work_date DATE NULL,
  ADD COLUMN scheduled_start_time TIME NULL,
  ADD COLUMN scheduled_end_time TIME NULL,
  ADD COLUMN punctuality_status ENUM('a_tiempo','tarde','no_aplica') NOT NULL DEFAULT 'a_tiempo',
  ADD COLUMN attendance_status ENUM('a_tiempo','tarde','tarde_justificada','ausencia','ausencia_justificada','justificacion_pendiente','jornada_incompleta') NOT NULL DEFAULT 'a_tiempo',
  ADD COLUMN duration_seconds INT NULL,
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ADD INDEX ix_attendance_date (company_id, work_date, attendance_status),
  ADD CONSTRAINT fk_attendance_schedule FOREIGN KEY (schedule_id) REFERENCES pb_work_schedules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS pb_attendance_settings (
  company_id CHAR(36) PRIMARY KEY,
  tolerance_minutes INT NOT NULL DEFAULT 0,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Costa_Rica',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  CONSTRAINT fk_attendance_settings_company FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pb_attendance_justifications (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  attendance_id CHAR(36) NULL,
  incident_type ENUM('incapacidad_medica','cita_medica','emergencia_medica','fallecimiento_familiar','emergencia_familiar','accidente','fuerza_mayor','otro') NOT NULL,
  incident_date DATE NOT NULL,
  incident_time TIME NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  description TEXT NOT NULL,
  document_filename VARCHAR(255) NULL,
  document_original_name VARCHAR(255) NULL,
  document_mimetype VARCHAR(100) NULL,
  document_size_bytes BIGINT NULL,
  document_path VARCHAR(255) NULL,
  comments TEXT NULL,
  status ENUM('pending','approved','rejected','info_required') NOT NULL DEFAULT 'pending',
  reviewer_id CHAR(36) NULL,
  reviewed_at DATETIME(3) NULL,
  review_comment VARCHAR(1000) NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX ix_justification_owner (company_id, user_id, created_at),
  INDEX ix_justification_review (company_id, status, created_at),
  INDEX ix_justification_attendance (company_id, attendance_id),
  CONSTRAINT fk_justification_company FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_justification_user FOREIGN KEY (user_id, company_id) REFERENCES pb_users(id, company_id) ON DELETE CASCADE,
  CONSTRAINT fk_justification_attendance FOREIGN KEY (attendance_id) REFERENCES pb_attendance(id) ON DELETE SET NULL,
  CONSTRAINT fk_justification_reviewer FOREIGN KEY (reviewer_id) REFERENCES pb_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pb_attendance_audit (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  previous_value JSON NULL,
  new_value JSON NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX ix_audit_company (company_id, created_at),
  INDEX ix_audit_entity (company_id, entity_type, entity_id),
  CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES pb_companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES pb_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
