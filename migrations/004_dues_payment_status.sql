ALTER TABLE member_dues_payments
  ADD COLUMN IF NOT EXISTS status ENUM('paid', 'cancelled') NOT NULL DEFAULT 'paid' AFTER notes,
  ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER status,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id INT NULL AFTER cancelled_at;

SET @existing_fk := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'member_dues_payments'
    AND COLUMN_NAME = 'cancelled_by_user_id'
    AND REFERENCED_TABLE_NAME = 'users'
  LIMIT 1
);

SET @sql := IF(
  @existing_fk IS NULL,
  'ALTER TABLE member_dues_payments ADD CONSTRAINT fk_member_dues_cancel_user FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE INDEX IF NOT EXISTS idx_dues_status ON member_dues_payments(status);
