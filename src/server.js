require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const bcrypt = require("bcryptjs");
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const createMySQLSessionStore = require("express-mysql-session");
const helmet = require("helmet");
const multer = require("multer");
const packageInfo = require("../package.json");
const pool = require("./db");
const { createAppSettingsStore } = require("./app-settings");
const asyncRoute = require("./lib/async-route");
const { sendEmail } = require("./email-service");
const flash = require("./lib/flash");
const { parseMembersCsv } = require("./members-csv");
const { currentYear, parseInteger, parseNumber } = require("./lib/parsing");
const { requireAdmin, requireAuth } = require("./middleware/auth");
const { createPaymentMethodService } = require("./services/payment-methods");
const { createTranslator, getSupportedLanguages, normalizeLanguage, translateHtml } = require("./i18n");
const {
  makePercent,
  normalizeDuesReportFilters,
  normalizeMerchReportFilters,
  normalizeReportFilters,
  normalizeStockReportFilters,
  preserveDuesReportQuery,
  preserveMerchReportQuery,
  preserveReportQuery,
  preserveStockReportQuery,
  rowsToCsv,
} = require("./services/report-utils");
const { createProductImageUpload } = require("./uploads/product-images");

const app = express();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const port = Number(process.env.APP_PORT || 3000);
const assetVersion = process.env.ASSET_VERSION || String(Date.now());

fs.mkdirSync(uploadDir, { recursive: true });
const memberCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    if (extension !== ".csv" && extension !== ".txt") {
      return cb(new Error(req.t ? req.t("O ficheiro deve ser um CSV.") : "O ficheiro deve ser um CSV."));
    }
    return cb(null, true);
  },
});
const statutesPdfUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      cb(null, `estatutos-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    if (extension !== ".pdf" || file.mimetype !== "application/pdf") {
      return cb(new Error(req.t ? req.t("O ficheiro deve ser um PDF.") : "O ficheiro deve ser um PDF."));
    }
    return cb(null, true);
  },
});

const appSettings = createAppSettingsStore({ pool });
const paymentMethods = createPaymentMethodService({ pool });
const softwareAuthor = String(packageInfo.author || "").trim() || "joaosilv969 AKA Frazao";

function getCommitCount() {
  try {
    return (
      Number.parseInt(
        execFileSync("git", ["rev-list", "--count", "HEAD"], {
          cwd: path.join(__dirname, ".."),
          encoding: "utf-8",
        }).trim(),
        10,
      ) || 0
    );
  } catch {
    return 0;
  }
}

function getMigrationCount() {
  try {
    return fs
      .readdirSync(path.join(__dirname, "..", "migrations"))
      .filter((file) => file.endsWith(".sql")).length;
  } catch {
    return 0;
  }
}

function buildSoftwareVersion() {
  const commitCount = getCommitCount();
  const migrationCount = getMigrationCount();
  const rawVersion = String(packageInfo.version || "0.0.0");
  const [, minor = "0", patch = "0"] = rawVersion.split(".");
  return `v${migrationCount}.${commitCount || minor}.${patch}`;
}

const softwareVersion = buildSoftwareVersion();

async function registerSoftwareVersion() {
  try {
    await pool.execute("INSERT IGNORE INTO software_versions (version) VALUES (?)", [softwareVersion]);
  } catch {
    // Ignore registration failures during boot; settings page will try again.
  }
}

async function listSoftwareVersions() {
  const [rows] = await pool.execute(
    "SELECT version, released_at FROM software_versions ORDER BY released_at DESC, version DESC",
  );
  return rows;
}

function createMoneyFormatter(locale = "pt-PT") {
  return (value) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(Number(value || 0));
}

function createDateTimeFormatter(locale = "pt-PT") {
  return (value) => {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  };
}

function createDateFormatter(locale = "pt-PT") {
  return (value) => {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
    }).format(new Date(value));
  };
}

function readCookieValue(cookieHeader, key) {
  const source = String(cookieHeader || "");
  if (!source) {
    return "";
  }

  const prefix = `${key}=`;
  const entry = source
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) {
    return "";
  }

  return decodeURIComponent(entry.slice(prefix.length));
}

function generateReceiptNumber(prefix) {
  const safePrefix = String(prefix || "").trim().toUpperCase();
  const normalizedPrefix = /^[A-Z]{1,3}$/.test(safePrefix) ? safePrefix : "V";
  return `${normalizedPrefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function duesDefaultAmount() {
  return appSettings.duesDefaultAmount();
}

async function duesAmountForYear(year) {
  const normalizedYear = parseInteger(year, currentYear());
  const [[row]] = await pool.execute("SELECT amount FROM dues_years WHERE year = ? LIMIT 1", [normalizedYear]);
  if (row && Number(row.amount) > 0) {
    return Number(row.amount);
  }
  return duesDefaultAmount();
}

function memberShouldPayDuesForYear(member, year) {
  // Se não tem data de entrada, deve pagar
  if (!member.entry_date) {
    return true;
  }

  // Se a data de entrada é nula (no banco), deve pagar
  if (member.entry_date === null) {
    return true;
  }

  const entryDate = new Date(member.entry_date);
  const yearStart = new Date(year, 0, 1); // 1 de janeiro do ano em questão

  // Se entrou DEPOIS de 31 de dezembro do ano anterior (ou seja, no ano ou depois), deve pagar
  return entryDate <= yearStart;
}

const MySQLStore = createMySQLSessionStore(session);
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "bar_user",
  password: process.env.DB_PASSWORD || "bar_password",
  database: process.env.DB_NAME || "bar_db",
  clearExpired: true,
  checkExpirationInterval: 1000 * 60 * 15,
  expiration: 1000 * 60 * 60 * 10,
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        "upgrade-insecure-requests": null,
      },
    },
    hsts: false,
  }),
);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS === "true",
      maxAge: 1000 * 60 * 60 * 10,
    },
  }),
);

app.use((req, res, next) => {
  const locale = normalizeLanguage(appSettings.language() || req.headers["accept-language"]);
  const theme = readCookieValue(req.headers.cookie, "app_theme") === "dark" ? "dark" : "light";
  req.language = locale;
  req.theme = theme;
  req.t = createTranslator(locale);

  const originalRender = res.render.bind(res);
  res.render = (view, options, callback) => {
    let renderOptions = options;
    let renderCallback = callback;

    if (typeof renderOptions === "function") {
      renderCallback = renderOptions;
      renderOptions = undefined;
    }

    return originalRender(view, renderOptions, (error, html) => {
      if (error) {
        if (typeof renderCallback === "function") {
          return renderCallback(error);
        }
        return next(error);
      }

      const localizedHtml = translateHtml(html, locale);
      if (typeof renderCallback === "function") {
        return renderCallback(null, localizedHtml);
      }
      return res.send(localizedHtml);
    });
  };

  next();
});

app.use(
  "/assets",
  express.static(path.join(__dirname, "..", "public"), {
    etag: true,
    immutable: process.env.NODE_ENV === "production",
    maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
  }),
);

async function verifyAdminCancelPin(connection, pin) {
  const normalizedPin = String(pin || "").trim();
  if (!normalizedPin) {
    return null;
  }

  const [admins] = await connection.execute(
    "SELECT id, password_hash, cancel_pin_hash FROM users WHERE active = 1 AND role = 'admin' ORDER BY id",
  );

  for (const admin of admins) {
    if (!admin) {
      continue;
    }

    if (admin.cancel_pin_hash) {
      if (await bcrypt.compare(normalizedPin, admin.cancel_pin_hash)) {
        return admin.id;
      }
      continue;
    }

    // Backwards compatibility: if PIN not set yet, accept the admin password as PIN.
    if (admin.password_hash && (await bcrypt.compare(normalizedPin, admin.password_hash))) {
      return admin.id;
    }
  }

  return null;
}

async function findUserByLoginPin(connection, pin) {
  const normalizedPin = String(pin || "").trim();
  if (!/^\d{4,10}$/.test(normalizedPin)) {
    return null;
  }

  const [users] = await connection.execute(
    "SELECT id, name, email, role, active, login_pin_hash FROM users WHERE active = 1 AND login_pin_hash IS NOT NULL ORDER BY id",
  );

  for (const user of users) {
    if (user.login_pin_hash && (await bcrypt.compare(normalizedPin, user.login_pin_hash))) {
      return user;
    }
  }

  return null;
}

async function loginPinExists(connection, pin, excludedUserId = null) {
  const normalizedPin = String(pin || "").trim();
  if (!/^\d{4,10}$/.test(normalizedPin)) {
    return false;
  }

  const [users] = excludedUserId
    ? await connection.execute(
        "SELECT id, login_pin_hash FROM users WHERE login_pin_hash IS NOT NULL AND id <> ? ORDER BY id",
        [excludedUserId],
      )
    : await connection.execute("SELECT id, login_pin_hash FROM users WHERE login_pin_hash IS NOT NULL ORDER BY id");

  for (const user of users) {
    if (user.login_pin_hash && (await bcrypt.compare(normalizedPin, user.login_pin_hash))) {
      return true;
    }
  }

  return false;
}

app.use((req, res, next) => {
  const currentBrandMarkImage = appSettings.brandMarkImage() || null;
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.language = req.language;
  res.locals.locale = req.language;
  res.locals.theme = req.theme;
  res.locals.t = req.t;
  res.locals.availableLanguages = getSupportedLanguages();
  res.locals.brandMarkImage = currentBrandMarkImage;
  res.locals.brandMarkUrl = currentBrandMarkImage ? `/brand-mark?v=${encodeURIComponent(currentBrandMarkImage)}` : null;
  res.locals.appName = appSettings.appName();
  res.locals.appSubtitle = appSettings.appSubtitle();
  res.locals.softwareVersion = softwareVersion;
  res.locals.softwareAuthor = softwareAuthor;
  res.locals.duesDefaultAmount = duesDefaultAmount();
  res.locals.defaultLowStockThreshold = appSettings.defaultLowStockThreshold();
  res.locals.receiptPrefixBar = appSettings.receiptPrefixBar();
  res.locals.receiptPrefixMerchandising = appSettings.receiptPrefixMerchandising();
  res.locals.assetVersion = assetVersion;
  res.locals.money = createMoneyFormatter(req.language);
  res.locals.formatDate = createDateFormatter(req.language);
  res.locals.formatDateTime = createDateTimeFormatter(req.language);
  res.locals.makePercent = makePercent;
  delete req.session.flash;
  next();
});

app.use("/uploads", requireAuth, express.static(uploadDir));

const { deleteUpload, removeProductImages, saveProductImage, uploadProductImage } = createProductImageUpload({
  flash,
  pool,
  uploadDir,
});

function uploadMemberCsv(req, res, next) {
  memberCsvUpload.single("csv_file")(req, res, (error) => {
    if (error) {
      flash(req, "error", error.message);
      return res.redirect("/members");
    }

    return next();
  });
}

