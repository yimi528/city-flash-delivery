const app = getApp()
const api = require('../../../utils/rider-api')

const RIDER_PAGES = {
  hall: '/pages/rider/order-hall/order-hall',
  tasks: '/pages/rider/tasks/tasks',
  profile: '/pages/rider/profile/profile'
}

Page({
  data: { rider: null, online: false, orders: [], loading: false, claimingId: '' },

  onShow() {
    if (!app.globalData.riderAuthToken) {
      this.returnToUser('骑手会话已失效，请重新进入')
      return
    }
    const rider = app.globalData.rider
    this.setData({ rider, online: Boolean(rider && rider.online) })
    this.refresh()
    this.startPolling()
  },

  onHide() { this.stopPolling() },
  onUnload() { this.stopPolling() },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  startPolling() {
    this.stopPolling()
    this.poller = setInterval(() => {
      if (this.data.online && app.globalData.riderAuthToken) this.loadOrders(false)
    }, 8000)
  },

  stopPolling() {
    if (!this.poller) return
    clearInterval(this.poller)
    this.poller = null
  },

  refresh() {
    return api.me().then((rider) => {
      app.updateRider(rider)
      const roleStatus = String(rider.roleStatus || '').toUpperCase()
      if (roleStatus && roleStatus !== 'ACTIVE') {
        this.setData({ rider, online: false, orders: [] })
        wx.showModal({
          title: '骑手身份当前不可用',
          content: roleStatus === 'SUSPENDED' ? '骑手权限已被暂停，用户端仍可正常使用。' : '请联系商家确认当前骑手状态。',
          showCancel: false,
          success: () => this.returnToUser()
        })
        return
      }
      this.setData({ rider, online: Boolean(rider.online) })
      if (rider.online) {
        app.startRiderPresence()
        return this.loadOrders(true)
      }
      return null
    }).catch((error) => {
      wx.showToast({ title: error.message || '骑手资料读取失败', icon: 'none' })
      if (!app.globalData.riderAuthToken) this.returnToUser()
    })
  },

  toggleOnline() {
    const online = !this.data.online
    if (online) {
      wx.getLocation({
        type: 'gcj02',
        success: (location) => api.setOnline(true)
          .then(() => api.updateLocation(location.latitude, location.longitude))
          .then((rider) => {
            app.updateRider(rider)
            this.setData({ rider, online: true })
            app.startRiderPresence()
            this.loadOrders(true)
          })
          .catch((error) => wx.showToast({ title: error.message, icon: 'none' })),
        fail: () => wx.showToast({ title: '上线需要位置权限', icon: 'none' })
      })
      return
    }
    api.setOnline(false).then((rider) => {
      app.stopRiderPresence()
      app.updateRider(rider)
      this.setData({ rider, online: false, orders: [] })
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
  },

  loadOrders(showLoading) {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    if (showLoading) wx.showNavigationBarLoading()
    return api.availableOrders().then((orders) => this.setData({ orders }))
      .catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
      .finally(() => {
        this.setData({ loading: false })
        wx.hideNavigationBarLoading()
      })
  },

  claim(event) {
    const id = event.currentTarget.dataset.id
    if (this.data.claimingId) return
    this.setData({ claimingId: id })
    api.claim(id).then(() => {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '抢单成功', icon: 'success' })
      this.setData({ orders: this.data.orders.filter((order) => order.id !== id) })
      setTimeout(() => wx.redirectTo({ url: RIDER_PAGES.tasks }), 500)
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: 'none' })
      this.loadOrders(false)
    }).finally(() => this.setData({ claimingId: '' }))
  },

  goRiderPage(event) {
    const target = RIDER_PAGES[event.currentTarget.dataset.page]
    if (target && target !== RIDER_PAGES.hall) wx.redirectTo({ url: target })
  },

  returnToUser(message) {
    app.clearRiderSession()
    if (message) wx.showToast({ title: message, icon: 'none' })
    setTimeout(() => wx.switchTab({ url: '/pages/profile/profile' }), message ? 500 : 0)
  }
})
