// 当前开发/真机/体验环境统一通过 Quick Tunnel 访问 osako 上的 API。
const OSAKO_API_BASE_URL = 'https://systematic-meaning-regardless-supplier.trycloudflare.com/api'
// 保留旧导出名，避免其他本地工具引用时失效；它不再指向局域网 IP。
const LOCAL_API_BASE_URL = OSAKO_API_BASE_URL

const API_BASE_URLS = Object.freeze({
  develop: OSAKO_API_BASE_URL,
  developDevice: OSAKO_API_BASE_URL,
  trial: OSAKO_API_BASE_URL,
  release: 'https://xian-api-img6c740.sealosbja.site/api'
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
  OSAKO_API_BASE_URL,
  LOCAL_API_BASE_URL,
  API_BASE_URLS,
  environmentVersion,
  isRealDevice,
  resolveApiBaseUrl
}
