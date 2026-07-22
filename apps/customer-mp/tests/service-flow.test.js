const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const customerRoot = path.resolve(__dirname, '..')
const carpool = require('../utils/carpool')

const CANGNAN_ADDRESS = {
  id: 'test-cangnan',
  name: '苍南站',
  detail: '浙江省温州市苍南县灵溪镇站前大道',
  city: '温州市',
  district: '苍南县',
  adcode: '330327',
  latitude: 27.5364,
  longitude: 120.4164,
  contact: '测试乘客',
  phone: '13800000001'
}

const WENZHOU_ADDRESS = {
  id: 'test-wenzhou',
  name: '温州南站',
  detail: '浙江省温州市瓯海区工业路',
  city: '温州市',
  district: '瓯海区',
  adcode: '330304',
  latitude: 27.9727,
  longitude: 120.5856,
  contact: '测试乘客',
  phone: '13800000002'
}

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
    { id: 'carpool_ride', service: '顺风车', vehicle: 'business_van', alternate: 'ebike' },
    { id: 'send_parcel', service: '寄货', vehicle: 'small_car', alternate: 'ebike' },
    { id: 'cargo_haul', service: '运货', vehicle: 'cargo_tricycle', alternate: 'small_car' },
    { id: 'moving_handling', service: '搬运装卸', vehicle: 'manual_labor', alternate: 'small_car' },
    { id: 'urgent_delivery', service: '急送', vehicle: 'ebike', alternate: 'small_car' },
    { id: 'pickup', service: '帮取', vehicle: 'ebike', alternate: 'small_car' },
    { id: 'buy_for_me', service: '帮买', vehicle: 'ebike', alternate: 'small_car' },
    { id: 'pedicab_delivery', service: '送货/送客', vehicle: 'human_tricycle', alternate: 'small_car' }
  ]

  assert.deepEqual(index.data.allTasks.map((item) => item.id), [
    'send_parcel',
    'carpool_ride',
    'cargo_haul',
    'moving_handling',
    'urgent_delivery',
    'pickup',
    'buy_for_me',
    'pedicab_delivery'
  ])

  cases.forEach((flow) => {
    index.chooseTask(event({ task: flow.id }))
    const draft = app.globalData.draftOrder
    if (flow.id === 'carpool_ride') {
      carpool.applySelectedAddress(draft, CANGNAN_ADDRESS, 'dropoff')
    } else {
      draft.pickup = app.globalData.addresses[0]
      draft.dropoff = app.globalData.addresses[1]
    }
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

test('all eight services keep their form choices selectable', () => {
  const cases = [
    {
      id: 'carpool_ride',
      select(page, event) {
        page.selectLine(event({ id: 'wenzhou' }))
        assert.equal(page.data.selectedLineId, 'cangnan')
      }
    },
    {
      id: 'cargo_haul',
      select(page, event) {
        page.selectItem(event({ item: '家具家电' }))
        page.selectWeight(event({ weight: 10 }))
        assert.equal(page.data.selectedItem, '家具家电')
        assert.equal(page.data.selectedWeight, 10)
      }
    },
    {
      id: 'moving_handling',
      select(page, event) {
        page.selectItem(event({ item: '卸货' }))
        assert.equal(page.data.selectedItem, '卸货')
      }
    },
    {
      id: 'send_parcel',
      select(page, event) {
        page.selectLine(event({ id: 'cangnan_parcel' }))
        page.selectItem(event({ item: '数码配件' }))
        page.selectWeight(event({ weight: 5 }))
        assert.equal(page.data.selectedLineId, 'cangnan_parcel')
        assert.equal(page.data.selectedItem, '数码配件')
        assert.equal(page.data.selectedWeight, 5)
      }
    },
    {
      id: 'urgent_delivery',
      select(page, event) {
        page.selectItem(event({ item: '鲜花蛋糕' }))
        assert.equal(page.data.selectedItem, '鲜花蛋糕')
      }
    },
    {
      id: 'pickup',
      select(page, event) {
        page.selectItem(event({ item: '文件证件' }))
        assert.equal(page.data.selectedItem, '文件证件')
      }
    },
    {
      id: 'buy_for_me',
      select(page, event) {
        page.inputBuyItems(event({}, { value: '两盒纯牛奶' }))
        page.inputBudget(event({}, { value: '26' }))
        assert.equal(page.data.estimate.productFee, '26.0')
      }
    },
    {
      id: 'pedicab_delivery',
      select(page, event) {
        page.selectItem(event({ item: '小件行李' }))
        assert.equal(page.data.selectedItem, '小件行李')
      }
    }
  ]

  cases.forEach((flow) => {
    const { app, event, loadPage } = createHarness()
    const index = loadPage('pages/index/index.js')
    index.onShow()
    index.chooseTask(event({ task: flow.id }))
    const page = loadPage('pages/order-create/order-create.js')
    page.onShow()
    flow.select(page, event)
    assert.equal(app.globalData.draftOrder.taskId, flow.id)
  })
})

test('published pricing is merged into the customer draft and route prices', () => {
  const { app, event, loadPage } = createHarness()
  app.globalData.appConfig = {
    pricingVersion: 42,
    services: [
      {
        id: 'send_parcel',
        priceSummary: '温州66元',
        routes: [{ id: 'wenzhou_parcel', destinationName: '温州', unitPriceFen: 6600 }]
      },
      {
        id: 'carpool_ride',
        routes: [{ id: 'cangnan', destinationName: '苍南', unitPriceFen: 5200 }]
      }
    ],
    pricing: {
      version: 42,
      rules: [
        { serviceId: 'send_parcel', pricingMode: 'fixed_route', baseFeeFen: 1200, perKmFen: 350, maxFeeFen: 50000 },
        { serviceId: 'carpool_ride', pricingMode: 'fixed_route', baseFeeFen: 0, perKmFen: 0, maxFeeFen: 50000 }
      ]
    }
  }
  app.globalData.remoteServices = app.globalData.appConfig.services
  const index = loadPage('pages/index/index.js')
  index.onShow()
  assert.equal(index.data.draft.taskName, '寄货')
  assert.equal(index.data.draft.priceSummary, '温州66元')
  assert.equal(index.data.allTasks[0].id, 'send_parcel')

  const orderPage = loadPage('pages/order-create/order-create.js')
  orderPage.onShow()
  assert.equal(orderPage.data.draft.pricingVersion, 42)
  assert.equal(orderPage.data.draft.selectedLine.price, 66)
  assert.equal(orderPage.data.draft.servicePricing.basePrice, 12)
})

test('legacy moving entry opens the unified handling service', () => {
  const { app, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'moving' }))

  assert.equal(app.globalData.draftOrder.taskId, 'moving_handling')
  assert.equal(app.globalData.draftOrder.service, '搬运装卸')
  assert.equal(index.data.activeTask.id, 'moving_handling')
})

