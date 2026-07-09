const app = getApp()
const api = require('../../utils/api')

const filters = ['全部', '待接单', '备货中', '待骑手取货', '已交付']
const products = [
  { id: 'p1', name: '招牌手打柠檬茶', price: 16, stock: 38, soldOut: false },
  { id: 'p2', name: '轻乳茉莉奶白', price: 18, stock: 24, soldOut: false },
  { id: 'p3', name: '冰美式', price: 12, stock: 31, soldOut: false },
  { id: 'p4', name: '鲜切水果杯', price: 22, stock: 0, soldOut: true }
]

function actionLabel(status, orderStatus) {
  if (status === '待接单') return '接单备货'
  if (status === '备货中') return '备货完成'
  if (status === '待骑手取货') return '交付骑手'
  if (status === '已交付' && orderStatus !== '已完成') return '确认完成'
  return ''
}

function nextMerchantStatus(status) {
  if (status === '待接单') return '备货中'
  if (status === '备货中') return '待骑手取货'
  if (status === '待骑手取货') return '已交付'
  return status
}

function normalizeOrder(order) {
  const merchantStatus = order.merchantStatus || (order.service === '帮买' ? '待接单' : '')
  const actionText = actionLabel(merchantStatus, order.status)
  return Object.assign({}, order, {
    merchantStatus,
    displayItems: order.buyItems || order.item || '待确认商品',
    sourceName: order.purchaseAddressName || order.pickupName || '门店',
    sourceDetail: order.purchaseAddressDetail || order.pickupDetail || '',
    actionText,
    canAdvance: Boolean(actionText)
  })
}

function demoOrder() {
  return normalizeOrder({
    id: 'M-DEMO-001',
    service: '帮买',
    status: '待接单',
    statusIndex: 0,
    merchantStatus: '待接单',
    buyItems: '帮我买两杯奶茶，一杯少糖一杯正常糖',
    budget: 50,
    serviceFee: 8.9,
    fee: 58.9,
    purchaseAddressName: '阿嬷手作宁德万达店',
    purchaseAddressDetail: '宁德万达广场 2 号门',
    dropoffName: '宁德万达广场写字楼 A 座',
    dropoffDetail: 'A 座 18 层前台',
    distance: 1.8,
    eta: '约 18 分钟',
    rider: '等待骑手接单',
    createTime: '示例订单',
    remark: '少冰，袋子扎紧'
  })
}

function calcStats(orders) {
  const realOrders = orders.filter((item) => item.id.indexOf('M-DEMO') !== 0)
  const baseOrders = realOrders.length ? realOrders : orders
  const pending = baseOrders.filter((item) => item.merchantStatus === '待接单').length
  const preparing = baseOrders.filter((item) => item.merchantStatus === '备货中').length
  const ready = baseOrders.filter((item) => item.merchantStatus === '待骑手取货').length
  const completed = baseOrders.filter((item) => item.merchantStatus === '已交付').length
  const revenue = baseOrders.reduce((sum, item) => sum + Number(item.budget || item.fee || 0), 0)
  return {
    pending,
    preparing,
    ready,
    completed,
    todayOrders: baseOrders.length,
    revenue: revenue.toFixed(1),
    avgPrepare: preparing || ready ? '8分钟' : '6分钟'
  }
}

