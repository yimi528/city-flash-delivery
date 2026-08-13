const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const runtime = require(path.resolve(__dirname, '../config/runtime.js'))

function wxFor(envVersion, override = '') {
  return {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getSystemInfoSync: () => ({ platform: 'devtools' }),
    getStorageSync: (key) => key === 'developerApiBaseUrl' ? override : ''
  }
}

test('development uses the local API and allows a developer-only override', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop')), runtime.LOCAL_API_BASE_URL)
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop', 'https://dev.example.com/api/')), 'https://dev.example.com/api')
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

test('trial builds use the local fallback until cloud config is enabled', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('trial', 'http://127.0.0.1:3000/api')), runtime.LOCAL_API_BASE_URL)
})

test('release builds retain the configured runtime fallback', () => {
  const url = runtime.resolveApiBaseUrl(wxFor('release', 'http://127.0.0.1:3000/api'))
  assert.equal(url, runtime.LOCAL_API_BASE_URL)
})
