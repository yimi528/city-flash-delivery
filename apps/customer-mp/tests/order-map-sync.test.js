const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const customerRoot = path.resolve(__dirname, '..')

const ADDR_PICKUP = {
  id: 'pickup-1',
  name: '福鼎一中',
  detail: '桐山街道1号',
  contact: '张三',
  phone: '13800000001',
  latitude: 27.3325,
  longitude: 120.2165,
  location: { latitude: 27.3325, longitude: 120.2165 }
}

const ADDR_DROPOFF = {
  id: 'dropoff-1',
  name: '福鼎万达',
  detail: '天湖路2号',
  contact: '李四',
  phone: '13800000002',
  latitude: 27.3011,
  longitude: 120.2381,
  location: { latitude: 27.3011, longitude: 120.2381 }
}

let activeApp = null
let requestHandler = (options) => options.success({ statusCode: 200, data: {} })
const calls = []

// utils/*.js 是在宿主上下文里加载的，它们读的是宿主 global.wx / global.getApp。
global.wx = {
  getSystemInfoSync: () => ({ statusBarHeight: 26, windowWidth: 390, platform: 'devtools' }),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop', appId: 'wxtest' } }),
  nextTick: (callback) => setTimeout(callback, 0),
  showToast: (options) => calls.push({ type: 'showToast', options }),
  showModal: (options) => { if (options.success) options.success({ confirm: true }) },
  navigateTo: (options) => calls.push({ type: 'navigateTo', options }),
  navigateBack: (options = {}) => calls.push({ type: 'navigateBack', options }),
  redirectTo: (options) => calls.push({ type: 'redirectTo', options }),
  switchTab: (options) => calls.push({ type: 'switchTab', options }),
  stopPullDownRefresh: () => {},
  getStorageSync: () => ({}),
  setStorageSync: () => {},
  canIUse: () => false,
  request: (options) => requestHandler(options)
}

global.getApp = () => activeApp

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

function tick() {
  // navigation.afterVisible → wx.nextTick → 真实 setTimeout，所以要等一个宏任务。
  return new Promise((resolve) => setTimeout(resolve, 10))
}

function createHarness() {
  calls.length = 0
  requestHandler = (options) => options.success({ statusCode: 200, data: {} })
  let app = null
  const appPath = path.join(customerRoot, 'app.js')
  vm.runInNewContext(fs.readFileSync(appPath, 'utf8'), {
    wx: global.wx,
    App: (definition) => { app = definition },
    console,
    setTimeout: (callback) => callback(),
    Date,
    Math,
    JSON
  }, { filename: appPath })
  app.onLaunch()
  activeApp = app

  function loadPage(relativePath) {
    let page = null
    const fullPath = path.join(customerRoot, relativePath)
    const pageDir = path.dirname(fullPath)
    vm.runInNewContext(fs.readFileSync(fullPath, 'utf8'), {
      wx: global.wx,
      getApp: () => app,
      Page: (definition) => { page = definition },
      require: (requestPath) => require(path.resolve(pageDir, requestPath)),
      console,
      setTimeout: (callback) => callback(),
      setInterval: () => 1,
      clearInterval: () => {},
      Date,
      Math,
      JSON
    }, { filename: fullPath })
    page.data = clone(page.data || {})
    page.setData = function setData(patch, callback) {
      calls.push({ type: 'setData', patch })
      Object.keys(patch).forEach((key) => setByPath(this.data, key, patch[key]))
      if (typeof callback === 'function') callback.call(this)
    }
    return page
  }

  return {
    app,
    loadPage,
    setRequest: (handler) => { requestHandler = handler },
    setDataCalls: () => calls.filter((call) => call.type === 'setData').length,
    markerPoints: () => []
  }
}

// orders.service.ts 的订单响应形状：坐标是扁平的 pickupLat/pickupLng。
function serverOrder(overrides = {}) {
  return Object.assign({
    id: 'NEW-ORDER',
    orderNo: 'NEW-ORDER',
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    serviceType: 'URGENT_DELIVERY',
    serviceName: '急送',
    taskId: 'urgent_delivery',
    pickupName: ADDR_PICKUP.name,
    pickupDetail: ADDR_PICKUP.detail,
    pickupContact: ADDR_PICKUP.contact,
    pickupPhone: ADDR_PICKUP.phone,
    pickupLat: ADDR_PICKUP.latitude,
    pickupLng: ADDR_PICKUP.longitude,
    dropoffName: ADDR_DROPOFF.name,
    dropoffDetail: ADDR_DROPOFF.detail,
    dropoffContact: ADDR_DROPOFF.contact,
    dropoffPhone: ADDR_DROPOFF.phone,
    dropoffLat: ADDR_DROPOFF.latitude,
    dropoffLng: ADDR_DROPOFF.longitude,
    totalFee: 13,
    fee: 13,
    distanceKm: 3.2,
    weightKg: 1,
    createdAt: '2026-09-16T02:00:00.000Z',
    updatedAt: '2026-09-16T02:00:00.000Z'
  }, overrides)
}

function markerPoints(page) {
  return page.data.mapMarkers.map((marker) => `${marker.latitude},${marker.longitude}`)
}

