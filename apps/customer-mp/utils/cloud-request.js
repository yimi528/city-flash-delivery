function getRuntimeConfig() {
  try {
    return require('../config/runtime')
  } catch (error) {
    return {}
  }
}

function getCloudConfig() {
  const runtime = getRuntimeConfig()
  let app = null
  try {
    app = typeof getApp === 'function' ? getApp() : null
  } catch (error) {}
  const globalData = app && app.globalData ? app.globalData : {}
  return {
    envId: globalData.wxCloudEnvId || runtime.WX_CLOUD_ENV_ID || '',
    serviceName: globalData.wxCloudServiceName || runtime.WX_CLOUD_SERVICE_NAME || 'city-flash-api'
  }
}

function isConfigured() {
  const config = getCloudConfig()
  return Boolean(config.envId && typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callContainer === 'function')
}

function requestCloud(path, options) {
  const config = options || {}
  const cloud = getCloudConfig()
  const header = Object.assign({}, config.header || {}, { 'X-WX-SERVICE': cloud.serviceName })
  return wx.cloud.callContainer({
    config: { env: cloud.envId },
    path: `/api${path}`,
    method: config.method || 'GET',
    data: config.data || {},
    header,
    timeout: config.timeout || 10000
  })
}

module.exports = {
  getCloudConfig,
  isConfigured,
  requestCloud
}
