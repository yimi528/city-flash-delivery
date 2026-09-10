const runtimeConfig = require('../config/runtime')

// 审核口径：小程序不得对外提供货物运输服务。寄货配送（send_parcel，含跨城寄递与顺风车）
// 只保留代码和数据模型，首页入口不展示、下单链路不可用。
// 与 utils/rider-feature.js 使用同一套开关写法：优先读 app.globalData，其次读运行时配置，
// 便于测试和开发联调临时打开被关闭的服务。
const MOCKED_TASK_IDS = ['send_parcel']

function currentApp(app) {
  if (app) return app
  return typeof getApp === 'function' ? getApp() : null
}

function isParcelEnabled(app) {
  const target = currentApp(app)
  if (target && target.globalData && typeof target.globalData.parcelServiceEnabled === 'boolean') {
    return target.globalData.parcelServiceEnabled
  }
  return runtimeConfig.PARCEL_SERVICE_ENABLED === true
}

function isTaskEnabled(taskId, app) {
  if (!MOCKED_TASK_IDS.includes(taskId)) return true
  if (taskId === 'send_parcel') return isParcelEnabled(app)
  return false
}

function filterEnabledTasks(tasks, app) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => task && isTaskEnabled(task.id, app))
}

function firstEnabledTaskId(tasks, app) {
  const available = filterEnabledTasks(tasks || [], app)
  return available.length ? available[0].id : ''
}

module.exports = {
  MOCKED_TASK_IDS,
  isParcelEnabled,
  isTaskEnabled,
  filterEnabledTasks,
  firstEnabledTaskId
}
