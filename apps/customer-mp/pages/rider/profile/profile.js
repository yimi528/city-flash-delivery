const app = getApp()
const customerApi = require('../../../utils/api')
const riderApi = require('../../../utils/rider-api')

const RIDER_PAGES = {
  hall: '/pages/rider/order-hall/order-hall',
  tasks: '/pages/rider/tasks/tasks',
  profile: '/pages/rider/profile/profile'
}

function statusLabel(status) {
  const labels = { APPROVED: '身份有效', PENDING: '等待审核', SUSPENDED: '权限暂停', REJECTED: '审核未通过' }
  return labels[String(status || '').toUpperCase()] || status || '状态未知'
}

function workStatusLabel(status, online) {
  if (online) return '在线接单'
  const labels = { OFFLINE: '当前下线', ONLINE: '在线接单', BUSY: '配送任务中' }
  return labels[String(status || '').toUpperCase()] || '当前下线'
}

function orderStatusLabel(status) {
  const labels = { COMPLETED: '已完成', CANCELLED: '已取消' }
  return labels[String(status || '').toUpperCase()] || status || '已归档'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (item) => String(item).padStart(2, '0')
  return `${date.getMonth() + 1}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeHistory(history) {
  return (history || []).map((item) => Object.assign({}, item, {
    statusText: orderStatusLabel(item.status),
    dateText: formatDate(item.updatedAt || item.createdAt)
  }))
}

const VEHICLE_OPTIONS = [
  { value: 'EBIKE', label: '二轮车' },
  { value: 'ETRIKE', label: '货三轮车' },
  { value: 'VAN', label: '小车' },
  { value: 'MANUAL', label: '人力服务' }
]

function selectedVehicleTypes(rider) {
  const values = (rider && rider.vehicles || []).filter((item) => item.enabled !== false && item.verified !== false).map((item) => item.vehicleType)
  if (values.length) return values
  return rider && rider.vehicleType ? [rider.vehicleType] : []
}

function vehicleOptionsFor(rider) {
  const selected = selectedVehicleTypes(rider)
  return VEHICLE_OPTIONS.map((item) => Object.assign({}, item, { selected: selected.includes(item.value) }))
}

function vehicleSummaryFor(rider) {
  const selected = selectedVehicleTypes(rider)
  return VEHICLE_OPTIONS.filter((item) => selected.includes(item.value)).map((item) => item.label).join('、')
}

Page({
  data: {
    rider: null,
    statusText: '',
    workStatusText: '',
    income: { completedOrders: 0, grossAmountFen: 0 },
    historyItems: [],
    switchingRole: false,
    vehicleOptions: VEHICLE_OPTIONS,
    vehicleSummary: '',
    savingVehicles: false
  },

  onShow() {
    if (!app.globalData.riderAuthToken) {
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    const rider = app.globalData.rider
    this.setData({
      rider,
      statusText: statusLabel(rider && rider.status),
      workStatusText: workStatusLabel(rider && rider.workStatus, rider && rider.online),
      vehicleOptions: vehicleOptionsFor(rider),
      vehicleSummary: vehicleSummaryFor(rider)
    })
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    return Promise.all([riderApi.me(), riderApi.income(), riderApi.history()]).then(([rider, income, history]) => {
      app.updateRider(rider)
      this.setData({
        rider,
        statusText: statusLabel(rider.status),
        workStatusText: workStatusLabel(rider.workStatus, rider.online),
        vehicleOptions: vehicleOptionsFor(rider),
        vehicleSummary: vehicleSummaryFor(rider),
        income,
        historyItems: normalizeHistory(history)
      })
    }).catch((error) => wx.showToast({ title: error.message || '骑手资料读取失败', icon: 'none' }))
  },

  toggleVehicle(event) {
    const type = event.currentTarget.dataset.type
    const selected = this.data.vehicleOptions.filter((item) => item.selected).map((item) => item.value)
    const next = selected.includes(type) ? selected.filter((item) => item !== type) : selected.concat(type)
    this.setData({ vehicleOptions: this.data.vehicleOptions.map((item) => Object.assign({}, item, { selected: next.includes(item.value) })) })
  },

  saveVehicles() {
    if (this.data.savingVehicles) return
    const vehicleTypes = this.data.vehicleOptions.filter((item) => item.selected).map((item) => item.value)
    this.setData({ savingVehicles: true })
    riderApi.updateVehicles(vehicleTypes).then((rider) => {
      app.updateRider(rider)
      this.setData({
        rider,
        vehicleOptions: vehicleOptionsFor(rider),
        vehicleSummary: vehicleSummaryFor(rider)
      })
      wx.showToast({ title: vehicleTypes.length ? '车型已更新' : '已清空车型，暂不可接单', icon: 'success' })
    }).catch((error) => wx.showToast({ title: error.message || '车型更新失败', icon: 'none' }))
      .finally(() => this.setData({ savingVehicles: false }))
  },

  switchToCustomer() {
    if (this.data.switchingRole) return
    this.setData({ switchingRole: true })
    wx.showLoading({ title: '正在切换' })
    const rider = this.data.rider
    const stopOnline = rider && rider.online ? riderApi.setOnline(false).catch(() => null) : Promise.resolve()
    stopOnline.then(() => customerApi.switchAccountRole('customer')).then((session) => {
      app.setCustomerRoleSession(session)
      wx.switchTab({ url: '/pages/profile/profile' })
    }).catch((error) => {
      app.clearRiderSession()
      wx.switchTab({ url: '/pages/profile/profile' })
      wx.showToast({ title: error.message || '已返回用户端', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
      this.setData({ switchingRole: false })
    })
  },

  goRiderPage(event) {
    const target = RIDER_PAGES[event.currentTarget.dataset.page]
    if (target && target !== RIDER_PAGES.profile) wx.redirectTo({ url: target })
  }
})
