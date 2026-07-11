const DEFAULT_BASE_URL = 'http://127.0.0.1:3000/api'

const STATUS_LABELS = {
  PENDING: '待接单',
  ACCEPTED: '已接单',
  PICKING_UP: '取货中',
  DELIVERING: '配送中',
  COMPLETED: '已完成',
  CANCELLED: '已取消'
}

const STATUS_VALUES = {
  待接单: 'PENDING',
  已接单: 'ACCEPTED',
  取货中: 'PICKING_UP',
  配送中: 'DELIVERING',
  已完成: 'COMPLETED',
  已取消: 'CANCELLED'
}

const STATUS_FLOW = ['待接单', '已接单', '取货中', '配送中', '已完成']

const SERVICE_VALUES = {
  寄货: 'CARGO',
  拼车: 'CARGO',
  拉货: 'CARGO',
  急送: 'DELIVERY',
  帮送: 'DELIVERY',
  帮取: 'PICKUP',
  送货: 'CARGO',
  '送货/送客': 'CARGO',
  搬运装卸: 'CARGO',
  '搬家/搬店': 'CARGO',
  装货: 'CARGO',
  卸货: 'CARGO',
  帮买: 'BUY_FOR_ME',
  '1对1急送': 'DELIVERY'
}

const SERVICE_LABELS = {
  DELIVERY: '帮送',
  PICKUP: '帮取',
  CARGO: '送货',
  BUY_FOR_ME: '帮买'
}

const VEHICLE_VALUES = {
  ebike: 'EBIKE',
  small_car: 'VAN',
  cargo_tricycle: 'ETRIKE',
  human_tricycle: 'ETRIKE',
  manual_labor: 'VAN',
  etrike: 'ETRIKE',
  van: 'VAN',
  EBIKE: 'EBIKE',
  ETRIKE: 'ETRIKE',
  VAN: 'VAN',
  小车: 'VAN',
  二轮车: 'EBIKE',
  二轮电动: 'EBIKE',
  货三轮车: 'ETRIKE',
  人力三轮车: 'ETRIKE',
  三轮电动: 'ETRIKE',
  面包车: 'VAN'
}

const VEHICLE_LABELS = {
  EBIKE: '二轮车',
  ETRIKE: '货三轮车',
  VAN: '小车'
}

function getAppRole() {
  try {
    const app = getApp()
    return (app.globalData && app.globalData.appRole) || 'customer'
  } catch (error) {
    return 'customer'
  }
}

function getBaseUrl() {
  try {
    const app = getApp()
    return (app.globalData && app.globalData.apiBaseUrl) || DEFAULT_BASE_URL
  } catch (error) {
    return DEFAULT_BASE_URL
  }
}

function isNestApi() {
  const baseUrl = getBaseUrl()
  return baseUrl.indexOf(':8000') === -1
}

function getAuthToken() {
  try {
    const app = getApp()
    return (app.globalData && app.globalData.authToken) || ''
  } catch (error) {
    return ''
  }
}

