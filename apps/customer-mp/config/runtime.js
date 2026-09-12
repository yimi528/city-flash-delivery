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

function hasCloudContainer(wxApi) {
  return Boolean(wxApi && wxApi.cloud && typeof wxApi.cloud.callContainer === 'function')
}

function getDeveloperApiOverride(wxApi) {
  try {
    const override = wxApi && wxApi.getStorageSync ? wxApi.getStorageSync('developerApiBaseUrl') : ''
    return override && /^https?:\/\//.test(String(override)) ? String(override).replace(/\/$/, '') : ''
  } catch (error) {
    return ''
  }
}

// 审核容器可能把 platform/envVersion 报成 develop。只要 callContainer 可用，
// 即使 platform 看起来像 devtools 也应走云托管；本机调试需要显式设置 developerApiBaseUrl。
function shouldUseCloudRuntime(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'trial' || version === 'release') return true
  return version === 'develop' && hasCloudContainer(wxApi) && !getDeveloperApiOverride(wxApi)
}

// 回环地址永远进不了微信「request 合法域名」白名单，一旦被请求就必然报
// `request:fail url not in domain list`（审核已因此被驳回一次），所以必须能识别出来。
function isLoopbackApiBaseUrl(url) {
  if (!url) return false
  return /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i.test(String(url).trim())
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

// 本机 API 只给微信开发者工具用。真机、预览和审核容器一律走云托管生产环境：
// 回环地址在真机上本来就连不通，回到它只会把「环境判断错误」放大成一次审核驳回。
function resolveApiBaseUrl(wxApi) {
  const version = environmentVersion(wxApi)
  if (version !== 'develop') return API_BASE_URLS[version] || API_BASE_URLS.release
  const override = getDeveloperApiOverride(wxApi)
  if (override) return override
  if (shouldUseCloudRuntime(wxApi)) return WX_CLOUD_PROD_API_BASE_URL
  if (isDevTools(wxApi)) return LOCAL_API_BASE_URL
  return WX_CLOUD_PROD_API_BASE_URL
}

function resolveCloudEnvId(wxApi) {
  const version = environmentVersion(wxApi)
  if (version === 'develop') {
    if (getDeveloperApiOverride(wxApi)) return ''
    if (isDevTools(wxApi) && !hasCloudContainer(wxApi)) return ''
    return WX_CLOUD_PROD_ENV_ID
  }
  if (version === 'trial' || version === 'release') return WX_CLOUD_PROD_ENV_ID
  // 环境未知（例如审核容器）时按线上处理，不回落到本机地址。
  return WX_CLOUD_PROD_ENV_ID
}

// 请求基址的唯一出口：保证非开发者工具环境永远不会把请求打到回环地址上。
function resolveBackendBaseUrl(globalData, wxApi) {
  const configured = String((globalData && globalData.apiBaseUrl) || '').replace(/\/$/, '')
  const cloudRuntime = shouldUseCloudRuntime(wxApi) || !isDevTools(wxApi)
  if (!configured) return cloudRuntime ? WX_CLOUD_PROD_API_BASE_URL : LOCAL_API_BASE_URL
  if (isLoopbackApiBaseUrl(configured) && cloudRuntime) return WX_CLOUD_PROD_API_BASE_URL
  return configured
}

module.exports = {
  LOCAL_API_BASE_URL,
  RIDER_FEATURE_ENABLED,
  PARCEL_SERVICE_ENABLED,
  API_BASE_URLS,
  WX_CLOUD_TEST_ENV_ID,
  WX_CLOUD_PROD_ENV_ID,
  WX_CLOUD_SERVICE_NAME,
  WX_CLOUD_PROD_API_BASE_URL,
  environmentVersion,
  isRealDevice,
  isDevTools,
  hasCloudContainer,
  getDeveloperApiOverride,
  shouldUseCloudRuntime,
  isLoopbackApiBaseUrl,
  resolveDeveloperWxOpenid,
  resolveCloudEnvId,
  resolveApiBaseUrl,
  resolveBackendBaseUrl
}
