ALTER TABLE members ADD COLUMN IF NOT EXISTS entry_date DATE NULL;
CREATE INDEX IF NOT EXISTS idx_members_entry_date ON members(entry_date);
