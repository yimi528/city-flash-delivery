const api = require('../../utils/api')

Page({
  data: { tasks: [], loading: false },
  onShow() { this.load() },
  load() {
    this.setData({ loading: true })
    api.currentTasks().then((tasks) => this.setData({ tasks })).catch(() => this.setData({ tasks: [] })).finally(() => this.setData({ loading: false }))
  },
  advance(event) {
    const id = event.currentTarget.dataset.id
    const current = event.currentTarget.dataset.status
    const arrived = event.currentTarget.dataset.arrived
    const next = current === 'PICKING_UP' && !arrived ? 'ARRIVED' : current === 'PICKING_UP' ? 'DELIVERING' : 'COMPLETED'
    api.updateStatus(id, next).then(() => { wx.showToast({ title: next === 'COMPLETED' ? '任务已完成' : '已开始服务', icon: 'success' }); this.load() })
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
  },
  callUser(event) {
    const phoneNumber = event.currentTarget.dataset.phone
    if (!phoneNumber) return wx.showToast({ title: '订单暂无联系电话', icon: 'none' })
    wx.makePhoneCall({ phoneNumber })
  },
  reportException(event) {
    const id = event.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['无法联系用户', '地址或货物不符', '车辆故障', '其他异常'],
      success: (result) => api.reportException(id, ['无法联系用户', '地址或货物不符', '车辆故障', '其他异常'][result.tapIndex])
        .then(() => wx.showToast({ title: '已上报', icon: 'success' }))
    })
  },
  navigate(event) {
    const lat = Number(event.currentTarget.dataset.lat)
    const lng = Number(event.currentTarget.dataset.lng)
    if (!lat || !lng) return wx.showToast({ title: '订单缺少导航坐标', icon: 'none' })
    wx.openLocation({ latitude: lat, longitude: lng, scale: 16 })
  }
})
