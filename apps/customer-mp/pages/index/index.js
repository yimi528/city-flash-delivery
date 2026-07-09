const app = getApp()
const map = require('../../utils/map')

Page({
  data: {
    statusBarHeight: 24,
    city: '宁德市',
    draft: {},
    services: ['帮送', '帮取', '送货', '帮买'],
    quickServices: [
      { icon: '饮', name: '取送饮料', type: 'drink' },
      { icon: '文', name: '取送文件', type: 'file' },
      { icon: '排', name: '代排队', type: 'queue' },
      { icon: '数', name: '取送数码', type: 'digital' },
      { icon: '全', name: '更多服务', type: 'more' }
    ],
    nearbyRiders: 12,
    locationText: '定位附近'
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
    if (service === '送货') {
      wx.navigateTo({ url: '/pages/cargo-options/cargo-options?from=index' })
      return
    }
    if (service === '帮买') {
      wx.navigateTo({ url: '/pages/city-buy/city-buy?from=index' })
    }
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
        locationText: address.name || '当前位置',
        nearbyRiders: Math.floor(Math.random() * 8) + 9
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

  useQuick(event) {
    const type = event.currentTarget.dataset.type || 'drink'
    const name = event.currentTarget.dataset.name || '取送饮料'
    app.globalData.draftOrder.quickServiceName = name
    this.setData({ draft: app.globalData.draftOrder })
    wx.navigateTo({ url: `/pages/quick-service/quick-service?type=${type}` })
  },

  openCargoOptions() {
    app.globalData.draftOrder.service = '送货'
    this.setData({ draft: app.globalData.draftOrder })
    wx.navigateTo({ url: '/pages/cargo-options/cargo-options?from=index' })
  },

  goOrder() {
    if (!app.globalData.draftOrder.dropoff) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/order-create/order-create' })
  }
})
