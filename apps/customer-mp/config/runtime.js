const API_BASE_URLS = Object.freeze({
  develop: 'http://127.0.0.1:3000/api',
  developDevice: 'http://192.168.1.6:3000/api',
  trial: 'https://xian-api-img6c740.sealosbja.site/api',
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
  API_BASE_URLS,
  environmentVersion,
  isRealDevice,
  resolveApiBaseUrl
}
