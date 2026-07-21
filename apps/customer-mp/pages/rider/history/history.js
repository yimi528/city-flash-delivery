const app = getApp()
const riderApi = require('../../../utils/rider-api')

const RIDER_PAGES = {
  hall: '/pages/rider/order-hall/order-hall',
  tasks: '/pages/rider/tasks/tasks',
  history: '/pages/rider/history/history',
  profile: '/pages/rider/profile/profile'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (item) => String(item).padStart(2, '0')
  return `${date.getMonth() + 1}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeHistory(history) {
  return (history || []).map((item) => {
    const status = String(item.status || '').toUpperCase()
    const totalFeeFen = Number(item.totalFeeFen || 0)
    return Object.assign({}, item, {
      serviceName: item.serviceName || '同城配送',
      orderNo: item.orderNo || '历史订单',
      statusText: status === 'CANCELLED' ? '已取消' : '已完成',
      statusClass: status === 'CANCELLED' ? 'cancelled' : 'completed',
      dateText: formatDate(item.updatedAt || item.createdAt),
      totalFeeText: (totalFeeFen / 100).toFixed(2),
      pickupName: item.pickupName || (item.pickup && item.pickup.name) || '取货地址',
      dropoffName: item.dropoffName || (item.dropoff && item.dropoff.name) || '仅上门服务'
    })
  })
}

function summarize(items) {
  return items.reduce((summary, item) => {
    summary.total += 1
    if (item.statusClass === 'completed') summary.completed += 1
    if (item.statusClass === 'cancelled') summary.cancelled += 1
    return summary
  }, { total: 0, completed: 0, cancelled: 0 })
}

Page({
  data: {
    historyItems: [],
    visibleHistory: [],
    summary: { total: 0, completed: 0, cancelled: 0 },
    filter: 'ALL',
    loading: false
  },

  onShow() {
    if (!app.globalData.riderAuthToken) {
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true })
    return riderApi.history().then((history) => {
      const items = normalizeHistory(history)
      this.setData({
        historyItems: items,
        visibleHistory: this.filterItems(items, this.data.filter),
        summary: summarize(items)
      })
    }).catch((error) => {
      this.setData({ historyItems: [], visibleHistory: [], summary: { total: 0, completed: 0, cancelled: 0 } })
      wx.showToast({ title: error.message || '历史订单读取失败', icon: 'none' })
    }).finally(() => this.setData({ loading: false }))
  },

  filterItems(items, filter) {
    if (filter === 'COMPLETED') return items.filter((item) => item.statusClass === 'completed')
    if (filter === 'CANCELLED') return items.filter((item) => item.statusClass === 'cancelled')
    return items
  },

  chooseFilter(event) {
    const filter = event.currentTarget.dataset.filter
    this.setData({ filter, visibleHistory: this.filterItems(this.data.historyItems, filter) })
  },

  openOrder(event) {
    const orderId = event.currentTarget.dataset.id
    if (!orderId) return

    // The history API is authenticated with the rider token while the shared
    // detail page reads its initial order from the app cache. Put the tapped
    // order there first so the detail view can render immediately even when
    // the customer-side detail endpoint is not available to a rider.
    const order = this.data.historyItems.find((item) => item.id === orderId)
    if (order) {
      const orders = Array.isArray(app.globalData.orders) ? app.globalData.orders : []
      const index = orders.findIndex((item) => item.id === orderId)
      if (index > -1) orders.splice(index, 1, order)
      else orders.unshift(order)
      app.globalData.orders = orders
    }

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${encodeURIComponent(orderId)}&mode=rider`
    })
  },

  goRiderPage(event) {
    const target = RIDER_PAGES[event.currentTarget.dataset.page]
    if (target && target !== RIDER_PAGES.history) wx.redirectTo({ url: target })
  }
})
