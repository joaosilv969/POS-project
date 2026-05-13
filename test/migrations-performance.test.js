const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("performance migration adds indexes for hot report and lookup paths", () => {
  const migrationPath = path.join(__dirname, "..", "migrations", "007_performance_indexes.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  for (const indexName of [
    "idx_categories_scope_active_name",
    "idx_product_images_primary",
    "idx_products_type_sale_lookup",
    "idx_sales_status_created",
    "idx_sales_user_created",
    "idx_sales_payment_status_created",
    "idx_sale_items_product_sale",
    "idx_dues_year_status_paid",
    "idx_members_active_name",
  ]) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}\\b`));
  }
});
