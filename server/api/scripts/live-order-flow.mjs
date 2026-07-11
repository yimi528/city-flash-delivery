import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

const apiBase = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '')
const prisma = new PrismaClient()
const userId = `e2e-user-${Date.now()}`
const createdOrderIds = []

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  assert.equal(response.status, 409, `${path} should return HTTP 409`)
}

async function createOrder(overrides) {
  const order = await request('/orders', {
    method: 'POST',
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

async function fulfill(orderId) {
  const statuses = ['ACCEPTED', 'PICKING_UP', 'DELIVERING', 'COMPLETED']
  let order = null
  for (const status of statuses) {
    order = await request(`/operations/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: { status, note: `联调测试更新为 ${status}` }
    })
    assert.equal(order.status, status)
  }
  return order
}

async function run() {
  const health = await request('/health')
  assert.equal(health.status, 'ok')

  const delivery = await createOrder({})
  assert.equal(delivery.status, 'PENDING')
  assert.equal(delivery.totalFee, 13)
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
  await expectConflict(`/operations/orders/${encodeURIComponent(moving.id)}/status`, { status: 'ACCEPTED' })

  const quoted = await request(`/operations/orders/${encodeURIComponent(moving.id)}/quote`, {
    method: 'PATCH',
    body: { quotedFee: 66, quoteNote: '联调测试最终报价' }
  })
  assert.equal(quoted.quoteStatus, 'QUOTED')
  assert.equal(quoted.deliveryFee, 66)

  const confirmed = await request(`/orders/${encodeURIComponent(moving.id)}/quote/confirm`, {
    method: 'PATCH',
    body: {}
  })
  assert.equal(confirmed.quoteStatus, 'ACCEPTED')
  const completedMoving = await fulfill(moving.id)

  console.log(JSON.stringify({
    apiBase,
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
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
}
