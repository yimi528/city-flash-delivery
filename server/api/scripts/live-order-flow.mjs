import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

const apiBase = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '')
const prisma = new PrismaClient()
let userId = ''
let customerToken = ''
let operatorToken = ''
const createdOrderIds = []
const flowTrace = []

async function request(path, options = {}) {
  const { token, ...fetchOptions } = options
  const response = await fetch(`${apiBase}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message || `HTTP ${response.status}`
    throw new Error(`${path}: ${message}`)
  }
  return data
}

async function expectConflict(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorToken}`
    },
    body: JSON.stringify(body)
  })
  assert.equal(response.status, 409, `${path} should return HTTP 409`)
}

async function expectSyncedState(orderId, expected) {
  const customerOrder = await request(`/orders/${encodeURIComponent(orderId)}`, {
    token: customerToken
  })
  const dashboard = await request('/operations/orders', { token: operatorToken })
  const merchantOrder = dashboard.orders.find((order) => order.id === orderId)
  assert.ok(merchantOrder, `merchant order ${orderId} should exist`)

  for (const order of [customerOrder, merchantOrder]) {
    assert.equal(order.businessStatus, expected.businessStatus)
    assert.equal(order.businessStatusText, expected.businessStatusText)
    if (expected.status) assert.equal(order.status, expected.status)
    if (expected.quoteStatus) assert.equal(order.quoteStatus, expected.quoteStatus)
    if (expected.paymentStatus) assert.equal(order.paymentStatus, expected.paymentStatus)
  }

  flowTrace.push({
    step: expected.step,
    businessStatus: customerOrder.businessStatus,
    statusText: customerOrder.businessStatusText,
    quoteStatus: customerOrder.quoteStatus,
    paymentStatus: customerOrder.paymentStatus
  })
  return customerOrder
}

async function createOrder(overrides) {
  const order = await request('/orders', {
    method: 'POST',
    token: customerToken,
    body: {
      userId,
      serviceType: 'DELIVERY',
      serviceName: '急送',
      vehicleType: 'EBIKE',
      vehicleName: '二轮车',
      pricingMode: 'distance_weather',
      baseDistanceKm: 4,
      basePrice: 10,
      extraPerKm: 1.6,
      serviceSurcharge: 3,
      maxDeliveryFee: 68,
      badWeatherMultiplier: 1.15,
      badWeather: false,
      pickupName: '联调测试起点',
      pickupDetail: '测试数据，完成后自动清理',
      pickupContact: '测试用户',
      pickupPhone: '13800000000',
      dropoffName: '联调测试终点',
      dropoffDetail: '测试数据，完成后自动清理',
      dropoffContact: '测试用户',
      dropoffPhone: '13800000001',
      item: '联调测试物品',
      distanceKm: 2.5,
      weightKg: 1,
      remark: '自动化真实 API 联调测试',
      ...overrides
    }
  })
  createdOrderIds.push(order.id)
  return order
}

