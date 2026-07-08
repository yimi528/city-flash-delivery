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
  },

  onShow() {
    this.loadAddresses()
  },

  loadAddresses() {
    if (!app.globalData.useBackend) {
      this.applySearch(app.globalData.addresses)
      return
    }
    api.getAddresses(app.globalData.userId).then((addresses) => {
      app.globalData.addresses = addresses
      this.applySearch(addresses)
    }).catch(() => {
      this.applySearch(app.globalData.addresses)
      wx.showToast({ title: '后端未启动，使用本地地址', icon: 'none' })
    })
  },

  applySearch(source) {
    const keyword = this.data.keyword.trim()
    const addresses = source.filter((item) => {
      return !keyword || item.name.indexOf(keyword) > -1 || item.detail.indexOf(keyword) > -1 || (item.tag || '').indexOf(keyword) > -1
    })
    this.setData({ addresses })
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value.trim() }, () => this.applySearch(app.globalData.addresses))
  },

  chooseAddress(event) {
    const id = event.currentTarget.dataset.id
    const selected = app.globalData.addresses.find((item) => item.id === id)
    if (!selected) return

    app.globalData.draftOrder[this.data.type] = selected
    wx.showToast({ title: this.data.type === 'pickup' ? '已选发货地址' : '已选收货地址', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },

  addAddress() {
    wx.navigateTo({ url: `/pages/address-edit/address-edit?type=${this.data.type}` })
  },

  editAddress(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/address-edit/address-edit?type=${this.data.type}&id=${id}` })
  },

  deleteAddress(event) {
    const id = event.currentTarget.dataset.id
    const removeLocal = () => {
      app.globalData.addresses = app.globalData.addresses.filter((item) => item.id !== id)
      this.applySearch(app.globalData.addresses)
    }

    if (!app.globalData.useBackend) {
      removeLocal()
      wx.showToast({ title: '已删除地址', icon: 'none' })
      return
    }

    api.deleteAddress(id).then(() => {
      removeLocal()
      wx.showToast({ title: '已删除地址', icon: 'none' })
    }).catch(() => {
      wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
