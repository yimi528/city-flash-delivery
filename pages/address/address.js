const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 24,
    type: 'dropoff',
    title: '选择收货地址',
    keyword: '',
    addresses: []
  },

  onLoad(query) {
    const type = query.type || 'dropoff'
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      type,
      title: type === 'pickup' ? '选择发货地址' : '选择收货地址',
      addresses: app.globalData.addresses
    })
    this.loadAddresses()
  },

  loadAddresses() {
    if (!app.globalData.useBackend) return
    api.getAddresses(app.globalData.userId).then((addresses) => {
      app.globalData.addresses = addresses
      this.setData({ addresses })
    }).catch(() => {
      wx.showToast({ title: '后端未启动，使用本地地址', icon: 'none' })
    })
  },

  onSearch(event) {
    const keyword = event.detail.value.trim()
    const addresses = app.globalData.addresses.filter((item) => {
      return !keyword || item.name.indexOf(keyword) > -1 || item.detail.indexOf(keyword) > -1
    })
    this.setData({ keyword, addresses })
  },

  chooseAddress(event) {
    const id = event.currentTarget.dataset.id
    const selected = app.globalData.addresses.find((item) => item.id === id)
    if (!selected) return

    app.globalData.draftOrder[this.data.type] = selected
    wx.showToast({ title: this.data.type === 'pickup' ? '已选发货地址' : '已选收货地址', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },

  addMockAddress() {
    const next = {
      id: `a${Date.now()}`,
      name: '临时收货点',
      detail: '蕉城区万安西路 88 号楼下',
      contact: '新用户',
      phone: '13500008888',
      distance: '1.7km'
    }
    app.globalData.addresses.unshift(next)
    this.setData({ addresses: app.globalData.addresses, keyword: '' })
    wx.showToast({ title: '已添加演示地址', icon: 'none' })
  },

  goBack() {
    wx.navigateBack()
  }
})
