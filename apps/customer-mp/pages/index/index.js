const app = getApp()
const map = require('../../utils/map')
const serviceConfig = require('../../utils/service-config')
const vehicleConfig = require('../../utils/vehicle-config')

function defaultOrderAddresses() {
  if (typeof app.getDefaultOrderAddresses === 'function') return app.getDefaultOrderAddresses()
  const addresses = Array.isArray(app.globalData.addresses) ? app.globalData.addresses : []
  const pickup = addresses.find((address) => address.isDefault) || addresses[0] || null
  const dropoff = addresses.find((address) => address.id !== (pickup && pickup.id)) || pickup
  return {
    pickup: pickup ? Object.assign({}, pickup) : null,
    dropoff: dropoff ? Object.assign({}, dropoff) : null
  }
}

function ensureDefaultOrderAddresses(draft) {
  const defaults = defaultOrderAddresses()
  if (!draft.pickup && defaults.pickup) draft.pickup = defaults.pickup
  if (!draft.dropoff && defaults.dropoff) draft.dropoff = defaults.dropoff
}

function ensureDraftTask(taskId) {
  const draft = app.globalData.draftOrder
  const nextTaskId = taskId || draft.taskId || 'send_parcel'
  const routeTask = serviceConfig.isRouteTask(nextTaskId)
  const isTaskChanged = draft.taskId !== nextTaskId
  const previousTaskId = draft.taskId
  const previousSelectedLine = draft.selectedLine
  const patch = serviceConfig.buildDraftService(nextTaskId)
  Object.assign(draft, patch)
  if (!isTaskChanged && previousSelectedLine) draft.selectedLine = previousSelectedLine
  if (isTaskChanged && routeTask) {
    draft.selectedLine = null
    draft.remoteTaskLines = []
    draft.pickup = null
    draft.dropoff = null
    draft.routeDistanceKm = 0
    draft.routeDistanceSource = ''
    draft.routeDuration = ''
    draft.quoteId = ''
  } else if (isTaskChanged && serviceConfig.isRouteTask(previousTaskId)) {
    const defaults = defaultOrderAddresses()
    draft.pickup = defaults.pickup
    draft.dropoff = defaults.dropoff
    draft.routeDistanceKm = 0
    draft.routeDistanceSource = ''
    draft.routeDuration = ''
    draft.quoteId = ''
  }
  if (!routeTask || draft.selectedLine) ensureDefaultOrderAddresses(draft)
  if (isTaskChanged || !draft.item) {
    draft.item = serviceConfig.getDefaultItem(nextTaskId)
  }
  const handlingType = patch.taskId === 'moving_handling'
    ? serviceConfig.applyHandlingType(draft, draft.item)
    : null
  vehicleConfig.applyVehicleToDraft(draft, handlingType ? handlingType.vehicleId : patch.recommendedVehicleType)
  if (patch.taskId === 'carpool_ride') {
    draft.direction = draft.direction || 'OUTBOUND'
    draft.passengerCount = Number(draft.passengerCount || 1)
  }
  if (patch.taskId === 'moving_handling') {
    draft.requiresDelivery = false
    draft.dropoff = null
  }
  const remoteService = (app.globalData.remoteServices || []).find((item) => item.id === nextTaskId)
  if (remoteService) {
    if (remoteService.priceSummary) draft.priceSummary = remoteService.priceSummary
    if (remoteService.vehicleName) draft.recommendedVehicleName = remoteService.vehicleName
  }
  serviceConfig.applyRemoteConfigToDraft(draft, app.globalData.appConfig)
  return draft
}

function visibleTasks() {
  const remote = app.globalData.remoteServices || []
  if (!remote.length) return serviceConfig.ALL_TASKS
  const order = new Map(remote.map((item) => [item.id, item]))
  const preferredOrder = new Map(serviceConfig.ALL_TASKS.map((item, index) => [item.id, index]))
  return serviceConfig.ALL_TASKS
    .filter((task) => order.has(task.id))
    .sort((left, right) => {
      const leftOrder = Number(order.get(left.id).sortOrder)
      const rightOrder = Number(order.get(right.id).sortOrder)
      const leftRank = Number.isFinite(leftOrder) ? leftOrder : preferredOrder.get(left.id)
      const rightRank = Number.isFinite(rightOrder) ? rightOrder : preferredOrder.get(right.id)
      return leftRank - rightRank
    })
}

