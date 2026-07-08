const app = getApp()

Page({
  data: {
    statusBarHeight: 24,
    city: '宁德市',
    draft: {},
    services: ['帮送', '帮取', '1对1急送', '帮买'],
    quickServices: [
      { icon: '🥤', name: '取送饮料' },
      { icon: '📄', name: '取送文件' },
      { icon: '⌛', name: '代排队' },
      { icon: '📷', name: '取送数码' },
      { icon: '✣', name: '更多服务' }
    ],
    nearbyRiders: 12
  },

  onShow() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      city: app.globalData.city,
      draft: app.globalData.draftOrder
    })
  },

  chooseService(event) {
    const service = event.currentTarget.dataset.service
    app.globalData.draftOrder.service = service
    this.setData({ 'draft.service': service })
  },

  openCity() {
    wx.showToast({ title: '城市切换开发中', icon: 'none' })
  },

  refreshLocation() {
    this.setData({ nearbyRiders: Math.floor(Math.random() * 8) + 9 })
    wx.showToast({ title: '已刷新附近骑手', icon: 'none' })
  },

  chooseAddress(event) {
    const type = event.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/address/address?type=${type}` })
  },

  useQuick(event) {
    const name = event.currentTarget.dataset.name
    app.globalData.draftOrder.item = name
    if (name.indexOf('取送') === 0) {
      app.globalData.draftOrder.service = '帮送'
    }
    this.setData({ draft: app.globalData.draftOrder })
    wx.showToast({ title: `已选择${name}`, icon: 'none' })
  },

  goOrder() {
    if (!app.globalData.draftOrder.dropoff) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/order-create/order-create' })
  }
})
