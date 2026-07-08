const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 24,
    orders: [],
    filter: '全部',
    filters: ['全部', '进行中', '已完成']
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
    if (!app.globalData.useBackend) {
      this.refresh()
      return
    }
    api.getOrders(app.globalData.userId).then((orders) => {
      app.globalData.orders = orders
      this.refresh(orders)
    }).catch(() => {
      this.refresh()
    })
  },

  refresh(sourceOrders) {
    const filter = this.data.filter
    const allOrders = sourceOrders || app.globalData.orders
    const orders = allOrders.filter((item) => {
      if (filter === '进行中') return item.status !== '已完成' && item.status !== '已取消'
      if (filter === '已完成') return item.status === '已完成'
      return true
    })
    this.setData({
      orders
    })
  },

  changeFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter }, () => this.refresh())
  },

  openOrder(event) {
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${event.currentTarget.dataset.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
