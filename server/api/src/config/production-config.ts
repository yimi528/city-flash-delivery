type ConfigReader = {
  get(key: string): unknown
}

const PLACEHOLDER_PATTERN = /(replace|change-me|example\.com|your-)/i

function value(config: ConfigReader, key: string) {
  return String(config.get(key) || '').trim()
}

function requireValue(config: ConfigReader, key: string, errors: string[]) {
  const current = value(config, key)
  if (!current || PLACEHOLDER_PATTERN.test(current)) {
    errors.push(`${key} must be configured with a production value`)
  }
  return current
}

export function validateProductionConfig(config: ConfigReader) {
  if (value(config, 'NODE_ENV') !== 'production') return

  const errors: string[] = []
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'CORS_ORIGINS',
    'WECHAT_MINI_APP_ID',
    'WECHAT_MINI_APP_SECRET',
    'WECHAT_PAY_MCH_ID',
    'WECHAT_PAY_CERT_SERIAL',
    'WECHAT_PAY_API_V3_KEY',
    'WECHAT_PAY_PLATFORM_CERT_SERIAL',
    'WECHAT_PAY_NOTIFY_URL',
    'WECHAT_PAY_REFUND_NOTIFY_URL',
    'TENCENT_MAP_KEY',
  ]
  required.forEach((key) => requireValue(config, key, errors))

  const jwtSecret = value(config, 'JWT_SECRET')
  if (jwtSecret && jwtSecret.length < 32) errors.push('JWT_SECRET must contain at least 32 characters')

  const apiV3Key = value(config, 'WECHAT_PAY_API_V3_KEY')
  if (apiV3Key && Buffer.byteLength(apiV3Key, 'utf8') !== 32) {
    errors.push('WECHAT_PAY_API_V3_KEY must contain exactly 32 bytes')
  }

  for (const key of ['WECHAT_PAY_NOTIFY_URL', 'WECHAT_PAY_REFUND_NOTIFY_URL']) {
    const current = value(config, key)
    if (current && !current.startsWith('https://')) errors.push(`${key} must use HTTPS`)
  }

  const origins = value(config, 'CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (origins.some((origin) => !origin.startsWith('https://') || origin.includes('*'))) {
    errors.push('CORS_ORIGINS must contain explicit HTTPS origins')
  }

  if (value(config, 'WECHAT_LOGIN_MOCK_ENABLED') !== 'false') {
    errors.push('WECHAT_LOGIN_MOCK_ENABLED must be false in production')
  }
  if (value(config, 'WECHAT_PAY_MOCK_ENABLED') !== 'false') {
    errors.push('WECHAT_PAY_MOCK_ENABLED must be false in production')
  }
  if (value(config, 'ENABLE_SWAGGER') === 'true') {
    errors.push('ENABLE_SWAGGER must not be true in production')
  }

  const privateKey = value(config, 'WECHAT_PAY_PRIVATE_KEY')
  const privateKeyPath = value(config, 'WECHAT_PAY_PRIVATE_KEY_PATH')
  if (!privateKey && !privateKeyPath) {
    errors.push('WECHAT_PAY_PRIVATE_KEY or WECHAT_PAY_PRIVATE_KEY_PATH must be configured')
  }

  const platformCert = value(config, 'WECHAT_PAY_PLATFORM_CERT')
  const platformCertPath = value(config, 'WECHAT_PAY_PLATFORM_CERT_PATH')
  if (!platformCert && !platformCertPath) {
    errors.push('WECHAT_PAY_PLATFORM_CERT or WECHAT_PAY_PLATFORM_CERT_PATH must be configured')
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`)
  }
}
