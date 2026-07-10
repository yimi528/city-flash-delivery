const app = getApp()
const vehicleConfig = require('../../utils/vehicle-config')

function formatLine(draft) {
  if (!draft) return '按当前任务推荐车型'
  if (draft.selectedLine && draft.selectedLine.name) return `${draft.taskName || draft.service} · ${draft.selectedLine.name} ￥${draft.selectedLine.price}`
  return `${draft.taskName || draft.service || '当前任务'} · ${draft.priceSummary || '按规则计价'}`
}

Page({
  data: {
    statusBarHeight: 24,
    vehicles: vehicleConfig.VEHICLES,
    selectedVehicle: 'small_car',
    selectedVehicleName: '小车',
    taskName: '寄货',
    routeText: '按当前任务推荐车型',
    from: ''
  },

  onLoad(query) {
    const draft = app.globalData.draftOrder || {}
    const selectedVehicle = vehicleConfig.recommendVehicleId(draft)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      from: query.from || '',
      selectedVehicle,
      selectedVehicleName: vehicleConfig.findVehicle(selectedVehicle).name,
      taskName: draft.taskName || draft.service || '寄货',
      routeText: formatLine(draft)
    })
  },

  selectVehicle(event) {
    const selectedVehicle = event.currentTarget.dataset.id
    this.setData({
      selectedVehicle,
      selectedVehicleName: vehicleConfig.findVehicle(selectedVehicle).name
    })
  },

  confirm() {
    const draft = app.globalData.draftOrder
    const vehicle = vehicleConfig.applyVehicleToDraft(draft, this.data.selectedVehicle)
    wx.showToast({ title: `已选择${vehicle.name}`, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 260)
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goBack() {
    wx.navigateBack()
  }
})
