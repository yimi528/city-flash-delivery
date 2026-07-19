import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

const apiBase = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '')
const prisma = new PrismaClient()
let userId = ''
let customerToken = ''
let operatorToken = ''
let riderId = ''
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
      pickupLat: 26.6659,
      pickupLng: 119.5476,
      dropoffName: '联调测试终点',
      dropoffDetail: '测试数据，完成后自动清理',
      dropoffContact: '测试用户',
      dropoffPhone: '13800000001',
      dropoffLat: 26.6824,
      dropoffLng: 119.5558,
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
  let order = await request(`/operations/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    token: operatorToken,
    body: { status: 'ACCEPTED', note: '联调测试商家接单' }
  })
  assert.equal(order.status, 'ACCEPTED')
  if (expectedStates[0]) await expectSyncedState(orderId, expectedStates[0])

  order = await request(`/operations/orders/${encodeURIComponent(orderId)}/assign`, {
    method: 'POST',
    token: operatorToken,
    body: { riderId, note: '联调测试指派骑手' }
  })
  assert.equal(order.status, 'PICKING_UP')
  if (expectedStates[1]) await expectSyncedState(orderId, expectedStates[1])

  for (let index = 0; index < 2; index += 1) {
    const status = ['DELIVERING', 'COMPLETED'][index]
    order = await request(`/operations/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      token: operatorToken,
      body: { status, note: `联调测试更新为 ${status}` }
    })
    assert.equal(order.status, status)
    if (expectedStates[index + 2]) await expectSyncedState(orderId, expectedStates[index + 2])
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

  const testRider = await prisma.riderProfile.create({
    data: {
      name: '联调测试骑手',
      phone: '13800000002',
      status: 'APPROVED',
      roleStatus: 'ACTIVE',
      workStatus: 'ONLINE',
      vehicleType: 'EBIKE',
      vehicleName: '联调测试车辆',
      handlingQualified: true,
      online: true,
      latitude: 26.6659,
      longitude: 119.5476,
      maxActiveOrders: 2,
      vehicles: {
        create: [
          { vehicleType: 'EBIKE', vehicleName: '二轮车', enabled: true, verified: true },
          { vehicleType: 'ETRIKE', vehicleName: '货三轮车', enabled: true, verified: true }
        ]
      }
    }
  })
  riderId = testRider.id

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

  const handlingQuote = await request('/v1/quotes/handling', {
    method: 'POST',
    token: customerToken,
    body: {
      requiresDelivery: false,
      pickupName: '联调搬运起点',
      pickupDetail: '测试数据，完成后自动清理',
      pickupLat: 26.6659,
      pickupLng: 119.5476
    }
  })
  assert.ok(handlingQuote.id, 'handling quote should be created')

  const moving = await createOrder({
    quoteId: handlingQuote.id,
    serviceType: 'CARGO',
    serviceName: '搬运装卸',
    vehicleType: 'ETRIKE',
    vehicleName: '货三轮车',
    item: '搬家/搬店'
  })
  assert.equal(moving.quoteStatus, 'NONE')
  await expectSyncedState(moving.id, {
    step: '用户获取后端报价并下单',
    businessStatus: 'AWAITING_PAYMENT',
    businessStatusText: '待支付',
    status: 'PENDING',
    quoteStatus: 'NONE',
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
    businessStatus: 'AWAITING_MERCHANT_ACCEPTANCE',
    businessStatusText: '待商家接单',
    status: 'PENDING',
    quoteStatus: 'NONE',
    paymentStatus: 'PAID'
  })
  const completedMoving = await fulfill(moving.id, [
    {
      step: '商家接单',
      businessStatus: 'AWAITING_RIDER_ACCEPTANCE',
      businessStatusText: '待骑手接单',
      status: 'ACCEPTED',
      quoteStatus: 'NONE',
      paymentStatus: 'PAID'
    },
    {
      step: '服务人员上门',
      businessStatus: 'PICKING_UP',
      businessStatusText: '上门途中',
      status: 'PICKING_UP',
      quoteStatus: 'NONE',
      paymentStatus: 'PAID'
    },
    {
      step: '开始搬运服务',
      businessStatus: 'DELIVERING',
      businessStatusText: '搬运中',
      status: 'DELIVERING',
      quoteStatus: 'NONE',
      paymentStatus: 'PAID'
    },
    {
      step: '完成订单',
      businessStatus: 'COMPLETED',
      businessStatusText: '已完成',
      status: 'COMPLETED',
      quoteStatus: 'NONE',
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
  if (riderId) await prisma.riderProfile.deleteMany({ where: { id: riderId } })
  if (userId && userId !== 'demo-user') await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
}
