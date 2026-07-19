const app = getApp()
const api = require('../../utils/api')

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'MERCHANT', label: '待商家接单' },
  { key: 'RIDER', label: '待骑手接单' },
  { key: 'QUOTE', label: '报价中' },
  { key: 'PAYMENT', label: '待支付' },
  { key: 'ACTIVE', label: '进行中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' }
]

function filterKey(value) {
  const text = String(value || '')
  if (!text || text === '全部') return 'ALL'
  if (text === '待接单' || text === '待商家接单') return 'MERCHANT'
  if (text === '待骑手接单') return 'RIDER'
  if (text === '待商家报价' || text === '待确认报价' || text === '报价中') return 'QUOTE'
  if (text === '待支付') return 'PAYMENT'
  if (text === '已完成') return 'COMPLETED'
  if (text === '已取消') return 'CANCELLED'
  if (text === '已接单' || text === '进行中') return 'ACTIVE'
  return text
}

function matchesFilter(order, key) {
  const displayStatus = order.displayStatus
  if (key === 'ALL') return true
  if (key === 'MERCHANT') return displayStatus === '待商家接单'
  if (key === 'RIDER') return displayStatus === '待骑手接单'
  if (key === 'QUOTE') return displayStatus === '待商家报价' || displayStatus === '待确认报价'
  if (key === 'PAYMENT') return displayStatus === '待支付'
  if (key === 'COMPLETED') return displayStatus === '已完成'
  if (key === 'CANCELLED') return displayStatus === '已取消'
  if (key === 'ACTIVE') return ['取货中', '前往取货', '上门途中', '前往上车点', '已到达取货点', '已到达上车点', '已到达服务地点', '配送中', '搬运中', '行程中'].includes(displayStatus)
  return false
}

function statusMeta(order) {
  const status = order.displayStatus
  const map = {
    '待商家接单': { hint: '订单已支付，等待商家确认接单', tone: 'pending' },
    '待骑手接单': { hint: '商家已接单，正在匹配骑手', tone: 'active' },
    '待商家报价': { hint: '商家正在核算服务费用', tone: 'quote' },
    '待确认报价': { hint: '请确认报价后继续下单', tone: 'action' },
    '待支付': { hint: '支付后将立即安排服务', tone: 'action' },
    '已完成': { hint: '服务已完成', tone: 'done' },
    '已取消': { hint: '订单已取消', tone: 'muted' }
  }
  if (map[status]) return map[status]
  return { hint: order.eta || '服务进行中', tone: 'active' }
}

Page({
  data: {
    statusBarHeight: 24,
    orders: [],
    filter: 'ALL',
    filters: FILTERS
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
    if (app.globalData.orderFilter) {
      this.setData({ filter: filterKey(app.globalData.orderFilter) })
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
    const filter = filterKey(this.data.filter)
    const allOrders = (sourceOrders || app.globalData.orders).map(api.normalizeOrder)
    const filters = FILTERS.map((item) => Object.assign({}, item, {
      count: item.key === 'ALL' ? allOrders.length : allOrders.filter((order) => matchesFilter(order, item.key)).length
    }))
    const orders = allOrders.filter((item) => matchesFilter(item, filter)).map((item) => {
      const meta = statusMeta(item)
      return Object.assign({}, item, meta, {
        feeText: item.feeText || (item.needsQuote ? '待报价' : `¥${item.fee}`),
        orderNoText: item.orderNo ? `订单 ${item.orderNo}` : `下单于 ${item.createTime}`,
        routeLabel: item.dropoffName ? `${item.pickupName} → ${item.dropoffName}` : item.pickupName,
        summaryText: [item.item, item.vehicleName, item.distance ? `${item.distance}km` : ''].filter(Boolean).join(' · ')
      })
    })
    this.setData({ orders, filters, filter })
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
