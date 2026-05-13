function parseNumber(value, fallback = 0) {
  const normalized = String(value ?? "").replace(",", ".");
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
