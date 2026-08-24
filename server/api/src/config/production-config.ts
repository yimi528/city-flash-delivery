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

function hasPemHeader(valueToCheck: string, kind: 'PRIVATE KEY' | 'PUBLIC KEY' | 'CERTIFICATE') {
  return new RegExp(`-----BEGIN (?:[A-Z]+ )?${kind}-----`).test(valueToCheck)
}

function hasBase64Der(valueToCheck: string, kind: 'PRIVATE KEY' | 'PUBLIC KEY' | 'CERTIFICATE') {
  const compact = valueToCheck.replace(/\s+/g, '')
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false
  const der = Buffer.from(compact, 'base64')
  const minimumLength = kind === 'PRIVATE KEY' ? 512 : 128
  return der.length >= minimumLength && der[0] === 0x30
}

function hasPemOrBase64Der(valueToCheck: string, kind: 'PRIVATE KEY' | 'PUBLIC KEY' | 'CERTIFICATE') {
  return hasPemHeader(valueToCheck, kind) || hasBase64Der(valueToCheck, kind)
}

export function validateProductionConfig(config: ConfigReader) {
  if (value(config, 'NODE_ENV') !== 'production') return

  const errors: string[] = []
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'WECHAT_MINI_APP_ID',
    'WECHAT_MINI_APP_SECRET',
  ]
  if (value(config, 'WEATHER_MOCK_ENABLED') !== 'true') required.push('TENCENT_MAP_KEY')
  required.forEach((key) => requireValue(config, key, errors))

  const jwtSecret = value(config, 'JWT_SECRET')
  if (jwtSecret && jwtSecret.length < 32) errors.push('JWT_SECRET must contain at least 32 characters')

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
  if (value(config, 'OPERATOR_BOOTSTRAP_ENABLED') !== 'false') errors.push('OPERATOR_BOOTSTRAP_ENABLED must be false in production')
  if (!origins.length) errors.push('CORS_ORIGINS must contain the merchant HTTPS origin')
  const releaseStage = value(config, 'APP_RELEASE_STAGE') || 'testing'
  if (!['testing', 'production'].includes(releaseStage)) {
    errors.push('APP_RELEASE_STAGE must be testing or production')
  }

  const paymentMode = value(config, 'WECHAT_PAY_MODE') || 'mock'
  if (!['mock', 'wechat', 'disabled'].includes(paymentMode)) {
    errors.push('WECHAT_PAY_MODE must be mock, wechat or disabled')
  }
  if (paymentMode === 'mock') {
    if (releaseStage !== 'testing') errors.push('mock payments are only allowed when APP_RELEASE_STAGE=testing')
    if (value(config, 'WECHAT_PAY_MOCK_ENABLED') !== 'true') {
      errors.push('WECHAT_PAY_MOCK_ENABLED must be true when WECHAT_PAY_MODE=mock')
    }
    if (value(config, 'WECHAT_PAY_AUTO_RECONCILIATION_ENABLED') === 'true') {
      errors.push('automatic reconciliation must be disabled for mock payments')
    }
  }
  if (paymentMode === 'disabled' && value(config, 'WECHAT_PAY_MOCK_ENABLED') === 'true') {
    errors.push('WECHAT_PAY_MOCK_ENABLED must be false when WECHAT_PAY_MODE=disabled')
  }
  if (value(config, 'ENABLE_SWAGGER') === 'true') {
    errors.push('ENABLE_SWAGGER must not be true in production')
  }
  if (value(config, 'OPERATOR_BOOTSTRAP_ENABLED') === 'true') {
    errors.push('OPERATOR_BOOTSTRAP_ENABLED must be false in production after the first operator is created')
  }

  for (const [key, minimum] of [
    ['CUSTOMER_AUTH_TOKEN_TTL_SECONDS', 900],
    ['RIDER_AUTH_TOKEN_TTL_SECONDS', 900],
    ['OPERATOR_AUTH_TOKEN_TTL_SECONDS', 900],
  ] as const) {
    const ttl = Number(value(config, key) || value(config, 'AUTH_TOKEN_TTL_SECONDS') || '604800')
    if (!Number.isInteger(ttl) || ttl < minimum || ttl > 604800) {
      errors.push(`${key} must be an integer between ${minimum} and 604800`)
    }
  }

  if (paymentMode === 'wechat') {
    for (const key of [
      'WECHAT_PAY_MCH_ID',
      'WECHAT_PAY_CERT_SERIAL',
      'WECHAT_PAY_API_V3_KEY',
      'WECHAT_PAY_NOTIFY_URL',
      'WECHAT_PAY_REFUND_NOTIFY_URL',
    ]) requireValue(config, key, errors)

    const apiV3Key = value(config, 'WECHAT_PAY_API_V3_KEY')
    if (apiV3Key && Buffer.byteLength(apiV3Key, 'utf8') !== 32) {
      errors.push('WECHAT_PAY_API_V3_KEY must contain exactly 32 bytes')
    }
    for (const key of ['WECHAT_PAY_NOTIFY_URL', 'WECHAT_PAY_REFUND_NOTIFY_URL']) {
      const current = value(config, key)
      if (current && !current.startsWith('https://')) errors.push(`${key} must use HTTPS`)
    }
    if (value(config, 'WECHAT_PAY_MOCK_ENABLED') !== 'false') {
      errors.push('WECHAT_PAY_MOCK_ENABLED must be false when WECHAT_PAY_MODE=wechat')
    }

    const privateKey = value(config, 'WECHAT_PAY_PRIVATE_KEY')
    const privateKeyPath = value(config, 'WECHAT_PAY_PRIVATE_KEY_PATH')
    if (!privateKey && !privateKeyPath) {
      errors.push('WECHAT_PAY_PRIVATE_KEY or WECHAT_PAY_PRIVATE_KEY_PATH must be configured')
    } else if (privateKey && !hasPemOrBase64Der(privateKey, 'PRIVATE KEY')) {
      errors.push('WECHAT_PAY_PRIVATE_KEY must be a PEM-encoded or base64-DER private key')
    }

    const platformCertSerial = value(config, 'WECHAT_PAY_PLATFORM_CERT_SERIAL')
    const platformCert = value(config, 'WECHAT_PAY_PLATFORM_CERT')
    const platformCertPath = value(config, 'WECHAT_PAY_PLATFORM_CERT_PATH')
    const publicKeyId = value(config, 'WECHAT_PAY_PUBLIC_KEY_ID')
    const publicKey = value(config, 'WECHAT_PAY_PUBLIC_KEY')
    const publicKeyPath = value(config, 'WECHAT_PAY_PUBLIC_KEY_PATH')
    const hasPlatformCertificate = Boolean(platformCertSerial && (platformCert || platformCertPath))
    const hasPublicKey = Boolean(publicKeyId && (publicKey || publicKeyPath))
    if (!hasPlatformCertificate && !hasPublicKey) {
      errors.push(
        'configure either WECHAT_PAY_PLATFORM_CERT_SERIAL with a platform certificate, or WECHAT_PAY_PUBLIC_KEY_ID with a public key',
      )
    }
    if (platformCertSerial && !platformCert && !platformCertPath && !hasPublicKey) {
      errors.push('WECHAT_PAY_PLATFORM_CERT or WECHAT_PAY_PLATFORM_CERT_PATH must be configured')
    }
    if (publicKeyId && !publicKey && !publicKeyPath && !hasPlatformCertificate) {
      errors.push('WECHAT_PAY_PUBLIC_KEY or WECHAT_PAY_PUBLIC_KEY_PATH must be configured')
    }
    if (platformCert && !hasPemOrBase64Der(platformCert, 'CERTIFICATE')) {
      errors.push('WECHAT_PAY_PLATFORM_CERT must be a PEM-encoded or base64-DER certificate')
    }
    if (publicKey && !hasPemOrBase64Der(publicKey, 'PUBLIC KEY')) {
      errors.push('WECHAT_PAY_PUBLIC_KEY must be a PEM-encoded or base64-DER public key')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`)
  }
}
