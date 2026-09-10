// 开发版默认访问本机 API；体验版和正式版访问云托管生产环境。
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000/api'
// 骑手端暂不对外开放；保留代码和数据模型，后续重新启用时改为 true。
const RIDER_FEATURE_ENABLED = false
// 审核口径：小程序不得对外提供货物运输服务。寄货配送（含跨城寄递与顺风车）改为占位处理，
// 首页不展示入口、不可下单；线路、计价和页面代码保留，后续重新开放时改为 true。
const PARCEL_SERVICE_ENABLED = false

// 保留测试环境 ID，供开发联调或后续显式切换使用；体验版不再指向测试环境。
const WX_CLOUD_TEST_ENV_ID = 'ding-delivery-test-d8clg2024ea54'
const WX_CLOUD_PROD_ENV_ID = 'ding-delivery-prod-d8c1eea132b4c'
const WX_CLOUD_SERVICE_NAME = 'city-flash-api'
const WX_CLOUD_PROD_API_BASE_URL = 'https://city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com/api'

const API_BASE_URLS = Object.freeze({
  develop: LOCAL_API_BASE_URL,
  developDevice: LOCAL_API_BASE_URL,
  trial: WX_CLOUD_PROD_API_BASE_URL,
  release: WX_CLOUD_PROD_API_BASE_URL
})

function environmentVersion(wxApi) {
  try {
    const account = wxApi && wxApi.getAccountInfoSync ? wxApi.getAccountInfoSync() : null
    return account && account.miniProgram && account.miniProgram.envVersion
      ? account.miniProgram.envVersion
      : 'develop'
  } catch (error) {
    return 'develop'
  }
}

function isRealDevice(wxApi) {
  try {
    const systemInfo = wxApi && wxApi.getSystemInfoSync ? wxApi.getSystemInfoSync() : null
    return Boolean(systemInfo && (systemInfo.platform === 'ios' || systemInfo.platform === 'android'))
  } catch (error) {
    return false
  }
}

function isDevTools(wxApi) {
  try {
    const systemInfo = wxApi && wxApi.getSystemInfoSync ? wxApi.getSystemInfoSync() : null
    return Boolean(systemInfo && (systemInfo.platform === 'devtools' || systemInfo.brand === 'devtools'))
  } catch (error) {
    return false
  }
}

// 仅供开发者工具 develop 模式把云端身份链路跑通；体验版/正式版绝不读取或发送该值。
function resolveDeveloperWxOpenid(wxApi) {
  if (environmentVersion(wxApi) !== 'develop' || !isDevTools(wxApi)) return ''
  try {
    const value = wxApi && wxApi.getStorageSync ? wxApi.getStorageSync('developerWxOpenid') : ''
    return value ? String(value).trim() : ''
  } catch (error) {
    return ''
  }
}

function resolveCloudEnvId(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'develop') return ''
  if (version === 'trial') return WX_CLOUD_PROD_ENV_ID
  if (version === 'release') return WX_CLOUD_PROD_ENV_ID
  return ''
}

function resolveApiBaseUrl(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'develop') {
    try {
      const override = wxApi && wxApi.getStorageSync ? wxApi.getStorageSync('developerApiBaseUrl') : ''
      if (override && /^https?:\/\//.test(String(override))) return String(override).replace(/\/$/, '')
    } catch (error) {}
    if (isRealDevice(wxApi)) return API_BASE_URLS.developDevice
  }
  return API_BASE_URLS[version] || API_BASE_URLS.release
}

module.exports = {
  LOCAL_API_BASE_URL,
  RIDER_FEATURE_ENABLED,
  PARCEL_SERVICE_ENABLED,
  API_BASE_URLS,
  WX_CLOUD_TEST_ENV_ID,
  WX_CLOUD_PROD_ENV_ID,
  WX_CLOUD_SERVICE_NAME,
  environmentVersion,
  isRealDevice,
  isDevTools,
  resolveDeveloperWxOpenid,
  resolveCloudEnvId,
  resolveApiBaseUrl
}
