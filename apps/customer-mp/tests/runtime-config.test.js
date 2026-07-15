const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const runtime = require(path.resolve(__dirname, '../config/runtime.js'))

function wxFor(envVersion, override = '') {
  return {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getStorageSync: (key) => key === 'developerApiBaseUrl' ? override : ''
  }
}

test('development uses local API and allows a developer-only override', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop')), 'http://127.0.0.1:3000/api')
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop', 'https://dev.example.com/api/')), 'https://dev.example.com/api')
})

test('trial and release builds never use local or temporary tunnel addresses', () => {
  for (const version of ['trial', 'release']) {
    const url = runtime.resolveApiBaseUrl(wxFor(version, 'http://127.0.0.1:3000/api'))
    assert.match(url, /^https:\/\//)
    assert.doesNotMatch(url, /127\.0\.0\.1|localhost|trycloudflare/i)
  }
})
