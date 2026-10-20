const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const BACKUP_FORMAT = "bar-pos-backup-v1";
const BACKUP_TABLES = [
  "users",
  "categories",
  "products",
  "product_images",
  "payment_methods",
  "bar_tables",
  "table_orders",
  "table_order_items",
  "sales",
  "sale_items",
  "stock_movements",
  "members",
  "member_dues_payments",
  "dues_years",
  "app_settings",
  "software_versions",
  "cash_closings",
];

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:-]/g, "").replace("T", "-");
}

function backupFilename(appName, date = new Date()) {
  const slug = String(appName || "bar-pos")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "bar-pos";

  return `${slug}-backup-${backupTimestamp(date)}.json.gz`;
}

function assertBackupDestination(destinationPath) {
  const normalizedPath = String(destinationPath || "").trim();
  if (!normalizedPath) {
    throw new Error("Configure a pasta de destino dos backups.");
  }
  if (!path.isAbsolute(normalizedPath)) {
    throw new Error("A pasta de destino tem de ser um caminho absoluto.");
  }

  return normalizedPath;
}

function safeBackupUploadPath(relativePath) {
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  const cleanPath = path.posix.normalize(normalizedPath);

  if (!cleanPath || cleanPath === "." || cleanPath.startsWith("../") || cleanPath === ".." || path.isAbsolute(cleanPath)) {
    throw new Error(`Caminho inválido no backup: ${relativePath}`);
  }

  return cleanPath;
}

async function listExistingBackupTables(pool) {
  const [rows] = await pool.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const existingTables = new Set(rows.map((row) => String(Object.values(row)[0] || "")));
  return BACKUP_TABLES.filter((table) => existingTables.has(table));
}

async function dumpTables(pool) {
  const tables = {};
  const tableNames = await listExistingBackupTables(pool);

  for (const table of tableNames) {
    const identifier = escapeIdentifier(table);
    const [schemaRows] = await pool.query(`SHOW CREATE TABLE ${identifier}`);
    const [rows] = await pool.query(`SELECT * FROM ${identifier}`);
    const schema = schemaRows[0] ? schemaRows[0]["Create Table"] : "";

    tables[table] = {
      schema,
      rowCount: rows.length,
      rows,
    };
  }

  return tables;
}

