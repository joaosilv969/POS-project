function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function splitCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(line) {
  const candidates = [",", ";", "\t"];
  let selected = ",";
  let bestCount = -1;

  for (const candidate of candidates) {
    const count = countDelimiter(line, candidate);
    if (count > bestCount) {
      bestCount = count;
      selected = candidate;
    }
  }

  return selected;
}

function detectHeader(columns) {
  const aliases = {
    memberNumber: new Set(["membernumber", "memberno", "numero", "numerosocio", "numsocio", "nrsocio"]),
    name: new Set(["name", "nome", "nomesocio", "membername", "socio"]),
    active: new Set(["active", "ativo", "activa", "estado", "status"]),
  };

  const mapping = {};

  columns.forEach((column, index) => {
    const normalized = normalizeHeader(column);
    if (!mapping.memberNumber && aliases.memberNumber.has(normalized)) {
      mapping.memberNumber = index;
      return;
    }
    if (!mapping.name && aliases.name.has(normalized)) {
      mapping.name = index;
      return;
    }
    if (!mapping.active && aliases.active.has(normalized)) {
      mapping.active = index;
    }
  });

  return mapping.memberNumber !== undefined && mapping.name !== undefined ? mapping : null;
}

function parseActiveValue(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) {
    return 1;
  }

  if (["0", "false", "nao", "no", "inativo", "inactive"].includes(normalized)) {
    return 0;
  }

  return 1;
}

function parseMembersCsv(input) {
  const source = String(input || "").replace(/^\uFEFF/, "");
  const rawLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawLines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(rawLines[0]);
  const firstColumns = splitCsvLine(rawLines[0], delimiter);
  const headerMap = detectHeader(firstColumns);
  const rows = [];
  const startIndex = headerMap ? 1 : 0;

  for (let index = startIndex; index < rawLines.length; index += 1) {
    const columns = splitCsvLine(rawLines[index], delimiter);
    rows.push({
      memberNumber: String(headerMap ? columns[headerMap.memberNumber] || "" : columns[0] || "").trim(),
      name: String(headerMap ? columns[headerMap.name] || "" : columns[1] || "").trim(),
      active: parseActiveValue(headerMap && headerMap.active !== undefined ? columns[headerMap.active] : columns[2]),
    });
  }

  return rows;
}

module.exports = {
  parseMembersCsv,
};
