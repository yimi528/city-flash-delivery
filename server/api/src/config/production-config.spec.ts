import { validateProductionConfig } from './production-config'
import { generateKeyPairSync } from 'node:crypto'

const validConfig: Record<string, string> = {
  NODE_ENV: 'production',
  APP_RELEASE_STAGE: 'production',
  DATABASE_URL: 'mysql://app:secret@mysql.internal:3306/city_flash',
  JWT_SECRET: 'a-secure-random-secret-that-is-long-enough',
  CORS_ORIGINS: 'https://ops.city-flash.test',
  ENABLE_SWAGGER: 'false',
  WECHAT_MINI_APP_ID: 'wx123',
  WECHAT_MINI_APP_SECRET: 'secret',
  WECHAT_LOGIN_MOCK_ENABLED: 'false',
  OPERATOR_BOOTSTRAP_ENABLED: 'false',
  WECHAT_PAY_MODE: 'wechat',
  WECHAT_PAY_MOCK_ENABLED: 'false',
  WECHAT_PAY_MCH_ID: '1900000001',
  WECHAT_PAY_CERT_SERIAL: 'SERIAL',
  WECHAT_PAY_PRIVATE_KEY_PATH: '/run/secrets/apiclient_key.pem',
  WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
  WECHAT_PAY_PLATFORM_CERT_SERIAL: 'PLATFORM-SERIAL',
  WECHAT_PAY_PLATFORM_CERT_PATH: '/run/secrets/wechatpay_platform.pem',
  WECHAT_PAY_NOTIFY_URL: 'https://api.city-flash.test/api/payments/wechat/notify',
  WECHAT_PAY_REFUND_NOTIFY_URL: 'https://api.city-flash.test/api/payments/wechat/refund-notify',
  TENCENT_MAP_KEY: 'map-key',
}

function reader(values: Record<string, string>) {
  return { get: (key: string) => values[key] }
}

describe('validateProductionConfig', () => {
  it('accepts a complete production configuration', () => {
    expect(() => validateProductionConfig(reader(validConfig))).not.toThrow()
  })

  it('accepts the WeChat Pay public-key verification mode', () => {
    const publicKeyConfig = { ...validConfig }
    delete publicKeyConfig.WECHAT_PAY_PLATFORM_CERT_SERIAL
    delete publicKeyConfig.WECHAT_PAY_PLATFORM_CERT_PATH
    publicKeyConfig.WECHAT_PAY_PUBLIC_KEY_ID = 'PUB_KEY_ID_3000000001'
    publicKeyConfig.WECHAT_PAY_PUBLIC_KEY_PATH = '/run/secrets/wechatpay_public_key.pem'

    expect(() => validateProductionConfig(reader(publicKeyConfig))).not.toThrow()
  })

  it('accepts a base64-DER inline merchant private key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const base64PrivateKey = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
    const base64Config = {
      ...validConfig,
      WECHAT_PAY_PRIVATE_KEY_PATH: '',
      WECHAT_PAY_PRIVATE_KEY: base64PrivateKey,
    }

    expect(() => validateProductionConfig(reader(base64Config))).not.toThrow()
  })

  it('accepts an unpadded base64-DER inline merchant private key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const base64PrivateKey = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64').replace(/=+$/, '')
    const base64Config = {
      ...validConfig,
      WECHAT_PAY_PRIVATE_KEY_PATH: '',
      WECHAT_PAY_PRIVATE_KEY: base64PrivateKey,
    }

    expect(() => validateProductionConfig(reader(base64Config))).not.toThrow()
  })

  it('rejects real payments without a response-verification key', () => {
    const incompleteConfig = { ...validConfig }
    delete incompleteConfig.WECHAT_PAY_PLATFORM_CERT_SERIAL
    delete incompleteConfig.WECHAT_PAY_PLATFORM_CERT_PATH

    expect(() => validateProductionConfig(reader(incompleteConfig))).toThrow(
      /configure either WECHAT_PAY_PLATFORM_CERT_SERIAL/,
    )
  })

  it('rejects a non-PEM inline merchant private key', () => {
    expect(() => validateProductionConfig(reader({
      ...validConfig,
      WECHAT_PAY_PRIVATE_KEY_PATH: '',
      WECHAT_PAY_PRIVATE_KEY: 'not-a-private-key',
    }))).toThrow(/WECHAT_PAY_PRIVATE_KEY must be a PEM-encoded or base64-DER private key/)
  })

  it('rejects mocks, placeholders and insecure endpoints', () => {
    expect(() =>
      validateProductionConfig(
        reader({
          ...validConfig,
          CORS_ORIGINS: '*',
          WECHAT_LOGIN_MOCK_ENABLED: 'true',
          WECHAT_PAY_NOTIFY_URL: 'http://api.example.com/notify',
        }),
      ),
    ).toThrow(/Invalid production configuration/)
  })

  it('accepts safe mock payments in the testing release stage without merchant credentials', () => {
    const mockConfig = {
      ...validConfig,
      APP_RELEASE_STAGE: 'testing',
      CORS_ORIGINS: 'https://ops.city-flash.test',
      WECHAT_PAY_MODE: 'mock',
      WECHAT_PAY_MOCK_ENABLED: 'true',
      WECHAT_PAY_AUTO_RECONCILIATION_ENABLED: 'false',
      WECHAT_PAY_MCH_ID: '',
      WECHAT_PAY_CERT_SERIAL: '',
      WECHAT_PAY_PRIVATE_KEY_PATH: '',
      WECHAT_PAY_API_V3_KEY: '',
      WECHAT_PAY_PLATFORM_CERT_SERIAL: '',
      WECHAT_PAY_PLATFORM_CERT_PATH: '',
      WECHAT_PAY_NOTIFY_URL: '',
      WECHAT_PAY_REFUND_NOTIFY_URL: '',
    }
    expect(() => validateProductionConfig(reader(mockConfig))).not.toThrow()
  })

  it('rejects mock payments in the public production release stage', () => {
    expect(() => validateProductionConfig(reader({
      ...validConfig,
      APP_RELEASE_STAGE: 'production',
      WECHAT_PAY_MODE: 'mock',
      WECHAT_PAY_MOCK_ENABLED: 'true',
      WECHAT_PAY_AUTO_RECONCILIATION_ENABLED: 'false',
    }))).toThrow(/mock payments are only allowed/)
  })

  it('accepts disabled online payments without merchant credentials', () => {
    expect(() => validateProductionConfig(reader({
      ...validConfig,
      WECHAT_PAY_MODE: 'disabled',
      WECHAT_PAY_MOCK_ENABLED: 'false',
      WECHAT_PAY_MCH_ID: '',
      WECHAT_PAY_CERT_SERIAL: '',
      WECHAT_PAY_PRIVATE_KEY_PATH: '',
      WECHAT_PAY_API_V3_KEY: '',
      WECHAT_PAY_PLATFORM_CERT_SERIAL: '',
      WECHAT_PAY_PLATFORM_CERT_PATH: '',
      WECHAT_PAY_NOTIFY_URL: '',
      WECHAT_PAY_REFUND_NOTIFY_URL: '',
    }))).not.toThrow()
  })

  it('allows the temporary weather mock without a Tencent weather key', () => {
    const mockConfig = {
      ...validConfig,
      WEATHER_MOCK_ENABLED: 'true',
      TENCENT_MAP_KEY: '',
    }
    expect(() => validateProductionConfig(reader(mockConfig))).not.toThrow()
  })

  it('does not constrain local development', () => {
    expect(() => validateProductionConfig(reader({ NODE_ENV: 'development' }))).not.toThrow()
  })
})
