const app = getApp()
const serviceConfig = require('../../utils/service-config')
const serviceAvailability = require('../../utils/service-availability')
const vehicleConfig = require('../../utils/vehicle-config')
const navigation = require('../../utils/navigation')

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
  const requestedTaskId = taskId || draft.taskId
  // 审核口径：被关闭的服务不进入草稿，避免首页默认选中或深链绕过入口。
  // 只有隐式选择（未显式指定服务）时才额外要求服务出现在首页当前可见清单里，
  // 显式选择仍按调用方要求切换，避免旧草稿或远端缺项把用户锁死在默认服务。
  const enabled = Boolean(requestedTaskId) && serviceAvailability.isTaskEnabled(requestedTaskId, app)
  const visibleIds = taskId ? null : visibleTasks().map((item) => item.id)
  const visible = !visibleIds || !visibleIds.length || visibleIds.indexOf(requestedTaskId) !== -1
  const nextTaskId = enabled && visible
    ? requestedTaskId
    : defaultTaskId()
  const routeTask = serviceConfig.isRouteTask(nextTaskId)
  const isTaskChanged = draft.taskId !== nextTaskId
  const previousTaskId = draft.taskId
  const previousSelectedLine = draft.selectedLine
  const patch = serviceConfig.buildDraftService(nextTaskId)
  Object.assign(draft, patch)
  if (!isTaskChanged && previousSelectedLine) draft.selectedLine = previousSelectedLine
  if (isTaskChanged && routeTask) {
    draft.selectedLine = null
    draft.selectedDistrict = ''
    draft.remoteTaskLines = []
    draft.pickup = null
    draft.dropoff = null
    draft.routeDistanceKm = 0
    draft.routeDistanceSource = ''
    draft.routeDuration = ''
    draft.quoteId = ''
    draft.direction = 'OUTBOUND'
  } else if (isTaskChanged && serviceConfig.isRouteTask(previousTaskId)) {
    const defaults = defaultOrderAddresses()
    draft.pickup = defaults.pickup
    draft.dropoff = defaults.dropoff
    draft.routeDistanceKm = 0
    draft.routeDistanceSource = ''
    draft.routeDuration = ''
    draft.quoteId = ''
  }
  if (isTaskChanged && nextTaskId !== 'buy_for_me') {
    draft.budget = 0
    draft.buyItems = ''
    draft.purchaseAddress = null
    draft.buyCategoryId = ''
    draft.buyCategoryName = ''
  }
  if (!routeTask || draft.selectedLine) ensureDefaultOrderAddresses(draft)
  if (isTaskChanged || !draft.item) {
    draft.item = serviceConfig.getDefaultItem(nextTaskId)
  }
  const handlingType = patch.taskId === 'moving_handling'
    ? serviceConfig.applyHandlingType(draft, draft.item)
    : null
  vehicleConfig.applyVehicleToDraft(draft, handlingType ? handlingType.vehicleId : patch.recommendedVehicleType)
  if (patch.taskId === 'send_parcel') draft.direction = isTaskChanged ? 'OUTBOUND' : (draft.direction || 'OUTBOUND')
  if (patch.taskId === 'send_parcel') draft.serviceMode = isTaskChanged ? 'PARCEL' : (draft.serviceMode || 'PARCEL')
  if (patch.taskId === 'moving_handling') {
    draft.requiresDelivery = false
    draft.dropoff = null
  }
  const remoteService = (app.globalData.remoteServices || []).find((item) => item.id === nextTaskId)
  if (remoteService) {
    if (remoteService.priceSummary) draft.priceSummary = serviceConfig.sanitizeServiceText(remoteService.priceSummary)
    if (remoteService.vehicleName) draft.recommendedVehicleName = serviceConfig.sanitizeServiceText(remoteService.vehicleName)
  }
  serviceConfig.applyRemoteConfigToDraft(draft, app.globalData.appConfig)
  return draft
}

