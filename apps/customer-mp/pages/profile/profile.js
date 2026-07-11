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
  if (!value) return '点击登录'
  if (value.indexOf('****') !== -1) return value
  if (/^\d{11}$/.test(value)) return `${value.slice(0, 3)}****${value.slice(7)}`
  return value
}

Page({
  data: {
    statusBarHeight: 24,
    isLoggedIn: false,
    currentUser: {},
    displayPhone: '点击登录',
    memberLevel: '登录领取权益',
    stats: [
      { label: '账户余额', value: '0', badge: '' },
      { label: '优惠券', value: '6', badge: '' }
    ],
    services
  },

  onShow() {
    this.syncUserState()
  },

  syncUserState() {
    const currentUser = app.globalData.currentUser || {}
    const isLoggedIn = app.globalData.isLoggedIn
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      isLoggedIn,
      currentUser,
      displayPhone: isLoggedIn ? maskPhone(currentUser.phone) : '点击登录',
      memberLevel: isLoggedIn ? (currentUser.memberLevel || '青铜会员') : '登录后享受多项权益'
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
      app.setCurrentUser(user, 'mock-token:customer:demo-user')
      this.syncUserState()
      wx.showToast({ title: '已使用本地登录', icon: 'success' })
    }

    const doLogin = (code) => {
      if (!app.globalData.useBackend) {
        fallbackLogin()
        return
      }
      api.wechatLogin({ code, userInfo: { nickName: '微信用户' } }).then((result) => {
        app.setCurrentUser(result.user, result.token)
        this.syncUserState()
        wx.showToast({ title: '登录成功', icon: 'success' })
      }).catch(() => fallbackLogin())
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
