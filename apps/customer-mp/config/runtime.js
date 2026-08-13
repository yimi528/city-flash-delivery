// 未配置云托管环境时，仅供本机开发工具使用；真机/体验版应配置云托管环境 ID。
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000/api'

// 云托管环境创建后填写；填写后小程序优先使用 wx.cloud.callContainer。
const WX_CLOUD_ENV_ID = 'prod-d0gpn0x7a421ec215'
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
  WX_CLOUD_ENV_ID,
  WX_CLOUD_SERVICE_NAME,
  environmentVersion,
  isRealDevice,
  resolveApiBaseUrl
}
