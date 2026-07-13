const app = getApp()

function request(path, options) {
  const config = options || {}
  return new Promise((resolve, reject) => {
    const header = Object.assign({ 'content-type': 'application/json' }, config.header || {})
    if (app.globalData.riderAuthToken) header.Authorization = `Bearer ${app.globalData.riderAuthToken}`
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method: config.method || 'GET',
      data: config.data || {},
      header,
      timeout: 8000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        if (res.statusCode === 401) app.clearRiderSession()
        const message = res.data && res.data.message
        reject(new Error(Array.isArray(message) ? message.join('；') : message || '骑手端请求失败'))
      },
      fail(error) {
        reject(new Error((error && (error.errMsg || error.message)) || '无法连接后端服务'))
      }
    })
  })
}

function idempotencyKey(orderId) {
  return `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

module.exports = {
  me: () => request('/v1/rider/me'),
  updateVehicles: (vehicleTypes) => request('/v1/rider/vehicles', { method: 'PUT', data: { vehicleTypes } }),
  setOnline: (online) => request('/v1/rider/online', { method: 'POST', data: { online } }),
  updateLocation: (latitude, longitude) => request('/v1/rider/location', { method: 'POST', data: { latitude, longitude } }),
  heartbeat: (latitude, longitude) => request('/v1/rider/heartbeat', {
    method: 'POST',
    data: latitude === undefined || longitude === undefined ? {} : { latitude, longitude }
  }),
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
