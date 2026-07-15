import { validateProductionConfig } from './production-config'

const validConfig: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret@database.internal:5432/city_flash',
  REDIS_URL: 'redis://:secret@redis.internal:6379',
  JWT_SECRET: 'a-secure-random-secret-that-is-long-enough',
  CORS_ORIGINS: 'https://ops.city-flash.test',
  ENABLE_SWAGGER: 'false',
  WECHAT_MINI_APP_ID: 'wx123',
  WECHAT_MINI_APP_SECRET: 'secret',
  WECHAT_LOGIN_MOCK_ENABLED: 'false',
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

  it('does not constrain local development', () => {
    expect(() => validateProductionConfig(reader({ NODE_ENV: 'development' }))).not.toThrow()
  })
})
