const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

test('the mini program silently exchanges wx.login code without changing the rider session', async () => {
  const storage = {
    riderAuthToken: 'rider-token',
    currentRider: { id: 'rider-1', online: true }
  }
  let app = null
  let loginCalls = 0
  const wx = {
    getSystemInfoSync: () => ({ statusBarHeight: 24, windowWidth: 375 }),
    getStorageSync: (key) => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: (key) => { delete storage[key] },
    login: ({ success }) => {
      loginCalls += 1
      success({ code: 'wx-session-code' })
    }
  }
  const miniApi = {
    wechatLogin: async (payload) => {
      assert.equal(payload.code, 'wx-session-code')
      return {
        token: 'customer-wechat-token',
        currentRole: 'customer',
        roles: [{ role: 'customer', status: 'active' }],
        user: { id: 'wechat-user-1', nickname: '微信用户' }
      }
    }
  }
  const appPath = path.resolve(__dirname, '../app.js')
  vm.runInNewContext(fs.readFileSync(appPath, 'utf8'), {
    App: (definition) => { app = definition },
    wx,
    require: (request) => request === './utils/api' ? miniApi : require(request),
    setInterval,
    clearInterval,
    Promise,
    Error
  }, { filename: appPath })

  app.globalData.useBackend = true
  app.globalData.isLoggedIn = false
  app.globalData.authToken = ''
  app.globalData.riderAuthToken = 'rider-token'
  app.globalData.rider = { id: 'rider-1', online: true }

  await app.ensureWechatLogin()

  assert.equal(loginCalls, 1)
  assert.equal(app.globalData.authToken, 'customer-wechat-token')
  assert.equal(app.globalData.userId, 'wechat-user-1')
  assert.equal(app.globalData.riderAuthToken, 'rider-token')
  assert.equal(app.globalData.rider.online, true)
  assert.equal(storage.customerAuthToken, 'customer-wechat-token')
  assert.equal(storage.riderAuthToken, 'rider-token')
})

test('app exposes a login-ready promise for pages that need authenticated data', async () => {
  const storage = {}
  let app = null
  const wx = {
    getSystemInfoSync: () => ({ statusBarHeight: 24, windowWidth: 375 }),
    getStorageSync: (key) => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: (key) => { delete storage[key] },
    login: ({ success }) => success({ code: 'wx-session-code' })
  }
  const miniApi = {
    wechatLogin: async () => ({
      token: 'customer-wechat-token',
      roles: [{ role: 'customer', status: 'active' }],
      user: { id: 'wechat-user-2', nickname: '微信用户' }
    })
  }
  const appPath = path.resolve(__dirname, '../app.js')
  vm.runInNewContext(fs.readFileSync(appPath, 'utf8'), {
    App: (definition) => { app = definition },
    wx,
    require: (request) => request === './utils/api' ? miniApi : require(request),
    setInterval,
    clearInterval,
    Promise,
    Error
  }, { filename: appPath })

  app.globalData.useBackend = true
  app.onLaunch()
  await app.loginReady

  assert.equal(app.globalData.isLoggedIn, true)
  assert.equal(app.globalData.userId, 'wechat-user-2')
})