test('switching from carpool to cargo clears the carpool-only destination', () => {
  const { app, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')

  index.onShow()
  index.chooseTask(event({ task: 'carpool_ride' }))
  assert.equal(app.globalData.draftOrder.dropoff.needsAddressSelection, true)

  index.chooseTask(event({ task: 'cargo_haul' }))

  assert.equal(app.globalData.draftOrder.taskId, 'cargo_haul')
  assert.equal(app.globalData.draftOrder.pickup.id, app.globalData.addresses[0].id)
  assert.equal(app.globalData.draftOrder.pickup.phone, app.globalData.addresses[0].phone)
  assert.equal(app.globalData.draftOrder.dropoff, null)
  assert.equal(index.data.draft.dropoff, null)
})

test('switching from a remote fixed route to handling clears stale route choices', () => {
  const { app, event, loadPage } = createHarness()
  app.globalData.appConfig = {
    services: [{
      id: 'send_parcel',
      routes: [{ id: 'wenzhou_parcel', destinationName: '温州', unitPriceFen: 5800 }]
    }],
    pricing: {
      rules: [{ serviceId: 'send_parcel', pricingMode: 'fixed_route', baseFeeFen: 5800 }]
    }
  }
  app.globalData.remoteServices = app.globalData.appConfig.services
  const index = loadPage('pages/index/index.js')
  index.onShow()
  assert.equal(app.globalData.draftOrder.remoteTaskLines.length, 1)

  index.chooseTask(event({ task: 'moving_handling' }))
  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()

  assert.equal(app.globalData.draftOrder.remoteTaskLines.length, 0)
  assert.equal(createPage.data.taskLines.length, 0)
  assert.equal(createPage.data.draft.selectedLine, null)
})

test('handling confirmation can reopen the pickup address selector', () => {
  const { calls, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'moving_handling' }))
  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()

  createPage.chooseRouteAddress(event({ type: 'pickup' }))

  const navigation = calls.findLast((call) => call.type === 'navigateTo')
  assert.equal(navigation.options.url, '/pages/address/address?type=pickup')
})

