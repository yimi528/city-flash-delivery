const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 24,
    messages: []
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
    if (!app.globalData.authToken) {
      this.setData({ messages: [] })
      return
    }
    api.getNotifications().then((messages) => this.setData({ messages })).catch(() => {
      wx.showToast({ title: '消息加载失败', icon: 'none' })
    })
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/index/index' })
  },

  openMenu() {
    api.markAllNotificationsRead().then(() => {
      this.setData({ messages: this.data.messages.map((item) => ({ ...item, unread: false })) })
      wx.showToast({ title: '已全部读', icon: 'none' })
    }).catch(() => wx.showToast({ title: '操作失败', icon: 'none' }))
  },

  openMessage(event) {
    const index = event.currentTarget.dataset.index
    const message = this.data.messages[index]
    if (!message) return
    api.markNotificationRead(message.id).catch(() => null)
    const messages = this.data.messages.map((item, itemIndex) => ({ ...item, unread: itemIndex === index ? false : item.unread }))
    this.setData({ messages })
    wx.showToast({ title: message.title, icon: 'none' })
  }
})
