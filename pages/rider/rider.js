const app = getApp()
const api = require('../../utils/api')

const filters = ['全部', '可接单', '待取货', '配送中', '已完成']

function getPhase(order) {
  if (!order) return ''
  const hasRider = Boolean(order.riderId) || (order.rider && order.rider !== '等待骑手接单' && order.rider !== '等待骑手取货')
  if (order.service === '帮买' && order.merchantStatus === '待骑手取货' && !hasRider) return '可接单'
  if (order.status === '已完成') return '已完成'
  if (order.status === '配送中') return '配送中'
  if (order.status === '已接单') return '待取货'
  if (order.status === '待接单') return '可接单'
  return order.status || ''
}

function actionLabel(phase) {
  if (phase === '可接单') return '立即接单'
  if (phase === '待取货') return '确认取货'
  if (phase === '配送中') return '确认送达'
  return ''
}

function normalizeOrder(order) {
  const phase = getPhase(order)
  const actionText = actionLabel(phase)
  return Object.assign({}, order, {
    riderPhase: phase,
    riderActionText: actionText,
    canRiderAdvance: Boolean(actionText),
    displayItems: order.buyItems || order.item || '待确认物品',
    pickupTitle: order.purchaseAddressName || order.pickupName || '取货点',
    pickupSub: order.purchaseAddressDetail || order.pickupDetail || '',
    dropoffTitle: order.dropoffName || '收货点',
    dropoffSub: order.dropoffDetail || ''
  })
}

function isRiderVisible(order) {
  if (!order || order.status === '已取消') return false
  if (order.status === '已完成') return Boolean(order.rider && order.rider !== '等待骑手接单')
  if (order.service === '帮买') {
    return order.merchantStatus === '待骑手取货' || order.merchantStatus === '已交付' || Boolean(order.riderId)
  }
  return ['待接单', '已接单', '配送中'].indexOf(order.status) !== -1
}

function calcStats(orders) {
  return {
    available: orders.filter((item) => item.riderPhase === '可接单').length,
    pickup: orders.filter((item) => item.riderPhase === '待取货').length,
    delivering: orders.filter((item) => item.riderPhase === '配送中').length,
    completed: orders.filter((item) => item.riderPhase === '已完成').length,
    todayIncome: orders.filter((item) => item.riderPhase === '已完成').reduce((sum, item) => sum + Number(item.serviceFee || item.fee || 0), 0).toFixed(1)
  }
}

function demoOrders() {
  return [
    normalizeOrder({
      id: 'R-DEMO-001',
      status: '待接单',
      statusIndex: 0,
      service: '帮送',
      item: '文件/小件',
      pickupName: '恒生一品苑',
      pickupDetail: '东侨经济技术开发区福宁北路 6 号',
      dropoffName: '宁德万达广场',
      dropoffDetail: '天湖东路 1 号 2 号门',
      fee: 14.8,
      serviceFee: 14.8,
      distance: 2.4,
      eta: '约 18 分钟',
      rider: '等待骑手接单',
      createTime: '示例订单'
    })
  ]
}