function uploadStatutesPdf(req, res, next) {
  statutesPdfUpload.single("statutes_pdf")(req, res, (error) => {
    if (error) {
      flash(req, "error", error.message);
      return res.redirect("/settings");
    }

    return next();
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function emailSettingsConfigured() {
  const settings = appSettings.smtpSettings();
  return Boolean(settings.smtpHost && settings.smtpPort && (settings.smtpFrom || settings.smtpUser));
}

function renderEmailTemplate(template, variables) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match,
  );
}

function statutesPdfAttachment() {
  const fileName = appSettings.statutesPdfFile();
  if (!fileName) {
    return null;
  }

  const safeName = path.basename(fileName);
  const filePath = path.join(uploadDir, safeName);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return {
    filename: "estatutos-motoclube.pdf",
    contentType: "application/pdf",
    content: fs.readFileSync(filePath),
  };
}

async function sendWelcomeEmailToMember(member, options = {}) {
  const enabled =
    Object.prototype.hasOwnProperty.call(options, "enabled") ? Boolean(options.enabled) : Boolean(appSettings.sendMemberWelcomeEmail());

  if (!enabled) {
    return { sent: false, reason: "disabled" };
  }

  if (!emailSettingsConfigured()) {
    return { sent: false, reason: "missing-email-settings" };
  }

  const attachment = statutesPdfAttachment();
  if (!attachment) {
    return { sent: false, reason: "missing-pdf" };
  }
  const templates = appSettings.emailTemplates();
  const variables = {
    appName: appSettings.appName(),
    memberEmail: member.email,
    memberName: member.name,
    memberNumber: member.memberNumber,
  };

  await sendEmail(appSettings.smtpSettings(), {
    to: member.email,
    subject: renderEmailTemplate(templates.memberWelcomeEmailSubject, variables),
    text: renderEmailTemplate(templates.memberWelcomeEmailBody, variables),
    attachments: [attachment],
  });

  return { sent: true };
}

async function sendDebtorEmail(member, year, expectedAmount) {
  const money = createMoneyFormatter("pt-PT");
  const paidTotal = Number(member.paid_total || 0);
  const due = Math.max(0, Number(expectedAmount || 0) - paidTotal);
  const templates = appSettings.emailTemplates();
  const variables = {
    appName: appSettings.appName(),
    dueAmount: money(due),
    expectedAmount: money(expectedAmount),
    memberEmail: member.email,
    memberName: member.name,
    memberNumber: member.member_number,
    paidTotal: money(paidTotal),
    year,
  };

  await sendEmail(appSettings.smtpSettings(), {
    to: member.email,
    subject: renderEmailTemplate(templates.debtorEmailSubject, variables),
    text: renderEmailTemplate(templates.debtorEmailBody, variables),
  });
}

async function getActiveCategories(scope = "bar") {
  const normalizedScope = scope === "merchandising" ? "merchandising" : "bar";
  try {
    const [categories] = await pool.execute("SELECT * FROM categories WHERE active = 1 AND scope = ? ORDER BY name", [normalizedScope]);
    return categories;
  } catch (error) {
    // Backwards compatibility: older DBs might not have `categories.scope` yet.
    if (error && (error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_PARSE_ERROR")) {
      const [categories] = await pool.execute("SELECT * FROM categories WHERE active = 1 ORDER BY name");
      return categories;
    }
    throw error;
  }
}

function productTypeLabel(type) {
  if (type === "merchandising") {
    return "Merchandising";
  }

  if (type === "bar") {
    return "Bar";
  }

  return "Produtos";
}

async function renderProductIndex(req, res, productType = null) {
  const employeeFilter = req.session.user.role === "employee" ? "AND p.active = 1" : "";
  const typeFilter = productType ? "AND p.product_type = ?" : "";
  const params = [];

  if (productType) {
    params.push(productType);
  }

  const [products] = await pool.execute(
    `SELECT p.*, c.name AS category_name, pi.file_name AS image_file
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
       WHERE p.deleted_at IS NULL ${employeeFilter} ${typeFilter}
       ORDER BY c.name ASC, p.name ASC`,
    params,
  );

  const sectionPaths = {
    bar: {
      newProductPath: "/bar-products/new",
      returnPath: "/bar-products",
      salePath: null,
    },
    merchandising: {
      newProductPath: "/merchandising/new",
      returnPath: "/merchandising",
      salePath: null,
    },
    default: {
      newProductPath: "/bar-products/new",
      returnPath: "/products",
      salePath: null,
    },
  };

  const paths = sectionPaths[productType] || sectionPaths.default;

  res.render("products/index", {
    title: productTypeLabel(productType),
    products,
    newProductPath: paths.newProductPath,
    returnPath: paths.returnPath,
    salePath: paths.salePath,
  });
}

async function renderProductForm(req, res, { title, product = null, image = null, action, productType = null, returnPath = "/products" }) {
  return res.render("products/form", {
    title,
    product,
    image,
    categories: await getActiveCategories(productType || (product ? product.product_type : "bar")),
    action,
    productType,
    returnPath,
  });
}

function buildProductFromRequest(req, fixedProductType = null) {
  return {
    categoryId: parseInteger(req.body.category_id),
    name: String(req.body.name || "").trim(),
    productType: fixedProductType || (Array.isArray(req.body.product_type) ? req.body.product_type[0] : req.body.product_type),
    size: String(req.body.size || "").trim() || null,
    shortDescription: String(req.body.short_description || "").trim(),
    referenceCode: String(req.body.reference_code || "").trim().toUpperCase(),
    price: parseNumber(req.body.price),
    stock: parseInteger(req.body.stock),
    lowStockThreshold: parseInteger(req.body.low_stock_threshold, appSettings.defaultLowStockThreshold()),
    active: req.body.active ? 1 : 0,
    availableForSale: req.body.available_for_sale ? 1 : 0,
  };
}

function dateFilters(query, alias = "s") {
  const filters = [];
  const params = [];

  if (query.start_date) {
    filters.push(`${alias}.created_at >= ?`);
    params.push(query.start_date);
  }

  if (query.end_date) {
    filters.push(`${alias}.created_at < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(query.end_date);
  }

  return {
    where: filters.length > 0 ? `AND ${filters.join(" AND ")}` : "",
    params,
  };
}

function reportItemFilters(filters) {
  const clauses = ["s.status = 'completed'"];
  const params = [];

  if (filters.startDate) {
    clauses.push("s.created_at >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    clauses.push("s.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(filters.endDate);
  }

  if (filters.paymentMethodId) {
    clauses.push("s.payment_method_id = ?");
    params.push(filters.paymentMethodId);
  }

  if (filters.userId) {
    clauses.push("s.user_id = ?");
    params.push(filters.userId);
  }

  if (filters.area !== "all") {
    clauses.push("p.product_type = ?");
    params.push(filters.area);
  }

  if (filters.categoryId) {
    clauses.push("p.category_id = ?");
    params.push(filters.categoryId);
  }

  return {
    where: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

function decorateReportRows(rows, valueKey = "total") {
  const max = Math.max(0, ...rows.map((row) => Number(row[valueKey] || 0)));
  return rows.map((row) => ({
    ...row,
    percent: makePercent(row[valueKey], max),
  }));
}

function reportExportLink(type, queryString) {
  return `/reports/export/${type}${queryString ? `?${queryString}` : ""}`;
}

function duesPaymentFilters(filters, alias = "mdp") {
  const clauses = [`${alias}.year = ?`, `${alias}.status = 'paid'`];
  const params = [filters.year];

  if (filters.startDate) {
    clauses.push(`${alias}.paid_at >= ?`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    clauses.push(`${alias}.paid_at < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(filters.endDate);
  }

  if (filters.paymentMethodId) {
    clauses.push(`${alias}.payment_method_id = ?`);
    params.push(filters.paymentMethodId);
  }

  return {
    where: clauses.join(" AND "),
    params,
  };
}

function memberSearchFilter(filters, alias = "m") {
  if (!filters.search) {
    return { where: "", params: [] };
  }

  return {
    where: `AND (${alias}.member_number LIKE ? OR ${alias}.name LIKE ?)`,
    params: [`%${filters.search}%`, `%${filters.search}%`],
  };
}

function duesExportLink(type, queryString) {
  return `/reports/dues/export/${type}${queryString ? `?${queryString}` : ""}`;
}

function stockProductFilters(filters) {
  const clauses = ["p.deleted_at IS NULL"];
  const params = [];

  if (filters.area !== "all") {
    clauses.push("p.product_type = ?");
    params.push(filters.area);
  }

  if (filters.categoryId) {
    clauses.push("p.category_id = ?");
    params.push(filters.categoryId);
  }

  if (filters.status === "low") {
    clauses.push("p.stock > 0 AND p.stock <= p.low_stock_threshold");
  } else if (filters.status === "out") {
    clauses.push("p.stock <= 0");
  } else if (filters.status === "ok") {
    clauses.push("p.stock > p.low_stock_threshold");
  }

  if (filters.search) {
    clauses.push("(p.name LIKE ? OR p.reference_code LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  return {
    where: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

function stockMovementFilters(filters) {
  const clauses = [];
  const params = [];

  if (filters.area !== "all") {
    clauses.push("p.product_type = ?");
    params.push(filters.area);
  }

  if (filters.categoryId) {
    clauses.push("p.category_id = ?");
    params.push(filters.categoryId);
  }

  if (filters.movementType !== "all") {
    clauses.push("sm.type = ?");
    params.push(filters.movementType);
  }

  if (filters.startDate) {
    clauses.push("sm.created_at >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    clauses.push("sm.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(filters.endDate);
  }

  if (filters.search) {
    clauses.push("(p.name LIKE ? OR p.reference_code LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function stockExportLink(type, queryString) {
  return `/stock/export/${type}${queryString ? `?${queryString}` : ""}`;
}

function merchReportFilters(filters) {
  const clauses = ["s.status = 'completed'", "p.product_type = 'merchandising'"];
  const params = [];

  if (filters.startDate) {
    clauses.push("s.created_at >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    clauses.push("s.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(filters.endDate);
  }

  if (filters.categoryId) {
    clauses.push("p.category_id = ?");
    params.push(filters.categoryId);
  }

  if (filters.paymentMethodId) {
    clauses.push("s.payment_method_id = ?");
    params.push(filters.paymentMethodId);
  }

  if (filters.userId) {
    clauses.push("s.user_id = ?");
    params.push(filters.userId);
  }

  if (filters.memberSearch) {
    clauses.push("(s.member_number LIKE ? OR s.member_name LIKE ?)");
    params.push(`%${filters.memberSearch}%`, `%${filters.memberSearch}%`);
  }

  if (filters.productSearch) {
    clauses.push("(p.name LIKE ? OR si.product_name LIKE ? OR p.reference_code LIKE ?)");
    params.push(`%${filters.productSearch}%`, `%${filters.productSearch}%`, `%${filters.productSearch}%`);
  }

  return {
    where: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

function merchExportLink(type, queryString) {
  return `/reports/merchandising/export/${type}${queryString ? `?${queryString}` : ""}`;
}

app.get("/", requireAuth, (req, res) => {
  res.redirect(req.session.user.role === "admin" ? "/dashboard" : "/home");
});

app.get(
  "/home",
  requireAuth,
  (req, res) => {
    if (req.session.user.role === "admin") {
      return res.redirect("/dashboard");
    }

    return res.render("home", { title: "Início" });
  },
);

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/");
  }

  return res.render("login", { title: "Entrar", layout: "auth-layout" });
});

app.post(
  "/login",
  asyncRoute(async (req, res) => {
    const identifier = String(req.body.identifier || "").trim();
    const password = String(req.body.password || "");
    const pin = String(req.body.pin || "").trim();

    let user = null;

    if (identifier || password) {
      const normalized = identifier.toLowerCase();
      const [users] = await pool.execute(
        "SELECT * FROM users WHERE active = 1 AND (LOWER(email) = ? OR LOWER(name) = ?)",
        [normalized, normalized],
      );
      const candidate = users[0];

      if (candidate && (await bcrypt.compare(password, candidate.password_hash))) {
        user = candidate;
      }
    }

    if (!user && pin) {
      user = await findUserByLoginPin(pool, pin);
    }

    if (!user) {
      flash(req, "error", "Credenciais inválidas.");
      return res.redirect("/login");
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return res.redirect("/");
  }),
);

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.post(
  "/language",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const locale = normalizeLanguage(req.body.language);
    await appSettings.update({ language: locale });
    const returnTo = String(req.body.return_to || "").trim();

    if (returnTo.startsWith("/")) {
      return res.redirect(returnTo);
    }

    return res.redirect(req.session.user ? "/" : "/login");
  }),
);

app.get("/brand-mark", (req, res) => {
  const { brandMarkImage } = appSettings.get();
  if (!brandMarkImage) {
    return res.status(404).end();
  }

  return res.sendFile(path.join(uploadDir, brandMarkImage), {
    etag: true,
    immutable: true,
    maxAge: "30d",
  });
});

app.get(
  "/settings",
  requireAdmin,
  asyncRoute(async (req, res) => {
    await registerSoftwareVersion();
    const [duesYears] = await pool.execute("SELECT * FROM dues_years ORDER BY year DESC");
    const softwareVersions = await listSoftwareVersions();
    res.render("settings", {
      title: "Configuração",
      brandMarkImage: appSettings.brandMarkImage() || null,
      appName: appSettings.appName(),
      appSubtitle: appSettings.appSubtitle(),
      defaultLowStockThreshold: appSettings.defaultLowStockThreshold(),
      receiptPrefixBar: appSettings.receiptPrefixBar(),
      receiptPrefixMerchandising: appSettings.receiptPrefixMerchandising(),
      duesDefaultAmount: duesDefaultAmount(),
      softwareVersions,
      duesYears,
    });
  }),
);

app.get(
  "/settings/email",
  requireAdmin,
  (req, res) => {
    const emailSettingsUnlocked = req.session.emailSettingsUnlocked === true;
    res.render("settings-email", {
      title: "Email",
      emailConfigured: emailSettingsConfigured(),
      emailSettings: emailSettingsUnlocked ? appSettings.smtpSettings() : null,
      emailSettingsUnlocked,
      emailTemplates: appSettings.emailTemplates(),
      sendMemberWelcomeEmail: appSettings.sendMemberWelcomeEmail(),
      statutesPdfFile: appSettings.statutesPdfFile(),
    });
  },
);

app.post(
  "/settings/app",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const name = String(req.body.app_name || "").trim();
    const subtitle = String(req.body.app_subtitle || "").trim();
    const threshold = parseInteger(req.body.default_low_stock_threshold, appSettings.defaultLowStockThreshold());
    const barPrefix = String(req.body.receipt_prefix_bar || "").trim().toUpperCase();
    const merchPrefix = String(req.body.receipt_prefix_merchandising || "").trim().toUpperCase();

    if (name && name.length > 40) {
      flash(req, "error", "O nome da aplicação é demasiado longo (máx. 40 caracteres).");
      return res.redirect("/settings");
    }

    if (subtitle && subtitle.length > 60) {
      flash(req, "error", "O subtítulo é demasiado longo (máx. 60 caracteres).");
      return res.redirect("/settings");
    }

    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 9999) {
      flash(req, "error", "Indique um valor válido para o alerta de stock baixo.");
      return res.redirect("/settings");
    }

    if (barPrefix && !/^[A-Z]{1,3}$/.test(barPrefix)) {
      flash(req, "error", "O prefixo de recibo (Bar) deve ter 1 a 3 letras (A-Z).");
      return res.redirect("/settings");
    }

    if (merchPrefix && !/^[A-Z]{1,3}$/.test(merchPrefix)) {
      flash(req, "error", "O prefixo de recibo (Merchandising) deve ter 1 a 3 letras (A-Z).");
      return res.redirect("/settings");
    }

    const currentSettings = appSettings.get();
    await appSettings.update({
      appName: name || currentSettings.appName,
      appSubtitle: subtitle || currentSettings.appSubtitle,
      defaultLowStockThreshold: threshold,
      receiptPrefixBar: barPrefix || currentSettings.receiptPrefixBar,
      receiptPrefixMerchandising: merchPrefix || currentSettings.receiptPrefixMerchandising,
    });
    flash(req, "success", "Configuração atualizada.");
    return res.redirect("/settings");
  }),
);

app.post(
  "/settings/cancel-pin",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const pin = String(req.body.cancel_pin || "").trim();
    if (!/^\d{4,10}$/.test(pin)) {
      flash(req, "error", "O PIN deve ter entre 4 e 10 dígitos.");
      return res.redirect("/settings");
    }

    const hash = await bcrypt.hash(pin, 12);
    await pool.execute("UPDATE users SET cancel_pin_hash = ? WHERE id = ? AND role = 'admin'", [hash, req.session.user.id]);
    flash(req, "success", "PIN de cancelamento atualizado.");
    return res.redirect("/settings");
  }),
);

app.post(
  "/settings/branding",
  requireAdmin,
  uploadProductImage,
  asyncRoute(async (req, res) => {
    if (!req.file) {
      flash(req, "error", "Selecione uma imagem para atualizar o logótipo.");
      return res.redirect("/settings");
    }

    const currentSettings = appSettings.get();
    if (currentSettings.brandMarkImage) {
      deleteUpload(currentSettings.brandMarkImage);
    }

    await appSettings.update({ brandMarkImage: req.file.filename });
    flash(req, "success", "Logótipo atualizado com sucesso.");
    return res.redirect("/settings");
  }),
);

app.post(
  "/settings/email/unlock",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const password = String(req.body.admin_password || "");
    const [[adminUser]] = await pool.execute("SELECT password_hash FROM users WHERE id = ? AND role = 'admin' AND active = 1", [
      req.session.user.id,
    ]);

    if (!adminUser || !(await bcrypt.compare(password, adminUser.password_hash))) {
      flash(req, "error", "Password de administrador inválida.");
      return res.redirect("/settings/email");
    }

    req.session.emailSettingsUnlocked = true;
    flash(req, "success", "Configurações de envio desbloqueadas.");
    return res.redirect("/settings/email");
  }),
);

app.post(
  "/settings/email/lock",
  requireAdmin,
  (req, res) => {
    req.session.emailSettingsUnlocked = false;
    flash(req, "success", "Configurações de envio ocultadas.");
    return res.redirect("/settings/email");
  },
);

app.post(
  "/settings/email/server",
  requireAdmin,
  asyncRoute(async (req, res) => {
    if (req.session.emailSettingsUnlocked !== true) {
      flash(req, "error", "Confirme a password de administrador para alterar as configurações de envio.");
      return res.redirect("/settings/email");
    }

    const currentSettings = appSettings.get();
    const smtpHost = String(req.body.smtp_host || "").trim();
    const smtpPort = parseInteger(req.body.smtp_port, 587);
    const smtpFrom = String(req.body.smtp_from || "").trim().toLowerCase();
    const smtpUser = String(req.body.smtp_user || "").trim();
    const smtpPass = String(req.body.smtp_pass || "");

    if (smtpHost && (!smtpPort || smtpPort < 1 || smtpPort > 65535)) {
      flash(req, "error", "Indique uma porta SMTP válida.");
      return res.redirect("/settings/email");
    }

    if (smtpFrom && !isValidEmail(smtpFrom)) {
      flash(req, "error", "Indique um email de envio válido.");
      return res.redirect("/settings/email");
    }

    await appSettings.update({
      sendMemberWelcomeEmail: req.body.send_member_welcome_email ? 1 : 0,
      smtpFrom,
      smtpHost,
      smtpPass: smtpPass || currentSettings.smtpPass || "",
      smtpPort,
      smtpSecure: req.body.smtp_secure ? 1 : 0,
      smtpUser,
    });

    flash(req, "success", "Configuração de email atualizada.");
    return res.redirect("/settings/email");
  }),
);

app.post(
  "/settings/email/templates",
  requireAdmin,
  asyncRoute(async (req, res) => {
    await appSettings.update({
      debtorEmailBody: String(req.body.debtor_email_body || "").trim(),
      debtorEmailSubject: String(req.body.debtor_email_subject || "").trim(),
      memberWelcomeEmailBody: String(req.body.member_welcome_email_body || "").trim(),
      memberWelcomeEmailSubject: String(req.body.member_welcome_email_subject || "").trim(),
    });

    flash(req, "success", "Textos dos emails atualizados.");
    return res.redirect("/settings/email");
  }),
);

app.post(
  "/settings/statutes-pdf",
  requireAdmin,
  uploadStatutesPdf,
  asyncRoute(async (req, res) => {
    if (!req.file) {
      flash(req, "error", "Selecione o PDF dos estatutos.");
      return res.redirect("/settings/email");
    }

    const currentFile = appSettings.statutesPdfFile();
    if (currentFile) {
      deleteUpload(currentFile);
    }

    await appSettings.update({ statutesPdfFile: req.file.filename });
    flash(req, "success", "PDF dos estatutos atualizado.");
    return res.redirect("/settings/email");
  }),
);

app.post(
  "/settings/dues",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const amount = parseNumber(req.body.dues_default_amount, 0);
    if (!Number.isFinite(amount) || amount < 0) {
      flash(req, "error", "Indique um valor válido.");
      return res.redirect("/settings");
    }

    await appSettings.update({ duesDefaultAmount: amount });
    flash(req, "success", "Valor default da cota atualizado.");
    return res.redirect("/settings");
  }),
);

app.post(
  "/settings/dues/year",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const year = parseInteger(req.body.year, currentYear());
    const amount = parseNumber(req.body.amount, 0);

    if (!year || year < 2000 || year > 2100 || !Number.isFinite(amount) || amount <= 0) {
      flash(req, "error", "Indique ano e valor válidos.");
      return res.redirect("/settings");
    }

    await pool.execute(
      `INSERT INTO dues_years (year, amount)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), updated_at = CURRENT_TIMESTAMP`,
      [year, amount],
    );

    flash(req, "success", "Valor da cota atualizado para o ano indicado.");
    return res.redirect("/settings");
  }),
);

