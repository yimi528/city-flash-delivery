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
  global.wx = { cloud: callContainer === undefined ? {} : { callContainer } }
  return require(cloudRequestPath)
}

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
  const cloudRequest = loadCloudRequest({ envId: '', callContainer: () => {} })
  assert.equal(cloudRequest.hasEnvironment(), false)
  assert.equal(cloudRequest.isConfigured(), false)
})

test.after(() => {
  delete global.getApp
  delete global.wx
})
