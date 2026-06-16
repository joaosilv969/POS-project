CREATE INDEX IF NOT EXISTS idx_categories_scope_active_name
  ON categories(scope, active, name);

CREATE INDEX IF NOT EXISTS idx_product_images_primary
  ON product_images(product_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_products_type_sale_lookup
  ON products(product_type, deleted_at, active, available_for_sale, name);

CREATE INDEX IF NOT EXISTS idx_sales_status_created
  ON sales(status, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_user_created
  ON sales(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_payment_status_created
  ON sales(payment_method_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_sale
  ON sale_items(product_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_dues_year_status_paid
  ON member_dues_payments(year, status, paid_at);

CREATE INDEX IF NOT EXISTS idx_members_active_name
  ON members(active, name);
