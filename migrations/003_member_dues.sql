CREATE TABLE IF NOT EXISTS member_dues_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  user_id INT NOT NULL,
  payment_method_id INT NOT NULL,
  year INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_member_dues_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_member_dues_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_member_dues_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_dues_member_year ON member_dues_payments(member_id, year);
CREATE INDEX IF NOT EXISTS idx_dues_paid_at ON member_dues_payments(paid_at);

