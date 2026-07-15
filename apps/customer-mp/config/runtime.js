const API_BASE_URLS = Object.freeze({
  develop: 'http://127.0.0.1:3000/api',
  trial: 'https://api.example.com/api',
  release: 'https://api.example.com/api'
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

function resolveApiBaseUrl(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'develop') {
    try {
      const override = wxApi && wxApi.getStorageSync ? wxApi.getStorageSync('developerApiBaseUrl') : ''
      if (override && /^https?:\/\//.test(String(override))) return String(override).replace(/\/$/, '')
    } catch (error) {}
  }
  return API_BASE_URLS[version] || API_BASE_URLS.release
}

module.exports = {
  API_BASE_URLS,
  environmentVersion,
  resolveApiBaseUrl
}
