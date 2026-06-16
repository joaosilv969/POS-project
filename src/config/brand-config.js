const fs = require("fs");
const path = require("path");

const CONFIG_FILE_NAME = "brand-config.json";

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function validReceiptPrefix(value, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{1,3}$/.test(normalized) ? normalized : fallback;
}

function createBrandConfigStore(uploadDir) {
  const configPath = path.join(uploadDir, CONFIG_FILE_NAME);
  let config = readConfig(configPath);

  function save(nextConfig = config) {
    config = { ...nextConfig };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  function update(patch) {
    config = { ...config, ...patch };
    save(config);
    return config;
  }

  function appName() {
    const value = String(config.appName || "").trim();
    return value || "Motoclube";
  }

  function appSubtitle() {
    const value = String(config.appSubtitle || "").trim();
    return value || "Gestão de vendas";
  }

  function defaultLowStockThreshold() {
    const value = Number.parseInt(config.defaultLowStockThreshold, 10);
    return Number.isFinite(value) && value >= 0 ? value : 5;
  }

  function receiptPrefixBar() {
    return validReceiptPrefix(config.receiptPrefixBar, "V");
  }

  function receiptPrefixMerchandising() {
    return validReceiptPrefix(config.receiptPrefixMerchandising, "M");
  }

  function duesDefaultAmount() {
    const value = Number(config.duesDefaultAmount);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  return {
    appName,
    appSubtitle,
    defaultLowStockThreshold,
    duesDefaultAmount,
    get: () => config,
    receiptPrefixBar,
    receiptPrefixMerchandising,
    save,
    update,
  };
}

module.exports = {
  createBrandConfigStore,
};
