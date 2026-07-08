const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 24,
    isLoggedIn: false,
    currentUser: {},
    stats: [
      { label: '优惠券', value: '6' },
      { label: '已省', value: '36' },
      { label: '积分', value: '1280' }
    ],
    tools: [
      { icon: '📍', name: '地址簿', action: 'address' },
      { icon: '🎟️', name: '优惠券', action: 'todo' },
      { icon: '🧾', name: '发票抬头', action: 'todo' },
      { icon: '🎧', name: '客服中心', action: 'todo' },
      { icon: '🛵', name: '骑手招募', action: 'todo' },
      { icon: '⚙️', name: '设置', action: 'todo' }
    ]
  },

  onShow() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      isLoggedIn: app.globalData.isLoggedIn,
      currentUser: app.globalData.currentUser
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
      app.setCurrentUser(user)
      this.setData({ isLoggedIn: true, currentUser: user })
      wx.showToast({ title: '已使用本地登录', icon: 'success' })
    }

    const doLogin = (code) => {
      if (!app.globalData.useBackend) {
        fallbackLogin()
        return
      }
      api.wechatLogin({ code, userInfo: { nickName: '微信用户' } }).then((result) => {
        app.setCurrentUser(result.user)
        this.setData({ isLoggedIn: true, currentUser: result.user })
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