test('buy-for-me confirmation reopens the purchase address selector', () => {
  const { calls, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'buy_for_me' }))
  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()

  createPage.chooseRouteAddress(event({ type: 'purchase' }))

  const navigation = calls.findLast((call) => call.type === 'navigateTo')
  assert.equal(navigation.options.url, '/pages/address/address?type=purchase')
})

test('all seeded customer addresses satisfy the order contact rules', () => {
  const { app } = createHarness()

  app.globalData.addresses.forEach((address) => {
    assert.ok(String(address.contact || '').trim(), `${address.id} should have a contact`)
    assert.match(String(address.phone || '').trim(), /^1[3-9]\d{9}$/, `${address.id} should have a valid mobile`)
  })
})

test('carpool fare follows passenger count and return always ends in Fuding', () => {
  const { app, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'carpool_ride' }))
  index.chooseCarpoolRoute(event({ route: 'wenzhou' }))
  carpool.applySelectedAddress(app.globalData.draftOrder, WENZHOU_ADDRESS, 'dropoff', 'wenzhou')
  const page = loadPage('pages/order-create/order-create.js')
  page.onShow()
  page.selectLine(event({ id: 'wenzhou' }))
  page.changePassenger(event({ step: 1 }))
  page.changePassenger(event({ step: 1 }))
  assert.equal(page.data.passengerCount, 3)
  assert.equal(Number(page.data.estimate.total), 450)
  page.selectDirection(event({ direction: 'RETURN' }))
  assert.equal(app.globalData.draftOrder.pickup.name, '温州南站')
  assert.equal(app.globalData.draftOrder.dropoff.name, '福鼎')
  assert.equal(Number(page.data.estimate.total), 450)
})

test('carpool address selection only accepts Cangnan or Wenzhou and matches the route', async () => {
  const { app, calls, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'carpool_ride' }))
  index.chooseCarpoolRoute(event({ route: 'wenzhou' }))

  const addressPage = loadPage('pages/address/address.js')
  addressPage.onLoad({ type: 'dropoff', mode: 'carpool', route: 'wenzhou' })
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.ok(addressPage.data.addresses.length >= 2)
  assert.ok(addressPage.data.addresses.every((item) => carpool.isSelectedCityAddress(item, 'wenzhou')))

  addressPage.selectAddress(WENZHOU_ADDRESS)
  assert.equal(app.globalData.draftOrder.selectedLine.id, 'wenzhou')
  assert.equal(app.globalData.draftOrder.direction, 'OUTBOUND')
  assert.equal(app.globalData.draftOrder.dropoff.name, '温州南站')

  const before = calls.length
  addressPage.selectAddress(CANGNAN_ADDRESS)
  assert.equal(calls[before].options.title, '请选择温州境内地址')
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

test('order detail preserves a user-adjusted map viewport during order refresh', () => {
  const { app, event, loadPage } = createHarness()
  const index = loadPage('pages/index/index.js')
  index.onShow()
  index.chooseTask(event({ task: 'send_parcel' }))
  app.globalData.draftOrder.pickup = app.globalData.addresses[0]
  app.globalData.draftOrder.dropoff = app.globalData.addresses[1]

  const createPage = loadPage('pages/order-create/order-create.js')
  createPage.onShow()
  createPage.submitOrder()
  const detail = loadPage('pages/order-detail/order-detail.js')
  detail.onLoad({ id: app.globalData.orders[0].id })
  detail.onShow()

  const patches = []
  const originalSetData = detail.setData
  detail.setData = function captureSetData(patch, callback) {
    patches.push(patch)
    originalSetData.call(this, patch, callback)
  }
  detail.onMapRegionChange({ type: 'begin', causedBy: 'gesture' })
  detail.onMapRegionChange({ type: 'end', causedBy: 'gesture' })
  detail.applyOrder(detail.data.order)

  const refreshPatch = patches[patches.length - 1]
  assert.equal('mapLatitude' in refreshPatch, false)
  assert.equal('mapLongitude' in refreshPatch, false)
  assert.equal('mapScale' in refreshPatch, false)
})

test('all services expose cancellation before payment', () => {
  const taskIds = [
    'carpool_ride',
    'cargo_haul',
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
    if (taskId === 'carpool_ride') {
      carpool.applySelectedAddress(app.globalData.draftOrder, CANGNAN_ADDRESS, 'dropoff')
    } else {
      app.globalData.draftOrder.pickup = app.globalData.addresses[0]
      app.globalData.draftOrder.dropoff = app.globalData.addresses[1]
    }
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
