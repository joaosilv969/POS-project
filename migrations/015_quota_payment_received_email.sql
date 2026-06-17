INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('quotaPaymentReceivedEmailSubject', 'Pagamento de quota recebido - {year}'),
  ('quotaPaymentReceivedEmailBody', 'Olá {memberName},\n\nRecebemos o teu pagamento de quota de {year}.\n\nValor recebido: {receivedAmount}\nMétodo de pagamento: {paymentMethod}\nTotal pago este ano: {paidTotal}\nValor em falta: {remainingAmount}\n\nObrigado.\n\n{appName}');
