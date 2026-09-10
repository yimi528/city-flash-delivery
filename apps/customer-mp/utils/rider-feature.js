const runtimeConfig = require('../config/runtime')

function isEnabled(app) {
  const currentApp = app || (typeof getApp === 'function' ? getApp() : null)
  if (currentApp && currentApp.globalData && typeof currentApp.globalData.riderFeatureEnabled === 'boolean') {
    return currentApp.globalData.riderFeatureEnabled
  }
  return runtimeConfig.RIDER_FEATURE_ENABLED === true
}

function redirectToCustomer(app) {
  if (app && typeof app.clearRiderSession === 'function') app.clearRiderSession()
  if (typeof wx !== 'undefined' && typeof wx.switchTab === 'function') {
    wx.switchTab({ url: '/pages/profile/profile' })
  }
}

module.exports = { isEnabled, redirectToCustomer }