app.get(
  "/dashboard",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const [[stats]] = await pool.execute(
      `SELECT COUNT(*) AS sales_count, COALESCE(SUM(total_amount), 0) AS total_amount
       FROM sales
       WHERE status = 'completed'
         AND created_at >= CURDATE()
         AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    );
    const [topProducts] = await pool.execute(
      `SELECT si.product_name, SUM(si.quantity) AS quantity, SUM(si.line_total) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'completed'
         AND s.created_at >= CURDATE()
         AND s.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       GROUP BY si.product_name
       ORDER BY quantity DESC
       LIMIT 5`,
    );
    const [lowStock] = await pool.execute(
      `SELECT p.*, c.name AS category_name
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.stock <= p.low_stock_threshold
       ORDER BY p.stock ASC, p.name ASC
       LIMIT 8`,
    );

    res.render("dashboard", {
      title: "Dashboard",
      stats,
      topProducts,
      lowStock,
    });
  }),
);

app.get(
  "/products",
  requireAuth,
  asyncRoute(async (req, res) => renderProductIndex(req, res, null)),
);

app.get(
  "/bar-products",
  requireAuth,
  asyncRoute(async (req, res) => renderProductIndex(req, res, "bar")),
);

app.get(
  "/merchandising",
  requireAuth,
  asyncRoute(async (req, res) => renderProductIndex(req, res, "merchandising")),
);

app.get(
  "/products/new",
  requireAdmin,
  (req, res) => {
    res.redirect("/bar-products/new");
  },
);

app.get(
  "/bar-products/new",
  requireAdmin,
  asyncRoute(async (req, res) => {
    return renderProductForm(req, res, {
      title: "Novo produto de Bar",
      product: null,
      image: null,
      action: "/bar-products",
      productType: "bar",
      returnPath: "/bar-products",
    });
  }),
);

app.post(
  "/bar-products",
  requireAdmin,
  uploadProductImage,
  asyncRoute(async (req, res) => {
    const product = buildProductFromRequest(req, "bar");

    if (!product.categoryId || !product.name || !product.referenceCode || product.price < 0) {
      if (req.file) {
        deleteUpload(req.file.filename);
      }
      flash(req, "error", "Preencha os campos obrigatorios do produto.");
      return res.redirect("/bar-products/new");
    }

    const [result] = await pool.execute(
      `INSERT INTO products
        (category_id, name, product_type, size, short_description, reference_code, price, stock, low_stock_threshold, active, available_for_sale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.categoryId,
        product.name,
        product.productType,
        product.size,
        product.shortDescription,
        product.referenceCode,
        product.price,
        product.stock,
        product.lowStockThreshold,
        product.active,
        product.availableForSale,
      ],
    );

    if (req.file) {
      await saveProductImage(result.insertId, req.file);
    }

    if (product.stock !== 0) {
      await pool.execute(
        `INSERT INTO stock_movements
          (product_id, user_id, type, quantity_change, quantity_before, quantity_after, reason)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [
          result.insertId,
          req.session.user.id,
          product.stock > 0 ? "entry" : "manual_adjustment",
          product.stock,
          product.stock,
          "Stock inicial",
        ],
      );
    }

    flash(req, "success", "Produto criado com sucesso.");
    return res.redirect("/bar-products");
  }),
);

app.get(
  "/merchandising/new",
  requireAdmin,
  asyncRoute(async (req, res) => {
    return renderProductForm(req, res, {
      title: "Novo produto de Merchandising",
      product: null,
      image: null,
      action: "/merchandising",
      productType: "merchandising",
      returnPath: "/merchandising",
    });
  }),
);

app.post(
  "/merchandising",
  requireAdmin,
  uploadProductImage,
  asyncRoute(async (req, res) => {
    const product = buildProductFromRequest(req, "merchandising");

    if (!product.categoryId || !product.name || !product.referenceCode || product.price < 0 || !product.size) {
      if (req.file) {
        deleteUpload(req.file.filename);
      }
      flash(req, "error", "Preencha os campos obrigatorios do produto (inclui tamanho).");
      return res.redirect("/merchandising/new");
    }

    const [result] = await pool.execute(
      `INSERT INTO products
        (category_id, name, product_type, size, short_description, reference_code, price, stock, low_stock_threshold, active, available_for_sale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.categoryId,
        product.name,
        product.productType,
        product.size,
        product.shortDescription,
        product.referenceCode,
        product.price,
        product.stock,
        product.lowStockThreshold,
        product.active,
        product.availableForSale,
      ],
    );

    if (req.file) {
      await saveProductImage(result.insertId, req.file);
    }

    if (product.stock !== 0) {
      await pool.execute(
        `INSERT INTO stock_movements
          (product_id, user_id, type, quantity_change, quantity_before, quantity_after, reason)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [
          result.insertId,
          req.session.user.id,
          product.stock > 0 ? "entry" : "manual_adjustment",
          product.stock,
          product.stock,
          "Stock inicial",
        ],
      );
    }

    flash(req, "success", "Produto criado com sucesso.");
    return res.redirect("/merchandising");
  }),
);

app.get(
  "/products/:id/edit",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const [products] = await pool.execute("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
    const product = products[0];

    if (!product) {
      return res.status(404).render("error", { title: "Produto não encontrado", message: "O produto indicado não existe." });
    }

    const [images] = await pool.execute("SELECT * FROM product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1", [
      product.id,
    ]);

    return res.render("products/form", {
      title: "Editar produto",
      product,
      image: images[0] || null,
      categories: await getActiveCategories(product.product_type),
      action: `/products/${product.id}`,
      productType: null,
      returnPath: product.product_type === "merchandising" ? "/merchandising" : "/bar-products",
    });
  }),
);

app.post(
  "/products/:id",
  requireAdmin,
  uploadProductImage,
  asyncRoute(async (req, res) => {
    const productId = parseInteger(req.params.id);
    const product = {
      categoryId: parseInteger(req.body.category_id),
      name: String(req.body.name || "").trim(),
      productType: ["bar", "merchandising"].includes(req.body.product_type) ? req.body.product_type : "bar",
      size: String(req.body.size || "").trim() || null,
      shortDescription: String(req.body.short_description || "").trim(),
      referenceCode: String(req.body.reference_code || "").trim().toUpperCase(),
      price: parseNumber(req.body.price),
      stock: parseInteger(req.body.stock),
      lowStockThreshold: parseInteger(req.body.low_stock_threshold, 5),
      active: req.body.active ? 1 : 0,
      availableForSale: req.body.available_for_sale ? 1 : 0,
    };

    if (
      !product.categoryId ||
      !product.name ||
      !product.referenceCode ||
      product.price < 0 ||
      (product.productType === "merchandising" && !product.size)
    ) {
      if (req.file) {
        deleteUpload(req.file.filename);
      }
      flash(req, "error", "Preencha os campos obrigatorios do produto.");
      return res.redirect(`/products/${productId}/edit`);
    }

    const [[currentProduct]] = await pool.execute("SELECT stock FROM products WHERE id = ? AND deleted_at IS NULL", [productId]);

    if (!currentProduct) {
      if (req.file) {
        deleteUpload(req.file.filename);
      }
      return res.status(404).render("error", { title: "Produto não encontrado", message: "O produto indicado não existe." });
    }

    await pool.execute(
      `UPDATE products
       SET category_id = ?, name = ?, product_type = ?, size = ?, short_description = ?, reference_code = ?, price = ?,
           stock = ?, low_stock_threshold = ?, active = ?, available_for_sale = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        product.categoryId,
        product.name,
        product.productType,
        product.size,
        product.shortDescription,
        product.referenceCode,
        product.price,
        product.stock,
        product.lowStockThreshold,
        product.active,
        product.availableForSale,
        productId,
      ],
    );

    if (currentProduct.stock !== product.stock) {
      await pool.execute(
        `INSERT INTO stock_movements
          (product_id, user_id, type, quantity_change, quantity_before, quantity_after, reason)
         VALUES (?, ?, 'manual_adjustment', ?, ?, ?, ?)`,
        [
          productId,
          req.session.user.id,
          product.stock - currentProduct.stock,
          currentProduct.stock,
          product.stock,
          "Correção manual na ficha do produto",
        ],
      );
    }

    if (req.body.remove_image === "1") {
      await removeProductImages(productId);
    }

    if (req.file) {
      await saveProductImage(productId, req.file);
    }

    flash(req, "success", "Produto atualizado com sucesso.");
    return res.redirect("/products");
  }),
);

app.post(
  "/products/:id/delete",
  requireAdmin,
  asyncRoute(async (req, res) => {
    await pool.execute("UPDATE products SET deleted_at = NOW(), active = 0, available_for_sale = 0 WHERE id = ?", [req.params.id]);
    flash(req, "success", "Produto removido da listagem.");
    res.redirect("/products");
  }),
);

app.get(
  "/categories",
  requireAdmin,
  (req, res) => res.redirect("/categories/bar"),
);

async function renderCategories(req, res, scope) {
  const normalizedScope = scope === "merchandising" ? "merchandising" : "bar";

  const [categories] = await pool.execute(
    `SELECT c.*, COUNT(p.id) AS product_count
     FROM categories c
     LEFT JOIN products p
       ON p.category_id = c.id AND p.deleted_at IS NULL AND p.product_type = ?
     WHERE c.scope = ?
     GROUP BY c.id
     ORDER BY c.name`,
    [normalizedScope, normalizedScope],
  );

  res.render(normalizedScope === "merchandising" ? "categories-merchandising" : "categories-bar", { title: "Categorias", categories });
}

app.get(
  "/categories/bar",
  requireAdmin,
  asyncRoute(async (req, res) => renderCategories(req, res, "bar")),
);

app.get(
  "/categories/merchandising",
  requireAdmin,
  asyncRoute(async (req, res) => renderCategories(req, res, "merchandising")),
);

app.post(
  "/categories",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const scope = req.body.scope === "merchandising" ? "merchandising" : "bar";

    if (!name) {
      flash(req, "error", "Indique o nome da categoria.");
      return res.redirect(scope === "merchandising" ? "/categories/merchandising" : "/categories/bar");
    }

    await pool.execute("INSERT INTO categories (name, description, scope, active) VALUES (?, ?, ?, 1)", [name, description, scope]);
    flash(req, "success", "Categoria criada.");
    return res.redirect(scope === "merchandising" ? "/categories/merchandising" : "/categories/bar");
  }),
);

app.post(
  "/categories/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const active = req.body.active ? 1 : 0;
    const scope = req.body.scope === "merchandising" ? "merchandising" : "bar";

    if (!name) {
      flash(req, "error", "Indique o nome da categoria.");
      return res.redirect(scope === "merchandising" ? "/categories/merchandising" : "/categories/bar");
    }

    await pool.execute("UPDATE categories SET name = ?, description = ?, scope = ?, active = ? WHERE id = ?", [
      name,
      description,
      scope,
      active,
      req.params.id,
    ]);
    flash(req, "success", "Categoria atualizada.");
    return res.redirect(scope === "merchandising" ? "/categories/merchandising" : "/categories/bar");
  }),
);

app.post(
  "/categories/:id/delete",
  requireAdmin,
  asyncRoute(async (req, res) => {
    await pool.execute("UPDATE categories SET active = 0 WHERE id = ?", [req.params.id]);
    flash(req, "success", "Categoria inativada.");
    res.redirect(req.get("Referrer") || "/categories/bar");
  }),
);

async function renderStock(req, res, defaults = {}) {
  const filters = normalizeStockReportFilters(req.query, defaults);
  const queryString = preserveStockReportQuery(filters);
  const productFilters = stockProductFilters(filters);
  const movementFilters = stockMovementFilters(filters);
  const movementAction = filters.area === "merchandising" ? "/stock/merchandising/movements" : "/stock/movements";

  const [categories] = await pool.execute(
    `SELECT id, name, scope
     FROM categories
     WHERE active = 1 ${filters.area !== "all" ? "AND scope = ?" : ""}
     ORDER BY scope, name`,
    filters.area !== "all" ? [filters.area] : [],
  );

  const [products] = await pool.execute(
    `SELECT p.*, c.name AS category_name,
            CASE
              WHEN p.stock <= 0 THEN 'out'
              WHEN p.stock <= p.low_stock_threshold THEN 'low'
              ELSE 'ok'
            END AS stock_status,
            (p.stock * p.price) AS stock_value
     FROM products p
     INNER JOIN categories c ON c.id = p.category_id
     ${productFilters.where}
     ORDER BY (p.stock <= 0) DESC, (p.stock <= p.low_stock_threshold) DESC, p.name ASC`,
    productFilters.params,
  );

  const [movements] = await pool.execute(
    `SELECT sm.*, p.name AS product_name, p.product_type, u.name AS user_name
     FROM stock_movements sm
     LEFT JOIN products p ON p.id = sm.product_id
     INNER JOIN users u ON u.id = sm.user_id
     ${movementFilters.where}
     ORDER BY sm.created_at DESC
     LIMIT 200`,
    movementFilters.params,
  );

  const [[summary]] = await pool.execute(
    `SELECT
       COUNT(*) AS products_count,
       SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END) AS out_count,
       SUM(CASE WHEN p.stock > 0 AND p.stock <= p.low_stock_threshold THEN 1 ELSE 0 END) AS low_count,
       COALESCE(SUM(p.stock), 0) AS total_units,
       COALESCE(SUM(p.stock * p.price), 0) AS stock_value
     FROM products p
     ${productFilters.where}`,
    productFilters.params,
  );

  const [movementByType] = await pool.execute(
    `SELECT sm.type, COUNT(*) AS movements_count, COALESCE(SUM(ABS(sm.quantity_change)), 0) AS units
     FROM stock_movements sm
     LEFT JOIN products p ON p.id = sm.product_id
     ${movementFilters.where}
     GROUP BY sm.type
     ORDER BY units DESC`,
    movementFilters.params,
  );

  const lowStock = products.filter((product) => product.stock_status !== "ok").slice(0, 12);
  const maxShortage = Math.max(
    0,
    ...lowStock.map((product) => Math.max(0, Number(product.low_stock_threshold || 0) - Number(product.stock || 0))),
  );
  const lowStockRank = lowStock.map((product) => {
    const shortage = Math.max(0, Number(product.low_stock_threshold || 0) - Number(product.stock || 0));
    return {
      ...product,
      shortage,
      percent: makePercent(shortage || 1, maxShortage || 1),
    };
  });

  res.render("stock", {
    title: filters.area === "merchandising" ? "Stock Merchandising" : "Stock",
    filters,
    queryString,
    categories,
    exportLink: (type) => stockExportLink(type, queryString),
    movementAction,
    products,
    movements,
    summary,
    movementByType: decorateReportRows(movementByType, "units"),
    lowStockRank,
  });
}

app.get(
  "/stock",
  requireAdmin,
  asyncRoute(async (req, res) => renderStock(req, res)),
);

app.get(
  "/stock/merchandising",
  requireAdmin,
  asyncRoute(async (req, res) => renderStock(req, res, { area: "merchandising" })),
);

