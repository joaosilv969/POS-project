const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  assertBackupDestination,
  backupFilename,
  collectUploadFiles,
  parseBackupBuffer,
  safeBackupUploadPath,
  saveBackupToDirectory,
} = require("../src/services/backups");

const gzip = promisify(zlib.gzip);

test("backup format stays versioned", () => {
  assert.equal(BACKUP_FORMAT, "bar-pos-backup-v1");
});

test("backup table list includes products and image metadata", () => {
  assert.ok(BACKUP_TABLES.includes("products"));
  assert.ok(BACKUP_TABLES.includes("product_images"));
});

test("backupFilename creates a safe compressed filename", () => {
  const filename = backupFilename("Motoclube V13", new Date("2026-06-17T14:05:06Z"));

  assert.equal(filename, "motoclube-v13-backup-20260617-140506Z.json.gz");
});

test("collectUploadFiles embeds files as base64", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bar-pos-backup-"));
  await fs.mkdir(path.join(root, "nested"));
  await fs.writeFile(path.join(root, "nested", "hello.txt"), "ola");

  const files = await collectUploadFiles(root);

  assert.equal(files.length, 1);
  assert.equal(files[0].path, "nested/hello.txt");
  assert.equal(files[0].encoding, "base64");
  assert.equal(Buffer.from(files[0].content, "base64").toString("utf8"), "ola");
});

test("safeBackupUploadPath rejects unsafe paths", () => {
  assert.throws(() => safeBackupUploadPath("../secret.txt"), /Caminho inválido/);
  assert.throws(() => safeBackupUploadPath("/secret.txt"), /Caminho inválido/);
});

test("parseBackupBuffer accepts gzipped backup payloads", async () => {
  const payload = {
    format: BACKUP_FORMAT,
    database: { tables: { products: { rows: [] }, product_images: { rows: [] } } },
    uploads: { files: [] },
  };
  const parsed = await parseBackupBuffer(await gzip(JSON.stringify(payload)));

  assert.equal(parsed.format, BACKUP_FORMAT);
});

test("assertBackupDestination requires an absolute path", () => {
  assert.throws(() => assertBackupDestination("relative/path"), /caminho absoluto/);
});

test("saveBackupToDirectory writes a compressed backup file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bar-pos-backup-destination-"));
  const saved = await saveBackupToDirectory({
    filename: "backup.json.gz",
    buffer: Buffer.from("backup"),
  }, root);

  assert.equal(saved.filename, "backup.json.gz");
  assert.equal(await fs.readFile(saved.filePath, "utf8"), "backup");
});
