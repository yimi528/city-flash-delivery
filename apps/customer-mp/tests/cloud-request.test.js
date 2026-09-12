const assert = require('node:assert/strict')
const test = require('node:test')

const cloudRequestPath = require.resolve('../utils/cloud-request')

function loadCloudRequest({ envId, callContainer }) {
  delete require.cache[cloudRequestPath]
  global.getApp = () => ({
    globalData: {
      wxCloudEnvId: envId,
      wxCloudServiceName: 'city-flash-api'
    }
  })
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: envId ? 'release' : 'develop' } }),
    getSystemInfoSync: () => ({ platform: 'devtools' }),
    cloud: callContainer === undefined ? {} : { callContainer }
  }
  return require(cloudRequestPath)
}

test('cloud runtime derives the production environment when app startup has not stored it yet', () => {
  delete require.cache[cloudRequestPath]
  global.getApp = () => ({ globalData: { wxCloudEnvId: '', wxCloudServiceName: 'city-flash-api' } })
  global.wx = {
    getSystemInfoSync: () => ({ platform: 'ios' }),
    cloud: { callContainer: () => {} }
  }
  const cloudRequest = require(cloudRequestPath)
  assert.equal(cloudRequest.hasEnvironment(), true)
  assert.equal(cloudRequest.isConfigured(), true)
})

test('WeChat login uses callContainer instead of a domain-whitelisted wx.request in review runtime', async () => {
  delete require.cache[cloudRequestPath]
  const apiPath = require.resolve('../utils/api')
  delete require.cache[apiPath]
  let cloudCalls = 0
  global.getApp = () => ({
    globalData: {
      wxCloudEnvId: '',
      wxCloudServiceName: 'city-flash-api',
      apiBaseUrl: 'http://127.0.0.1:3000/api',
      appRole: 'customer',
      authToken: ''
    }
  })
  global.wx = {
    getSystemInfoSync: () => ({ platform: 'ios' }),
    cloud: {
      callContainer: (options) => {
        cloudCalls += 1
        assert.equal(options.path, '/api/auth/wechat-login')
        return Promise.resolve({ statusCode: 200, data: { token: 'cloud-token', user: { id: 'cloud-user' } } })
      }
    },
    request: () => { throw new Error('wx.request must not be used for review login') }
  }
  const api = require(apiPath)
  const result = await api.wechatLogin({ code: 'review-code' })
  assert.equal(result.token, 'cloud-token')
  assert.equal(cloudCalls, 1)
})

test('cloud runtime is configured when an environment and callContainer are available', () => {
  const cloudRequest = loadCloudRequest({ envId: 'ding-delivery-test-example', callContainer: () => {} })
  assert.equal(cloudRequest.hasEnvironment(), true)
  assert.equal(cloudRequest.isConfigured(), true)
})

test('cloud runtime remains identifiable when callContainer is unavailable', () => {
  const cloudRequest = loadCloudRequest({ envId: 'ding-delivery-test-example' })
  assert.equal(cloudRequest.hasEnvironment(), true)
  assert.equal(cloudRequest.isConfigured(), false)
})

test('development runtime has no cloud environment', () => {
  const cloudRequest = loadCloudRequest({ envId: '', callContainer: undefined })
  assert.equal(cloudRequest.hasEnvironment(), false)
  assert.equal(cloudRequest.isConfigured(), false)
})

test.after(() => {
  delete global.getApp
  delete global.wx
})
