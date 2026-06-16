INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('memberWelcomeEmailSubject', 'Bem-vindo ao {appName}'),
  ('memberWelcomeEmailBody', 'Olá {memberName},\n\nBem-vindo ao {appName}.\n\nSegue em anexo o PDF com os estatutos do motoclube.\n\nCumprimentos,\n{appName}'),
  ('debtorEmailSubject', 'Cota em atraso - {year}'),
  ('debtorEmailBody', 'Olá {memberName},\n\nDe acordo com os nossos registos, existe um valor em falta na tua cota de {year}.\n\nValor anual: {expectedAmount}\nValor pago: {paidTotal}\nValor em falta: {dueAmount}\n\nObrigado.\n\n{appName}');