function visibleTasks() {
  // 审核口径：被关闭的服务（如寄货配送）不进入首页服务列表。
  const enabled = serviceAvailability.filterEnabledTasks(serviceConfig.ALL_TASKS, app)
  const remote = app.globalData.remoteServices || []
  if (!remote.length) return enabled
  const order = new Map(remote.map((item) => [item.id, item]))
  const preferredOrder = new Map(enabled.map((item, index) => [item.id, index]))
  return enabled
    .filter((task) => order.has(task.id))
    .sort((left, right) => {
      const leftOrder = Number(order.get(left.id).sortOrder)
      const rightOrder = Number(order.get(right.id).sortOrder)
      const leftRank = Number.isFinite(leftOrder) ? leftOrder : preferredOrder.get(left.id)
      const rightRank = Number.isFinite(rightOrder) ? rightOrder : preferredOrder.get(right.id)
      return leftRank - rightRank
    })
}

const initialTasks = serviceAvailability.filterEnabledTasks(serviceConfig.ALL_TASKS, app)
const initialTask = initialTasks[0] || serviceConfig.PRIMARY_TASKS[0]

// 默认选中首页当前可见服务中的第一项：既能落在远端排序结果上，
// 也不会因为某个服务被 mock 关闭而选中不可用服务。
function defaultTaskId() {
  const tasks = visibleTasks()
  if (tasks.length) return tasks[0].id
  return serviceAvailability.firstEnabledTaskId(serviceConfig.ALL_TASKS, app) || 'cargo_haul'
}

Page({
  data: {
    statusBarHeight: 24,
    city: '福鼎市',
    serviceCount: initialTasks.length,
    draft: {},
    allTasks: initialTasks,
    coreTasks: initialTasks.slice(0, 3),
    moreTasks: initialTasks.slice(3),
    activeTask: initialTask,
    selectedTaskId: initialTask.id,
    isRouteTask: false,
    isOpeningOrder: false,
    isTaskTransitioning: false
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
        coreTasks: tasks.slice(0, 3),
        moreTasks: tasks.slice(3),
        activeTask: serviceConfig.getTask(draft.taskId),
        selectedTaskId: draft.taskId,
        isRouteTask: serviceConfig.isRouteTask(draft.taskId),
        isOpeningOrder: false
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
    if (!serviceAvailability.isTaskEnabled(taskId, app)) {
      // 审核口径：被关闭的服务不响应选择，避免通过旧草稿或分享链接重新进入。
      wx.showToast({ title: '该服务升级中，敬请期待', icon: 'none' })
      return
    }
    const nextTask = serviceConfig.getTask(taskId)
    this.setData({
      selectedTaskId: taskId,
      activeTask: nextTask,
      isRouteTask: serviceConfig.isRouteTask(taskId),
      isTaskTransitioning: true
    }, () => {
      const loadTask = () => {
        const draft = ensureDraftTask(taskId)
        this.setData({
          draft,
          activeTask: nextTask,
          isRouteTask: serviceConfig.isRouteTask(draft.taskId),
          isTaskTransitioning: false
        })
      }
      if (typeof wx.nextTick === 'function') wx.nextTick(loadTask)
      else setTimeout(loadTask, 0)
    })
  },

  openAddressSelector() {
    navigation.navigateTo(wx, { url: '/pages/address/address?type=pickup' })
  },

  chooseAddress(event) {
    const type = event.currentTarget.dataset.type
    navigation.navigateTo(wx, { url: `/pages/address/address?type=${type}` })
  },

  openPricing() {
    wx.showToast({ title: this.data.draft.priceSummary || '按甲方规则计价', icon: 'none' })
  },

  goOrder() {
    if (this.data.isOpeningOrder) return
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
    this.setData({ isOpeningOrder: true }, () => {
      navigation.navigateTo(wx, {
        url: '/pages/order-create/order-create',
        fail: () => this.setData({ isOpeningOrder: false })
      })
    })
  }
})