async function handleStockMovement(req, res, options = {}) {
  const productId = parseInteger(req.body.product_id);
  const type = String(req.body.type || "");
  const quantityInput = parseInteger(req.body.quantity);
  const reason = String(req.body.reason || "").trim();
  const allowedTypes = ["entry", "manual_adjustment", "waste"];
  const returnPath = options.returnPath || "/stock";

  if (!productId || !allowedTypes.includes(type) || quantityInput === 0) {
    flash(req, "error", "Indique produto, tipo e quantidade.");
    return res.redirect(returnPath);
  }

  const delta = type === "entry" ? Math.abs(quantityInput) : type === "waste" ? -Math.abs(quantityInput) : quantityInput;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const typeFilter = options.productType ? "AND product_type = ?" : "";
    const params = options.productType ? [productId, options.productType] : [productId];
    const [[product]] = await connection.execute(
      `SELECT id, stock FROM products WHERE id = ? AND deleted_at IS NULL ${typeFilter} FOR UPDATE`,
      params,
    );

    if (!product) {
      throw new Error("Produto não encontrado.");
    }

    const quantityBefore = product.stock;
    const quantityAfter = quantityBefore + delta;

    await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [quantityAfter, productId]);
    await connection.execute(
      `INSERT INTO stock_movements
        (product_id, user_id, type, quantity_change, quantity_before, quantity_after, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [productId, req.session.user.id, type, delta, quantityBefore, quantityAfter, reason],
    );
    await connection.commit();
    flash(req, "success", "Movimento de stock registado.");
  } catch (error) {
    await connection.rollback();
    flash(req, "error", error.message);
  } finally {
    connection.release();
  }

  return res.redirect(returnPath);
}

app.post(
  "/stock/movements",
  requireAdmin,
  asyncRoute(async (req, res) => handleStockMovement(req, res, { returnPath: "/stock" })),
);

app.post(
  "/stock/merchandising/movements",
  requireAdmin,
  asyncRoute(async (req, res) => handleStockMovement(req, res, { returnPath: "/stock/merchandising", productType: "merchandising" })),
);

app.get(
  "/stock/export/:type",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = normalizeStockReportFilters(req.query);
    const productFilters = stockProductFilters(filters);
    const movementFilters = stockMovementFilters(filters);
    const type = String(req.params.type || "");
    const exports = {
      products: {
        filename: "stock-produtos.csv",
        columns: [
          { key: "name", label: "Produto" },
          { key: "reference_code", label: "Referencia" },
          { key: "product_type", label: "Area" },
          { key: "category_name", label: "Categoria" },
          { key: "stock", label: "Stock" },
          { key: "low_stock_threshold", label: "Alerta" },
          { key: "price", label: "Preco" },
          { key: "stock_value", label: "Valor stock" },
        ],
        sql: `SELECT p.name, p.reference_code, p.product_type, c.name AS category_name,
                     p.stock, p.low_stock_threshold, p.price, (p.stock * p.price) AS stock_value
              FROM products p
              INNER JOIN categories c ON c.id = p.category_id
              ${productFilters.where}
              ORDER BY p.name ASC`,
        params: productFilters.params,
      },
      movements: {
        filename: "stock-movimentos.csv",
        columns: [
          { key: "created_at", label: "Data" },
          { key: "product_name", label: "Produto" },
          { key: "type", label: "Tipo" },
          { key: "quantity_change", label: "Movimento" },
          { key: "quantity_before", label: "Antes" },
          { key: "quantity_after", label: "Depois" },
          { key: "user_name", label: "Utilizador" },
          { key: "reason", label: "Motivo" },
        ],
        sql: `SELECT sm.created_at, p.name AS product_name, sm.type, sm.quantity_change,
                     sm.quantity_before, sm.quantity_after, u.name AS user_name, sm.reason
              FROM stock_movements sm
              LEFT JOIN products p ON p.id = sm.product_id
              INNER JOIN users u ON u.id = sm.user_id
              ${movementFilters.where}
              ORDER BY sm.created_at DESC`,
        params: movementFilters.params,
      },
    };

    const definition = exports[type];
    if (!definition) {
      return res.redirect("/stock");
    }

    const [rows] = await pool.execute(definition.sql, definition.params);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${definition.filename}"`);
    return res.send(rowsToCsv(definition.columns, rows));
  }),
);

app.get(
  "/tables",
  requireAuth,
  asyncRoute(async (req, res) => {
    const adminFilter = req.session.user.role === "admin" ? "" : "WHERE bt.active = 1";
    const [tables] = await pool.execute(
      `SELECT bt.*, open_orders.id AS order_id, open_orders.opened_at, open_orders.user_name,
              COALESCE(order_totals.total_amount, 0) AS total_amount,
              COALESCE(order_totals.items_count, 0) AS items_count
       FROM bar_tables bt
       LEFT JOIN (
        SELECT table_orders.id, table_orders.table_id, table_orders.opened_at, users.name AS user_name
        FROM table_orders
        INNER JOIN users ON users.id = table_orders.user_id
        WHERE table_orders.status = 'open'
       ) open_orders ON open_orders.table_id = bt.id
       LEFT JOIN (
        SELECT table_order_id, SUM(quantity * unit_price) AS total_amount, SUM(quantity) AS items_count
        FROM table_order_items
        GROUP BY table_order_id
       ) order_totals ON order_totals.table_order_id = open_orders.id
       ${adminFilter}
       ORDER BY bt.active DESC, bt.name ASC`,
    );

    res.render("tables/index", { title: "Mesas", tables });
  }),
);

app.post(
  "/tables",
  requireAuth,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const location = String(req.body.location || "").trim();
    const capacity = Math.max(1, parseInteger(req.body.capacity, 4));

    if (!name) {
      flash(req, "error", "Indique o nome da mesa.");
      return res.redirect("/tables");
    }

    await pool.execute("INSERT INTO bar_tables (name, location, capacity, active) VALUES (?, ?, ?, 1)", [
      name,
      location,
      capacity,
    ]);
    flash(req, "success", "Mesa criada.");
    return res.redirect("/tables");
  }),
);

app.post(
  "/tables/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const tableId = parseInteger(req.params.id);
    const name = String(req.body.name || "").trim();
    const location = String(req.body.location || "").trim();
    const capacity = Math.max(1, parseInteger(req.body.capacity, 4));
    const active = req.body.active ? 1 : 0;

    if (!name) {
      flash(req, "error", "Indique o nome da mesa.");
      return res.redirect("/tables");
    }

    const [[openOrder]] = await pool.execute("SELECT id FROM table_orders WHERE table_id = ? AND status = 'open' LIMIT 1", [
      tableId,
    ]);

    if (openOrder && !active) {
      flash(req, "error", "Não pode inativar uma mesa com conta aberta.");
      return res.redirect("/tables");
    }

    await pool.execute("UPDATE bar_tables SET name = ?, location = ?, capacity = ?, active = ? WHERE id = ?", [
      name,
      location,
      capacity,
      active,
      tableId,
    ]);
    flash(req, "success", "Mesa atualizada.");
    return res.redirect("/tables");
  }),
);

app.post(
  "/tables/:id/open",
  requireAuth,
  asyncRoute(async (req, res) => {
    const tableId = parseInteger(req.params.id);
    const [[table]] = await pool.execute("SELECT id FROM bar_tables WHERE id = ? AND active = 1", [tableId]);

    if (!table) {
      flash(req, "error", "Mesa não encontrada ou inativa.");
      return res.redirect("/tables");
    }

    const [[openOrder]] = await pool.execute("SELECT id FROM table_orders WHERE table_id = ? AND status = 'open' LIMIT 1", [
      tableId,
    ]);

    if (!openOrder) {
      await pool.execute("INSERT INTO table_orders (table_id, user_id, status) VALUES (?, ?, 'open')", [
        tableId,
        req.session.user.id,
      ]);
    }

    return res.redirect(`/tables/${tableId}`);
  }),
);

app.get(
  "/tables/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const tableId = parseInteger(req.params.id);
    const [tables] = await pool.execute("SELECT * FROM bar_tables WHERE id = ? AND active = 1", [tableId]);
    const table = tables[0];

    if (!table) {
      flash(req, "error", "Mesa não encontrada ou inativa.");
      return res.redirect("/tables");
    }

    const [orders] = await pool.execute(
      `SELECT table_orders.*, users.name AS user_name
       FROM table_orders
       INNER JOIN users ON users.id = table_orders.user_id
       WHERE table_orders.table_id = ? AND table_orders.status = 'open'
       LIMIT 1`,
      [tableId],
    );
    const order = orders[0];

    if (!order) {
      flash(req, "error", "Abra a mesa antes de adicionar produtos.");
      return res.redirect("/tables");
    }

    const [items] = await pool.execute(
      `SELECT *, quantity * unit_price AS line_total
       FROM table_order_items
       WHERE table_order_id = ?
       ORDER BY created_at ASC, id ASC`,
      [order.id],
    );
    const categories = await getActiveCategories("bar");
    const [products] = await pool.execute(
      `SELECT p.*, c.name AS category_name, pi.file_name AS image_file
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.available_for_sale = 1 AND p.product_type = 'bar'
       ORDER BY c.name ASC, p.name ASC`,
    );
    const activePaymentMethods = await paymentMethods.getActivePaymentMethods();
    const cashMethodId = await paymentMethods.getCashPaymentMethodId();
    const total = items.reduce((sum, item) => sum + Number(item.line_total), 0);

    return res.render("tables/show", {
      title: table.name,
      table,
      order,
      items,
      total,
      categories,
      products,
      paymentMethods: activePaymentMethods,
      cashMethodId,
    });
  }),
);

app.post(
  "/tables/orders/:orderId/items",
  requireAuth,
  asyncRoute(async (req, res) => {
    const orderId = parseInteger(req.params.orderId);
    const productId = parseInteger(req.body.product_id);
    const quantity = Math.max(1, parseInteger(req.body.quantity, 1));
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [[order]] = await connection.execute("SELECT * FROM table_orders WHERE id = ? AND status = 'open' FOR UPDATE", [
        orderId,
      ]);

      if (!order) {
        throw new Error(req.t("Conta de mesa não encontrada."));
      }

      const [[product]] = await connection.execute(
        `SELECT id, name, price, stock
         FROM products
         WHERE id = ? AND deleted_at IS NULL AND active = 1 AND available_for_sale = 1`,
        [productId],
      );

      if (!product) {
        throw new Error(req.t("Produto indisponível."));
      }

      const [[existingItem]] = await connection.execute(
        "SELECT id, quantity FROM table_order_items WHERE table_order_id = ? AND product_id = ? FOR UPDATE",
        [orderId, productId],
      );
      const nextQuantity = (existingItem ? existingItem.quantity : 0) + quantity;

      if (existingItem) {
        await connection.execute("UPDATE table_order_items SET quantity = ? WHERE id = ?", [nextQuantity, existingItem.id]);
      } else {
        await connection.execute(
          `INSERT INTO table_order_items (table_order_id, product_id, product_name, unit_price, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, product.id, product.name, product.price, quantity],
        );
      }

      await connection.commit();
      return res.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: error.message });
    } finally {
      connection.release();
    }
  }),
);

app.post(
  "/tables/orders/:orderId/items/:itemId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const orderId = parseInteger(req.params.orderId);
    const itemId = parseInteger(req.params.itemId);
    const quantity = parseInteger(req.body.quantity);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [[order]] = await connection.execute("SELECT id FROM table_orders WHERE id = ? AND status = 'open' FOR UPDATE", [
        orderId,
      ]);

      if (!order) {
        throw new Error(req.t("Conta de mesa não encontrada."));
      }

      const [[item]] = await connection.execute(
        `SELECT toi.*, p.stock
         FROM table_order_items toi
         LEFT JOIN products p ON p.id = toi.product_id
         WHERE toi.id = ? AND toi.table_order_id = ?
         FOR UPDATE`,
        [itemId, orderId],
      );

      if (!item) {
        throw new Error(req.t("Produto não encontrado na mesa."));
      }

      if (quantity <= 0) {
        await connection.execute("DELETE FROM table_order_items WHERE id = ?", [itemId]);
      } else {
        await connection.execute("UPDATE table_order_items SET quantity = ? WHERE id = ?", [quantity, itemId]);
      }

      await connection.commit();
      return res.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: error.message });
    } finally {
      connection.release();
    }
  }),
);

app.post(
  "/tables/orders/:orderId/cancel",
  requireAuth,
  asyncRoute(async (req, res) => {
    const orderId = parseInteger(req.params.orderId);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [[order]] = await connection.execute("SELECT * FROM table_orders WHERE id = ? AND status = 'open' FOR UPDATE", [
        orderId,
      ]);

      if (!order) {
        throw new Error(req.t("Conta de mesa não encontrada."));
      }

      await connection.execute("UPDATE table_orders SET status = 'cancelled', closed_at = NOW() WHERE id = ?", [orderId]);
      await connection.commit();
      flash(req, "success", "Mesa cancelada.");
      return res.redirect("/tables");
    } catch (error) {
      await connection.rollback();
      flash(req, "error", error.message);
      return res.redirect("/tables");
    } finally {
      connection.release();
    }
  }),
);

app.post(
  "/tables/orders/:orderId/close",
  requireAuth,
  asyncRoute(async (req, res) => {
    const orderId = parseInteger(req.params.orderId);
    const paymentMethodId = parseInteger(req.body.payment_method_id);
    const memberNumber = String(req.body.member_number || "").trim() || null;
    const memberName = String(req.body.member_name || "").trim() || null;
    const cashReceived = req.body.cash_received ? parseFloat(req.body.cash_received) : null;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [[order]] = await connection.execute(
        `SELECT table_orders.*, bar_tables.name AS table_name
         FROM table_orders
         INNER JOIN bar_tables ON bar_tables.id = table_orders.table_id
         WHERE table_orders.id = ? AND table_orders.status = 'open'
         FOR UPDATE`,
        [orderId],
      );

      if (!order) {
        throw new Error(req.t("Conta de mesa não encontrada."));
      }

      const [[paymentMethod]] = await connection.execute("SELECT id, code FROM payment_methods WHERE id = ? AND active = 1", [
        paymentMethodId,
      ]);

      if (!paymentMethod) {
        throw new Error(req.t("Método de pagamento inválido."));
      }

      const isCash = paymentMethod.code === "cash";

      const [items] = await connection.execute(
        "SELECT * FROM table_order_items WHERE table_order_id = ? ORDER BY id FOR UPDATE",
        [orderId],
      );

      if (items.length === 0) {
        throw new Error(req.t("A mesa não tem produtos para fechar."));
      }

      let total = 0;
      const saleItems = [];

      for (const item of items) {
        const [[product]] = await connection.execute("SELECT id, stock FROM products WHERE id = ? FOR UPDATE", [item.product_id]);

        if (!product) {
          throw new Error(req.t("Produto removido: {name}.", { name: item.product_name }));
        }

        const lineTotal = Number((Number(item.unit_price) * item.quantity).toFixed(2));
        total = Number((total + lineTotal).toFixed(2));
        saleItems.push({ ...item, product, lineTotal });
      }

      // Validate cash received amount
      if (isCash && cashReceived !== null && cashReceived < total) {
        throw new Error(req.t("Valor recebido insuficiente para o total da conta."));
      }

      const receiptNumber = generateReceiptNumber(appSettings.receiptPrefixBar());
      const [saleResult] = await connection.execute(
        `INSERT INTO sales
          (receipt_number, user_id, payment_method_id, member_number, member_name, table_id, table_order_id, total_amount, cash_received)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [receiptNumber, req.session.user.id, paymentMethodId, memberNumber, memberName, order.table_id, orderId, total, isCash ? cashReceived : null],
      );
      const saleId = saleResult.insertId;

      for (const item of saleItems) {
        const quantityBefore = item.product.stock;
        const quantityAfter = quantityBefore - item.quantity;
        const [itemResult] = await connection.execute(
          `INSERT INTO sale_items
            (sale_id, product_id, product_name, unit_price, quantity, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.product_id, item.product_name, item.unit_price, item.quantity, item.lineTotal],
        );

        await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [quantityAfter, item.product_id]);
        await connection.execute(
          `INSERT INTO stock_movements
            (product_id, user_id, sale_item_id, type, quantity_change, quantity_before, quantity_after, reason)
           VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`,
          [
            item.product_id,
            req.session.user.id,
            itemResult.insertId,
            -item.quantity,
            quantityBefore,
            quantityAfter,
            `Mesa ${order.table_name} - venda ${receiptNumber}`,
          ],
        );
      }

      await connection.execute("UPDATE table_orders SET status = 'closed', closed_at = NOW() WHERE id = ?", [orderId]);
      await connection.commit();
      return res.json({ ok: true, saleId, redirect: `/pos/receipt/${saleId}` });
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: error.message });
    } finally {
      connection.release();
    }
  }),
);

app.get(
  "/pos",
  requireAuth,
  asyncRoute(async (req, res) => {
    const categories = await getActiveCategories("bar");
    const [products] = await pool.execute(
      `SELECT p.*, c.name AS category_name, pi.file_name AS image_file
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.available_for_sale = 1 AND p.product_type = 'bar'
       ORDER BY c.name ASC, p.name ASC`,
    );
    const activePaymentMethods = await paymentMethods.getActivePaymentMethods();
    const cashMethodId = await paymentMethods.getCashPaymentMethodId();

    res.render("pos/index", {
      title: "Ponto de venda (Apenas Bar)",
      categories,
      products,
      paymentMethods: activePaymentMethods,
      cashMethodId,
    });
  }),
);

app.get(
  "/merchandising/sale",
  requireAuth,
  asyncRoute(async (req, res) => {
    const categories = await getActiveCategories("merchandising");
    const [products] = await pool.execute(
      `SELECT p.*, c.name AS category_name, pi.file_name AS image_file
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.available_for_sale = 1 AND p.product_type = 'merchandising'
       ORDER BY c.name ASC, p.name ASC`,
    );
    const activePaymentMethods = await paymentMethods.getActivePaymentMethods();
    const cashMethodId = await paymentMethods.getCashPaymentMethodId();

    res.render("merch/index", {
      title: "Venda de Merchandising",
      categories,
      products,
      paymentMethods: activePaymentMethods,
      cashMethodId,
    });
  }),
);

app.post(
  "/merchandising/sale",
  requireAuth,
  asyncRoute(async (req, res) => {
    const paymentMethodId = parseInteger(req.body.payment_method_id);
    const memberNumber = String(req.body.member_number || "").trim() || null;
    const memberName = String(req.body.member_name || "").trim() || null;
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const itemMap = new Map();

    for (const item of rawItems) {
      const productId = parseInteger(item.product_id || item.productId);
      const quantity = parseInteger(item.quantity);

      if (productId && quantity > 0) {
        itemMap.set(productId, (itemMap.get(productId) || 0) + quantity);
      }
    }

    if (!paymentMethodId || itemMap.size === 0) {
      return res.status(400).json({ ok: false, message: req.t("Venda sem produtos ou método de pagamento.") });
    }

    if (!memberNumber || !memberName) {
      return res
        .status(400)
        .json({ ok: false, message: req.t("Nº sócio e nome do sócio são obrigatórios para vendas de merchandising.") });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[paymentMethod]] = await connection.execute("SELECT id FROM payment_methods WHERE id = ? AND active = 1", [
        paymentMethodId,
      ]);

      if (!paymentMethod) {
        throw new Error(req.t("Método de pagamento inválido."));
      }

      const saleItems = [];
      let total = 0;

      for (const [productId, quantity] of itemMap.entries()) {
        const [[product]] = await connection.execute(
          `SELECT id, name, price, stock, product_type
           FROM products
           WHERE id = ? AND deleted_at IS NULL AND active = 1 AND available_for_sale = 1
           FOR UPDATE`,
          [productId],
        );

        if (!product) {
          throw new Error(req.t("Um dos produtos já não está disponível."));
        }

        if (product.product_type !== "merchandising") {
          throw new Error(req.t("O produto {name} não pode ser vendido nesta vista de merchandising.", { name: product.name }));
        }

        const lineTotal = Number((Number(product.price) * quantity).toFixed(2));
        total = Number((total + lineTotal).toFixed(2));
        saleItems.push({ product, quantity, lineTotal });
      }

      const receiptNumber = generateReceiptNumber(appSettings.receiptPrefixMerchandising());
      const [saleResult] = await connection.execute(
        "INSERT INTO sales (receipt_number, user_id, payment_method_id, member_number, member_name, total_amount) VALUES (?, ?, ?, ?, ?, ?)",
        [receiptNumber, req.session.user.id, paymentMethodId, memberNumber, memberName, total],
      );
      const saleId = saleResult.insertId;

      for (const item of saleItems) {
        const quantityBefore = item.product.stock;
        const quantityAfter = quantityBefore - item.quantity;
        const [itemResult] = await connection.execute(
          `INSERT INTO sale_items
            (sale_id, product_id, product_name, unit_price, quantity, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.product.id, item.product.name, item.product.price, item.quantity, item.lineTotal],
        );

        await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [quantityAfter, item.product.id]);
        await connection.execute(
          `INSERT INTO stock_movements
            (product_id, user_id, sale_item_id, type, quantity_change, quantity_before, quantity_after, reason)
           VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`,
          [
            item.product.id,
            req.session.user.id,
            itemResult.insertId,
            -item.quantity,
            quantityBefore,
            quantityAfter,
            `Venda ${receiptNumber}`,
          ],
        );
      }

      await connection.commit();
      return res.json({ ok: true, saleId, redirect: `/pos/receipt/${saleId}` });
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: error.message });
    } finally {
      connection.release();
    }
  }),
);

