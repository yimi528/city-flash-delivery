const app = getApp()
const api = require('../../utils/api')

const services = [
  { iconClass: 'address', name: '地址簿', action: 'address' },
  { iconClass: 'service', name: '联系客服', action: 'todo' },
  { iconClass: 'shield', name: '售后理赔', action: 'todo' },
  { iconClass: 'invoice', name: '发票管理', action: 'todo' },
  { iconClass: 'feedback', name: '意见反馈', action: 'todo' },
  { iconClass: 'invite', name: '填写邀请码', action: 'todo' },
  { iconClass: 'license', name: '平台资质', action: 'todo' },
  { iconClass: 'terms', name: '法律条款', action: 'todo' },
  { iconClass: 'bill', name: '我的账单', action: 'todo' },
  { iconClass: 'settings', name: '系统设置', action: 'todo' }
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
    stats: [
      { label: '账户余额', value: '0', badge: '' },
      { label: '优惠券', value: '6', badge: '' }
    ],
    services
  },

  onShow() {
    this.syncUserState()
    this.validateSession()
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
        { label: '账户余额', value: '0', badge: '' },
        { label: '优惠券', value: isLoggedIn ? '6' : '0', badge: '' }
      ]
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

  login() {
    const fallbackLogin = () => {
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
    }

    const doLogin = (code) => {
      if (!app.globalData.useBackend) {
        fallbackLogin()
        return
      }
      this.setData({ isLoggingIn: true })
      api.wechatLogin({ code, userInfo: { nickName: '微信用户' } }).then((result) => {
        app.setCurrentUser(result.user, result.token)
        this.syncUserState()
        wx.showToast({ title: '登录成功', icon: 'success' })
      }).catch((error) => {
        wx.showToast({ title: error.message || '微信登录失败', icon: 'none' })
      }).finally(() => {
        this.setData({ isLoggingIn: false })
      })
    }

    if (wx.login) {
      wx.login({
        success: (res) => doLogin(res.code || ''),
        fail: () => doLogin('')
      })
      return
    }
    doLogin('')
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

  openMember() {
    if (!this.data.isLoggedIn) {
      this.login()
      return
    }
    wx.showToast({ title: '会员权益开发中', icon: 'none' })
  },

  openCoupons() {
    wx.showToast({ title: '券包功能开发中', icon: 'none' })
  },

  openTool(event) {
    const action = event.currentTarget.dataset.action
    const name = event.currentTarget.dataset.name
    if (action === 'address') {
      wx.navigateTo({ url: '/pages/address/address?type=dropoff' })
      return
    }
    wx.showToast({ title: `${name}开发中`, icon: 'none' })
  }
})