Page({
  data: {
    statusBarHeight: 24,
    rider: {},
    online: true,
    filters,
    activeFilter: '全部',
    stats: calcStats([]),
    orders: [],
    visibleOrders: []
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
    this.loadDashboard()
  },

  loadDashboard() {
    if (!app.globalData.useBackend) {
      this.applyLocalDashboard()
      return
    }
    api.getRiderDashboard(app.globalData.riderId).then((dashboard) => {
      const orders = (dashboard.orders || []).map(normalizeOrder)
      this.setData({
        rider: dashboard.rider || app.globalData.riderProfile,
        online: (dashboard.rider || {}).status !== '休息中',
        orders: orders.length ? orders : demoOrders(),
        stats: dashboard.stats || calcStats(orders)
      }, () => this.applyFilter())
    }).catch(() => {
      this.applyLocalDashboard()
    })
  },

  applyLocalDashboard() {
    const source = (app.globalData.orders || []).filter(isRiderVisible).map(normalizeOrder)
    const orders = source.length ? source : demoOrders()
    this.setData({
      rider: app.globalData.riderProfile,
      online: app.globalData.riderProfile.status !== '休息中',
      orders,
      stats: calcStats(orders)
    }, () => this.applyFilter())
  },

  applyFilter() {
    const active = this.data.activeFilter
    const visibleOrders = this.data.orders.filter((item) => active === '全部' || item.riderPhase === active)
    this.setData({ visibleOrders })
  },

  changeFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.status }, () => this.applyFilter())
  },

  toggleOnline() {
    const online = !this.data.online
    const rider = Object.assign({}, this.data.rider, { status: online ? '接单中' : '休息中' })
    app.globalData.riderProfile = rider
    this.setData({ online, rider })
    wx.showToast({ title: online ? '已开始接单' : '已暂停接单', icon: 'none' })
  },

  updateOrderInMemory(orderId, action) {
    const riderName = (this.data.rider && this.data.rider.name) || '王师傅'
    const updateOne = (item) => {
      if (item.id !== orderId) return item
      const updated = Object.assign({}, item, { rider: riderName, riderId: app.globalData.riderId })
      if (action === 'accept') {
        updated.status = '已接单'
        updated.statusIndex = 1
        updated.eta = '约 16 分钟'
      }
      if (action === 'pickup') {
        updated.status = '配送中'
        updated.statusIndex = 2
        updated.eta = '约 9 分钟'
        if (updated.service === '帮买') updated.merchantStatus = '已交付'
      }
      if (action === 'complete') {
        updated.status = '已完成'
        updated.statusIndex = 3
        updated.eta = '已送达'
        if (updated.service === '帮买') updated.merchantStatus = '已交付'
      }
      return updated
    }

    app.globalData.orders = (app.globalData.orders || []).map(updateOne)
    const orders = this.data.orders.map((item) => normalizeOrder(updateOne(item)))
    this.setData({ orders, stats: calcStats(orders) }, () => this.applyFilter())
  },

  advanceOrder(event) {
    const orderId = event.currentTarget.dataset.id
    const order = this.data.orders.find((item) => item.id === orderId)
    if (!order || !order.riderActionText) return
    const action = order.riderPhase === '可接单' ? 'accept' : (order.riderPhase === '待取货' ? 'pickup' : 'complete')

    if (!app.globalData.useBackend || orderId.indexOf('R-DEMO') === 0) {
      this.updateOrderInMemory(orderId, action)
      wx.showToast({ title: order.riderActionText, icon: 'none' })
      return
    }

    const runLocal = () => {
      this.updateOrderInMemory(orderId, action)
      wx.showToast({ title: '已本地更新', icon: 'none' })
    }

    const payload = { riderId: app.globalData.riderId, action }
    const request = action === 'accept'
      ? api.acceptRiderOrder(orderId, payload)
      : api.updateRiderOrderStatus(orderId, payload)

    request.then((remoteOrder) => {
      this.mergeRemoteOrder(remoteOrder)
      wx.showToast({ title: order.riderActionText, icon: 'none' })
    }).catch(runLocal)
  },

  mergeRemoteOrder(remoteOrder) {
    const normalized = normalizeOrder(remoteOrder)
    const orders = this.data.orders.map((item) => item.id === normalized.id ? normalized : item)
    const index = app.globalData.orders.findIndex((item) => item.id === normalized.id)
    if (index > -1) {
      app.globalData.orders.splice(index, 1, remoteOrder)
    } else {
      app.globalData.orders.unshift(remoteOrder)
    }
    this.setData({ orders, stats: calcStats(orders) }, () => this.applyFilter())
  },

  openOrder(event) {
    const id = event.currentTarget.dataset.id
    if (id.indexOf('R-DEMO') === 0) {
      wx.showToast({ title: '示例订单暂不可打开详情', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
  },

  goBack() {
    wx.navigateBack()
  }
})
