const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 24,
    orders: [],
    mode: '寄',
    filter: '全部',
    filters: ['全部', '待接单', '已接单', '取货中', '配送中', '已完成', '已取消']
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
    if (app.globalData.orderFilter) {
      this.setData({ filter: app.globalData.orderFilter })
      app.globalData.orderFilter = ''
    }
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
      if (filter === '全部') return true
      return item.status === filter
    })
    this.setData({ orders })
  },

  changeMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode })
  },

  changeFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter }, () => this.refresh())
  },

  openInvoice() {
    wx.showToast({ title: '发票功能开发中', icon: 'none' })
  },

  openOrder(event) {
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${event.currentTarget.dataset.id}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
