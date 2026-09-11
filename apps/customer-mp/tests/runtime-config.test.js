const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const runtime = require(path.resolve(__dirname, '../config/runtime.js'))

const PROD_API_BASE_URL = 'https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com/api'
const PROD_ENV_ID = 'ding-delivery-prod-d8c1eea132b4c'

test('rider client is disabled in the current release configuration', () => {
  assert.equal(runtime.RIDER_FEATURE_ENABLED, false)
})

test('parcel service is mocked off in the current release configuration', () => {
  assert.equal(runtime.PARCEL_SERVICE_ENABLED, false)
})

function wxFor(envVersion, override = '', developerOpenid = '') {
  return {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getSystemInfoSync: () => ({ platform: 'devtools' }),
    getStorageSync: (key) => key === 'developerApiBaseUrl' ? override : (key === 'developerWxOpenid' ? developerOpenid : '')
  }
}

function deviceFor(envVersion, override = '') {
  return {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getSystemInfoSync: () => ({ platform: 'ios' }),
    getStorageSync: (key) => key === 'developerApiBaseUrl' ? override : ''
  }
}

function brokenAccountApi(override = '') {
  return {
    getAccountInfoSync: () => { throw new Error('getAccountInfoSync is unavailable') },
    getSystemInfoSync: () => ({ platform: 'android' }),
    getStorageSync: (key) => key === 'developerApiBaseUrl' ? override : ''
  }
}

test('development in DevTools uses the local API and allows a developer-only override', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop')), runtime.LOCAL_API_BASE_URL)
  assert.equal(runtime.resolveApiBaseUrl(wxFor('develop', 'https://dev.example.com/api/')), 'https://dev.example.com/api')
  assert.equal(runtime.resolveCloudEnvId(wxFor('develop')), '')
})

test('development outside DevTools never targets the loopback API', () => {
  // 回归：审核容器把 envVersion 报成 develop 时，曾经回落到 http://127.0.0.1:3000/api，
  // 于是所有请求都被微信以 request:fail url not in domain list 拒绝（审核因此被驳回）。
  const realDevice = deviceFor('develop')
  const url = runtime.resolveApiBaseUrl(realDevice)

  assert.equal(url, PROD_API_BASE_URL)
  assert.equal(runtime.isLoopbackApiBaseUrl(url), false)
  assert.equal(runtime.resolveCloudEnvId(realDevice), PROD_ENV_ID)
})

test('an unknown or broken environment version is treated as production, never loopback', () => {
  for (const wx of [deviceFor(''), deviceFor('weird'), brokenAccountApi()]) {
    const url = runtime.resolveApiBaseUrl(wx)
    assert.equal(url, PROD_API_BASE_URL)
    assert.equal(runtime.isLoopbackApiBaseUrl(url), false)
    assert.equal(runtime.resolveCloudEnvId(wx), PROD_ENV_ID)
  }
})

test('an explicit developer override still wins outside DevTools', () => {
  const url = runtime.resolveApiBaseUrl(deviceFor('develop', 'http://192.168.1.20:3000/api/'))
  assert.equal(url, 'http://192.168.1.20:3000/api')
  assert.equal(runtime.isLoopbackApiBaseUrl(url), false)
})

test('developer cloud identity override is restricted to DevTools develop mode', () => {
  assert.equal(runtime.resolveDeveloperWxOpenid(wxFor('develop', '', 'devtools-openid')), 'devtools-openid')
  assert.equal(runtime.resolveDeveloperWxOpenid(wxFor('trial', '', 'trial-openid')), '')
  assert.equal(runtime.resolveDeveloperWxOpenid(deviceFor('develop', '')), '')
})

test('trial builds use the production cloud environment and API', () => {
  assert.equal(runtime.resolveApiBaseUrl(wxFor('trial', 'http://127.0.0.1:3000/api')), PROD_API_BASE_URL)
  assert.equal(runtime.resolveCloudEnvId(wxFor('trial')), PROD_ENV_ID)
  assert.equal(runtime.WX_CLOUD_TEST_ENV_ID, 'ding-delivery-test-d8clg2024ea54')
})

test('release builds use the production cloud environment and API', () => {
  const url = runtime.resolveApiBaseUrl(wxFor('release', 'http://127.0.0.1:3000/api'))
  assert.equal(url, PROD_API_BASE_URL)
  assert.equal(runtime.resolveCloudEnvId(wxFor('release')), PROD_ENV_ID)
})

test('isLoopbackApiBaseUrl recognises every loopback form', () => {
  for (const url of [
    'http://127.0.0.1:3000/api',
    'https://127.0.0.1/api',
    'http://localhost:3000/api',
    'http://0.0.0.0:3000',
    'http://[::1]:3000/api'
  ]) {
    assert.equal(runtime.isLoopbackApiBaseUrl(url), true, `${url} should be loopback`)
  }
  for (const url of [PROD_API_BASE_URL, 'http://192.168.1.20:3000/api', '', null, undefined]) {
    assert.equal(runtime.isLoopbackApiBaseUrl(url), false, `${String(url)} should not be loopback`)
  }
})

test('resolveBackendBaseUrl keeps the local API in DevTools and blocks it elsewhere', () => {
  const localGlobalData = { apiBaseUrl: runtime.LOCAL_API_BASE_URL }

  assert.equal(runtime.resolveBackendBaseUrl(localGlobalData, wxFor('develop')), runtime.LOCAL_API_BASE_URL)
  // 真机 / 审核容器：即使 globalData 里带着本机地址，也必须改走线上地址。
  assert.equal(runtime.resolveBackendBaseUrl(localGlobalData, deviceFor('develop')), PROD_API_BASE_URL)
  // 地址缺失时按环境给出安全默认值。
  assert.equal(runtime.resolveBackendBaseUrl({}, wxFor('develop')), runtime.LOCAL_API_BASE_URL)
  assert.equal(runtime.resolveBackendBaseUrl({}, deviceFor('trial')), PROD_API_BASE_URL)
  // 正常的线上地址原样保留（去掉结尾斜杠）。
  assert.equal(runtime.resolveBackendBaseUrl({ apiBaseUrl: `${PROD_API_BASE_URL}/` }, wxFor('release')), PROD_API_BASE_URL)
})
