function validReceiptPrefix(value, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{1,3}$/.test(normalized) ? normalized : fallback;
}

const DEFAULT_MEMBER_WELCOME_EMAIL_SUBJECT = "Bem-vindo ao {appName}";
const DEFAULT_MEMBER_WELCOME_EMAIL_BODY = `Olá {memberName},

Bem-vindo ao {appName}.

Segue em anexo o PDF com os estatutos do motoclube.

Cumprimentos,
{appName}`;
const DEFAULT_DEBTOR_EMAIL_SUBJECT = "Quota em atraso - {year}";
const DEFAULT_DEBTOR_EMAIL_BODY = `Olá {memberName},

De acordo com os nossos registos, existe um valor em falta na tua quota de {year}.

Valor anual: {expectedAmount}
Valor pago: {paidTotal}
Valor em falta: {dueAmount}

Obrigado.

{appName}`;
const DEFAULT_QUOTA_PAYMENT_RECEIVED_EMAIL_SUBJECT = "Pagamento de quota recebido - {year}";
const DEFAULT_QUOTA_PAYMENT_RECEIVED_EMAIL_BODY = `Olá {memberName},

Recebemos o teu pagamento de quota de {year}.

Valor recebido: {receivedAmount}
Método de pagamento: {paymentMethod}
Total pago este ano: {paidTotal}
Valor em falta: {remainingAmount}

Obrigado.

{appName}`;

function normalizeSettings(source = {}) {
  const appName = String(source.appName || "").trim() || "Motoclube";
  const appSubtitle = String(source.appSubtitle || "").trim() || "Gestão de vendas";
  const defaultLowStockThreshold = Number.parseInt(source.defaultLowStockThreshold, 10);
  const duesDefaultAmount = Number(source.duesDefaultAmount);
  const language = String(source.language || "").trim() || "pt-PT";
  const brandMarkImage = String(source.brandMarkImage || "").trim() || null;
  const smtpPort = Number.parseInt(source.smtpPort, 10);

  return {
    appName,
    appSubtitle,
    defaultLowStockThreshold:
      Number.isFinite(defaultLowStockThreshold) && defaultLowStockThreshold >= 0 ? defaultLowStockThreshold : 5,
    receiptPrefixBar: validReceiptPrefix(source.receiptPrefixBar, "V"),
    receiptPrefixMerchandising: validReceiptPrefix(source.receiptPrefixMerchandising, "M"),
    duesDefaultAmount: Number.isFinite(duesDefaultAmount) && duesDefaultAmount > 0 ? duesDefaultAmount : 0,
    language,
    brandMarkImage,
    debtorEmailBody: String(source.debtorEmailBody || "").trim() || DEFAULT_DEBTOR_EMAIL_BODY,
    debtorEmailSubject: String(source.debtorEmailSubject || "").trim() || DEFAULT_DEBTOR_EMAIL_SUBJECT,
    memberWelcomeEmailBody: String(source.memberWelcomeEmailBody || "").trim() || DEFAULT_MEMBER_WELCOME_EMAIL_BODY,
    memberWelcomeEmailSubject: String(source.memberWelcomeEmailSubject || "").trim() || DEFAULT_MEMBER_WELCOME_EMAIL_SUBJECT,
    quotaPaymentReceivedEmailBody:
      String(source.quotaPaymentReceivedEmailBody || "").trim() || DEFAULT_QUOTA_PAYMENT_RECEIVED_EMAIL_BODY,
    quotaPaymentReceivedEmailSubject:
      String(source.quotaPaymentReceivedEmailSubject || "").trim() || DEFAULT_QUOTA_PAYMENT_RECEIVED_EMAIL_SUBJECT,
    sendMemberWelcomeEmail: String(source.sendMemberWelcomeEmail || "") === "1" || source.sendMemberWelcomeEmail === true ? 1 : 0,
    smtpFrom: String(source.smtpFrom || "").trim(),
    smtpHost: String(source.smtpHost || "").trim(),
    smtpPass: String(source.smtpPass || ""),
    smtpPort: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : 587,
    smtpSecure: String(source.smtpSecure || "") === "1" || source.smtpSecure === true ? 1 : 0,
    smtpUser: String(source.smtpUser || "").trim(),
    statutesPdfFile: String(source.statutesPdfFile || "").trim() || null,
  };
}

function createAppSettingsStore({ pool }) {
  let cache = normalizeSettings();

  async function hydrate() {
    const [rows] = await pool.execute("SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key");
    const next = {};

    for (const row of rows) {
      next[row.setting_key] = row.setting_value;
    }

    cache = normalizeSettings(next);
    return cache;
  }

  async function update(patch = {}) {
    cache = normalizeSettings({ ...cache, ...patch });

    const entries = Object.entries(cache);
    for (const [key, value] of entries) {
      await pool.execute(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value === null || value === undefined ? null : String(value)],
      );
    }

    return cache;
  }

  return {
    appName: () => cache.appName,
    appSubtitle: () => cache.appSubtitle,
    brandMarkImage: () => cache.brandMarkImage,
    defaultLowStockThreshold: () => cache.defaultLowStockThreshold,
    duesDefaultAmount: () => cache.duesDefaultAmount,
    get: () => ({ ...cache }),
    hydrate,
    language: () => cache.language,
    emailTemplates: () => ({
      debtorEmailBody: cache.debtorEmailBody,
      debtorEmailSubject: cache.debtorEmailSubject,
      memberWelcomeEmailBody: cache.memberWelcomeEmailBody,
      memberWelcomeEmailSubject: cache.memberWelcomeEmailSubject,
      quotaPaymentReceivedEmailBody: cache.quotaPaymentReceivedEmailBody,
      quotaPaymentReceivedEmailSubject: cache.quotaPaymentReceivedEmailSubject,
    }),
    receiptPrefixBar: () => cache.receiptPrefixBar,
    receiptPrefixMerchandising: () => cache.receiptPrefixMerchandising,
    sendMemberWelcomeEmail: () => cache.sendMemberWelcomeEmail,
    smtpSettings: () => ({
      smtpFrom: cache.smtpFrom,
      smtpHost: cache.smtpHost,
      smtpPass: cache.smtpPass,
      smtpPort: cache.smtpPort,
      smtpSecure: cache.smtpSecure,
      smtpUser: cache.smtpUser,
    }),
    statutesPdfFile: () => cache.statutesPdfFile,
    update,
  };
}

module.exports = {
  createAppSettingsStore,
};
