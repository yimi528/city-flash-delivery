// 开发版只访问本机 API；体验版访问当前云托管测试环境。
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000/api'

// 当前云环境先作为体验测试环境使用。正式上线前创建独立生产环境并填写下方 ID。
const WX_CLOUD_TEST_ENV_ID = 'prod-d0gpn0x7a421ec215'
const WX_CLOUD_PROD_ENV_ID = ''
const WX_CLOUD_SERVICE_NAME = 'city-flash-api'

const API_BASE_URLS = Object.freeze({
  develop: LOCAL_API_BASE_URL,
  developDevice: LOCAL_API_BASE_URL,
  trial: LOCAL_API_BASE_URL,
  release: LOCAL_API_BASE_URL
})

function environmentVersion(wxApi) {
  try {
    const account = wxApi && wxApi.getAccountInfoSync ? wxApi.getAccountInfoSync() : null
    return account && account.miniProgram && account.miniProgram.envVersion
      ? account.miniProgram.envVersion
      : 'develop'
  } catch (error) {
    return 'develop'
  }
}

function isRealDevice(wxApi) {
  try {
    const systemInfo = wxApi && wxApi.getSystemInfoSync ? wxApi.getSystemInfoSync() : null
    return Boolean(systemInfo && (systemInfo.platform === 'ios' || systemInfo.platform === 'android'))
  } catch (error) {
    return false
  }
}

function resolveCloudEnvId(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'develop') return ''
  if (version === 'trial') return WX_CLOUD_TEST_ENV_ID
  if (version === 'release') return WX_CLOUD_PROD_ENV_ID
  return ''
}

function resolveApiBaseUrl(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'develop') {
    try {
      const override = wxApi && wxApi.getStorageSync ? wxApi.getStorageSync('developerApiBaseUrl') : ''
      if (override && /^https?:\/\//.test(String(override))) return String(override).replace(/\/$/, '')
    } catch (error) {}
    if (isRealDevice(wxApi)) return API_BASE_URLS.developDevice
  }
  return API_BASE_URLS[version] || API_BASE_URLS.release
}

module.exports = {
  LOCAL_API_BASE_URL,
  API_BASE_URLS,
  WX_CLOUD_TEST_ENV_ID,
  WX_CLOUD_PROD_ENV_ID,
  WX_CLOUD_SERVICE_NAME,
  environmentVersion,
  isRealDevice,
  resolveCloudEnvId,
  resolveApiBaseUrl
}