Page({
  data: {
    statusBarHeight: 24,
    store: {},
    online: true,
    filters,
    activeFilter: '全部',
    orders: [],
    visibleOrders: [],
    stats: calcStats([]),
    products
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
    api.getMerchantDashboard(app.globalData.merchantId).then((dashboard) => {
      const orders = (dashboard.orders || []).map(normalizeOrder)
      this.setData({
        store: dashboard.store || app.globalData.merchantStore,
        online: (dashboard.store || {}).status !== '休息中',
        stats: dashboard.stats || calcStats(orders),
        orders: orders.length ? orders : [demoOrder()]
      }, () => this.applyFilter())
    }).catch(() => {
      this.applyLocalDashboard()
    })
  },

  applyLocalDashboard() {
    const localOrders = (app.globalData.orders || []).filter((item) => item.service === '帮买').map(normalizeOrder)
    const orders = localOrders.length ? localOrders : [demoOrder()]
    this.setData({
      store: app.globalData.merchantStore,
      online: app.globalData.merchantStore.status !== '休息中',
      stats: calcStats(orders),
      orders
    }, () => this.applyFilter())
  },

  applyFilter() {
    const active = this.data.activeFilter
    const visibleOrders = this.data.orders.filter((item) => active === '全部' || item.merchantStatus === active)
    this.setData({ visibleOrders })
  },

  changeFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.status }, () => this.applyFilter())
  },

  toggleOnline() {
    const online = !this.data.online
    const store = Object.assign({}, this.data.store, { status: online ? '营业中' : '休息中' })
    app.globalData.merchantStore = store
    this.setData({ online, store })
    wx.showToast({ title: online ? '已切换为营业中' : '已切换为休息中', icon: 'none' })
  },

  updateOrderInMemory(orderId, merchantStatus) {
    const orders = this.data.orders.map((item) => {
      if (item.id !== orderId) return item
      const updated = Object.assign({}, item, { merchantStatus })
      if (merchantStatus === '备货中') {
        updated.status = '已接单'
        updated.statusIndex = 1
        updated.rider = '等待骑手取货'
        updated.eta = '商家备货中'
      }
      if (merchantStatus === '待骑手取货') {
        updated.status = '已接单'
        updated.statusIndex = 1
        updated.rider = '等待骑手取货'
        updated.eta = '等待骑手取货'
      }
      if (merchantStatus === '已交付') {
        updated.status = '配送中'
        updated.statusIndex = 2
        updated.rider = '王师傅'
        updated.eta = '约 9 分钟'
      }
      return normalizeOrder(updated)
    })

    app.globalData.orders = (app.globalData.orders || []).map((item) => {
      if (item.id !== orderId) return item
      const updated = Object.assign({}, item, { merchantStatus })
      if (merchantStatus === '备货中') {
        updated.status = '已接单'
        updated.statusIndex = 1
        updated.rider = '等待骑手取货'
        updated.eta = '商家备货中'
      }
      if (merchantStatus === '待骑手取货') {
        updated.status = '已接单'
        updated.statusIndex = 1
        updated.rider = '等待骑手取货'
        updated.eta = '等待骑手取货'
      }
      if (merchantStatus === '已交付') {
        updated.status = '配送中'
        updated.statusIndex = 2
        updated.rider = '王师傅'
        updated.eta = '约 9 分钟'
      }
      return updated
    })

    this.setData({ orders, stats: calcStats(orders) }, () => this.applyFilter())
  },

  completeOrderInMemory(orderId) {
    const orders = this.data.orders.map((item) => {
      if (item.id !== orderId) return item
      return normalizeOrder(Object.assign({}, item, {
        status: '已完成',
        statusIndex: 3,
        merchantStatus: '已交付',
        rider: item.rider || '王师傅',
        eta: '已送达'
      }))
    })

    app.globalData.orders = (app.globalData.orders || []).map((item) => {
      if (item.id !== orderId) return item
      return Object.assign({}, item, {
        status: '已完成',
        statusIndex: 3,
        merchantStatus: '已交付',
        rider: item.rider || '王师傅',
        eta: '已送达'
      })
    })

    this.setData({ orders, stats: calcStats(orders) }, () => this.applyFilter())
  },

  advanceOrder(event) {
    const orderId = event.currentTarget.dataset.id
    const order = this.data.orders.find((item) => item.id === orderId)
    if (!order || !order.actionText) return

    if (order.merchantStatus === '已交付') {
      if (!app.globalData.useBackend || orderId.indexOf('M-DEMO') === 0) {
        this.completeOrderInMemory(orderId)
        wx.showToast({ title: '订单已完成', icon: 'success' })
        return
      }
      api.updateOrderStatus(orderId, { status: '已完成', note: '商家演示确认完成' }).then(() => {
        this.completeOrderInMemory(orderId)
        wx.showToast({ title: '订单已完成', icon: 'success' })
      }).catch(() => {
        this.completeOrderInMemory(orderId)
        wx.showToast({ title: '已本地完成', icon: 'none' })
      })
      return
    }

    const merchantStatus = nextMerchantStatus(order.merchantStatus)

    if (!app.globalData.useBackend || orderId.indexOf('M-DEMO') === 0) {
      this.updateOrderInMemory(orderId, merchantStatus)
      wx.showToast({ title: merchantStatus, icon: 'none' })
      return
    }

    api.updateMerchantOrderStatus(orderId, { status: merchantStatus }).then((remoteOrder) => {
      this.updateOrderInMemory(orderId, remoteOrder.merchantStatus || merchantStatus)
      wx.showToast({ title: merchantStatus, icon: 'none' })
    }).catch(() => {
      this.updateOrderInMemory(orderId, merchantStatus)
      wx.showToast({ title: '已本地更新', icon: 'none' })
    })
  },

  openOrder(event) {
    const id = event.currentTarget.dataset.id
    if (id.indexOf('M-DEMO') === 0) {
      wx.showToast({ title: '示例订单暂不可打开详情', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}&mode=merchant` })
  },

  callRider() {
    wx.showToast({ title: '演示版暂未接入电话', icon: 'none' })
  },

  printTicket() {
    wx.showToast({ title: '已模拟打印小票', icon: 'none' })
  },

  toggleSoldOut(event) {
    const id = event.currentTarget.dataset.id
    const products = this.data.products.map((item) => {
      if (item.id !== id) return item
      return Object.assign({}, item, { soldOut: !item.soldOut })
    })
    this.setData({ products })
  },

  goBack() {
    wx.navigateBack()
  }
})
