ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_pin_hash VARCHAR(255) NULL AFTER password_hash;
