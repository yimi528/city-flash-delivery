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

test('all eight services create an order and react to vehicle changes', () => {
  const harness = createHarness()
  const { app, event, loadPage } = harness
  const index = loadPage('pages/index/index.js')
  index.onShow()

  const cases = [
    { id: 'send_parcel', service: '寄货', alternate: 'ebike' },
    { id: 'carpool_ride', service: '拼车', alternate: 'ebike' },
    { id: 'cargo_haul', service: '拉货', alternate: 'small_car' },
    { id: 'urgent_delivery', service: '急送', alternate: 'small_car' },
    { id: 'pickup', service: '帮取', alternate: 'small_car' },
    { id: 'buy_for_me', service: '帮买', alternate: 'small_car' },
    { id: 'moving_handling', service: '搬运装卸', alternate: 'small_car', manualQuote: true },
    { id: 'pedicab_delivery', service: '送货/送客', alternate: 'small_car' }
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
    const recommendedFee = Number(page.data.estimate.deliveryFee)
    page.selectVehicle(event({ id: flow.alternate }))
    const alternateFee = Number(page.data.estimate.deliveryFee)
    assert.notEqual(alternateFee, recommendedFee, `${flow.service} should change price with vehicle`)

    const beforeCount = app.globalData.orders.length
    page.submitOrder()
    assert.equal(app.globalData.orders.length, beforeCount + 1, `${flow.service} should create an order`)
    const order = app.globalData.orders[0]
    assert.equal(order.service, flow.service)
    assert.equal(order.status, '待接单')
    assert.ok(order.fee > 0)
    assert.equal(order.isManualQuote, Boolean(flow.manualQuote))
    assert.equal(order.quoteStatus, flow.manualQuote ? 'PENDING' : 'NONE')
    if (flow.id === 'buy_for_me') {
      assert.equal(order.productFee, 50)
      assert.equal(order.fee, order.productFee + order.deliveryFee)
    }
  })
})

test('all eight services have distinct and capped prices across every vehicle option', () => {
  const taskIds = [
    'send_parcel',
    'carpool_ride',
    'cargo_haul',
    'urgent_delivery',
    'pickup',
    'buy_for_me',
    'moving_handling',
    'pedicab_delivery'
  ]
  const vehicleIds = ['small_car', 'cargo_tricycle', 'human_tricycle', 'ebike', 'manual_labor']

  taskIds.forEach((taskId) => {
    const { app, event, loadPage } = createHarness()
    const index = loadPage('pages/index/index.js')
    index.onShow()
    index.chooseTask(event({ task: taskId }))
    const draft = app.globalData.draftOrder
    draft.pickup = app.globalData.addresses[0]
    draft.dropoff = app.globalData.addresses[1]
    draft.routeDistanceKm = 2.5
    if (taskId === 'buy_for_me') {
      draft.buyItems = '测试商品'
      draft.budget = 50
    }

    const page = loadPage('pages/order-create/order-create.js')
    page.onShow()
    const deliveryFees = vehicleIds.map((vehicleId) => {
      page.selectVehicle(event({ id: vehicleId }))
      const deliveryFee = Number(page.data.estimate.deliveryFee)
      const total = Number(page.data.estimate.total)
      assert.ok(deliveryFee > 0 && deliveryFee <= 168, `${taskId}/${vehicleId} delivery fee should be reasonable`)
      assert.equal(total, deliveryFee + (taskId === 'buy_for_me' ? 50 : 0))
      return deliveryFee
    })

    assert.equal(new Set(deliveryFees).size, vehicleIds.length, `${taskId} should price every vehicle differently`)
  })
})

test('manual quote requires customer confirmation before fulfillment', () => {
  const harness = createHarness()
  const { app, event, loadPage } = harness
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'moving_handling' }))
  app.globalData.draftOrder.dropoff = app.globalData.addresses[1]

  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()
  createPage.submitOrder()
  const order = app.globalData.orders[0]
  Object.assign(order, {
    quoteStatus: 'QUOTED',
    quotedFee: 66,
    fee: 66,
    deliveryFee: 66,
    feeText: '待确认￥66'
  })

  const detail = loadPage('pages/order-detail/order-detail.js')
  detail.onLoad({ id: order.id })
  detail.onShow()
  assert.equal(detail.data.order.needsQuoteConfirmation, true)
  detail.confirmQuote()
  assert.equal(detail.data.order.quoteStatus, 'ACCEPTED')
  assert.equal(detail.data.order.fee, 66)
})
