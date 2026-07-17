const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')

function emptyForm() {
  return {
    id: '',
    name: '',
    detail: '',
    contact: '',
    phone: '',
    tag: '',
    distanceKm: 1,
    latitude: '',
    longitude: '',
    city: '',
    district: '',
    adcode: '',
    mapPoiId: '',
    isDefault: false
  }
}

function normalizeAddress(form) {
  const latitude = form.latitude === '' ? '' : Number(form.latitude)
  const longitude = form.longitude === '' ? '' : Number(form.longitude)
  return {
    id: form.id,
    userId: app.globalData.userId,
    name: String(form.name || '').trim(),
    detail: String(form.detail || '').trim(),
    contact: String(form.contact || '').trim(),
    phone: String(form.phone || '').trim(),
    tag: form.tag || '',
    distanceKm: Number(form.distanceKm || 1),
    latitude,
    longitude,
    location: latitude !== '' && longitude !== '' ? { latitude, longitude } : null,
    city: form.city || app.globalData.city || '',
    district: form.district || '',
    adcode: form.adcode || '',
    mapPoiId: form.mapPoiId || '',
    isDefault: !!form.isDefault
  }
}

function fillFromMapAddress(form, address) {
  return Object.assign({}, form, {
    name: address.name || form.name,
    detail: address.detail || form.detail,
    tag: form.tag || address.tag || '地图',
    distanceKm: address.distanceKm || map.parseDistanceKm(address.distance, form.distanceKm || 1),
    latitude: address.latitude || '',
    longitude: address.longitude || '',
    city: address.city || form.city || app.globalData.city || '',
    district: address.district || form.district || '',
    adcode: address.adcode || form.adcode || '',
    mapPoiId: address.mapPoiId || address.id || form.mapPoiId || ''
  })
}

Page({
  data: {
    statusBarHeight: 24,
    title: '新增地址',
    type: 'dropoff',
    isCarpool: false,
    routeId: '',
    routeName: '',
    form: emptyForm(),
    tags: ['家', '公司', '门店', '学校', '商场', '药店'],
    mapKeyword: '',
    mapResults: [],
    isLocating: false,
    isSearching: false
  },

  onLoad(query) {
    const id = query.id || ''
    const savedAddresses = Array.isArray(app.globalData.addresses) ? app.globalData.addresses : []
    const pendingMapAddress = query.from === 'map' ? app.globalData.pendingMapAddress : null
    const source = id ? savedAddresses.find((item) => item.id === id) : pendingMapAddress
    const isCarpool = query.mode === 'carpool'
    const route = carpool.getRoute(query.route || (app.globalData.draftOrder.selectedLine && app.globalData.draftOrder.selectedLine.id))
    const initialForm = source
      ? Object.assign(emptyForm(), source, { distanceKm: source.distanceKm || Number(String(source.distance || '1').replace('km', '')) || 1 })
      : Object.assign(emptyForm(), isCarpool ? carpool.addressDefaults(route.id) : {})
    this.searchSeq = 0
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      title: id ? '编辑地址' : (pendingMapAddress ? '补全地址信息' : '手动填写地址'),
      type: query.type || 'dropoff',
      isCarpool,
      routeId: isCarpool ? route.id : '',
      routeName: isCarpool ? route.name : '',
      form: initialForm
    })
    if (pendingMapAddress) app.globalData.pendingMapAddress = null
  },

  inputField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  inputMapKeyword(event) {
    const keyword = event.detail.value.trim()
    this.setData({ mapKeyword: keyword })
    if (!keyword) {
      this.setData({ mapResults: [], isSearching: false })
      return
    }
    this.searchMap(keyword)
  },

  searchMap(keyword) {
    const searchSeq = (this.searchSeq || 0) + 1
    this.searchSeq = searchSeq
    this.setData({ isSearching: true })
    map.searchAddress(keyword, {
      region: this.data.isCarpool ? (this.data.routeId === 'cangnan' ? '苍南县' : '温州市') : app.globalData.city,
      location: app.globalData.currentLocation
    }).then((results) => {
      if (this.searchSeq !== searchSeq || this.data.mapKeyword !== keyword) return
      const scopedResults = this.data.isCarpool ? results.filter((item) => carpool.isSelectedCityAddress(item, this.data.routeId)) : results
      this.setData({ mapResults: scopedResults.slice(0, 6), isSearching: false })
    }).catch(() => {
      if (this.searchSeq === searchSeq) this.setData({ mapResults: [], isSearching: false })
    })
  },

  chooseMapResult(event) {
    const id = event.currentTarget.dataset.id
    const selected = this.data.mapResults.find((item) => item.id === id)
    if (!selected) return
    this.setData({ form: fillFromMapAddress(this.data.form, selected), mapKeyword: selected.name, mapResults: [] })
    wx.showToast({ title: '已填入地图地址', icon: 'success' })
  },

  useCurrentLocation() {
    this.setData({ isLocating: true })
    map.getCurrentLocation().then((location) => {
      app.globalData.currentLocation = location
      return map.reverseGeocode(location)
    }).then((address) => {
      if (this.data.isCarpool && !carpool.isSelectedCityAddress(address, this.data.routeId)) {
        this.setData({ isLocating: false })
        wx.showToast({ title: `当前位置不在${this.data.routeName}境内`, icon: 'none' })
        return
      }
      app.globalData.currentAddress = address
      if (address.city) app.globalData.city = address.city
      this.setData({ form: fillFromMapAddress(this.data.form, address), isLocating: false, mapKeyword: address.name })
      wx.showToast({ title: '已定位当前位置', icon: 'success' })
    }).catch(() => {
      this.setData({ isLocating: false })
      wx.showToast({ title: '定位失败', icon: 'none' })
    })
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
    if (!payload.name || !payload.detail || !payload.contact || !payload.phone) {
      wx.showToast({ title: '请完整填写地址和联系人信息', icon: 'none' })
      return
    }
    if (!/^1[3-9]\d{9}$/.test(payload.phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' })
      return
    }
    if (this.data.isCarpool && !carpool.isSelectedCityAddress(payload, this.data.routeId)) {
      wx.showToast({ title: `请填写${this.data.routeName}境内地址`, icon: 'none' })
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
    }).catch((error) => {
      wx.showToast({ title: error.message || '地址保存失败，请稍后重试', icon: 'none' })
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