Page({
  data: {
    statusBarHeight: 24,
    city: '福鼎市',
    serviceCount: serviceConfig.ALL_TASKS.length,
    draft: {},
    allTasks: serviceConfig.ALL_TASKS,
    coreTasks: serviceConfig.ALL_TASKS.slice(0, 4),
    moreTasks: serviceConfig.ALL_TASKS.slice(4),
    activeTask: serviceConfig.PRIMARY_TASKS[0],
    isRouteTask: false,
    locationText: '定位附近'
  },

  onShow() {
    const draft = ensureDraftTask()
    const apply = () => {
      ensureDraftTask(draft.taskId)
      const tasks = visibleTasks()
      this.setData({
        statusBarHeight: app.globalData.statusBarHeight,
        city: app.globalData.city,
        draft,
        allTasks: tasks,
        serviceCount: tasks.length,
        coreTasks: tasks.slice(0, 4),
        moreTasks: tasks.slice(4),
        activeTask: serviceConfig.getTask(draft.taskId),
        isRouteTask: serviceConfig.isRouteTask(draft.taskId)
      })
    }
    if (this.configSyncTimer) clearInterval(this.configSyncTimer)
    if (app.globalData.useBackend && app.refreshAppConfig) {
      app.refreshAppConfig().then(apply)
      this.configSyncTimer = setInterval(() => app.refreshAppConfig().then(apply), 15000)
    } else apply()
  },

  onHide() {
    if (this.configSyncTimer) {
      clearInterval(this.configSyncTimer)
      this.configSyncTimer = null
    }
  },

  onUnload() {
    this.onHide()
  },

  chooseTask(event) {
    if (app.globalData.useBackend && !app.globalData.businessOpen) {
      wx.showToast({ title: app.globalData.appConfig && app.globalData.appConfig.operating && app.globalData.appConfig.operating.reason || '当前暂停接单', icon: 'none' })
      return
    }
    const taskId = event.currentTarget.dataset.task
    const draft = ensureDraftTask(taskId)
    this.setData({
      draft,
      activeTask: serviceConfig.getTask(draft.taskId),
      isRouteTask: serviceConfig.isRouteTask(draft.taskId)
    })
  },

  refreshLocation() {
    wx.showLoading({ title: '定位中' })
    map.getCurrentLocation().then((location) => {
      app.globalData.currentLocation = location
      return map.reverseGeocode(location)
    }).then((address) => {
      app.globalData.currentAddress = address
      if (address.city) app.globalData.city = address.city
      this.setData({
        city: app.globalData.city,
        locationText: address.name || '当前位置'
      })
      wx.hideLoading()
      wx.showToast({ title: '已定位附近地址', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '定位失败，请稍后重试', icon: 'none' })
    })
  },

  chooseAddress(event) {
    const type = event.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/address/address?type=${type}` })
  },

  openPricing() {
    wx.showToast({ title: this.data.draft.priceSummary || '按甲方规则计价', icon: 'none' })
  },

  goOrder() {
    if (app.globalData.useBackend && !app.globalData.businessOpen) {
      wx.showToast({ title: app.globalData.appConfig && app.globalData.appConfig.operating && app.globalData.appConfig.operating.reason || '当前暂停接单', icon: 'none' })
      return
    }
    const draft = app.globalData.draftOrder
    const routeTask = serviceConfig.isRouteTask(draft.taskId)
    if (!routeTask && !draft.pickup) {
      wx.showToast({ title: '请先选择服务地址', icon: 'none' })
      return
    }
    if (!routeTask && draft.taskId !== 'moving_handling' && !draft.dropoff) {
      wx.showToast({ title: '请先选择目的地', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/order-create/order-create' })
  }
})
