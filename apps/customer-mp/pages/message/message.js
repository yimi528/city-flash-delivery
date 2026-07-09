const app = getApp()

Page({
  data: {
    statusBarHeight: 24,
    messages: []
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
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
    wx.showToast({ title: '消息设置开发中', icon: 'none' })
  },

  openMessage(event) {
    const index = event.currentTarget.dataset.index
    const messages = this.data.messages.map((item, itemIndex) => {
      return {
        icon: item.icon,
        title: item.title,
        body: item.body,
        time: item.time,
        unread: itemIndex === index ? false : item.unread
      }
    })
    this.setData({ messages })
    wx.showToast({ title: messages[index].title, icon: 'none' })
  }
})