test('订单详情不会把缓存里另一单的坐标画到本单地图上', async () => {
  const harness = createHarness()
  const { app, loadPage, setRequest } = harness
  app.globalData.useBackend = true
  app.globalData.isLoggedIn = true
  app.globalData.authToken = 'test-token'
  // 缓存里只有别的订单（带坐标），本单要靠 syncOrder 拉取。
  app.globalData.orders = [serverOrder({
    id: 'OLD-ORDER',
    pickupLat: 1.11,
    pickupLng: 2.22,
    dropoffLat: 3.33,
    dropoffLng: 4.44
  })]
  setRequest((options) => {
    if (/\/orders\/NEW-ORDER$/.test(String(options.url))) {
      options.success({ statusCode: 200, data: serverOrder() })
      return
    }
    options.success({ statusCode: 200, data: {} })
  })

  const page = loadPage('pages/order-detail/order-detail.js')
  page.onLoad({ id: 'NEW-ORDER' })
  page.onShow()

  assert.equal(page.data.order, null, '同步完成前不应该拿别的订单顶上')
  assert.deepEqual(markerPoints(page), [], '同步完成前不画任何坐标')

  await tick()

  assert.equal(page.data.order && page.data.order.id, 'NEW-ORDER')
  assert.deepEqual(markerPoints(page), ['27.3325,120.2165', '27.3011,120.2381'])
})

test('订单坐标缺失时地图明确停在默认中心并给出文案', async () => {
  const harness = createHarness()
  const { app, loadPage, setRequest } = harness
  app.globalData.useBackend = true
  app.globalData.orders = [serverOrder({ pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null })]
  setRequest((options) => options.success({ statusCode: 200, data: serverOrder({ pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null }) }))

  const page = loadPage('pages/order-detail/order-detail.js')
  page.onLoad({ id: 'NEW-ORDER' })
  page.onShow()
  await tick()

  assert.equal(page.data.mapPointCount, 0)
  assert.deepEqual(markerPoints(page), [])
  assert.equal(page.data.mapRouteText, '订单尚未同步完整坐标')
  assert.equal(page.data.mapLatitude, 27.3245)
  assert.equal(page.data.mapLongitude, 120.216)
})

test('选车型页在地址变化后同步地图，且没有变化时不重复重算', () => {
  const harness = createHarness()
  const { app, loadPage, setDataCalls } = harness
  app.globalData.useBackend = false
  app.globalData.draftOrder = { taskName: '急送', service: '急送', pickup: null, dropoff: null }

  const page = loadPage('pages/cargo-options/cargo-options.js')
  page.onLoad({})
  assert.equal(page.data.mapPointCount, 0, '进入页面时还没有地址')

  // 用户回到下单页选好地址：只写 globalData.draftOrder，本页必须靠 onShow 感知。
  app.globalData.draftOrder.pickup = ADDR_PICKUP
  app.globalData.draftOrder.dropoff = ADDR_DROPOFF
  page.onShow()

  assert.equal(page.data.mapPointCount, 2)
  assert.deepEqual(markerPoints(page), ['27.3325,120.2165', '27.3011,120.2381'])
  assert.equal(page.data.mapLatitude, 27.3168)
  assert.equal(page.data.mapLongitude, 120.2273)

  const afterFirstRefresh = setDataCalls()
  page.onShow()
  assert.equal(setDataCalls(), afterFirstRefresh, '起终点没变就不该再重算地图')
})

test('选车型页的 onShow 不会重置用户已经选好的车型', () => {
  const harness = createHarness()
  const { app, loadPage } = harness
  app.globalData.useBackend = false
  app.globalData.draftOrder = { taskName: '急送', service: '急送', pickup: ADDR_PICKUP, dropoff: ADDR_DROPOFF }

  const page = loadPage('pages/cargo-options/cargo-options.js')
  page.onLoad({})
  page.selectVehicle({ currentTarget: { dataset: { id: 'business_van' } } })
  page.onShow()

  assert.equal(page.data.selectedVehicle, 'business_van')
  assert.equal(page.data.selectedVehicleName, '小车')
})

test('下单请求不再把缺失坐标发成 0', () => {
  const api = require('../utils/api.js')

  const withoutCoordinates = api.buildNestOrderPayload({
    taskId: 'urgent_delivery',
    pickup: { name: '福鼎一中', detail: '桐山街道1号', latitude: '', longitude: '' },
    dropoff: { name: '福鼎万达', detail: '天湖路2号' }
  })
  assert.equal(withoutCoordinates.pickupLat, undefined)
  assert.equal(withoutCoordinates.pickupLng, undefined)
  assert.equal(withoutCoordinates.dropoffLat, undefined)
  assert.equal(withoutCoordinates.dropoffLng, undefined)

  const withCoordinates = api.buildNestOrderPayload({
    taskId: 'urgent_delivery',
    pickup: ADDR_PICKUP,
    dropoff: ADDR_DROPOFF
  })
  assert.equal(withCoordinates.pickupLat, 27.3325)
  assert.equal(withCoordinates.pickupLng, 120.2165)
  assert.equal(withCoordinates.dropoffLat, 27.3011)
  assert.equal(withCoordinates.dropoffLng, 120.2381)
})
