const app = getApp()
const api = require('../../utils/api')

function emptyForm() {
  return {
    id: '',
    name: '',
    detail: '',
    contact: '',
    phone: '',
    tag: '',
    distanceKm: 1,
    isDefault: false
  }
}

function normalizeAddress(form) {
  return {
    id: form.id,
    userId: app.globalData.userId,
    name: form.name || '临时地址',
    detail: form.detail || '未填写详细地址',
    contact: form.contact || '微信用户',
    phone: form.phone || '13800000000',
    tag: form.tag || '',
    distanceKm: Number(form.distanceKm || 1),
    isDefault: !!form.isDefault
  }
}

Page({
  data: {
    statusBarHeight: 24,
    title: '新增地址',
    type: 'dropoff',
    form: emptyForm(),
    tags: ['家', '公司', '门店', '学校']
  },

  onLoad(query) {
    const id = query.id || ''
    const source = id ? app.globalData.addresses.find((item) => item.id === id) : null
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      title: id ? '编辑地址' : '新增地址',
      type: query.type || 'dropoff',
      form: source ? Object.assign(emptyForm(), source, { distanceKm: source.distanceKm || Number(String(source.distance || '1').replace('km', '')) || 1 }) : emptyForm()
    })
  },

  inputField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  selectTag(event) {
    this.setData({ 'form.tag': event.currentTarget.dataset.tag })
  },

  toggleDefault() {
    this.setData({ 'form.isDefault': !this.data.form.isDefault })
  },

  saveLocal(payload) {
    const address = Object.assign({}, payload, {
      id: payload.id || `addr-${Date.now()}`,
      distance: `${payload.distanceKm}km`
    })
    if (address.isDefault) {
      app.globalData.addresses.forEach((item) => { item.isDefault = false })
    }
    const index = app.globalData.addresses.findIndex((item) => item.id === address.id)
    if (index > -1) {
      app.globalData.addresses.splice(index, 1, address)
    } else {
      app.globalData.addresses.unshift(address)
    }
    return address
  },

  submit() {
    const payload = normalizeAddress(this.data.form)
    if (!payload.name || !payload.detail) {
      wx.showToast({ title: '请填写地址名称和详情', icon: 'none' })
      return
    }

    const done = (address, title) => {
      this.saveLocal(address)
      wx.showToast({ title, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    }

    if (!app.globalData.useBackend) {
      done(payload, payload.id ? '已保存地址' : '已新增地址')
      return
    }

    const request = payload.id ? api.updateAddress(payload.id, payload) : api.createAddress(payload)
    request.then((address) => {
      done(address, payload.id ? '已保存地址' : '已新增地址')
    }).catch(() => {
      done(payload, '已保存到本地')
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
