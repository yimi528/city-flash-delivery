const app = getApp()

function request(path, options) {
  const config = options || {}
  return new Promise((resolve, reject) => {
    const header = Object.assign({ 'content-type': 'application/json' }, config.header || {})
    if (app.globalData.authToken) header.Authorization = `Bearer ${app.globalData.authToken}`
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: config.method || 'GET',
      data: config.data || {},
      header,
      timeout: 8000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data)
        const message = res.data && res.data.message
        reject(new Error(Array.isArray(message) ? message.join('；') : message || '请求失败'))
      },
      fail: reject
    })
  })
}

function login() {
  return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
    .then((result) => request('/auth/rider-wechat-login', { method: 'POST', data: { code: result.code, nickname: '微信骑手' } }))
}

function idempotencyKey(orderId) {
  return `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

module.exports = {
  login,
  me: () => request('/v1/rider/me'),
  apply: (payload) => request('/v1/rider/application', { method: 'POST', data: payload }),
  setOnline: (online) => request('/v1/rider/online', { method: 'POST', data: { online } }),
  updateLocation: (latitude, longitude) => request('/v1/rider/location', { method: 'POST', data: { latitude, longitude } }),
  availableOrders: () => request('/v1/rider/orders/available'),
  claim: (id) => request(`/v1/rider/orders/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey(id) }
  }),
  currentTasks: () => request('/v1/rider/tasks/current'),
  history: () => request('/v1/rider/orders/history'),
  income: () => request('/v1/rider/income'),
  updateStatus: (id, status) => request(`/v1/rider/orders/${encodeURIComponent(id)}/status`, { method: 'POST', data: { status } }),
  reportException: (id, reason) => request(`/v1/rider/orders/${encodeURIComponent(id)}/exception`, { method: 'POST', data: { reason } })
}
