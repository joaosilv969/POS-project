ALTER TABLE members ADD COLUMN IF NOT EXISTS email VARCHAR(180) NOT NULL DEFAULT '' AFTER name;
UPDATE members SET email = '' WHERE email IS NULL;
ALTER TABLE members MODIFY COLUMN email VARCHAR(180) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('smtpHost', ''),
  ('smtpPort', '587'),
  ('smtpSecure', '0'),
  ('smtpUser', ''),
  ('smtpPass', ''),
  ('smtpFrom', ''),
  ('statutesPdfFile', ''),
  ('sendMemberWelcomeEmail', '0');