async function fulfill(orderId, expectedStates = []) {
  const statuses = ['ACCEPTED', 'PICKING_UP', 'DELIVERING', 'COMPLETED']
  let order = null
  for (let index = 0; index < statuses.length; index += 1) {
    const status = statuses[index]
    order = await request(`/operations/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      token: operatorToken,
      body: { status, note: `联调测试更新为 ${status}` }
    })
    assert.equal(order.status, status)
    if (expectedStates[index]) await expectSyncedState(orderId, expectedStates[index])
  }
  return order
}

async function run() {
  const health = await request('/health')
  assert.equal(health.status, 'ok')

  const customerSession = await request('/auth/wechat-login', {
    method: 'POST',
    body: { code: 'demo-live-flow', nickname: '联调测试用户' }
  })
  customerToken = customerSession.token
  userId = customerSession.user.id
  const operatorSession = await request('/auth/operator-login', {
    method: 'POST',
    body: {
      username: process.env.LIVE_OPERATOR_USERNAME || 'operator-demo',
      password: process.env.LIVE_OPERATOR_PASSWORD || 'demo123456'
    }
  })
  operatorToken = operatorSession.token

  const delivery = await createOrder({})
  assert.equal(delivery.status, 'PENDING')
  assert.equal(delivery.totalFee, 13)
  const deliveryPrepay = await request(`/payments/orders/${encodeURIComponent(delivery.id)}/prepay`, {
    method: 'POST',
    token: customerToken
  })
  assert.equal(deliveryPrepay.mode, 'mock')
  const paidDelivery = await request(`/payments/orders/${encodeURIComponent(delivery.id)}/mock-confirm`, {
    method: 'POST',
    token: customerToken
  })
  assert.equal(paidDelivery.paymentStatus, 'PAID')
  const completedDelivery = await fulfill(delivery.id)

  const moving = await createOrder({
    serviceType: 'CARGO',
    serviceName: '搬运装卸',
    vehicleType: 'ETRIKE',
    vehicleName: '货三轮车',
    pricingMode: 'manual_quote',
    basePrice: 28,
    extraPerKm: 2.8,
    serviceSurcharge: 20,
    maxDeliveryFee: 138,
    item: '搬家/搬店'
  })
  assert.equal(moving.quoteStatus, 'PENDING')
  await expectSyncedState(moving.id, {
    step: '用户下单，等待商家报价',
    businessStatus: 'AWAITING_QUOTE',
    businessStatusText: '待商家报价',
    status: 'PENDING',
    quoteStatus: 'PENDING',
    paymentStatus: 'UNPAID'
  })
  await expectConflict(`/operations/orders/${encodeURIComponent(moving.id)}/status`, { status: 'ACCEPTED' })

  const quoted = await request(`/operations/orders/${encodeURIComponent(moving.id)}/quote`, {
    method: 'PATCH',
    token: operatorToken,
    body: { quotedFee: 66, quoteNote: '联调测试最终报价' }
  })
  assert.equal(quoted.quoteStatus, 'QUOTED')
  assert.equal(quoted.deliveryFee, 66)
  await expectSyncedState(moving.id, {
    step: '商家提交最终报价',
    businessStatus: 'AWAITING_QUOTE_CONFIRMATION',
    businessStatusText: '待确认报价',
    status: 'PENDING',
    quoteStatus: 'QUOTED',
    paymentStatus: 'UNPAID'
  })

  const confirmed = await request(`/orders/${encodeURIComponent(moving.id)}/quote/confirm`, {
    method: 'PATCH',
    token: customerToken,
    body: {}
  })
  assert.equal(confirmed.quoteStatus, 'ACCEPTED')
  await expectSyncedState(moving.id, {
    step: '用户接受报价',
    businessStatus: 'AWAITING_PAYMENT',
    businessStatusText: '待支付',
    status: 'PENDING',
    quoteStatus: 'ACCEPTED',
    paymentStatus: 'UNPAID'
  })
  const movingPrepay = await request(`/payments/orders/${encodeURIComponent(moving.id)}/prepay`, {
    method: 'POST',
    token: customerToken
  })
  assert.equal(movingPrepay.mode, 'mock')
  const paidMoving = await request(`/payments/orders/${encodeURIComponent(moving.id)}/mock-confirm`, {
    method: 'POST',
    token: customerToken
  })
  assert.equal(paidMoving.paymentStatus, 'PAID')
  await expectSyncedState(moving.id, {
    step: '用户完成支付',
    businessStatus: 'PENDING',
    businessStatusText: '待接单',
    status: 'PENDING',
    quoteStatus: 'ACCEPTED',
    paymentStatus: 'PAID'
  })
  const completedMoving = await fulfill(moving.id, [
    {
      step: '商家接单',
      businessStatus: 'ACCEPTED',
      businessStatusText: '已接单',
      status: 'ACCEPTED',
      quoteStatus: 'ACCEPTED',
      paymentStatus: 'PAID'
    },
    {
      step: '服务人员上门',
      businessStatus: 'PICKING_UP',
      businessStatusText: '上门途中',
      status: 'PICKING_UP',
      quoteStatus: 'ACCEPTED',
      paymentStatus: 'PAID'
    },
    {
      step: '开始搬运服务',
      businessStatus: 'DELIVERING',
      businessStatusText: '搬运中',
      status: 'DELIVERING',
      quoteStatus: 'ACCEPTED',
      paymentStatus: 'PAID'
    },
    {
      step: '完成订单',
      businessStatus: 'COMPLETED',
      businessStatusText: '已完成',
      status: 'COMPLETED',
      quoteStatus: 'ACCEPTED',
      paymentStatus: 'PAID'
    }
  ])

  console.log(JSON.stringify({
    apiBase,
    flowTrace,
    delivery: { id: delivery.id, status: completedDelivery.status, fee: completedDelivery.totalFee },
    moving: { id: moving.id, status: completedMoving.status, fee: completedMoving.totalFee, quoteStatus: completedMoving.quoteStatus }
  }, null, 2))
}

try {
  await run()
} finally {
  if (createdOrderIds.length) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } })
  }
  if (userId && userId !== 'demo-user') await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
}
