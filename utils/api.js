const DEFAULT_BASE_URL = 'http://127.0.0.1:8000/api'

function getBaseUrl() {
  try {
    const app = getApp()
    return (app.globalData && app.globalData.apiBaseUrl) || DEFAULT_BASE_URL
  } catch (error) {
    return DEFAULT_BASE_URL
  }
}

function request(path, options) {
  const config = options || {}
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${path}`,
      method: config.method || 'GET',
      data: config.data || {},
      timeout: config.timeout || 5000,
      header: {
        'content-type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        reject(new Error(`API ${path} failed with ${res.statusCode}`))
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

function getAddresses(userId) {
  return request(`/addresses?userId=${encodeURIComponent(userId || 'demo-user')}`)
}

function getVehicleTypes() {
  return request('/vehicle-types')
}

function estimatePrice(payload) {
  return request('/pricing/estimate', {
    method: 'POST',
    data: payload
  })
}

function createOrder(payload) {
  return request('/orders', {
    method: 'POST',
    data: payload
  })
}

function getOrders(userId) {
  return request(`/orders?userId=${encodeURIComponent(userId || 'demo-user')}`)
}

function getOrder(id) {
  return request(`/orders/${encodeURIComponent(id)}`)
}

function updateOrderStatus(id, payload) {
  return request(`/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    data: payload
  })
}

module.exports = {
  request,
  getAddresses,
  getVehicleTypes,
  estimatePrice,
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus
}
