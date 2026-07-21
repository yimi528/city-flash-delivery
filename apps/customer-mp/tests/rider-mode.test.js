const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

let requestHandler = null
let clearedRiderSession = false
let appAvailable = true

global.wx = {
  request(options) {
    requestHandler(options)
  }
}

const riderApp = {
  globalData: {
    apiBaseUrl: 'http://127.0.0.1:3000/api',
    authToken: 'customer-token',
    riderAuthToken: 'rider-token'
  },
  clearRiderSession() {
    clearedRiderSession = true
  }
}

global.getApp = () => appAvailable ? riderApp : undefined

const riderApi = require(path.resolve(__dirname, '../utils/rider-api.js'))

test('rider mode uses the rider token without replacing the customer token', async () => {
  requestHandler = (options) => {
    assert.match(options.url, /\/v1\/rider\/me$/)
    assert.equal(options.header.Authorization, 'Bearer rider-token')
    options.success({ statusCode: 200, data: { id: 'rider-1', roleStatus: 'ACTIVE' } })
  }

  const rider = await riderApi.me()
  assert.equal(rider.id, 'rider-1')
})

test('rider requests recover after the app instance is temporarily unavailable', async () => {
  appAvailable = false
  await assert.rejects(riderApi.me(), /小程序状态正在初始化/)

  appAvailable = true
  requestHandler = (options) => options.success({ statusCode: 200, data: { id: 'rider-1' } })
  const rider = await riderApi.me()
  assert.equal(rider.id, 'rider-1')
})

test('an expired rider token clears only the rider session', async () => {
  clearedRiderSession = false
  requestHandler = (options) => {
    options.success({ statusCode: 401, data: { message: '骑手登录已过期' } })
  }

  await assert.rejects(riderApi.currentTasks(), /骑手登录已过期/)
  assert.equal(clearedRiderSession, true)
})

test('offline writes carry an explicit order-hall confirmation source', async () => {
  requestHandler = (options) => {
    assert.match(options.url, /\/v1\/rider\/online$/)
    assert.deepEqual(options.data, { online: false, intent: 'manual_offline', source: 'order_hall_shift_end' })
    options.success({ statusCode: 200, data: { id: 'rider-1', online: false } })
  }

  const rider = await riderApi.setOnline(false, 'order_hall_shift_end')
  assert.equal(rider.online, false)
})

test('one mini program keeps customer and rider sessions isolated while switching modes', () => {
  const storage = {}
  let app = null
  const wx = {
    getSystemInfoSync: () => ({ statusBarHeight: 24, windowWidth: 375 }),
    getStorageSync: (key) => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: (key) => { delete storage[key] }
  }
  const appPath = path.resolve(__dirname, '../app.js')
  vm.runInNewContext(fs.readFileSync(appPath, 'utf8'), {
    App: (definition) => { app = definition },
    wx,
    require,
    setInterval,
    clearInterval,
    Promise
  }, { filename: appPath })

  app.globalData.useBackend = false
  app.onLaunch()
  app.globalData.authToken = 'customer-token'
  app.setRiderSession({ token: 'rider-token', rider: { id: 'rider-1', online: true } })

  assert.equal(app.globalData.authToken, 'customer-token')
  assert.equal(app.globalData.riderAuthToken, 'rider-token')
  assert.equal(storage.customerAuthToken, undefined)
  assert.equal(storage.riderAuthToken, 'rider-token')

  // The state assertion does not need to start the real location heartbeat.
  app.riderPresenceTimer = {}
  app.setCustomerRoleSession({ token: 'new-customer-token' })
  assert.equal(app.globalData.authToken, 'new-customer-token')
  assert.equal(app.globalData.currentRole, 'customer')
  assert.equal(app.globalData.riderAuthToken, 'rider-token')
  assert.equal(app.globalData.rider.online, true)
  assert.equal(storage.customerAuthToken, 'new-customer-token')
  assert.equal(storage.riderAuthToken, 'rider-token')
  assert.equal(storage.currentRider.online, true)
})
