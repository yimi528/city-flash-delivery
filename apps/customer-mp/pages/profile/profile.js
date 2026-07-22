const app = getApp()
const api = require('../../utils/api')

const services = [
  { iconClass: 'bill', name: '我的订单', action: 'orders' },
  { iconClass: 'address', name: '地址簿', action: 'address' },
  { iconClass: 'service', name: '联系客服', action: 'service' },
  { iconClass: 'license', name: '平台资质', action: 'qualification' },
  { iconClass: 'terms', name: '法律条款', action: 'legal' }
]

function maskPhone(phone) {
  const value = String(phone || '')
  if (!value) return ''
  if (value.indexOf('****') !== -1) return value
  if (/^\d{11}$/.test(value)) return `${value.slice(0, 3)}****${value.slice(7)}`
  return value
}

Page({
  data: {
    statusBarHeight: 24,
    isLoggedIn: false,
    isLoggingIn: false,
    currentUser: {},
    displayName: '微信授权登录',
    accountCaption: '登录后管理订单与支付',
    memberLevel: '登录领取权益',
    riderState: null,
    stats: [
      { label: '我的订单', value: '0', action: 'orders' },
      { label: '常用地址', value: '0', action: 'address' }
    ],
    services
  },

  onShow() {
    this.syncUserState()
    this.validateSession()
    this.loadStats()
    if (app.globalData.isLoggedIn && app.globalData.useBackend) this.loadRiderState()
  },

  syncUserState() {
    const currentUser = app.globalData.currentUser || {}
    const isLoggedIn = app.globalData.isLoggedIn
    const displayPhone = maskPhone(currentUser.phone)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      isLoggedIn,
      currentUser,
      displayName: isLoggedIn ? (displayPhone || currentUser.nickname || '微信用户') : '微信授权登录',
      accountCaption: isLoggedIn
        ? (displayPhone ? (currentUser.nickname || '微信账号已登录') : '微信账号已登录')
        : '登录后管理订单、地址与支付',
      memberLevel: isLoggedIn ? (currentUser.memberLevel || '普通会员') : '安全、快捷地使用同城服务',
      stats: [
        { label: '我的订单', value: isLoggedIn ? String((app.globalData.orders || []).length) : '0', action: 'orders' },
        { label: '常用地址', value: isLoggedIn ? String((app.globalData.addresses || []).length) : '0', action: 'address' }
      ]
    })
  },

  loadStats() {
    if (!app.globalData.isLoggedIn) return
    const localOrders = app.globalData.orders || []
    const localAddresses = app.globalData.addresses || []
    const ordersRequest = app.globalData.useBackend ? api.getOrders(app.globalData.userId).catch(() => localOrders) : Promise.resolve(localOrders)
    const addressesRequest = app.globalData.useBackend ? api.getAddresses(app.globalData.userId).catch(() => localAddresses) : Promise.resolve(localAddresses)
    Promise.all([ordersRequest, addressesRequest]).then(([orders, addresses]) => {
      if (!app.globalData.isLoggedIn || !this.data.isLoggedIn) return
      app.globalData.orders = orders
      app.globalData.addresses = addresses
      this.setData({
        stats: [
          { label: '我的订单', value: String(orders.length), action: 'orders' },
          { label: '常用地址', value: String(addresses.length), action: 'address' }
        ]
      })
    })
  },

  validateSession() {
    if (!app.globalData.useBackend || !app.globalData.authToken) return
    api.getCurrentUser().then((user) => {
      if (!user || !user.id) throw new Error('用户不存在')
      app.setCurrentUser(user, app.globalData.authToken)
      this.syncUserState()
    }).catch(() => {
      app.clearCurrentUser()
      this.syncUserState()
      wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
    })
  },

  loadRiderState() {
    api.getAccountRoles().then((state) => {
      app.globalData.accountRoles = state.roles || app.globalData.accountRoles
      this.setData({ riderState: state })
    }).catch(() => {})
  },

  openRiderCenter() {
    if (!this.data.isLoggedIn) {
      this.login()
      return
    }
    const state = this.data.riderState || {}
    const rider = state.rider || {}
    const roleStatus = String(rider.roleStatus || '').toLowerCase()
    if (roleStatus === 'active') {
      wx.showModal({
        title: '切换到骑手模式',
        content: '将在当前小程序内进入骑手工作台，用户账号和历史订单都会保留。',
        confirmText: '继续',
        success: (result) => {
          if (!result.confirm) return
          api.switchAccountRole('rider').then((session) => {
            app.setRiderSession(session)
            wx.reLaunch({ url: '/pages/rider/order-hall/order-hall' })
          }).catch((error) => {
            wx.showToast({ title: (error && (error.message || error.errMsg)) || '骑手模式切换失败', icon: 'none' })
          })
        }
      })
      return
    }
    wx.navigateTo({ url: '/pages/rider-apply/rider-apply' })
  },

  login() {
    if (!app.globalData.useBackend) {
      const user = {
        id: 'demo-user',
        phone: '138****4581',
        nickname: '微信用户',
        avatarUrl: '',
        memberLevel: '青铜会员'
      }
      app.setCurrentUser(user, '')
      this.syncUserState()
      wx.showToast({ title: '已使用本地登录', icon: 'success' })
      return
    }
    this.setData({ isLoggingIn: true })
    app.ensureWechatLogin().then(() => {
        this.syncUserState()
        this.loadRiderState()
        wx.showToast({ title: '登录成功', icon: 'success' })
      }).catch((error) => {
        wx.showToast({ title: error.message || '微信登录失败', icon: 'none' })
      }).finally(() => {
        this.setData({ isLoggingIn: false })
      })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新进行微信授权，历史订单不会被删除。',
      confirmText: '确认退出',
      confirmColor: '#d93025',
      cancelText: '取消',
      success: (result) => {
        if (!result.confirm) return
        app.clearCurrentUser()
        this.syncUserState()
        wx.showToast({ title: '已安全退出', icon: 'none' })
      }
    })
  },

  openStat(event) {
    this.openAction(event.currentTarget.dataset.action)
  },

  openAction(action) {
    if (action === 'orders') {
      wx.switchTab({ url: '/pages/orders/orders' })
      return true
    }
    if (action === 'address') {
      wx.navigateTo({ url: '/pages/address/address?type=dropoff' })
      return true
    }
    return false
  },

  openTool(event) {
    const action = event.currentTarget.dataset.action
    if (this.openAction(action)) return
    if (action === 'service') {
      const phone = String(app.globalData.customerServicePhone || '').trim()
      if (phone) {
        wx.makePhoneCall({ phoneNumber: phone })
      } else {
        wx.showModal({ title: '暂时无法联系', content: '客服电话尚未配置，请稍后再试。', showCancel: false })
      }
      return
    }
    if (action === 'qualification') {
      wx.navigateTo({ url: '/pages/legal/legal?type=qualification' })
      return
    }
    if (action === 'legal') {
      wx.navigateTo({ url: '/pages/legal/legal?type=terms' })
      return
    }
  }
})
