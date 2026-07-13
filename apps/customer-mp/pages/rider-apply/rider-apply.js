const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    statusBarHeight: 24,
    mode: 'loading',
    application: null,
    form: { name: '', phone: '', vehicleType: 'ETRIKE', vehicleTypes: ['ETRIKE'], vehicleName: '货三轮车', statement: '', agreementAccepted: false },
    vehicleOptions: [
      { value: 'EBIKE', label: '二轮车', selected: false },
      { value: 'ETRIKE', label: '货三轮车', selected: true },
      { value: 'VAN', label: '小车', selected: false },
      { value: 'MANUAL', label: '人力服务', selected: false }
    ],
    vehicleIndex: 1
  },

  onLoad() {
    this.agreementAccepted = false
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 24 })
  },

  onShow() {
    this.loadState()
    this.startStatePolling()
  },

  onHide() {
    this.stopStatePolling()
  },

  onUnload() {
    this.stopStatePolling()
  },

  startStatePolling() {
    this.stopStatePolling()
    this.statePollingTimer = setInterval(() => {
      if (this.data.mode === 'pending') this.loadState()
    }, 5000)
  },

  stopStatePolling() {
    if (!this.statePollingTimer) return
    clearInterval(this.statePollingTimer)
    this.statePollingTimer = null
  },

  loadState() {
    api.getCurrentRiderApplication().then((state) => {
      const application = state.application
      const rider = state.rider || {}
      const roleStatus = String(rider.roleStatus || '').toLowerCase()
      const applicationStatus = String(application && application.status || '').toLowerCase()
      const mode = roleStatus === 'active'
        ? 'active'
        : roleStatus && roleStatus !== 'active'
          ? 'blocked'
          : applicationStatus === 'approved'
            ? 'active'
            : applicationStatus === 'pending'
              ? 'pending'
              : applicationStatus === 'rejected'
                ? 'rejected'
                : 'apply'
      this.setData({ mode, application, rider })
      if (mode !== 'pending') this.stopStatePolling()
    }).catch(() => {
      this.setData({ mode: 'apply' })
      this.stopStatePolling()
    })
  },

  input(event) {
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  chooseVehicle(event) {
    const index = Number(event.detail.value)
    const option = this.data.vehicleOptions[index]
    this.setData({ vehicleIndex: index, 'form.vehicleType': option.value, 'form.vehicleName': option.label })
  },

  toggleVehicle(event) {
    const type = event.currentTarget.dataset.type
    const selected = this.data.vehicleOptions.filter((item) => item.selected).map((item) => item.value)
    const next = selected.includes(type) ? selected.filter((item) => item !== type) : selected.concat(type)
    if (!next.length) return wx.showToast({ title: '至少选择一种配送工具', icon: 'none' })
    const primary = next[0]
    const option = this.data.vehicleOptions.find((item) => item.value === primary)
    this.setData({
      vehicleOptions: this.data.vehicleOptions.map((item) => Object.assign({}, item, { selected: next.includes(item.value) })),
      'form.vehicleTypes': next,
      'form.vehicleType': primary,
      'form.vehicleName': option.label
    })
  },

  toggleAgreement() {
    const checked = !this.data.form.agreementAccepted
    this.agreementAccepted = checked
    this.setData({ 'form.agreementAccepted': checked })
  },

  submit() {
    const agreementAccepted = this.agreementAccepted === true || this.data.form.agreementAccepted === true
    const form = Object.assign({}, this.data.form, { agreementAccepted })
    if (!form.name || !form.phone) return wx.showToast({ title: '请填写真实姓名和手机号', icon: 'none' })
    if (!form.agreementAccepted) return wx.showToast({ title: '请先确认用户协议和隐私政策', icon: 'none' })
    if (!form.vehicleTypes || !form.vehicleTypes.length) return wx.showToast({ title: '至少选择一种配送工具', icon: 'none' })
    wx.showLoading({ title: '提交申请中' })
    api.submitRiderApplication(form).then(() => {
      this.setData({ mode: 'pending' })
      wx.showToast({ title: '申请已提交', icon: 'success' })
    }).catch((error) => wx.showToast({ title: error.message || '提交失败', icon: 'none' })).finally(() => wx.hideLoading())
  },

  reapply() {
    this.agreementAccepted = false
    this.setData({ mode: 'apply', form: Object.assign({}, this.data.form, { agreementAccepted: false }) })
  },

  switchRider() {
    api.switchAccountRole('rider').then((session) => {
      app.setRiderSession(session)
      wx.reLaunch({ url: '/pages/rider/order-hall/order-hall' })
    }).catch((error) => {
      wx.showToast({ title: (error && (error.message || error.errMsg)) || '骑手模式切换失败', icon: 'none' })
    })
  },

  goBack() { wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/profile' }) }) }
})
