const app = getApp()

Page({
  data: {
    statusBarHeight: 24,
    messages: [
      {
        icon: '🔔',
        title: '订单提醒',
        body: '骑手接单、取件、送达等进度会在这里同步。',
        time: '刚刚',
        unread: true
      },
      {
        icon: '🎟️',
        title: '优惠活动',
        body: '新人首单最高减 9 元，急送服务享 2 折起。',
        time: '今天',
        unread: true
      },
      {
        icon: '🛡️',
        title: '保障通知',
        body: '贵重物品建议开启保价，异常订单可发起客服介入。',
        time: '昨天',
        unread: false
      }
    ]
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
  },

  openMessage(event) {
    const index = event.currentTarget.dataset.index
    const messages = this.data.messages
    messages[index].unread = false
    this.setData({ messages })
    wx.showToast({ title: messages[index].title, icon: 'none' })
  }
})
