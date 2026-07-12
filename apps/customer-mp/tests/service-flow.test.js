const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const customerRoot = path.resolve(__dirname, '..')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function setByPath(target, key, value) {
  const parts = key.split('.')
  let cursor = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}
    cursor = cursor[part]
  }
  cursor[parts[parts.length - 1]] = value
}

function createHarness() {
  const calls = []
  const wx = {
    getSystemInfoSync: () => ({ statusBarHeight: 26, windowWidth: 390 }),
    showToast: (options) => calls.push({ type: 'showToast', options }),
    showModal: (options) => {
      calls.push({ type: 'showModal', options })
      if (options.success) options.success({ confirm: true, cancel: false })
    },
    navigateTo: (options) => calls.push({ type: 'navigateTo', options }),
    navigateBack: (options = {}) => calls.push({ type: 'navigateBack', options }),
    redirectTo: (options) => calls.push({ type: 'redirectTo', options }),
    switchTab: (options) => calls.push({ type: 'switchTab', options })
  }
  let app = null

  const appCode = fs.readFileSync(path.join(customerRoot, 'app.js'), 'utf8')
  vm.runInNewContext(appCode, {
    wx,
    App: (definition) => { app = definition },
    console,
    setTimeout: (callback) => callback()
  }, { filename: path.join(customerRoot, 'app.js') })
  app.onLaunch()
  app.globalData.useBackend = false

  function loadPage(relativePath) {
    let page = null
    const fullPath = path.join(customerRoot, relativePath)
    const pageDir = path.dirname(fullPath)
    const code = fs.readFileSync(fullPath, 'utf8')
    vm.runInNewContext(code, {
      wx,
      getApp: () => app,
      Page: (definition) => { page = definition },
      require: (requestPath) => require(path.resolve(pageDir, requestPath)),
      console,
      setTimeout: (callback) => callback(),
      setInterval,
      clearInterval
    }, { filename: fullPath })
    page.data = clone(page.data || {})
    page.setData = function setData(patch, callback) {
      Object.keys(patch).forEach((key) => setByPath(this.data, key, patch[key]))
      if (typeof callback === 'function') callback.call(this)
    }
    return page
  }

  return {
    app,
    calls,
    event: (dataset = {}, detail = {}) => ({ currentTarget: { dataset }, detail }),
    loadPage
  }
}

test('all services create an order with their fixed vehicle', () => {
  const harness = createHarness()
  const { app, event, loadPage } = harness
  const index = loadPage('pages/index/index.js')
  index.onShow()

  const cases = [
    { id: 'carpool_ride', service: '拼车', vehicle: 'business_van', alternate: 'ebike' },
    { id: 'cargo_haul', service: '运货', vehicle: 'cargo_tricycle', alternate: 'small_car' },
    { id: 'moving', service: '搬家', vehicle: 'moving_van', alternate: 'ebike' },
    { id: 'moving_handling', service: '搬运装卸', vehicle: 'manual_labor', alternate: 'small_car' },
    { id: 'send_parcel', service: '寄货', vehicle: 'small_car', alternate: 'ebike' },
    { id: 'urgent_delivery', service: '急送', vehicle: 'ebike', alternate: 'small_car' },
    { id: 'pickup', service: '帮取', vehicle: 'ebike', alternate: 'small_car' },
    { id: 'buy_for_me', service: '帮买', vehicle: 'ebike', alternate: 'small_car' },
    { id: 'pedicab_delivery', service: '送货/送客', vehicle: 'human_tricycle', alternate: 'small_car' }
  ]

  assert.deepEqual(index.data.allTasks.map((item) => item.id), cases.map((item) => item.id))

  cases.forEach((flow) => {
    index.chooseTask(event({ task: flow.id }))
    const draft = app.globalData.draftOrder
    draft.pickup = app.globalData.addresses[0]
    draft.dropoff = app.globalData.addresses[1]
    draft.routeDistanceKm = 2.5
    if (flow.id === 'buy_for_me') {
      draft.buyItems = '测试商品'
      draft.budget = 50
    }

    const page = loadPage('pages/order-create/order-create.js')
    page.onShow()
    const recommendedVehicle = page.data.selectedVehicle
    page.selectVehicle(event({ id: flow.alternate }))
    assert.equal(page.data.selectedVehicle, recommendedVehicle, `${flow.service} should keep its fixed vehicle`)
    assert.equal(recommendedVehicle, flow.vehicle)

    const beforeCount = app.globalData.orders.length
    page.submitOrder()
    assert.equal(app.globalData.orders.length, beforeCount + 1, `${flow.service} should create an order`)
    const order = app.globalData.orders[0]
    assert.equal(order.service, flow.service)
    assert.equal(order.status, '待接单')
    assert.ok(order.fee > 0)
    assert.equal(order.isManualQuote, false)
    assert.equal(order.quoteStatus, 'NONE')
    if (flow.id === 'buy_for_me') {
      assert.equal(order.productFee, 50)
      assert.equal(order.fee, order.productFee + order.deliveryFee)
    }
  })
})

