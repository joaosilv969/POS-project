CREATE TABLE IF NOT EXISTS cash_closings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  opening_float DECIMAL(10,2) NOT NULL DEFAULT 0,
  counted_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
  registered_cash_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
  withdraw_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  difference_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  bar_cash_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  merch_cash_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  dues_cash_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cash_closings_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_cash_closings_closed_at ON cash_closings(closed_at);
CREATE INDEX IF NOT EXISTS idx_cash_closings_period ON cash_closings(period_start, period_end);
