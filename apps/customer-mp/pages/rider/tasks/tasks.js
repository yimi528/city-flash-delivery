const app = getApp()
const api = require('../../../utils/rider-api')

const RIDER_PAGES = {
  hall: '/pages/rider/order-hall/order-hall',
  tasks: '/pages/rider/tasks/tasks',
  profile: '/pages/rider/profile/profile'
}

function decorateTask(task) {
  const isPickingUp = task.status === 'PICKING_UP'
  const isArrived = Boolean(task.arrivedAt)
  const serviceName = String(task.serviceName || '')
  const isMoving = ['搬运', '装卸', '搬家', '搬店'].some((keyword) => serviceName.indexOf(keyword) !== -1)
  const isPassenger = ['拼车', '送客'].some((keyword) => serviceName.indexOf(keyword) !== -1)
  const pickupText = isMoving ? '上门途中' : (isPassenger ? '前往上车点' : '前往取货')
  const arrivedText = isMoving ? '已到达服务地点' : (isPassenger ? '已到达上车点' : '已到达取货点')
  const deliveryText = isMoving ? '搬运中' : (isPassenger ? '行程中' : '配送中')
  const startText = isMoving ? '开始搬运服务' : (isPassenger ? '开始行程' : '开始配送')
  const statusText = isPickingUp ? (isArrived ? arrivedText : pickupText) : deliveryText
  const statusHint = isPickingUp
    ? (isArrived ? '已到达履约地点，可开始服务' : `请${pickupText}`)
    : '请按订单要求完成配送或服务'
  return Object.assign({}, task, {
    statusText,
    statusHint,
    nextActionText: isPickingUp ? (isArrived ? startText : arrivedText) : '确认送达并完成',
    navigateLabel: isPickingUp ? (isPassenger ? '导航去上车点' : isMoving ? '导航去服务地点' : '导航去取货') : '导航去送达',
    navigateLat: isPickingUp ? task.pickupLat : (task.dropoffLat || task.pickupLat),
    navigateLng: isPickingUp ? task.pickupLng : (task.dropoffLng || task.pickupLng),
    contactPhone: isPickingUp ? task.pickupPhone : (task.dropoffPhone || task.pickupPhone)
  })
}

Page({
  data: { tasks: [], loading: false },

  onShow() {
    if (!app.globalData.riderAuthToken) {
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true })
    return api.currentTasks().then((tasks) => this.setData({ tasks: tasks.map(decorateTask) }))
      .catch((error) => {
        this.setData({ tasks: [] })
        wx.showToast({ title: error.message || '任务读取失败', icon: 'none' })
      })
      .finally(() => this.setData({ loading: false }))
  },

  advance(event) {
    const id = event.currentTarget.dataset.id
    const current = event.currentTarget.dataset.status
    const arrived = event.currentTarget.dataset.arrived
    const next = current === 'PICKING_UP' && !arrived ? 'ARRIVED' : current === 'PICKING_UP' ? 'DELIVERING' : 'COMPLETED'
    api.updateStatus(id, next).then(() => {
      wx.showToast({ title: next === 'COMPLETED' ? '任务已完成' : '状态已更新', icon: 'success' })
      this.load()
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
  },

  callUser(event) {
    const phoneNumber = event.currentTarget.dataset.phone
    if (!phoneNumber) return wx.showToast({ title: '订单暂无联系电话', icon: 'none' })
    wx.makePhoneCall({ phoneNumber })
  },

  reportException(event) {
    const id = event.currentTarget.dataset.id
    const reasons = ['无法联系用户', '地址或货物不符', '车辆故障', '其他异常']
    wx.showActionSheet({
      itemList: reasons,
      success: (result) => api.reportException(id, reasons[result.tapIndex])
        .then(() => wx.showToast({ title: '已上报', icon: 'success' }))
        .catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
    })
  },

  navigate(event) {
    const lat = Number(event.currentTarget.dataset.lat)
    const lng = Number(event.currentTarget.dataset.lng)
    if (!lat || !lng) return wx.showToast({ title: '订单缺少导航坐标', icon: 'none' })
    wx.openLocation({ latitude: lat, longitude: lng, scale: 16 })
  },

  goRiderPage(event) {
    const target = RIDER_PAGES[event.currentTarget.dataset.page]
    if (target && target !== RIDER_PAGES.tasks) wx.redirectTo({ url: target })
  }
})
