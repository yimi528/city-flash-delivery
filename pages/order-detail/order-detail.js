const app = getApp()

const statusFlow = ['待接单', '已接单', '配送中', '已完成']

Page({
  data: {
    statusBarHeight: 24,
    order: null,
    statusFlow,
    activeIndex: 0
  },

  onLoad(query) {
    this.orderId = query.id
  },

  onShow() {
    const order = app.globalData.orders.find((item) => item.id === this.orderId) || app.globalData.orders[0]
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      order,
      activeIndex: order ? order.statusIndex : 0
    })
  },

  nextStatus() {
    const order = this.data.order
    if (!order || order.status === '已完成' || order.status === '已取消') return

    const nextIndex = Math.min(order.statusIndex + 1, statusFlow.length - 1)
    order.statusIndex = nextIndex
    order.status = statusFlow[nextIndex]
    if (order.status === '已接单') {
      order.rider = '王师傅'
      order.eta = '约 16 分钟'
    }
    if (order.status === '配送中') {
      order.eta = '约 9 分钟'
    }
    if (order.status === '已完成') {
      order.eta = '已送达'
    }
    this.setData({ order, activeIndex: nextIndex })
  },

  cancelOrder() {
    const order = this.data.order
    if (!order || order.status === '已完成') return
    order.status = '已取消'
    order.statusIndex = 0
    order.eta = '已取消'
    this.setData({ order, activeIndex: 0 })
    wx.showToast({ title: '订单已取消', icon: 'none' })
  },

  callRider() {
    wx.showToast({ title: '演示版暂未接入电话', icon: 'none' })
  },

  goBack() {
    wx.navigateBack()
  }
})
