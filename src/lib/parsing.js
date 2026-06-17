function parseNumber(value, fallback = 0) {
  const cleaned = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!/\d/.test(cleaned)) {
    return fallback;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = cleaned.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = cleaned.replaceAll(".", "").replace(",", ".");
  } else {
    normalized = cleaned.replaceAll(",", "");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function parseInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function currentYear() {
  return new Date().getFullYear();
}

module.exports = {
  currentYear,
  parseInteger,
  parseNumber,
};
