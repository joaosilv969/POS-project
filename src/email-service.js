const crypto = require("crypto");
const net = require("net");
const path = require("path");
const tls = require("tls");

function encodeHeader(value) {
  const source = String(value || "");
  return /^[\x00-\x7F]*$/.test(source) ? source : `=?UTF-8?B?${Buffer.from(source, "utf8").toString("base64")}?=`;
}

function normalizeAddress(address) {
  return String(address || "").trim();
}

function escapeData(value) {
  return String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");
}

function attachmentPart(attachment) {
  const filename = path.basename(attachment.filename || "anexo.pdf");
  const content = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(String(attachment.content || ""));

  return [
    `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    content.toString("base64").replace(/.{1,76}/g, "$&\r\n").trim(),
  ].join("\r\n");
}

function buildMessage({ from, to, subject, text, html, attachments = [] }) {
  const boundary = `----barpos-${crypto.randomBytes(12).toString("hex")}`;
  const bodyParts = [
    `--${boundary}`,
    html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html || text || "",
  ];

  for (const attachment of attachments) {
    bodyParts.push(`--${boundary}`, attachmentPart(attachment));
  }

  bodyParts.push(`--${boundary}--`);

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    bodyParts.join("\r\n"),
  ].join("\r\n");
}

function createSmtpConnection({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });

    socket.setEncoding("utf8");
    socket.setTimeout(30000);
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("Tempo esgotado ao ligar ao servidor de email.")));
    if (secure) {
      socket.once("secureConnect", () => resolve(socket));
    } else {
      socket.once("connect", () => resolve(socket));
    }
  });
}

function createResponseReader(socket) {
  let buffer = "";

  return function readResponse() {
    return new Promise((resolve, reject) => {
      function cleanup() {
        socket.off("data", onData);
        socket.off("error", onError);
      }

      function onError(error) {
        cleanup();
        reject(error);
      }

      function onData(chunk) {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line));

        if (completeIndex === -1) {
          return;
        }

        const responseLines = lines.slice(0, completeIndex + 1);
        buffer = lines.slice(completeIndex + 1).join("\n");
        cleanup();
        resolve(responseLines.join("\n"));
      }

      socket.on("data", onData);
      socket.on("error", onError);
    });
  };
}

async function expect(readResponse, command, allowedCodes = [250]) {
  const response = await readResponse();
  const code = Number.parseInt(response.slice(0, 3), 10);
  if (!allowedCodes.includes(code)) {
    throw new Error(`Erro SMTP em ${command}: ${response}`);
  }
  return response;
}

function write(socket, line) {
  socket.write(`${line}\r\n`);
}

async function authenticate(socket, readResponse, username, password) {
  write(socket, `AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`, "utf8").toString("base64")}`);
  let response = await readResponse();
  let code = Number.parseInt(response.slice(0, 3), 10);
  if (code === 235) {
    return;
  }

  write(socket, "AUTH LOGIN");
  response = await readResponse();
  code = Number.parseInt(response.slice(0, 3), 10);
  if (code !== 334) {
    throw new Error(`Erro SMTP em AUTH: ${response}`);
  }

  write(socket, Buffer.from(username, "utf8").toString("base64"));
  response = await readResponse();
  code = Number.parseInt(response.slice(0, 3), 10);
  if (code !== 334) {
    throw new Error(`Erro SMTP em AUTH: ${response}`);
  }

  write(socket, Buffer.from(password, "utf8").toString("base64"));
  response = await readResponse();
  code = Number.parseInt(response.slice(0, 3), 10);
  if (code !== 235) {
    throw new Error(`Erro SMTP em AUTH: ${response}`);
  }
}

async function sendEmail(settings, message) {
  const host = String(settings.smtpHost || "").trim();
  const port = Number(settings.smtpPort || 587);
  const secure = Boolean(settings.smtpSecure);
  const username = String(settings.smtpUser || "").trim();
  const password = String(settings.smtpPass || "");
  const from = normalizeAddress(settings.smtpFrom || username);
  const to = normalizeAddress(message.to);

  if (!host || !port || !from || !to) {
    throw new Error("Configuração de email incompleta.");
  }

  let socket = await createSmtpConnection({ host, port, secure });
  let readResponse = createResponseReader(socket);
  await expect(readResponse, "ligação", [220]);

  write(socket, `EHLO ${settings.smtpEhlo || "localhost"}`);
  await expect(readResponse, "EHLO", [250]);

  if (!secure && Number(port) === 587) {
    write(socket, "STARTTLS");
    await expect(readResponse, "STARTTLS", [220]);
    socket = tls.connect({ socket, servername: host });
    readResponse = createResponseReader(socket);
    write(socket, `EHLO ${settings.smtpEhlo || "localhost"}`);
    await expect(readResponse, "EHLO", [250]);
  }

  if (username && password) {
    await authenticate(socket, readResponse, username, password);
  }

  write(socket, `MAIL FROM:<${from}>`);
  await expect(readResponse, "MAIL FROM", [250]);
  write(socket, `RCPT TO:<${to}>`);
  await expect(readResponse, "RCPT TO", [250, 251]);
  write(socket, "DATA");
  await expect(readResponse, "DATA", [354]);

  socket.write(`${escapeData(buildMessage({ ...message, from, to }))}\r\n.\r\n`);
  await expect(readResponse, "mensagem", [250]);
  write(socket, "QUIT");
  socket.end();
}

module.exports = {
  sendEmail,
};
