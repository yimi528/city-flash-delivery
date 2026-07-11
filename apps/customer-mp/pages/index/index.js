const app = getApp()
const map = require('../../utils/map')
const serviceConfig = require('../../utils/service-config')
const vehicleConfig = require('../../utils/vehicle-config')

function ensureDraftTask(taskId) {
  const draft = app.globalData.draftOrder
  const nextTaskId = taskId || draft.taskId || 'send_parcel'
  const isTaskChanged = draft.taskId !== nextTaskId
  const patch = serviceConfig.buildDraftService(nextTaskId)
  Object.assign(draft, patch)
  if (isTaskChanged || !draft.item) {
    draft.item = serviceConfig.getDefaultItem(nextTaskId)
  }
  const handlingType = patch.taskId === 'moving_handling'
    ? serviceConfig.applyHandlingType(draft, draft.item)
    : null
  vehicleConfig.applyVehicleToDraft(draft, handlingType ? handlingType.vehicleId : patch.recommendedVehicleType)
  return draft
}

Page({
  data: {
    statusBarHeight: 24,
    city: '宁德市',
    draft: {},
    allTasks: serviceConfig.ALL_TASKS,
    activeTask: serviceConfig.PRIMARY_TASKS[0],
    locationText: '定位附近'
  },

  onShow() {
    const draft = ensureDraftTask()
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      city: app.globalData.city,
      draft,
      activeTask: serviceConfig.getTask(draft.taskId)
    })
  },

  chooseTask(event) {
    const taskId = event.currentTarget.dataset.task
    const draft = ensureDraftTask(taskId)
    this.setData({
      draft,
      activeTask: serviceConfig.getTask(draft.taskId)
    })
  },

  openCity() {
    wx.showToast({ title: '城市切换开发中', icon: 'none' })
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
    if (!app.globalData.draftOrder.dropoff) {
      wx.showToast({ title: '请先选择目的地', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/order-create/order-create' })
  }
})
