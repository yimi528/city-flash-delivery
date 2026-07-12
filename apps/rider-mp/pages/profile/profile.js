const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    rider: null,
    income: { completedOrders: 0, grossAmountFen: 0 },
    history: [],
    vehicleOptions: [
      { value: 'EBIKE', label: '二轮车' },
      { value: 'ETRIKE', label: '货三轮车' },
      { value: 'VAN', label: '厢式货车/商务车' },
      { value: 'MANUAL', label: '人力服务' }
    ],
    vehicleIndex: 1,
    form: { name: '', phone: '', requestsHandling: false }
  },
  onShow() {
    this.setData({ rider: app.globalData.rider })
    if (app.globalData.authToken) {
      Promise.all([api.income(), api.history()]).then(([income, history]) => this.setData({ income, history })).catch(() => {})
    }
  },
  inputName(event) { this.setData({ 'form.name': event.detail.value }) },
  inputPhone(event) { this.setData({ 'form.phone': event.detail.value }) },
  chooseVehicle(event) { this.setData({ vehicleIndex: Number(event.detail.value) }) },
  toggleHandling(event) { this.setData({ 'form.requestsHandling': event.detail.value }) },
  submitApplication() {
    const option = this.data.vehicleOptions[this.data.vehicleIndex]
    const form = this.data.form
    if (!form.name || !form.phone) return wx.showToast({ title: '请填写姓名和手机号', icon: 'none' })
    api.apply({
      name: form.name,
      phone: form.phone,
      vehicleType: option.value,
      vehicleName: option.label,
      requestsHandling: form.requestsHandling,
      documentUrls: []
    }).then((rider) => {
      app.globalData.rider = rider
      this.setData({ rider })
      wx.showToast({ title: '申请已提交', icon: 'success' })
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }))
  },
  logout() { app.clearSession(); this.setData({ rider: null, income: { completedOrders: 0, grossAmountFen: 0 } }) }
})
