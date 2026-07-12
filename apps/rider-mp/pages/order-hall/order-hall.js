const app = getApp()
const api = require('../../utils/api')

Page({
  data: { rider: null, online: false, orders: [], loading: false, claimingId: '' },
  onShow() {
    this.setData({ rider: app.globalData.rider, online: Boolean(app.globalData.rider && app.globalData.rider.online) })
    if (app.globalData.authToken) this.refresh()
    this.startPolling()
  },
  onHide() { this.stopPolling() },
  onUnload() { this.stopPolling() },
  startPolling() {
    this.stopPolling()
    this.poller = setInterval(() => {
      if (this.data.online && app.globalData.authToken) this.loadOrders(false)
    }, 8000)
  },
  stopPolling() { if (this.poller) clearInterval(this.poller) },
  login() {
    wx.showLoading({ title: '登录中' })
    api.login().then((payload) => {
      app.setSession(payload)
      this.setData({ rider: payload.rider, online: Boolean(payload.rider.online) })
      return this.refresh()
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' })).finally(wx.hideLoading)
  },
  refresh() {
    return api.me().then((rider) => {
      app.globalData.rider = rider
      this.setData({ rider, online: rider.online })
      if (rider.online) return this.loadOrders(true)
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
  },
  toggleOnline() {
    const online = !this.data.online
    if (online) {
      wx.getLocation({
        type: 'gcj02',
        success: (location) => api.setOnline(true)
          .then(() => api.updateLocation(location.latitude, location.longitude))
          .then(() => { this.setData({ online: true }); this.loadOrders(true) })
          .catch((error) => wx.showToast({ title: error.message, icon: 'none' })),
        fail: () => wx.showToast({ title: '上线需要位置权限', icon: 'none' })
      })
      return
    }
    api.setOnline(false).then(() => this.setData({ online: false, orders: [] }))
  },
  loadOrders(showLoading) {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    if (showLoading) wx.showNavigationBarLoading()
    return api.availableOrders().then((orders) => this.setData({ orders }))
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
      .finally(() => { this.setData({ loading: false }); wx.hideNavigationBarLoading() })
  },
  claim(event) {
    const id = event.currentTarget.dataset.id
    if (this.data.claimingId) return
    this.setData({ claimingId: id })
    api.claim(id).then(() => {
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '抢单成功', icon: 'success' })
      this.setData({ orders: this.data.orders.filter((order) => order.id !== id) })
      setTimeout(() => wx.switchTab({ url: '/pages/tasks/tasks' }), 500)
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: 'none' })
      this.loadOrders(false)
    }).finally(() => this.setData({ claimingId: '' }))
  }
})
