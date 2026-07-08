const app = getApp()

Page({
  data: {
    statusBarHeight: 24,
    stats: [
      { label: '优惠券', value: '6' },
      { label: '已省', value: '36' },
      { label: '积分', value: '1280' }
    ],
    tools: [
      { icon: '📍', name: '地址簿' },
      { icon: '🎟️', name: '优惠券' },
      { icon: '🧾', name: '发票抬头' },
      { icon: '🎧', name: '客服中心' },
      { icon: '🛵', name: '骑手招募' },
      { icon: '⚙️', name: '设置' }
    ]
  },

  onShow() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight })
  },

  openTool(event) {
    wx.showToast({ title: `${event.currentTarget.dataset.name}开发中`, icon: 'none' })
  }
})