async function collectUploadFiles(uploadDir, currentDir = uploadDir) {
  let entries;

  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectUploadFiles(uploadDir, fullPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const [stat, content] = await Promise.all([fs.stat(fullPath), fs.readFile(fullPath)]);
    const relativePath = path.relative(uploadDir, fullPath).split(path.sep).join("/");

    files.push({
      path: relativePath,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      encoding: "base64",
      content: content.toString("base64"),
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function parseBackupBuffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const isGzip = source.length >= 2 && source[0] === 0x1f && source[1] === 0x8b;
  const content = isGzip ? await gunzip(source) : source;
  let payload;

  try {
    payload = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error("O ficheiro de backup não é JSON válido.");
  }

  if (!payload || payload.format !== BACKUP_FORMAT) {
    throw new Error("Formato de backup inválido ou incompatível.");
  }

  if (!payload.database || !payload.database.tables || typeof payload.database.tables !== "object") {
    throw new Error("O backup não contém dados da base de dados.");
  }

  if (!payload.uploads || !Array.isArray(payload.uploads.files)) {
    throw new Error("O backup não contém a lista de uploads.");
  }

  return payload;
}

async function createBackup({ pool, uploadDir, appName, softwareVersion, user }) {
  const generatedAt = new Date();
  const [tables, uploadFiles] = await Promise.all([
    dumpTables(pool),
    collectUploadFiles(uploadDir),
  ]);
  const uploadBytes = uploadFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const payload = {
    format: BACKUP_FORMAT,
    generatedAt: generatedAt.toISOString(),
    app: {
      name: appName,
      softwareVersion,
      nodeVersion: process.version,
    },
    generatedBy: user
      ? {
          id: user.id,
          name: user.name,
          role: user.role,
        }
      : null,
    database: {
      tableCount: Object.keys(tables).length,
      tables,
    },
    uploads: {
      fileCount: uploadFiles.length,
      totalBytes: uploadBytes,
      files: uploadFiles,
    },
  };
  const json = JSON.stringify(payload, null, 2);
  const buffer = await gzip(json, { level: 9 });

  return {
    filename: backupFilename(appName, generatedAt),
    buffer,
    payloadSize: Buffer.byteLength(json),
    compressedSize: buffer.length,
  };
}

async function writeUniqueFile(directoryPath, filename, buffer) {
  const parsed = path.parse(filename);

  for (let index = 0; index < 100; index += 1) {
    const nextFilename = index === 0 ? filename : `${parsed.name}-${index + 1}${parsed.ext}`;
    const filePath = path.join(directoryPath, nextFilename);

    try {
      await fs.writeFile(filePath, buffer, { flag: "wx" });
      return { filename: nextFilename, filePath };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  throw new Error("Não foi possível criar um nome único para o backup.");
}

async function saveBackupToDirectory(backup, destinationPath) {
  const directoryPath = assertBackupDestination(destinationPath);
  await fs.mkdir(directoryPath, { recursive: true });

  return writeUniqueFile(directoryPath, backup.filename, backup.buffer);
}

async function clearDirectory(directoryPath) {
  const resolvedPath = path.resolve(directoryPath);
  if (resolvedPath === path.parse(resolvedPath).root) {
    throw new Error("Recusado limpar uma pasta raiz.");
  }

  await fs.mkdir(resolvedPath, { recursive: true });
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

  for (const entry of entries) {
    await fs.rm(path.join(resolvedPath, entry.name), { force: true, recursive: true });
  }
}

async function restoreUploadFiles(uploadDir, uploadFiles) {
  await clearDirectory(uploadDir);

  for (const file of uploadFiles) {
    if (!file || file.encoding !== "base64") {
      throw new Error("O backup contém um ficheiro de upload inválido.");
    }

    const safePath = safeBackupUploadPath(file.path);
    const fullPath = path.join(uploadDir, safePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, Buffer.from(file.content || "", "base64"), { flag: "wx" });
  }
}

async function restoreTables(connection, tables) {
  const existingTables = await listExistingBackupTables(connection);
  const existingTableSet = new Set(existingTables);
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");

  try {
    for (const table of existingTables.slice().reverse()) {
      await connection.query(`DELETE FROM ${escapeIdentifier(table)}`);
    }

    for (const table of BACKUP_TABLES) {
      if (!existingTableSet.has(table)) {
        continue;
      }

      const tableBackup = tables[table];
      const rows = tableBackup && Array.isArray(tableBackup.rows) ? tableBackup.rows : [];

      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) {
          continue;
        }

        const columnSql = columns.map(escapeIdentifier).join(", ");
        const placeholderSql = columns.map(() => "?").join(", ");
        const values = columns.map((column) => row[column]);
        await connection.query(
          `INSERT INTO ${escapeIdentifier(table)} (${columnSql}) VALUES (${placeholderSql})`,
          values,
        );
      }
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

async function restoreBackup({ pool, uploadDir, buffer }) {
  const payload = await parseBackupBuffer(buffer);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await restoreTables(connection, payload.database.tables);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await restoreUploadFiles(uploadDir, payload.uploads.files);

  return {
    generatedAt: payload.generatedAt,
    tableCount: Number(payload.database.tableCount || Object.keys(payload.database.tables).length),
    uploadFileCount: Number(payload.uploads.fileCount || payload.uploads.files.length),
  };
}

module.exports = {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  assertBackupDestination,
  backupFilename,
  backupTimestamp,
  collectUploadFiles,
  createBackup,
  parseBackupBuffer,
  restoreBackup,
  restoreUploadFiles,
  safeBackupUploadPath,
  saveBackupToDirectory,
};
