const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const runtime = require(path.resolve(__dirname, '../config/runtime.js'))

function wxFor(envVersion, override = '', developerOpenid = '') {
  return {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getSystemInfoSync: () => ({ platform: 'devtools' }),
    getStorageSync: (key) => key === 'developerApiBaseUrl' ? override : (key === 'developerWxOpenid' ? developerOpenid : '')
  }
}

test('development uses the local API and allows a developer-only override', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop')), runtime.LOCAL_API_BASE_URL)
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop', 'https://dev.example.com/api/')), 'https://dev.example.com/api')
  assert.equal(runtime.resolveCloudEnvId(wxFor('develop')), '')
})

test('development on a real device keeps the local fallback until cloud config is enabled', () => {
  const deviceWx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getSystemInfoSync: () => ({ platform: 'ios' }),
    getStorageSync: () => ''
  }

  assert.equal(runtime.resolveApiBaseUrl(deviceWx), runtime.LOCAL_API_BASE_URL)
  assert.match(runtime.resolveApiBaseUrl(deviceWx), /^http:\/\//)
})

test('developer cloud identity override is restricted to DevTools develop mode', () => {
  assert.equal(runtime.resolveDeveloperWxOpenid(wxFor('develop', '', 'devtools-openid')), 'devtools-openid')
  assert.equal(runtime.resolveDeveloperWxOpenid(wxFor('trial', '', 'trial-openid')), '')
  assert.equal(runtime.resolveDeveloperWxOpenid({
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getSystemInfoSync: () => ({ platform: 'ios' }),
    getStorageSync: () => 'device-openid'
  }), '')
})

test('trial builds use the production cloud environment and API', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('trial', 'http://127.0.0.1:3000/api')), 'https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com/api')
  assert.equal(runtime.resolveCloudEnvId(wxFor('trial')), 'ding-delivery-prod-d8c1eea132b4c')
  assert.equal(runtime.WX_CLOUD_TEST_ENV_ID, 'ding-delivery-test-d8clg2024ea54')
})

test('release builds use the production cloud environment and API', () => {
  const url = runtime.resolveApiBaseUrl(wxFor('release', 'http://127.0.0.1:3000/api'))
  assert.equal(url, 'https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com/api')
  assert.equal(runtime.resolveCloudEnvId(wxFor('release')), 'ding-delivery-prod-d8c1eea132b4c')
})
