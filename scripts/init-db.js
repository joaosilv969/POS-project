require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "bar_user",
  password: process.env.DB_PASSWORD || "bar_password",
  database: process.env.DB_NAME || "bar_db",
  multipleStatements: true,
};

async function connectWithRetry() {
  let lastError;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      return await mysql.createConnection(config);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw lastError;
}

async function seedUsers(connection) {
  const users = [
    {
      name: "Administrador",
      email: "admin@bar.local",
      password: "admin123",
      role: "admin",
    },
    {
      name: "Funcionário",
      email: "funcionario@bar.local",
      password: "funcionario123",
      role: "employee",
    },
  ];

  for (const user of users) {
    const [existing] = await connection.execute("SELECT id FROM users WHERE email = ?", [user.email]);
    if (existing.length > 0) {
      continue;
    }

    const passwordHash = await bcrypt.hash(user.password, 12);
    await connection.execute(
      "INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)",
      [user.name, user.email, passwordHash, user.role],
    );
  }
}

async function seedAdminCancelPin(connection) {
  const rawPin = process.env.ADMIN_CANCEL_PIN;
  if (!rawPin) {
    return;
  }

  const pin = String(rawPin).trim();
  if (!/^\d{4,10}$/.test(pin)) {
    console.warn("ADMIN_CANCEL_PIN ignorado: tem de ter entre 4 e 10 dígitos.");
    return;
  }

  const [admins] = await connection.execute(
    "SELECT id, cancel_pin_hash FROM users WHERE role = 'admin' AND active = 1 ORDER BY id",
  );

  if (!admins || admins.length === 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(pin, 12);

  for (const admin of admins) {
    if (!admin || admin.cancel_pin_hash) {
      continue;
    }
    await connection.execute("UPDATE users SET cancel_pin_hash = ? WHERE id = ? AND role = 'admin'", [passwordHash, admin.id]);
  }
}

async function seedCategories(connection) {
  const categories = [
    { name: "Cervejas", description: "Cervejas nacionais, artesanais e importadas", scope: "bar", aliases: [] },
    { name: "Bebidas sem álcool", description: "Águas, sumos, refrigerantes e tónicas", scope: "bar", aliases: ["Bebidas sem alcool"] },
    { name: "Cafés", description: "Café, descafeinado e bebidas quentes", scope: "bar", aliases: ["Cafes"] },
    { name: "Cocktails", description: "Cocktails e bebidas preparadas", scope: "bar", aliases: [] },
    { name: "Snacks", description: "Snacks rápidos para balcão", scope: "bar", aliases: [] },
    { name: "Refeições rápidas", description: "Pratos simples e rápidos", scope: "bar", aliases: ["Refeicoes rapidas"] },
    { name: "Sobremesas", description: "Doces e sobremesas", scope: "bar", aliases: [] },
    { name: "Merchandising", description: "Artigos do clube, camisolas e brindes", scope: "merchandising", aliases: [] },
  ];

  for (const category of categories) {
    const names = [category.name, ...category.aliases];
    const placeholders = names.map(() => "?").join(", ");
    const [existing] = await connection.execute(`SELECT id, name FROM categories WHERE name IN (${placeholders}) LIMIT 1`, names);

    if (existing.length > 0 && existing[0].name !== category.name) {
      await connection.execute("UPDATE categories SET name = ?, description = ?, scope = ?, active = 1 WHERE id = ?", [
        category.name,
        category.description,
        category.scope,
        existing[0].id,
      ]);
    } else if (existing.length === 0) {
      await connection.execute("INSERT INTO categories (name, description, scope, active) VALUES (?, ?, ?, 1)", [
        category.name,
        category.description,
        category.scope,
      ]);
    } else {
      await connection.execute("UPDATE categories SET description = ?, scope = ?, active = 1 WHERE id = ?", [
        category.description,
        category.scope,
        existing[0].id,
      ]);
    }
  }
}

async function seedPaymentMethods(connection) {
  const methods = [
    ["Dinheiro", "cash"],
    ["MB WAY", "mbway"],
    ["Multibanco", "multibanco"],
    ["Cartão", "card"],
    ["Outro", "other"],
  ];

  for (const [name, code] of methods) {
    await connection.execute(
      "INSERT INTO payment_methods (name, code, active) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name), active = 1",
      [name, code],
    );
  }
}

async function seedTables(connection) {
  const tables = [
    ["Mesa 1", "Sala", 4],
    ["Mesa 2", "Sala", 4],
    ["Mesa 3", "Sala", 4],
    ["Mesa 4", "Sala", 4],
    ["Mesa 5", "Esplanada", 4],
    ["Mesa 6", "Esplanada", 4],
    ["Balcão", "Bar", 2],
    ["Reservados", "Sala", 6],
  ];

  for (const table of tables) {
    await connection.execute(
      `INSERT INTO bar_tables (name, location, capacity, active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = name`,
      table,
    );
  }
}

async function categoryId(connection, name) {
  const [rows] = await connection.execute("SELECT id FROM categories WHERE name = ?", [name]);
  return rows[0].id;
}

async function seedProducts(connection) {
  const categoryIds = {
    cervejas: await categoryId(connection, "Cervejas"),
    bebidas: await categoryId(connection, "Bebidas sem álcool"),
    cafes: await categoryId(connection, "Cafés"),
    cocktails: await categoryId(connection, "Cocktails"),
    snacks: await categoryId(connection, "Snacks"),
    refeicoes: await categoryId(connection, "Refeições rápidas"),
    merchandising: await categoryId(connection, "Merchandising"),
  };

  const products = [
    [categoryIds.cervejas, "bar", "Cerveja Pressão 0.20L", "Copo pequeno de cerveja à pressão", "CER-020", 1.4, 80, 12],
    [categoryIds.cervejas, "bar", "Cerveja Pressão 0.40L", "Copo grande de cerveja à pressão", "CER-040", 2.5, 55, 10],
    [categoryIds.bebidas, "bar", "Água 0.50L", "Garrafa de água sem gás", "BEB-AGUA", 1.0, 120, 20],
    [categoryIds.bebidas, "bar", "Refrigerante Lata", "Lata de refrigerante variado", "BEB-LATA", 1.6, 75, 15],
    [categoryIds.cafes, "bar", "Café", "Café expresso", "CAF-EXP", 0.8, 200, 30],
    [categoryIds.cocktails, "bar", "Caipirinha", "Cocktail fresco com lima", "COC-CAI", 5.5, 25, 5],
    [categoryIds.snacks, "bar", "Tosta Mista", "Tosta com queijo e fiambre", "SNK-TOSTA", 3.0, 20, 5],
    [categoryIds.refeicoes, "bar", "Bifana", "Bifana simples no pão", "REF-BIF", 3.5, 18, 5],
    [categoryIds.merchandising, "merchandising", "Camisola do clube", "T-shirt oficial do clube", "MERCH-TSHIRT", 20.0, 25, 5],
    [categoryIds.merchandising, "merchandising", "Boné do clube", "Boné bordado com o logotipo", "MERCH-BONE", 15.0, 18, 5],
  ];

  for (const product of products) {
    await connection.execute(
      `INSERT INTO products
        (category_id, product_type, name, short_description, reference_code, price, stock, low_stock_threshold, active, available_for_sale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE reference_code = reference_code`,
      product,
    );
  }
}

function readLegacyBrandConfig(uploadDir) {
  try {
    const filePath = path.join(uploadDir, "brand-config.json");
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function seedAppSettingsFromLegacyConfig(connection) {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
  const legacyConfig = readLegacyBrandConfig(uploadDir);
  if (!legacyConfig || typeof legacyConfig !== "object") {
    return;
  }

  const allowedKeys = [
    "appName",
    "appSubtitle",
    "defaultLowStockThreshold",
    "receiptPrefixBar",
    "receiptPrefixMerchandising",
    "duesDefaultAmount",
    "language",
    "brandMarkImage",
    "sendMemberWelcomeEmail",
    "smtpFrom",
    "smtpHost",
    "smtpPass",
    "smtpPort",
    "smtpSecure",
    "smtpUser",
    "statutesPdfFile",
  ];

  for (const key of allowedKeys) {
    if (!(key in legacyConfig)) {
      continue;
    }

    const value = legacyConfig[key];
    await connection.execute("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)", [
      key,
      value === null || value === undefined ? null : String(value),
    ]);
  }
}

async function main() {
  const connection = await connectWithRetry();
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await connection.query(sql);
    } catch (error) {
      // Allow re-running migrations safely when schema already includes later changes.
      if (error && (error.code === "ER_DUP_FIELDNAME" || error.code === "ER_DUP_KEYNAME")) {
        continue;
      }
      throw error;
    }
  }

  await seedPaymentMethods(connection);
  await seedTables(connection);
  await seedCategories(connection);
  await seedUsers(connection);
  await seedAdminCancelPin(connection);
  await seedProducts(connection);
  await seedAppSettingsFromLegacyConfig(connection);
  await connection.end();
}

main().catch((error) => {
  console.error("Erro ao inicializar base de dados:", error);
  process.exit(1);
});
