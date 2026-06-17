UPDATE app_settings
SET setting_value = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(setting_value, 'Cotas', 'Quotas'),
      'cotas',
      'quotas'
    ),
    'Cota',
    'Quota'
  ),
  'cota',
  'quota'
)
WHERE setting_key IN ('debtorEmailSubject', 'debtorEmailBody');
