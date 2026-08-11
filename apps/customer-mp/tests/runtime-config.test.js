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

test('development uses osako API and allows a developer-only override', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop')), runtime.OSAKO_API_BASE_URL)
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop', 'https://dev.example.com/api/')), 'https://dev.example.com/api')
})

test('development on a real device uses the osako API', () => {
  const deviceWx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getSystemInfoSync: () => ({ platform: 'ios' }),
    getStorageSync: () => ''
  }

  assert.equal(runtime.resolveApiBaseUrl(deviceWx), runtime.OSAKO_API_BASE_URL)
  assert.match(runtime.resolveApiBaseUrl(deviceWx), /^https:\/\//)
})

test('trial builds use the osako API', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('trial', 'http://127.0.0.1:3000/api')), runtime.OSAKO_API_BASE_URL)
})

test('release builds retain the stable production API', () => {
  const url = runtime.resolveApiBaseUrl(wxFor('release', 'http://127.0.0.1:3000/api'))
  assert.match(url, /^https:\/\//)
  assert.doesNotMatch(url, /127\.0\.0\.1|localhost|trycloudflare/i)
})