test('carpool fare follows passenger count and return always ends in Fuding', () => {
  const { app, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'carpool_ride' }))
  const page = loadPage('pages/order-create/order-create.js')
  page.onShow()
  page.selectLine(event({ id: 'wenzhou' }))
  page.changePassenger(event({ step: 1 }))
  page.changePassenger(event({ step: 1 }))
  assert.equal(page.data.passengerCount, 3)
  assert.equal(Number(page.data.estimate.total), 450)
  page.selectDirection(event({ direction: 'RETURN' }))
  assert.equal(app.globalData.draftOrder.pickup.name, '温州')
  assert.equal(app.globalData.draftOrder.dropoff.name, '福鼎')
  assert.equal(Number(page.data.estimate.total), 450)
})

test('handling-only order charges a fixed fee without a destination', () => {
  const harness = createHarness()
  const { app, event, loadPage } = harness
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'moving_handling' }))
  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()
  assert.equal(app.globalData.draftOrder.requiresDelivery, false)
  assert.equal(Number(createPage.data.estimate.total), 48)
  createPage.submitOrder()
  const order = app.globalData.orders[0]
  assert.equal(order.dropoffName, '')
  assert.equal(order.fee, 48)
  assert.equal(order.isManualQuote, false)
})

test('cancelling a manual quote order keeps it cancelled and stops quoting', () => {
  const { app, event, loadPage, calls } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'moving_handling' }))
  app.globalData.draftOrder.dropoff = app.globalData.addresses[1]

  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()
  createPage.submitOrder()
  const order = app.globalData.orders[0]
  const detail = loadPage('pages/order-detail/order-detail.js')
  detail.onLoad({ id: order.id })
  detail.onShow()
  detail.cancelOrder()

  assert.equal(detail.data.order.status, '已取消')
  assert.equal(detail.data.order.displayStatus, '已取消')
  assert.equal(detail.data.order.paymentStatus, 'CLOSED')
  assert.equal(detail.data.order.needsQuote, false)
  assert.equal(calls.some((call) => call.type === 'showModal'), true)
})

test('all services expose cancellation before payment', () => {
  const taskIds = [
    'carpool_ride',
    'cargo_haul',
    'moving',
    'moving_handling',
    'send_parcel',
    'urgent_delivery',
    'pickup',
    'buy_for_me',
    'pedicab_delivery'
  ]

  taskIds.forEach((taskId) => {
    const { app, event, loadPage } = createHarness()
    const index = loadPage('pages/index/index.js')
    index.onShow()
    index.chooseTask(event({ task: taskId }))
    app.globalData.draftOrder.pickup = app.globalData.addresses[0]
    app.globalData.draftOrder.dropoff = app.globalData.addresses[1]
    if (taskId === 'buy_for_me') {
      app.globalData.draftOrder.buyItems = '取消测试商品'
      app.globalData.draftOrder.budget = 20
    }

    const createPage = loadPage('pages/order-create/order-create.js')
    createPage.onShow()
    createPage.submitOrder()
    const order = app.globalData.orders[0]
    const detail = loadPage('pages/order-detail/order-detail.js')
    detail.onLoad({ id: order.id })
    detail.onShow()

    assert.equal(detail.data.canCancel, true, `${taskId} should expose cancellation`)
    detail.cancelOrder()
    assert.equal(detail.data.order.status, '已取消', `${taskId} should cancel locally`)
    assert.equal(detail.data.order.needsQuote, false, `${taskId} should stop quote actions`)
  })
})

test('a paid order awaiting merchant acceptance can cancel with an automatic mock refund', () => {
  const { app, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'send_parcel' }))
  app.globalData.draftOrder.pickup = app.globalData.addresses[0]
  app.globalData.draftOrder.dropoff = app.globalData.addresses[1]

  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()
  createPage.submitOrder()
  const order = app.globalData.orders[0]
  order.paymentStatus = 'PAID'

  const detail = loadPage('pages/order-detail/order-detail.js')
  detail.onLoad({ id: order.id })
  detail.onShow()
  assert.equal(detail.data.canAutoRefundCancellation, true)
  assert.equal(detail.data.requiresRefundCancellation, false)
  detail.cancelOrder()

  assert.equal(detail.data.order.status, '已取消')
  assert.equal(detail.data.order.paymentStatus, 'REFUNDED')
  assert.equal(detail.data.paymentStatusText, '已退款')
})