app.post(
  "/pos/sale",
  requireAuth,
  asyncRoute(async (req, res) => {
    const paymentMethodId = parseInteger(req.body.payment_method_id);
    const memberNumber = String(req.body.member_number || "").trim() || null;
    const memberName = String(req.body.member_name || "").trim() || null;
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const itemMap = new Map();

    for (const item of rawItems) {
      const productId = parseInteger(item.product_id || item.productId);
      const quantity = parseInteger(item.quantity);

      if (productId && quantity > 0) {
        itemMap.set(productId, (itemMap.get(productId) || 0) + quantity);
      }
    }

    if (!paymentMethodId || itemMap.size === 0) {
      return res.status(400).json({ ok: false, message: req.t("Venda sem produtos ou método de pagamento.") });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[paymentMethod]] = await connection.execute("SELECT id FROM payment_methods WHERE id = ? AND active = 1", [
        paymentMethodId,
      ]);

      if (!paymentMethod) {
        throw new Error(req.t("Método de pagamento inválido."));
      }

      const saleItems = [];
      let total = 0;

      for (const [productId, quantity] of itemMap.entries()) {
        const [[product]] = await connection.execute(
          `SELECT id, name, price, stock, product_type
           FROM products
           WHERE id = ? AND deleted_at IS NULL AND active = 1 AND available_for_sale = 1
           FOR UPDATE`,
          [productId],
        );

        if (!product) {
          throw new Error(req.t("Um dos produtos já não está disponível."));
        }

        if (product.product_type !== "bar") {
          throw new Error(req.t("O produto {name} não pode ser vendido no ponto de venda.", { name: product.name }));
        }

        const lineTotal = Number((Number(product.price) * quantity).toFixed(2));
        total = Number((total + lineTotal).toFixed(2));
        saleItems.push({ product, quantity, lineTotal });
      }

      const receiptNumber = generateReceiptNumber(appSettings.receiptPrefixBar());
      const [saleResult] = await connection.execute(
        "INSERT INTO sales (receipt_number, user_id, payment_method_id, member_number, member_name, total_amount) VALUES (?, ?, ?, ?, ?, ?)",
        [receiptNumber, req.session.user.id, paymentMethodId, memberNumber, memberName, total],
      );
      const saleId = saleResult.insertId;

      for (const item of saleItems) {
        const quantityBefore = item.product.stock;
        const quantityAfter = quantityBefore - item.quantity;
        const [itemResult] = await connection.execute(
          `INSERT INTO sale_items
            (sale_id, product_id, product_name, unit_price, quantity, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.product.id, item.product.name, item.product.price, item.quantity, item.lineTotal],
        );

        await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [quantityAfter, item.product.id]);
        await connection.execute(
          `INSERT INTO stock_movements
            (product_id, user_id, sale_item_id, type, quantity_change, quantity_before, quantity_after, reason)
           VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`,
          [
            item.product.id,
            req.session.user.id,
            itemResult.insertId,
            -item.quantity,
            quantityBefore,
            quantityAfter,
            `Venda ${receiptNumber}`,
          ],
        );
      }

      await connection.commit();
      return res.json({ ok: true, saleId, redirect: `/pos/receipt/${saleId}` });
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: error.message });
    } finally {
      connection.release();
    }
  }),
);

async function renderSale(req, res, saleId) {
  const [sales] = await pool.execute(
    `SELECT s.*, u.name AS user_name, pm.name AS payment_method, bt.name AS table_name
     FROM sales s
     INNER JOIN users u ON u.id = s.user_id
     INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
     LEFT JOIN bar_tables bt ON bt.id = s.table_id
     WHERE s.id = ?`,
    [saleId],
  );
  const sale = sales[0];

  if (!sale) {
    return res.status(404).render("error", { title: "Venda não encontrada", message: "A venda indicada não existe." });
  }

  if (req.session.user.role !== "admin" && sale.user_id !== req.session.user.id) {
    return res.status(403).render("error", { title: "Acesso negado", message: "Não pode consultar esta venda." });
  }

  const [items] = await pool.execute("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id", [sale.id]);
  const merchPrefix = appSettings.receiptPrefixMerchandising();
  const newSalePath = String(sale.receipt_number || "").startsWith(merchPrefix) ? "/merchandising/sale" : "/pos";
  return res.render("pos/receipt", { title: "Recibo", sale, items, newSalePath });
}

app.get(
  "/pos/receipt/:id",
  requireAuth,
  asyncRoute(async (req, res) => renderSale(req, res, req.params.id)),
);

app.get(
  "/sales",
  requireAdmin,
  (req, res) => res.redirect("/sales/bar"),
);

async function renderSales(req, res, scope) {
  const normalizedScope = scope === "merchandising" ? "merchandising" : "bar";
  const filters = dateFilters(req.query);
  const [sales] = await pool.execute(
    `SELECT s.*, u.name AS user_name, pm.name AS payment_method, bt.name AS table_name
     FROM sales s
     INNER JOIN users u ON u.id = s.user_id
     INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
     LEFT JOIN bar_tables bt ON bt.id = s.table_id
     WHERE EXISTS (
       SELECT 1
       FROM sale_items si
       INNER JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = s.id AND p.product_type = ?
     ) ${filters.where}
     ORDER BY s.created_at DESC
     LIMIT 200`,
    [normalizedScope, ...filters.params],
  );

  res.render("sales/index", {
    title: normalizedScope === "merchandising" ? "Vendas Merchandising" : "Vendas Bar",
    sales,
    filters: req.query,
  });
}

app.get(
  "/sales/bar",
  requireAdmin,
  asyncRoute(async (req, res) => renderSales(req, res, "bar")),
);

app.get(
  "/sales/merchandising",
  requireAdmin,
  asyncRoute(async (req, res) => renderSales(req, res, "merchandising")),
);

app.get(
  "/my-sales",
  requireAuth,
  asyncRoute(async (req, res) => {
    const filters = dateFilters(req.query);
    const [sales] = await pool.execute(
      `SELECT s.*, u.name AS user_name, pm.name AS payment_method, bt.name AS table_name
       FROM sales s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       LEFT JOIN bar_tables bt ON bt.id = s.table_id
       WHERE s.user_id = ? ${filters.where}
       ORDER BY s.created_at DESC
       LIMIT 200`,
      [req.session.user.id, ...filters.params],
    );

    res.render("sales/index", {
      title: "Minhas vendas",
      sales,
      filters: req.query,
    });
  }),
);

app.get(
  "/cash-summary",
  requireAuth,
  asyncRoute(async (req, res) => {
    const filters = dateFilters(req.query);
    const cashMethodId = await paymentMethods.getCashPaymentMethodId(1);

    const [barCash] = await pool.execute(
      `SELECT COUNT(DISTINCT s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       WHERE s.status = 'completed' AND s.payment_method_id = ? ${filters.where}
         AND EXISTS (
           SELECT 1
           FROM sale_items si
           INNER JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = s.id AND p.product_type = 'bar'
         )`,
      [cashMethodId, ...filters.params],
    );

    const [barOtherPayments] = await pool.execute(
      `SELECT pm.name, pm.code, COUNT(DISTINCT s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       WHERE s.status = 'completed' AND pm.active = 1 AND pm.code != 'cash' ${filters.where}
         AND EXISTS (
           SELECT 1
           FROM sale_items si
           INNER JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = s.id AND p.product_type = 'bar'
         )
       GROUP BY pm.id, pm.name, pm.code
       ORDER BY total DESC`,
      filters.params,
    );

    const [merchCash] = await pool.execute(
      `SELECT COUNT(DISTINCT s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       WHERE s.status = 'completed' AND s.payment_method_id = ? ${filters.where}
         AND EXISTS (
           SELECT 1
           FROM sale_items si
           INNER JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = s.id AND p.product_type = 'merchandising'
         )`,
      [cashMethodId, ...filters.params],
    );

    const [merchOtherPayments] = await pool.execute(
      `SELECT pm.name, pm.code, COUNT(DISTINCT s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       WHERE s.status = 'completed' AND pm.active = 1 AND pm.code != 'cash' ${filters.where}
         AND EXISTS (
           SELECT 1
           FROM sale_items si
           INNER JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = s.id AND p.product_type = 'merchandising'
         )
       GROUP BY pm.id, pm.name, pm.code
       ORDER BY total DESC`,
      filters.params,
    );

    res.render("cash-summary", {
      title: "Resumo de caixa",
      filters: req.query,
      barCash: barCash[0] || { sales_count: 0, total: 0 },
      merchCash: merchCash[0] || { sales_count: 0, total: 0 },
      barOtherPayments,
      merchOtherPayments,
    });
  }),
);

app.get(
  "/sales/:id",
  requireAuth,
  asyncRoute(async (req, res) => renderSale(req, res, req.params.id)),
);

app.post(
  "/sales/:id/cancel",
  requireAuth,
  asyncRoute(async (req, res) => {
    const saleId = parseInteger(req.params.id);
    const adminPin = String(req.body.admin_pin || "");
    const currentUser = req.session.user;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[sale]] = await connection.execute(
        "SELECT id, receipt_number, status FROM sales WHERE id = ? FOR UPDATE",
        [saleId],
      );

      if (!sale) {
        throw new Error("Venda não encontrada.");
      }

      if (sale.status !== "completed") {
        throw new Error("A venda já não está em estado concluído.");
      }

      const adminUserId = await verifyAdminCancelPin(connection, adminPin);
      if (!adminUserId) {
        throw new Error("PIN de administrador inválido.");
      }

      const cancellingUserId = adminUserId;

      const [items] = await connection.execute(
        "SELECT id, product_id, quantity FROM sale_items WHERE sale_id = ? ORDER BY id",
        [saleId],
      );

      for (const item of items) {
        if (!item.product_id) {
          continue;
        }

        const [[product]] = await connection.execute(
          "SELECT id, stock FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
          [item.product_id],
        );

        if (!product) {
          continue;
        }

        const quantityBefore = product.stock;
        const quantityAfter = quantityBefore + Number(item.quantity);

        await connection.execute("UPDATE products SET stock = ? WHERE id = ?", [quantityAfter, product.id]);
        await connection.execute(
          `INSERT INTO stock_movements
            (product_id, user_id, sale_item_id, type, quantity_change, quantity_before, quantity_after, reason)
           VALUES (?, ?, ?, 'manual_adjustment', ?, ?, ?, ?)`,
          [
            product.id,
            cancellingUserId,
            item.id,
            Number(item.quantity),
            quantityBefore,
            quantityAfter,
            `Cancelamento venda ${sale.receipt_number}`,
          ],
        );
      }

      await connection.execute("UPDATE sales SET status = 'cancelled' WHERE id = ?", [saleId]);
      await connection.commit();
      flash(req, "success", "Venda cancelada.");
    } catch (error) {
      await connection.rollback();
      flash(req, "error", error.message);
    } finally {
      connection.release();
    }

    const redirectTo = String(req.body.redirect_to || "").trim();
    return res.redirect(redirectTo || `/pos/receipt/${saleId}`);
  }),
);

app.get(
  "/users",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const [users] = await pool.execute("SELECT id, name, email, role, active, created_at FROM users ORDER BY name");
    res.render("users/index", { title: "Utilizadores", users });
  }),
);

app.get("/users/new", requireAdmin, (req, res) => {
  res.render("users/form", { title: "Novo utilizador", user: null, action: "/users" });
});

app.post(
  "/users",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const loginPin = String(req.body.login_pin || "").trim();
    const role = req.body.role === "admin" ? "admin" : "employee";
    const active = req.body.active ? 1 : 0;

    if (!name || !email || password.length < 6) {
      flash(req, "error", "Preencha nome, email e password com pelo menos 6 caracteres.");
      return res.redirect("/users/new");
    }

    if (loginPin && !/^\d{4,10}$/.test(loginPin)) {
      flash(req, "error", "O PIN de login deve ter entre 4 e 10 dígitos.");
      return res.redirect("/users/new");
    }

    if (loginPin && (await loginPinExists(pool, loginPin))) {
      flash(req, "error", "Esse PIN de login já está a ser usado por outro utilizador.");
      return res.redirect("/users/new");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const loginPinHash = loginPin ? await bcrypt.hash(loginPin, 12) : null;
    await pool.execute("INSERT INTO users (name, email, password_hash, login_pin_hash, role, active) VALUES (?, ?, ?, ?, ?, ?)", [
      name,
      email,
      passwordHash,
      loginPinHash,
      role,
      active,
    ]);
    flash(req, "success", "Utilizador criado.");
    return res.redirect("/users");
  }),
);

app.get(
  "/users/:id/edit",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const [users] = await pool.execute("SELECT id, name, email, role, active FROM users WHERE id = ?", [req.params.id]);
    const user = users[0];

    if (!user) {
      return res.status(404).render("error", { title: "Utilizador não encontrado", message: "O utilizador indicado não existe." });
    }

    return res.render("users/form", { title: "Editar utilizador", user, action: `/users/${user.id}` });
  }),
);

app.post(
  "/users/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const userId = parseInteger(req.params.id);
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const loginPin = String(req.body.login_pin || "").trim();
    const role = req.body.role === "admin" ? "admin" : "employee";
    const active = req.body.active ? 1 : 0;

    if (!name || !email) {
      flash(req, "error", "Preencha nome e email.");
      return res.redirect(`/users/${userId}/edit`);
    }

    if (loginPin && !/^\d{4,10}$/.test(loginPin)) {
      flash(req, "error", "O PIN de login deve ter entre 4 e 10 dígitos.");
      return res.redirect(`/users/${userId}/edit`);
    }

    if (loginPin && (await loginPinExists(pool, loginPin, userId))) {
      flash(req, "error", "Esse PIN de login já está a ser usado por outro utilizador.");
      return res.redirect(`/users/${userId}/edit`);
    }

    const loginPinHash = loginPin ? await bcrypt.hash(loginPin, 12) : null;

    if (password) {
      if (password.length < 6) {
        flash(req, "error", "A password deve ter pelo menos 6 caracteres.");
        return res.redirect(`/users/${userId}/edit`);
      }

      const passwordHash = await bcrypt.hash(password, 12);
      if (loginPinHash) {
        await pool.execute(
          "UPDATE users SET name = ?, email = ?, password_hash = ?, login_pin_hash = ?, role = ?, active = ? WHERE id = ?",
          [name, email, passwordHash, loginPinHash, role, active, userId],
        );
      } else {
        await pool.execute("UPDATE users SET name = ?, email = ?, password_hash = ?, role = ?, active = ? WHERE id = ?", [
          name,
          email,
          passwordHash,
          role,
          active,
          userId,
        ]);
      }
    } else {
      if (loginPinHash) {
        await pool.execute("UPDATE users SET name = ?, email = ?, login_pin_hash = ?, role = ?, active = ? WHERE id = ?", [
          name,
          email,
          loginPinHash,
          role,
          active,
          userId,
        ]);
      } else {
        await pool.execute("UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?", [
          name,
          email,
          role,
          active,
          userId,
        ]);
      }
    }

    if (req.session.user.id === userId) {
      req.session.user.name = name;
      req.session.user.email = email;
      req.session.user.role = role;
    }

    flash(req, "success", "Utilizador atualizado.");
    return res.redirect("/users");
  }),
);

app.post(
  "/users/:id/delete",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const userId = parseInteger(req.params.id);

    if (userId === req.session.user.id) {
      flash(req, "error", "Não pode apagar o seu próprio utilizador.");
      return res.redirect("/users");
    }

    const [[usage]] = await pool.execute(
      `SELECT
        (SELECT COUNT(*) FROM sales WHERE user_id = ?) AS sales_count,
        (SELECT COUNT(*) FROM stock_movements WHERE user_id = ?) AS stock_count`,
      [userId, userId],
    );

    if (usage.sales_count > 0 || usage.stock_count > 0) {
      await pool.execute("UPDATE users SET active = 0 WHERE id = ?", [userId]);
      flash(req, "success", "Utilizador bloqueado para preservar o histórico.");
      return res.redirect("/users");
    }

    await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
    flash(req, "success", "Utilizador apagado.");
    return res.redirect("/users");
  }),
);

app.get(
  "/members",
  requireAuth,
  asyncRoute(async (req, res) => {
    const onlyActiveFilter = req.session.user.role === "admin" ? "" : "WHERE active = 1";
    const [members] = await pool.execute(`SELECT * FROM members ${onlyActiveFilter} ORDER BY name ASC`);
    res.render("members/index", { title: "Sócios", members });
  }),
);

app.get(
  "/members/import/example.csv",
  requireAuth,
  (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="socios-exemplo.csv"');
    return res.send(`member_number,name,email,active
1001,Ana Silva,ana@example.com,1
1002,Bruno Costa,bruno@example.com,1
1003,Socio Inativo,inativo@example.com,0
`);
  },
);

app.get(
  "/members/new",
  requireAuth,
  (req, res) => {
    res.render("members/form", {
      title: "Novo sócio",
      member: null,
      action: "/members",
    });
  },
);

app.post(
  "/members",
  requireAuth,
  asyncRoute(async (req, res) => {
    const memberNumber = String(req.body.member_number || "").trim();
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const entryDate = String(req.body.entry_date || "").trim() || null;
    const sendWelcomeEmail = Boolean(req.body.send_welcome_email);

    if (!memberNumber || !name || !isValidEmail(email)) {
      flash(req, "error", "Número de sócio, nome e email válido são obrigatórios.");
      return res.redirect("/members/new");
    }

    const [existing] = await pool.execute("SELECT id FROM members WHERE member_number = ?", [memberNumber]);

    if (existing.length > 0) {
      flash(req, "error", "Já existe um sócio com este número.");
      return res.redirect("/members/new");
    }

    try {
      await pool.execute("INSERT INTO members (member_number, name, email, entry_date, active) VALUES (?, ?, ?, ?, 1)", [memberNumber, name, email, entryDate]);
      try {
        const welcomeResult = await sendWelcomeEmailToMember({ memberNumber, name, email }, { enabled: sendWelcomeEmail });
        if (welcomeResult.sent) {
          flash(req, "success", "Sócio criado com sucesso. Email de boas-vindas enviado.");
        } else if (welcomeResult.reason === "missing-email-settings") {
          flash(req, "error", "Sócio criado, mas falta configurar o email de envio.");
        } else if (welcomeResult.reason === "missing-pdf") {
          flash(req, "error", "Sócio criado, mas falta carregar o PDF dos estatutos.");
        } else {
          flash(req, "success", "Sócio criado com sucesso.");
        }
      } catch (emailError) {
        flash(req, "error", `Sócio criado, mas o email de boas-vindas falhou: ${emailError.message}`);
      }
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        flash(req, "error", "Já existe um sócio com este número.");
        return res.redirect("/members/new");
      }
      throw error;
    }
    return res.redirect("/members");
  }),
);

app.post(
  "/members/import",
  requireAdmin,
  uploadMemberCsv,
  asyncRoute(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      flash(req, "error", req.t("Selecione um ficheiro CSV para importar sócios."));
      return res.redirect("/members");
    }

    const parsedRows = parseMembersCsv(req.file.buffer.toString("utf-8"));
    if (parsedRows.length === 0) {
      flash(req, "error", req.t("O CSV de sócios não tem linhas válidas."));
      return res.redirect("/members");
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const createdMembers = [];
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      for (const row of parsedRows) {
        if (!row.memberNumber || !row.name || !isValidEmail(row.email)) {
          skipped += 1;
          continue;
        }

        const [[existingMember]] = await connection.execute("SELECT id FROM members WHERE member_number = ? LIMIT 1", [
          row.memberNumber,
        ]);

        if (existingMember) {
          await connection.execute("UPDATE members SET name = ?, email = ?, active = ? WHERE id = ?", [
            row.name,
            row.email,
            row.active,
            existingMember.id,
          ]);
          updated += 1;
        } else {
          await connection.execute("INSERT INTO members (member_number, name, email, active) VALUES (?, ?, ?, ?)", [
            row.memberNumber,
            row.name,
            row.email,
            row.active,
          ]);
          createdMembers.push({ memberNumber: row.memberNumber, name: row.name, email: row.email });
          created += 1;
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    let welcomeSent = 0;
    let welcomeFailed = 0;
    if (appSettings.sendMemberWelcomeEmail() && createdMembers.length > 0) {
      for (const member of createdMembers) {
        try {
          const welcomeResult = await sendWelcomeEmailToMember(member);
          if (welcomeResult.sent) {
            welcomeSent += 1;
          } else {
            welcomeFailed += 1;
          }
        } catch {
          welcomeFailed += 1;
        }
      }
    }

    const welcomeSummary =
      welcomeSent || welcomeFailed ? ` Emails boas-vindas: ${welcomeSent} enviados, ${welcomeFailed} falhados.` : "";
    flash(
      req,
      welcomeFailed > 0 ? "error" : "success",
      `${req.t("Importação concluída: {created} criados, {updated} atualizados, {skipped} ignorados.", {
        created,
        updated,
        skipped,
      })}${welcomeSummary}`,
    );

    return res.redirect("/members");
  }),
);

app.get(
  "/members/:id/edit",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const memberId = parseInteger(req.params.id);
    const [members] = await pool.execute("SELECT * FROM members WHERE id = ?", [memberId]);
    const member = members[0];

    if (!member) {
      return res.status(404).render("error", { title: "Sócio não encontrado", message: "O sócio indicado não existe." });
    }

    res.render("members/form", {
      title: "Editar sócio",
      member,
      action: `/members/${member.id}`,
    });
  }),
);

app.post(
  "/members/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const memberId = parseInteger(req.params.id);
    const memberNumber = String(req.body.member_number || "").trim();
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const entryDate = String(req.body.entry_date || "").trim() || null;
    const active = req.body.active ? 1 : 0;

    if (!memberNumber || !name || !isValidEmail(email)) {
      flash(req, "error", "Número de sócio, nome e email válido são obrigatórios.");
      return res.redirect(`/members/${memberId}/edit`);
    }

    const [existing] = await pool.execute("SELECT id FROM members WHERE member_number = ? AND id != ?", [memberNumber, memberId]);

    if (existing.length > 0) {
      flash(req, "error", "Já existe outro sócio com este número.");
      return res.redirect(`/members/${memberId}/edit`);
    }

    await pool.execute("UPDATE members SET member_number = ?, name = ?, email = ?, entry_date = ?, active = ? WHERE id = ?", [
      memberNumber,
      name,
      email,
      entryDate,
      active,
      memberId,
    ]);
    flash(req, "success", "Sócio atualizado com sucesso.");
    return res.redirect("/members");
  }),
);

app.post(
  "/members/:id/delete",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const memberId = parseInteger(req.params.id);
    await pool.execute("UPDATE members SET active = 0 WHERE id = ?", [memberId]);
    flash(req, "success", "Sócio inativado.");
    res.redirect("/members");
  }),
);

app.get(
  "/dues",
  requireAuth,
  asyncRoute(async (req, res) => {
    const year = parseInteger(req.query.year, currentYear());
    const expectedAmount = await duesAmountForYear(year);
    const q = String(req.query.q || "").trim();
    const params = [year, year, year];
    let memberFilter = "";

    if (q) {
      memberFilter = "AND (m.name LIKE ? OR m.member_number LIKE ?)";
      const needle = `%${q}%`;
      params.push(needle, needle);
    }

    const [members] = await pool.execute(
      `SELECT
         m.*,
         (SELECT COUNT(*) FROM member_dues_payments mdp WHERE mdp.member_id = m.id AND mdp.year = ? AND mdp.status = 'paid') AS paid_count,
         (SELECT COALESCE(SUM(mdp.amount), 0) FROM member_dues_payments mdp WHERE mdp.member_id = m.id AND mdp.year = ? AND mdp.status = 'paid') AS paid_total,
         (SELECT MAX(mdp.paid_at) FROM member_dues_payments mdp WHERE mdp.member_id = m.id AND mdp.year = ? AND mdp.status = 'paid') AS last_paid_at
       FROM members m
       WHERE m.active = 1 ${memberFilter}
       ORDER BY m.name ASC`,
      params,
    );

    // Filtrar membros que devem pagar cotas este ano
    const membersWithDues = members.filter((m) => memberShouldPayDuesForYear(m, year));

    res.render("dues/index", {
      title: "Cotas",
      year,
      q,
      expectedAmount,
      members: membersWithDues,
    });
  }),
);

app.post(
  "/dues/email-debtors",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const year = parseInteger(req.body.year, currentYear());
    const expectedAmount = await duesAmountForYear(year);

    if (!emailSettingsConfigured()) {
      flash(req, "error", "Configure o email de envio antes de enviar avisos.");
      return res.redirect(`/dues?year=${year}`);
    }

    if (!expectedAmount || expectedAmount <= 0) {
      flash(req, "error", "Defina o valor da cota antes de enviar avisos.");
      return res.redirect(`/dues?year=${year}`);
    }

    const [members] = await pool.execute(
      `SELECT
         m.id, m.member_number, m.name, m.email, m.entry_date,
         (SELECT COALESCE(SUM(mdp.amount), 0)
          FROM member_dues_payments mdp
          WHERE mdp.member_id = m.id AND mdp.year = ? AND mdp.status = 'paid') AS paid_total
       FROM members m
       WHERE m.active = 1
       ORDER BY m.name ASC`,
      [year],
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const member of members) {
      // Se não deve pagar cotas este ano, pula
      if (!memberShouldPayDuesForYear(member, year)) {
        skipped += 1;
        continue;
      }

      const due = Math.max(0, Number(expectedAmount || 0) - Number(member.paid_total || 0));
      if (due <= 0 || !isValidEmail(member.email)) {
        skipped += 1;
        continue;
      }

      try {
        await sendDebtorEmail(member, year, expectedAmount);
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    flash(req, failed > 0 ? "error" : "success", `Emails de devedores: ${sent} enviados, ${skipped} ignorados, ${failed} falhados.`);
    return res.redirect(`/dues?year=${year}`);
  }),
);

app.get(
  "/dues/export-debtors",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const year = parseInteger(req.query.year, currentYear());
    const expectedAmount = await duesAmountForYear(year);

    const [members] = await pool.execute(
      `SELECT
         m.id, m.member_number, m.name, m.email, m.entry_date,
         (SELECT COALESCE(SUM(mdp.amount), 0)
          FROM member_dues_payments mdp
          WHERE mdp.member_id = m.id AND mdp.year = ? AND mdp.status = 'paid') AS paid_total
       FROM members m
       WHERE m.active = 1
       ORDER BY m.name ASC`,
      [year],
    );

    const debtors = members
      .filter((m) => memberShouldPayDuesForYear(m, year))
      .filter((m) => Math.max(0, Number(expectedAmount || 0) - Number(m.paid_total || 0)) > 0)
      .map((m) => ({
        numero_socio: m.member_number,
        nome: m.name,
        email: m.email,
        pago: m.paid_total,
        em_falta: Math.max(0, Number(expectedAmount || 0) - Number(m.paid_total || 0)),
      }));

    const columns = [
      { label: "Nº Sócio", key: "numero_socio" },
      { label: "Nome", key: "nome" },
      { label: "Email", key: "email" },
      { label: "Pago", key: "pago" },
      { label: "Em falta", key: "em_falta" },
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="devedores-cotas-${year}.csv"`);
    return res.send(rowsToCsv(columns, debtors));
  }),
);

app.get(
  "/dues/:memberId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const memberId = parseInteger(req.params.memberId);
    const year = parseInteger(req.query.year, currentYear());
    const expectedAmount = await duesAmountForYear(year);

    const [[member]] = await pool.execute("SELECT * FROM members WHERE id = ?", [memberId]);
    if (!member) {
      return res.status(404).render("error", { title: "Sócio não encontrado", message: "O sócio indicado não existe." });
    }

    const [payments] = await pool.execute(
      `SELECT mdp.*, pm.name AS payment_method_name, u.name AS user_name
       FROM member_dues_payments mdp
       INNER JOIN payment_methods pm ON pm.id = mdp.payment_method_id
       INNER JOIN users u ON u.id = mdp.user_id
       WHERE mdp.member_id = ? AND mdp.year = ?
       ORDER BY mdp.paid_at DESC, mdp.id DESC`,
      [memberId, year],
    );

    const [[totals]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS paid_total
       FROM member_dues_payments
       WHERE member_id = ? AND year = ? AND status = 'paid'`,
      [memberId, year],
    );
    const paidTotal = totals ? Number(totals.paid_total) : 0;
    const remainingAmount = Math.max(0, Number(expectedAmount || 0) - paidTotal);

    const activePaymentMethods = await paymentMethods.getActivePaymentMethods();

    res.render("dues/member", {
      title: "Pagamento de cotas",
      member,
      year,
      expectedAmount,
      paidTotal,
      remainingAmount,
      payments,
      paymentMethods: activePaymentMethods,
    });
  }),
);

app.post(
  "/dues/:memberId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const memberId = parseInteger(req.params.memberId);
    const year = parseInteger(req.body.year, currentYear());
    const paymentMethodId = parseInteger(req.body.payment_method_id);
    const amount = parseNumber(req.body.amount, 0);
    const notes = String(req.body.notes || "").trim() || null;

    if (!memberId || !year || !paymentMethodId || amount <= 0) {
      flash(req, "error", "Indique ano, método de pagamento e valor.");
      return res.redirect(`/dues/${memberId}?year=${year}`);
    }

    const [[member]] = await pool.execute("SELECT id FROM members WHERE id = ? AND active = 1", [memberId]);
    if (!member) {
      return res.status(404).render("error", { title: "Sócio não encontrado", message: "O sócio indicado não existe ou está inativo." });
    }

    const [[paymentMethod]] = await pool.execute("SELECT id FROM payment_methods WHERE id = ? AND active = 1", [paymentMethodId]);
    if (!paymentMethod) {
      flash(req, "error", "Método de pagamento inválido.");
      return res.redirect(`/dues/${memberId}?year=${year}`);
    }

    await pool.execute(
      `INSERT INTO member_dues_payments (member_id, user_id, payment_method_id, year, amount, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'paid')`,
      [memberId, req.session.user.id, paymentMethodId, year, amount, notes],
    );

    flash(req, "success", "Pagamento de cota registado.");
    return res.redirect(`/dues/${memberId}?year=${year}`);
  }),
);

app.post(
  "/dues/payments/:id/cancel",
  requireAuth,
  asyncRoute(async (req, res) => {
    const paymentId = parseInteger(req.params.id);
    const adminPin = String(req.body.admin_pin || "");
    const currentUser = req.session.user;
    const redirectTo = String(req.body.redirect_to || "").trim();

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [[payment]] = await connection.execute(
        "SELECT id, member_id, year, status FROM member_dues_payments WHERE id = ? FOR UPDATE",
        [paymentId],
      );

      if (!payment) {
        throw new Error("Pagamento não encontrado.");
      }

      if (payment.status !== "paid") {
        throw new Error("Este pagamento já foi cancelado.");
      }

      const adminUserId = await verifyAdminCancelPin(connection, adminPin);
      if (!adminUserId) {
        throw new Error("PIN de administrador inválido.");
      }

      const cancellingUserId = adminUserId;

      await connection.execute(
        "UPDATE member_dues_payments SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = ? WHERE id = ?",
        [cancellingUserId, paymentId],
      );

      await connection.commit();
      flash(req, "success", "Pagamento de cota cancelado.");
    } catch (error) {
      await connection.rollback();
      flash(req, "error", error.message);
    } finally {
      connection.release();
    }

    return res.redirect(redirectTo || "/dues");
  }),
);

app.get(
  "/reports",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = normalizeReportFilters(req.query);
    const queryString = preserveReportQuery(filters);
    const itemFilters = reportItemFilters(filters);

    const [activePaymentMethods, users, categories] = await Promise.all([
      paymentMethods.getActivePaymentMethods(),
      pool.execute("SELECT id, name FROM users WHERE active = 1 ORDER BY name"),
      pool.execute("SELECT id, name, scope FROM categories WHERE active = 1 ORDER BY scope, name"),
    ]);
    const paymentMethodOptions = activePaymentMethods;
    const userOptions = users[0];
    const categoryOptions = categories[0];

    const [[summary]] = await pool.execute(
      `SELECT
         COUNT(DISTINCT s.id) AS sales_count,
         COALESCE(SUM(si.quantity), 0) AS items_sold,
         COALESCE(SUM(si.line_total), 0) AS total,
         COALESCE(SUM(CASE WHEN pm.code = 'cash' THEN si.line_total ELSE 0 END), 0) AS cash_total,
         COALESCE(SUM(CASE WHEN pm.code != 'cash' THEN si.line_total ELSE 0 END), 0) AS non_cash_total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       INNER JOIN products p ON p.id = si.product_id
       ${itemFilters.where}`,
      itemFilters.params,
    );

    const [salesByDay] = await pool.execute(
      `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS day,
              COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       ${itemFilters.where}
       GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
       ORDER BY day DESC
       LIMIT 60`,
      itemFilters.params,
    );

    const [salesByProduct] = await pool.execute(
      `SELECT p.name AS product_name, c.name AS category_name, p.product_type,
              COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       INNER JOIN categories c ON c.id = p.category_id
       ${itemFilters.where}
       GROUP BY p.id, p.name, c.name, p.product_type
       ORDER BY total DESC, quantity DESC
       LIMIT 20`,
      itemFilters.params,
    );

    const [salesByEmployee] = await pool.execute(
      `SELECT u.name, COUNT(DISTINCT s.id) AS sales_count, COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN products p ON p.id = si.product_id
       ${itemFilters.where}
       GROUP BY u.id, u.name
       ORDER BY total DESC
       LIMIT 20`,
      itemFilters.params,
    );

    const [paymentTotals] = await pool.execute(
      `SELECT pm.name, pm.code, COUNT(DISTINCT s.id) AS sales_count, COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       INNER JOIN products p ON p.id = si.product_id
       ${itemFilters.where}
       GROUP BY pm.id, pm.name, pm.code
       ORDER BY total DESC`,
      itemFilters.params,
    );

    const [salesByCategory] = await pool.execute(
      `SELECT c.name, c.scope, COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       INNER JOIN categories c ON c.id = p.category_id
       ${itemFilters.where}
       GROUP BY c.id, c.name, c.scope
       ORDER BY total DESC`,
      itemFilters.params,
    );

    const lowStockClauses = ["p.deleted_at IS NULL", "p.active = 1", "p.stock <= p.low_stock_threshold"];
    const lowStockParams = [];
    if (filters.area !== "all") {
      lowStockClauses.push("p.product_type = ?");
      lowStockParams.push(filters.area);
    }
    if (filters.categoryId) {
      lowStockClauses.push("p.category_id = ?");
      lowStockParams.push(filters.categoryId);
    }
    const [lowStock] = await pool.execute(
      `SELECT p.*, c.name AS category_name
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE ${lowStockClauses.join(" AND ")}
       ORDER BY p.stock ASC, p.name ASC
       LIMIT 50`,
      lowStockParams,
    );

    const total = Number(summary.total || 0);
    const salesCount = Number(summary.sales_count || 0);

    return res.render("reports/workbench", {
      title: "Analytics",
      filters,
      queryString,
      paymentMethodOptions,
      userOptions,
      categoryOptions,
      exportLink: (type) => reportExportLink(type, queryString),
      summary: {
        ...summary,
        average_sale: salesCount > 0 ? total / salesCount : 0,
      },
      salesByDay: decorateReportRows(salesByDay.slice().reverse(), "total"),
      salesByProduct: decorateReportRows(salesByProduct, "total"),
      salesByEmployee: decorateReportRows(salesByEmployee, "total"),
      paymentTotals: decorateReportRows(paymentTotals, "total"),
      salesByCategory: decorateReportRows(salesByCategory, "total"),
      lowStock: decorateReportRows(lowStock, "low_stock_threshold"),
    });
  }),
);

app.get(
  "/reports/export/:type",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = normalizeReportFilters(req.query);
    const itemFilters = reportItemFilters(filters);
    const type = String(req.params.type || "");
    const exports = {
      daily: {
        filename: "relatorio-vendas-dia.csv",
        columns: [
          { key: "day", label: "Dia" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Artigos" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS day,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              ${itemFilters.where}
              GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
              ORDER BY day DESC`,
      },
      products: {
        filename: "relatorio-produtos.csv",
        columns: [
          { key: "product_name", label: "Produto" },
          { key: "category_name", label: "Categoria" },
          { key: "product_type", label: "Area" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT p.name AS product_name, c.name AS category_name, p.product_type,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              INNER JOIN categories c ON c.id = p.category_id
              ${itemFilters.where}
              GROUP BY p.id, p.name, c.name, p.product_type
              ORDER BY total DESC, quantity DESC`,
      },
      payments: {
        filename: "relatorio-pagamentos.csv",
        columns: [
          { key: "name", label: "Metodo" },
          { key: "code", label: "Codigo" },
          { key: "sales_count", label: "Vendas" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT pm.name, pm.code,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
              INNER JOIN products p ON p.id = si.product_id
              ${itemFilters.where}
              GROUP BY pm.id, pm.name, pm.code
              ORDER BY total DESC`,
      },
      employees: {
        filename: "relatorio-funcionarios.csv",
        columns: [
          { key: "name", label: "Funcionario" },
          { key: "sales_count", label: "Vendas" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT u.name,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN users u ON u.id = s.user_id
              INNER JOIN products p ON p.id = si.product_id
              ${itemFilters.where}
              GROUP BY u.id, u.name
              ORDER BY total DESC`,
      },
      categories: {
        filename: "relatorio-categorias.csv",
        columns: [
          { key: "name", label: "Categoria" },
          { key: "scope", label: "Area" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT c.name, c.scope,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              INNER JOIN categories c ON c.id = p.category_id
              ${itemFilters.where}
              GROUP BY c.id, c.name, c.scope
              ORDER BY total DESC`,
      },
    };

    const definition = exports[type];
    if (!definition) {
      return res.redirect("/reports");
    }

    const [rows] = await pool.execute(definition.sql, itemFilters.params);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${definition.filename}"`);
    return res.send(rowsToCsv(definition.columns, rows));
  }),
);

app.get(
  "/reports/general",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = dateFilters(req.query);
    const [salesByDay] = await pool.execute(
      `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS day, COUNT(*) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
       ORDER BY day DESC`,
      filters.params,
    );
    const [salesByProduct] = await pool.execute(
      `SELECT si.product_name, SUM(si.quantity) AS quantity, SUM(si.line_total) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY si.product_name
       ORDER BY quantity DESC`,
      filters.params,
    );
    const [salesByEmployee] = await pool.execute(
      `SELECT u.name, COUNT(s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY u.id, u.name
       ORDER BY total DESC`,
      filters.params,
    );
    const [paymentTotals] = await pool.execute(
      `SELECT pm.name, COUNT(s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY pm.id, pm.name
       ORDER BY total DESC`,
      filters.params,
    );
    const [lowStock] = await pool.execute(
      `SELECT p.*, c.name AS category_name
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.stock <= p.low_stock_threshold
       ORDER BY p.stock ASC, p.name ASC`,
    );

    res.render("reports/index", {
      title: "Relatórios Gerais",
      filters: req.query,
      salesByDay,
      salesByProduct,
      salesByEmployee,
      paymentTotals,
      lowStock,
    });
  }),
);

app.get(
  "/reports/merchandising",
  requireAuth,
  asyncRoute(async (req, res) => {
    const filters = normalizeMerchReportFilters(req.query);
    const queryString = preserveMerchReportQuery(filters);
    const reportFilters = merchReportFilters(filters);
    const categories = await getActiveCategories("merchandising");
    const [paymentMethodOptions, userRows] = await Promise.all([
      paymentMethods.getActivePaymentMethods(),
      pool.execute("SELECT id, name FROM users WHERE active = 1 ORDER BY name"),
    ]);
    const userOptions = userRows[0];

    const [[summary]] = await pool.execute(
      `SELECT COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS items_sold,
              COALESCE(SUM(si.line_total), 0) AS total,
              COUNT(DISTINCT NULLIF(CONCAT(COALESCE(s.member_number, ''), '|', COALESCE(s.member_name, '')), '|')) AS buyers_count
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       ${reportFilters.where}`,
      reportFilters.params,
    );

    const [merchByMember] = await pool.execute(
      `SELECT s.member_number, s.member_name,
              COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       ${reportFilters.where}
       GROUP BY s.member_number, s.member_name
       ORDER BY total DESC
       LIMIT 50`,
      reportFilters.params,
    );

    const [merchByProduct] = await pool.execute(
      `SELECT p.id AS product_id, si.product_name, c.name AS category_name,
              COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       INNER JOIN categories c ON c.id = p.category_id
       ${reportFilters.where}
       GROUP BY p.id, si.product_name, c.name
       ORDER BY total DESC, quantity DESC
       LIMIT 50`,
      reportFilters.params,
    );

    const [merchByMemberProduct] = await pool.execute(
      `SELECT
         s.member_number,
         s.member_name,
         si.product_name,
         COUNT(DISTINCT s.id) AS sales_count,
         COALESCE(SUM(si.quantity), 0) AS quantity,
         COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       ${reportFilters.where}
       GROUP BY s.member_number, s.member_name, si.product_name
       ORDER BY total DESC, quantity DESC
       LIMIT 200`,
      reportFilters.params,
    );

    const [salesByDay] = await pool.execute(
      `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS day,
              COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       ${reportFilters.where}
       GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
       ORDER BY day ASC
       LIMIT 90`,
      reportFilters.params,
    );

    const [salesByCategory] = await pool.execute(
      `SELECT c.name, COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       INNER JOIN categories c ON c.id = p.category_id
       ${reportFilters.where}
       GROUP BY c.id, c.name
       ORDER BY total DESC`,
      reportFilters.params,
    );

    const [paymentTotals] = await pool.execute(
      `SELECT pm.name, pm.code, COUNT(DISTINCT s.id) AS sales_count, COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       INNER JOIN products p ON p.id = si.product_id
       ${reportFilters.where}
       GROUP BY pm.id, pm.name, pm.code
       ORDER BY total DESC`,
      reportFilters.params,
    );

    const [recentSales] = await pool.execute(
      `SELECT s.id, s.receipt_number, s.member_number, s.member_name, s.created_at,
              u.name AS user_name, pm.name AS payment_method_name,
              COALESCE(SUM(si.quantity), 0) AS quantity,
              COALESCE(SUM(si.line_total), 0) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       ${reportFilters.where}
       GROUP BY s.id, s.receipt_number, s.member_number, s.member_name, s.created_at, u.name, pm.name
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 50`,
      reportFilters.params,
    );

    const [lowStock] = await pool.execute(
      `SELECT p.*, c.name AS category_name
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.product_type = 'merchandising' AND p.stock <= p.low_stock_threshold
       ORDER BY p.stock ASC, p.name ASC
       LIMIT 25`,
    );

    const topProduct = merchByProduct[0] || null;
    const salesCount = Number(summary.sales_count || 0);
    const total = Number(summary.total || 0);

    res.render("reports/merchandising", {
      title: "Relatório Merchandising",
      filters,
      queryString,
      categories,
      paymentMethodOptions,
      userOptions,
      exportLink: (type) => merchExportLink(type, queryString),
      summary: {
        ...summary,
        average_sale: salesCount > 0 ? total / salesCount : 0,
        top_product: topProduct ? topProduct.product_name : "",
      },
      merchByMember: decorateReportRows(merchByMember, "total"),
      merchByProduct: decorateReportRows(merchByProduct, "total"),
      merchByMemberProduct,
      salesByDay: decorateReportRows(salesByDay, "total"),
      salesByCategory: decorateReportRows(salesByCategory, "total"),
      paymentTotals: decorateReportRows(paymentTotals, "total"),
      recentSales,
      lowStock,
    });
  }),
);

app.get(
  "/reports/merchandising/export/:type",
  requireAuth,
  asyncRoute(async (req, res) => {
    const filters = normalizeMerchReportFilters(req.query);
    const reportFilters = merchReportFilters(filters);
    const type = String(req.params.type || "");
    const exports = {
      products: {
        filename: "merchandising-produtos.csv",
        columns: [
          { key: "product_name", label: "Produto" },
          { key: "category_name", label: "Categoria" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT si.product_name, c.name AS category_name,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              INNER JOIN categories c ON c.id = p.category_id
              ${reportFilters.where}
              GROUP BY p.id, si.product_name, c.name
              ORDER BY total DESC`,
      },
      members: {
        filename: "merchandising-socios.csv",
        columns: [
          { key: "member_number", label: "Numero" },
          { key: "member_name", label: "Socio" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT s.member_number, s.member_name,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              ${reportFilters.where}
              GROUP BY s.member_number, s.member_name
              ORDER BY total DESC`,
      },
      matrix: {
        filename: "merchandising-quem-comprou-o-que.csv",
        columns: [
          { key: "member_number", label: "Numero" },
          { key: "member_name", label: "Socio" },
          { key: "product_name", label: "Produto" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT s.member_number, s.member_name, si.product_name,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              ${reportFilters.where}
              GROUP BY s.member_number, s.member_name, si.product_name
              ORDER BY total DESC, quantity DESC`,
      },
      daily: {
        filename: "merchandising-diario.csv",
        columns: [
          { key: "day", label: "Dia" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS day,
                     COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              ${reportFilters.where}
              GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
              ORDER BY day DESC`,
      },
      recent: {
        filename: "merchandising-vendas-recentes.csv",
        columns: [
          { key: "receipt_number", label: "Recibo" },
          { key: "created_at", label: "Data" },
          { key: "member_number", label: "Numero" },
          { key: "member_name", label: "Socio" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
          { key: "payment_method_name", label: "Pagamento" },
          { key: "user_name", label: "Utilizador" },
        ],
        sql: `SELECT s.receipt_number, s.created_at, s.member_number, s.member_name,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total,
                     pm.name AS payment_method_name,
                     u.name AS user_name
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
              INNER JOIN users u ON u.id = s.user_id
              ${reportFilters.where}
              GROUP BY s.id, s.receipt_number, s.created_at, s.member_number, s.member_name, pm.name, u.name
              ORDER BY s.created_at DESC`,
      },
      categories: {
        filename: "merchandising-categorias.csv",
        columns: [
          { key: "name", label: "Categoria" },
          { key: "sales_count", label: "Vendas" },
          { key: "quantity", label: "Quantidade" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT c.name, COUNT(DISTINCT s.id) AS sales_count,
                     COALESCE(SUM(si.quantity), 0) AS quantity,
                     COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN products p ON p.id = si.product_id
              INNER JOIN categories c ON c.id = p.category_id
              ${reportFilters.where}
              GROUP BY c.id, c.name
              ORDER BY total DESC`,
      },
      payments: {
        filename: "merchandising-pagamentos.csv",
        columns: [
          { key: "name", label: "Metodo" },
          { key: "sales_count", label: "Vendas" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT pm.name, COUNT(DISTINCT s.id) AS sales_count, COALESCE(SUM(si.line_total), 0) AS total
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
              INNER JOIN products p ON p.id = si.product_id
              ${reportFilters.where}
              GROUP BY pm.id, pm.name
              ORDER BY total DESC`,
      },
    };

    const definition = exports[type];
    if (!definition) {
      return res.redirect("/reports/merchandising");
    }

    const [rows] = await pool.execute(definition.sql, reportFilters.params);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${definition.filename}"`);
    return res.send(rowsToCsv(definition.columns, rows));
  }),
);

app.get(
  "/api/members",
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = String(req.query.q || "").trim();
    const params = [];
    let where = "WHERE active = 1";

    if (query) {
      where += " AND (member_number LIKE ? OR name LIKE ?)";
      const needle = `%${query}%`;
      params.push(needle, needle);
    }

    const [members] = await pool.execute(
      `SELECT member_number, name
       FROM members
       ${where}
       ORDER BY name ASC
       LIMIT 200`,
      params,
    );

    res.json({ ok: true, members });
  }),
);

app.get(
  "/reports/dues",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = normalizeDuesReportFilters(req.query, currentYear());
    const queryString = preserveDuesReportQuery(filters);
    const year = filters.year;
    const expectedAmount = await duesAmountForYear(year);
    const paymentFilter = duesPaymentFilters(filters);
    const searchFilter = memberSearchFilter(filters);
    const paymentMethodOptions = await paymentMethods.getActivePaymentMethods();

    const [[activeMembers]] = await pool.execute(
      `SELECT COUNT(*) AS count
       FROM members m
       WHERE m.active = 1 ${searchFilter.where}`,
      searchFilter.params,
    );
    const expectedTotal = Number(activeMembers ? activeMembers.count : 0) * Number(expectedAmount || 0);

    const [duesTotal] = await pool.execute(
      `SELECT COUNT(*) AS payments_count, SUM(mdp.amount) AS total
       FROM member_dues_payments mdp
       INNER JOIN members m ON m.id = mdp.member_id
       WHERE ${paymentFilter.where} ${searchFilter.where}`,
      [...paymentFilter.params, ...searchFilter.params],
    );
    const paidTotal = Number((duesTotal[0] && duesTotal[0].total) || 0);
    const outstandingTotal = Math.max(0, Number(expectedTotal) - paidTotal);
    const collectionRate = makePercent(paidTotal, expectedTotal);

    const [duesByMethod] = await pool.execute(
      `SELECT pm.name, COUNT(*) AS payments_count, SUM(mdp.amount) AS total
       FROM member_dues_payments mdp
       INNER JOIN payment_methods pm ON pm.id = mdp.payment_method_id
       INNER JOIN members m ON m.id = mdp.member_id
       WHERE ${paymentFilter.where} ${searchFilter.where}
       GROUP BY pm.id, pm.name
       ORDER BY total DESC`,
      [...paymentFilter.params, ...searchFilter.params],
    );

    const [duesByMember] = await pool.execute(
      `SELECT m.member_number, m.name, COUNT(*) AS payments_count, SUM(mdp.amount) AS total, MAX(mdp.paid_at) AS last_paid_at
       FROM member_dues_payments mdp
       INNER JOIN members m ON m.id = mdp.member_id
       WHERE ${paymentFilter.where} ${searchFilter.where}
       GROUP BY m.id, m.member_number, m.name
       HAVING SUM(mdp.amount) >= ?
       ORDER BY total DESC, m.name ASC
       LIMIT 200`,
      [...paymentFilter.params, ...searchFilter.params, expectedAmount],
    );

    const balanceHaving = filters.status === "partial"
      ? "COALESCE(SUM(mdp.amount), 0) > 0 AND COALESCE(SUM(mdp.amount), 0) < ?"
      : "COALESCE(SUM(mdp.amount), 0) < ?";
    const [unpaidMembers] = await pool.execute(
      `SELECT m.member_number, m.name
       FROM members m
       WHERE m.active = 1 ${searchFilter.where}
         AND NOT EXISTS (
           SELECT 1 FROM member_dues_payments mdp
           WHERE mdp.member_id = m.id AND ${paymentFilter.where}
         )
       ORDER BY m.name ASC
       LIMIT 200`,
      [...searchFilter.params, ...paymentFilter.params],
    );

    const [membersWithBalance] = await pool.execute(
      `SELECT
         m.member_number, m.name, COALESCE(SUM(mdp.amount), 0) AS paid_total, MAX(mdp.paid_at) AS last_paid_at
       FROM members m
       LEFT JOIN member_dues_payments mdp
         ON mdp.member_id = m.id AND ${paymentFilter.where}
       WHERE m.active = 1 ${searchFilter.where}
       GROUP BY m.id, m.member_number, m.name
       HAVING ${balanceHaving}
       ORDER BY ( ? - COALESCE(SUM(mdp.amount), 0) ) DESC, m.name ASC
       LIMIT 200`,
      [...paymentFilter.params, ...searchFilter.params, expectedAmount, expectedAmount],
    );

    const [memberStatusCountsRows] = await pool.execute(
      `SELECT
         SUM(CASE WHEN paid_total >= ? THEN 1 ELSE 0 END) AS paid_members,
         SUM(CASE WHEN paid_total > 0 AND paid_total < ? THEN 1 ELSE 0 END) AS partial_members,
         SUM(CASE WHEN paid_total = 0 THEN 1 ELSE 0 END) AS unpaid_members
       FROM (
         SELECT m.id, COALESCE(SUM(mdp.amount), 0) AS paid_total
         FROM members m
         LEFT JOIN member_dues_payments mdp
           ON mdp.member_id = m.id AND ${paymentFilter.where}
         WHERE m.active = 1 ${searchFilter.where}
         GROUP BY m.id
       ) member_totals`,
      [expectedAmount, expectedAmount, ...paymentFilter.params, ...searchFilter.params],
    );
    const memberStatusCounts = memberStatusCountsRows[0] || { paid_members: 0, partial_members: 0, unpaid_members: 0 };

    const [monthlyTrend] = await pool.execute(
      `SELECT DATE_FORMAT(mdp.paid_at, '%Y-%m') AS month, COUNT(*) AS payments_count, SUM(mdp.amount) AS total
       FROM member_dues_payments mdp
       INNER JOIN members m ON m.id = mdp.member_id
       WHERE ${paymentFilter.where} ${searchFilter.where}
       GROUP BY DATE_FORMAT(mdp.paid_at, '%Y-%m')
       ORDER BY month ASC`,
      [...paymentFilter.params, ...searchFilter.params],
    );

    const [recentPayments] = await pool.execute(
      `SELECT mdp.amount, mdp.paid_at, pm.name AS payment_method_name, u.name AS user_name, m.member_number, m.name
       FROM member_dues_payments mdp
       INNER JOIN members m ON m.id = mdp.member_id
       INNER JOIN payment_methods pm ON pm.id = mdp.payment_method_id
       INNER JOIN users u ON u.id = mdp.user_id
       WHERE ${paymentFilter.where} ${searchFilter.where}
       ORDER BY mdp.paid_at DESC, mdp.id DESC
       LIMIT 50`,
      [...paymentFilter.params, ...searchFilter.params],
    );

    const maxOutstanding = Math.max(
      0,
      ...membersWithBalance.map((row) => Math.max(0, Number(expectedAmount || 0) - Number(row.paid_total || 0))),
    );
    const decoratedMembersWithBalance = membersWithBalance.map((row) => {
      const outstanding = Math.max(0, Number(expectedAmount || 0) - Number(row.paid_total || 0));
      return {
        ...row,
        outstanding,
        percent: makePercent(outstanding, maxOutstanding),
      };
    });

    res.render("reports/dues", {
      title: "Relatório de Cotas",
      filters,
      queryString,
      year,
      expectedAmount,
      expectedTotal,
      outstandingTotal,
      paidTotal,
      collectionRate,
      paymentMethodOptions,
      exportLink: (type) => duesExportLink(type, queryString),
      duesTotal: duesTotal[0] || { payments_count: 0, total: 0 },
      duesByMethod: decorateReportRows(duesByMethod, "total"),
      duesByMember,
      unpaidMembers,
      membersWithBalance: decoratedMembersWithBalance,
      memberStatusCounts,
      monthlyTrend: decorateReportRows(monthlyTrend, "total"),
      recentPayments,
    });
  }),
);

app.get(
  "/reports/dues/export/:type",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = normalizeDuesReportFilters(req.query, currentYear());
    const paymentFilter = duesPaymentFilters(filters);
    const searchFilter = memberSearchFilter(filters);
    const expectedAmount = await duesAmountForYear(filters.year);
    const type = String(req.params.type || "");
    const exports = {
      paid: {
        filename: "cotas-socios-pagos.csv",
        columns: [
          { key: "member_number", label: "Numero" },
          { key: "name", label: "Socio" },
          { key: "payments_count", label: "Pagamentos" },
          { key: "total", label: "Total" },
          { key: "last_paid_at", label: "Ultimo pagamento" },
        ],
        sql: `SELECT m.member_number, m.name, COUNT(*) AS payments_count, SUM(mdp.amount) AS total, MAX(mdp.paid_at) AS last_paid_at
              FROM member_dues_payments mdp
              INNER JOIN members m ON m.id = mdp.member_id
              WHERE ${paymentFilter.where} ${searchFilter.where}
              GROUP BY m.id, m.member_number, m.name
              HAVING SUM(mdp.amount) >= ?
              ORDER BY total DESC, m.name ASC`,
        params: [...paymentFilter.params, ...searchFilter.params, expectedAmount],
      },
      outstanding: {
        filename: "cotas-saldos-em-falta.csv",
        columns: [
          { key: "member_number", label: "Numero" },
          { key: "name", label: "Socio" },
          { key: "paid_total", label: "Pago" },
          { key: "outstanding", label: "Em falta" },
          { key: "last_paid_at", label: "Ultimo pagamento" },
        ],
        sql: `SELECT m.member_number, m.name,
                     COALESCE(SUM(mdp.amount), 0) AS paid_total,
                     (? - COALESCE(SUM(mdp.amount), 0)) AS outstanding,
                     MAX(mdp.paid_at) AS last_paid_at
              FROM members m
              LEFT JOIN member_dues_payments mdp
                ON mdp.member_id = m.id AND ${paymentFilter.where}
              WHERE m.active = 1 ${searchFilter.where}
              GROUP BY m.id, m.member_number, m.name
              HAVING COALESCE(SUM(mdp.amount), 0) < ?
              ORDER BY outstanding DESC, m.name ASC`,
        params: [expectedAmount, ...paymentFilter.params, ...searchFilter.params, expectedAmount],
      },
      unpaid: {
        filename: "cotas-socios-sem-pagamento.csv",
        columns: [
          { key: "member_number", label: "Numero" },
          { key: "name", label: "Socio" },
        ],
        sql: `SELECT m.member_number, m.name
              FROM members m
              WHERE m.active = 1 ${searchFilter.where}
                AND NOT EXISTS (
                  SELECT 1 FROM member_dues_payments mdp
                  WHERE mdp.member_id = m.id AND ${paymentFilter.where}
                )
              ORDER BY m.name ASC`,
        params: [...searchFilter.params, ...paymentFilter.params],
      },
      methods: {
        filename: "cotas-metodos-pagamento.csv",
        columns: [
          { key: "name", label: "Metodo" },
          { key: "payments_count", label: "Pagamentos" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT pm.name, COUNT(*) AS payments_count, SUM(mdp.amount) AS total
              FROM member_dues_payments mdp
              INNER JOIN payment_methods pm ON pm.id = mdp.payment_method_id
              INNER JOIN members m ON m.id = mdp.member_id
              WHERE ${paymentFilter.where} ${searchFilter.where}
              GROUP BY pm.id, pm.name
              ORDER BY total DESC`,
        params: [...paymentFilter.params, ...searchFilter.params],
      },
      monthly: {
        filename: "cotas-evolucao-mensal.csv",
        columns: [
          { key: "month", label: "Mes" },
          { key: "payments_count", label: "Pagamentos" },
          { key: "total", label: "Total" },
        ],
        sql: `SELECT DATE_FORMAT(mdp.paid_at, '%Y-%m') AS month, COUNT(*) AS payments_count, SUM(mdp.amount) AS total
              FROM member_dues_payments mdp
              INNER JOIN members m ON m.id = mdp.member_id
              WHERE ${paymentFilter.where} ${searchFilter.where}
              GROUP BY DATE_FORMAT(mdp.paid_at, '%Y-%m')
              ORDER BY month ASC`,
        params: [...paymentFilter.params, ...searchFilter.params],
      },
    };

    const definition = exports[type];
    if (!definition) {
      return res.redirect("/reports/dues");
    }

    const [rows] = await pool.execute(definition.sql, definition.params);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${definition.filename}"`);
    return res.send(rowsToCsv(definition.columns, rows));
  }),
);

app.get(
  "/reports/old",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const filters = dateFilters(req.query);
    const [salesByDay] = await pool.execute(
      `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS day, COUNT(*) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
       ORDER BY day DESC`,
      filters.params,
    );
    const [salesByProduct] = await pool.execute(
      `SELECT si.product_name, SUM(si.quantity) AS quantity, SUM(si.line_total) AS total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY si.product_name
       ORDER BY quantity DESC`,
      filters.params,
    );
    const [salesByEmployee] = await pool.execute(
      `SELECT u.name, COUNT(s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY u.id, u.name
       ORDER BY total DESC`,
      filters.params,
    );
    const [paymentTotals] = await pool.execute(
      `SELECT pm.name, COUNT(s.id) AS sales_count, SUM(s.total_amount) AS total
       FROM sales s
       INNER JOIN payment_methods pm ON pm.id = s.payment_method_id
       WHERE s.status = 'completed' ${filters.where}
       GROUP BY pm.id, pm.name
       ORDER BY total DESC`,
      filters.params,
    );
    const [lowStock] = await pool.execute(
      `SELECT p.*, c.name AS category_name
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL AND p.active = 1 AND p.stock <= p.low_stock_threshold
       ORDER BY p.stock ASC, p.name ASC`,
    );

    res.render("reports/index", {
      title: "Relatórios",
      filters: req.query,
      salesByDay,
      salesByProduct,
      salesByEmployee,
      paymentTotals,
      lowStock,
    });
  }),
);

app.use((req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.status(404).render("error", {
    title: "Página não encontrada",
    message: "A página pedida não existe.",
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render("error", {
    title: "Erro interno",
    message: "Ocorreu um erro. Verifique os dados introduzidos ou tente novamente.",
    layout: req.session && req.session.user ? "layout" : "auth-layout",
  });
});

async function start() {
  await appSettings.hydrate();
  await registerSoftwareVersion();
  app.listen(port, () => {
    console.log(`Bar POS disponível em http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Erro ao iniciar aplicação:", error);
  process.exit(1);
});