function buildHeaders() {
  const headers = {
    'content-type': 'application/json',
    'x-app-role': getAppRole()
  }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function request(path, options) {
  const config = options || {}
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${path}`,
      method: config.method || 'GET',
      data: config.data || {},
      timeout: config.timeout || 5000,
      header: buildHeaders(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const data = res.data || {}
        const detail = Array.isArray(data.message) ? data.message.join('；') : (data.message || data.error || '')
        reject(new Error(detail || `API ${path} failed with ${res.statusCode}`))
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

function normalizeStatus(status) {
  return STATUS_LABELS[status] || status || '待接单'
}

function toStatusValue(status) {
  return STATUS_VALUES[status] || status || 'PENDING'
}

function toServiceValue(service) {
  return SERVICE_VALUES[service] || service || 'DELIVERY'
}

function toServiceLabel(service) {
  return SERVICE_LABELS[service] || service || '帮送'
}

function toVehicleValue(value) {
  return VEHICLE_VALUES[value] || 'EBIKE'
}

function toVehicleLabel(vehicleType, fallback) {
  return fallback || VEHICLE_LABELS[vehicleType] || VEHICLE_LABELS[toVehicleValue(vehicleType)] || '二轮电动'
}

function formatTime(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (item) => String(item).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getStatusIndex(status) {
  const index = STATUS_FLOW.indexOf(status)
  return index > -1 ? index : 0
}

function getWeightLabel(weight) {
  const value = Number(weight || 1)
  if (value <= 1) return '≤1公斤'
  if (value < 10) return `${value}公斤`
  return `${value}公斤以上`
}

function getEta(status) {
  if (status === '待接单') return '等待运营接单'
  if (status === '已接单') return '运营已接单'
  if (status === '取货中') return '正在前往取货'
  if (status === '配送中') return '正在配送中'
  if (status === '已完成') return '已送达'
  if (status === '已取消') return '已取消'
  return '约 20 分钟'
}

function normalizeOrder(order) {
  const status = normalizeStatus(order.status)
  const service = order.serviceName || toServiceLabel(order.serviceType || order.service)
  const weight = Number(order.weightKg || order.weight || 1)
  const vehicleType = order.vehicleType || (order.cargoOptions && order.cargoOptions.vehicleId)
  const quoteStatus = order.quoteStatus || (order.isManualQuote || order.pricingMode === 'manual_quote' ? 'PENDING' : 'NONE')
  const isManualQuote = Boolean(order.isManualQuote || order.pricingMode === 'manual_quote')
  const needsQuote = isManualQuote && (quoteStatus === 'PENDING' || quoteStatus === 'REJECTED')
  const needsQuoteConfirmation = isManualQuote && quoteStatus === 'QUOTED'
  const quoteAccepted = isManualQuote && quoteStatus === 'ACCEPTED'
  const productFee = Number(order.productFee || order.budget || 0)
  const storedDeliveryFee = Number(order.deliveryFee || order.serviceFee || 0)
  const fee = Number(order.totalFee || order.fee || productFee + storedDeliveryFee || 0)
  const deliveryFee = Number(order.deliveryFee || order.serviceFee || Math.max(fee - productFee, 0))
  const estimatedFee = Number(order.estimatedFee || (quoteStatus === 'PENDING' ? fee : 0) || fee)
  const feeText = quoteStatus === 'PENDING'
    ? `预估￥${estimatedFee}`
    : quoteStatus === 'QUOTED'
      ? `待确认￥${fee}`
      : quoteStatus === 'REJECTED'
        ? '已拒绝报价'
        : `￥${fee}`
  const quoteStatusText = quoteStatus === 'PENDING'
    ? '等待商家报价'
    : quoteStatus === 'QUOTED'
      ? '等待用户确认'
      : quoteStatus === 'ACCEPTED'
        ? '用户已接受'
        : quoteStatus === 'REJECTED'
          ? '用户已拒绝'
          : ''
  return Object.assign({}, order, {
    status,
    statusIndex: Number.isInteger(order.statusIndex) ? order.statusIndex : getStatusIndex(status),
    service,
    pickupName: order.pickupName || (order.pickup && order.pickup.name) || '取货地址',
    pickupDetail: order.pickupDetail || (order.pickup && order.pickup.detail) || '',
    dropoffName: order.dropoffName || (order.dropoff && order.dropoff.name) || '收货地址',
    dropoffDetail: order.dropoffDetail || (order.dropoff && order.dropoff.detail) || '',
    item: order.item || order.itemName || '同城配送物品',
    vehicleName: toVehicleLabel(vehicleType, order.vehicleName),
    weightLabel: order.weightLabel || getWeightLabel(weight),
    fee,
    estimatedFee,
    feeText,
    productFee,
    deliveryFee,
    budget: productFee,
    serviceFee: deliveryFee,
    quoteStatus,
    needsQuote,
    needsQuoteConfirmation,
    quoteAccepted,
    quoteStatusText,
    quotedFee: order.quotedFee || (['QUOTED', 'ACCEPTED', 'REJECTED'].includes(quoteStatus) ? fee : null),
    quoteNote: order.quoteNote || '',
    distance: Number(order.distanceKm || order.distance || 0),
    eta: quoteStatus === 'PENDING'
      ? '等待商家报价'
      : quoteStatus === 'QUOTED'
        ? '等待你确认价格'
        : quoteStatus === 'REJECTED'
          ? '等待商家重新报价'
          : (order.eta || getEta(status)),
    rider: order.rider || (status === '待接单' ? '等待运营接单' : '同城速送配送员'),
    createTime: order.createTime || formatTime(order.createdAt),
    remark: order.remark || ''
  })
}

function normalizeOrders(payload) {
  const orders = Array.isArray(payload) ? payload : (payload && payload.orders) || []
  return orders.map(normalizeOrder)
}

function buildNestLoginPayload(payload) {
  const source = payload || {}
  const userInfo = source.userInfo || {}
  return {
    code: source.code || '',
    phone: source.phone || '',
    nickname: source.nickname || userInfo.nickName || userInfo.nickname || '微信用户'
  }
}

function firstNumber() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index]
    if (value === undefined || value === null || value === '') continue
    const numberValue = Number(value)
    if (Number.isFinite(numberValue)) return numberValue
  }
  return 0
}

function buildNestPricePayload(payload) {
  const source = payload || {}
  const cargoOptions = source.cargoOptions || {}
  const selectedLine = source.selectedLine || {}
  const servicePricing = source.servicePricing || {}
  const weatherRisk = source.weatherRisk || {}
  return {
    serviceType: toServiceValue(source.serviceType || source.service),
    serviceName: source.service || source.serviceName || '',
    vehicleType: toVehicleValue(source.vehicleType || source.vehicleId || cargoOptions.vehicleId),
    vehicleName: source.vehicleName || cargoOptions.vehicleName || '',
    pricingMode: source.pricingMode || '',
    linePrice: Number(source.linePrice || selectedLine.price || 0),
    baseDistanceKm: Number(source.baseDistanceKm || servicePricing.baseDistanceKm || 0),
    basePrice: firstNumber(source.basePrice, cargoOptions.baseFee, servicePricing.basePrice),
    extraPerKm: firstNumber(source.extraPerKm, cargoOptions.distanceRate, servicePricing.extraPerKm),
    badWeatherMultiplier: Number(source.badWeatherMultiplier || servicePricing.badWeatherMultiplier || 1.2),
    badWeather: !!(source.badWeather || source.isBadWeather || weatherRisk.isBadWeather || weatherRisk.badWeather),
    distanceKm: Number(source.distanceKm || source.distance || 2.6),
    weightKg: Number(source.weightKg || source.weight || cargoOptions.weight || 1),
    productFee: Number(source.productFee || source.budget || 0),
    budget: Number(source.budget || 0)
  }
}

function buildNestOrderPayload(payload) {
  const source = payload || {}
  const pickup = source.pickup || {}
  const dropoff = source.dropoff || {}
  const cargoOptions = source.cargoOptions || {}
  const selectedLine = source.selectedLine || {}
  const servicePricing = source.servicePricing || {}
  const weatherRisk = source.weatherRisk || {}
  return {
    userId: source.userId || 'demo-user',
    serviceType: toServiceValue(source.serviceType || source.service),
    serviceName: source.service || source.serviceName || '',
    vehicleType: toVehicleValue(source.vehicleType || source.vehicleId || cargoOptions.vehicleId),
    vehicleName: source.vehicleName || cargoOptions.vehicleName || '',
    pricingMode: source.pricingMode || '',
    linePrice: Number(source.linePrice || selectedLine.price || 0),
    baseDistanceKm: Number(source.baseDistanceKm || servicePricing.baseDistanceKm || 0),
    basePrice: firstNumber(source.basePrice, cargoOptions.baseFee, servicePricing.basePrice),
    extraPerKm: firstNumber(source.extraPerKm, cargoOptions.distanceRate, servicePricing.extraPerKm),
    badWeatherMultiplier: Number(source.badWeatherMultiplier || servicePricing.badWeatherMultiplier || 1.2),
    badWeather: !!(source.badWeather || source.isBadWeather || weatherRisk.isBadWeather || weatherRisk.badWeather),
    pickupName: source.pickupName || pickup.name || '取货地址',
    pickupDetail: source.pickupDetail || pickup.detail || '',
    pickupContact: source.pickupContact || pickup.contact || '',
    pickupPhone: source.pickupPhone || pickup.phone || '',
    pickupLat: Number(source.pickupLat || pickup.latitude || 0),
    pickupLng: Number(source.pickupLng || pickup.longitude || 0),
    dropoffName: source.dropoffName || dropoff.name || '收货地址',
    dropoffDetail: source.dropoffDetail || dropoff.detail || '',
    dropoffContact: source.dropoffContact || dropoff.contact || '',
    dropoffPhone: source.dropoffPhone || dropoff.phone || '',
    dropoffLat: Number(source.dropoffLat || dropoff.latitude || 0),
    dropoffLng: Number(source.dropoffLng || dropoff.longitude || 0),
    item: source.item || source.itemName || source.buyItems || '同城配送物品',
    buyItems: source.buyItems || '',
    distanceKm: Number(source.distanceKm || source.distance || 2.6),
    weightKg: Number(source.weightKg || source.weight || cargoOptions.weight || 1),
    productFee: Number(source.productFee || source.budget || 0),
    budget: Number(source.budget || 0),
    remark: source.remark || ''
  }
}

function buildNestStatusPayload(payload) {
  const source = payload || {}
  return {
    status: toStatusValue(source.status),
    note: source.note || ''
  }
}

function getAddresses(userId) {
  return request(`/addresses?userId=${encodeURIComponent(userId || 'demo-user')}`)
}

function wechatLogin(payload) {
  return request('/auth/wechat-login', {
    method: 'POST',
    data: isNestApi() ? buildNestLoginPayload(payload) : (payload || {})
  })
}

function merchantLogin(payload) {
  if (isNestApi()) {
    return request('/auth/operator-login', {
      method: 'POST',
      data: { operatorId: (payload && (payload.operatorId || payload.merchantId)) || 'operator-demo' }
    })
  }
  return request('/auth/merchant-login', {
    method: 'POST',
    data: payload || {}
  })
}

function createAddress(payload) {
  return request('/addresses', {
    method: 'POST',
    data: payload
  })
}

function updateAddress(id, payload) {
  return request(`/addresses/${encodeURIComponent(id)}`, {
    method: 'PUT',
    data: payload
  })
}

function deleteAddress(id) {
  return request(`/addresses/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

function getVehicleTypes() {
  if (isNestApi()) {
    return Promise.resolve([
      { id: 'ebike', type: 'EBIKE', name: '二轮车' },
      { id: 'cargo_tricycle', type: 'ETRIKE', name: '货三轮车' },
      { id: 'small_car', type: 'VAN', name: '小车' }
    ])
  }
  return request('/vehicle-types')
}

function getWeatherRisk(payload) {
  const source = payload || {}
  const query = [
    ['city', source.city || '宁德市'],
    ['lat', source.latitude || source.lat || ''],
    ['lng', source.longitude || source.lng || '']
  ].filter((item) => item[1] !== undefined && item[1] !== null && item[1] !== '')
    .map((item) => `${encodeURIComponent(item[0])}=${encodeURIComponent(item[1])}`)
    .join('&')

  if (!isNestApi()) {
    return Promise.resolve({
      isBadWeather: false,
      badWeather: false,
      multiplier: 1,
      weatherText: '旧版后端暂未接入天气预报',
      reason: '按正常天气计价',
      source: 'legacy-fallback'
    })
  }
  return request(`/maps/weather-risk${query ? `?${query}` : ''}`)
}

function estimatePrice(payload) {
  return request('/pricing/estimate', {
    method: 'POST',
    data: isNestApi() ? buildNestPricePayload(payload) : payload
  })
}

function createOrder(payload) {
  return request('/orders', {
    method: 'POST',
    data: isNestApi() ? buildNestOrderPayload(payload) : payload
  }).then(normalizeOrder)
}

function getOrders(userId) {
  return request(`/orders?userId=${encodeURIComponent(userId || 'demo-user')}`).then(normalizeOrders)
}

function getOrder(id) {
  return request(`/orders/${encodeURIComponent(id)}`).then(normalizeOrder)
}

function updateOrderStatus(id, payload) {
  return request(`/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    data: isNestApi() ? buildNestStatusPayload(payload) : payload
  }).then(normalizeOrder)
}

function confirmOrderQuote(id) {
  return request(`/orders/${encodeURIComponent(id)}/quote/confirm`, {
    method: 'PATCH',
    data: {}
  }).then(normalizeOrder)
}

function rejectOrderQuote(id) {
  return request(`/orders/${encodeURIComponent(id)}/quote/reject`, {
    method: 'PATCH',
    data: {}
  }).then(normalizeOrder)
}

function getMerchantDashboard(merchantId) {
  if (isNestApi()) return request('/operations/orders')
  return request(`/merchant/dashboard?merchantId=${encodeURIComponent(merchantId || 'merchant-demo')}`)
}

function getMerchantOrders(merchantId, status) {
  if (isNestApi()) {
    return request('/operations/orders').then((payload) => {
      const orders = normalizeOrders(payload)
      return status ? orders.filter((order) => order.status === status) : orders
    })
  }
  const query = status ? `&status=${encodeURIComponent(status)}` : ''
  return request(`/merchant/orders?merchantId=${encodeURIComponent(merchantId || 'merchant-demo')}${query}`)
}

function updateMerchantOrderStatus(id, payload) {
  if (isNestApi()) {
    return request(`/operations/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      data: buildNestStatusPayload(payload)
    }).then(normalizeOrder)
  }
  return request(`/merchant/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    data: payload
  })
}

module.exports = {
  request,
  wechatLogin,
  merchantLogin,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getVehicleTypes,
  getWeatherRisk,
  estimatePrice,
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  confirmOrderQuote,
  rejectOrderQuote,
  getMerchantDashboard,
  getMerchantOrders,
  updateMerchantOrderStatus,
  normalizeOrder,
  buildNestOrderPayload
}
