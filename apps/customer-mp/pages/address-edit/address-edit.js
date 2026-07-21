const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')
const addressParser = require('../../utils/address-parser')

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

function draftKey(type) {
  return type === 'purchase' ? 'purchaseAddress' : type
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

function formTitle(type, editing, isCarpool, routeName) {
  if (isCarpool) return `${editing ? '编辑' : '填写'}${routeName || '拼车'}地址`
  const labels = { pickup: '发货', purchase: '购买', dropoff: '收货' }
  return `${editing ? '编辑' : '填写'}${labels[type] || '收货'}信息`
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
    smartPasteText: '',
    recognizing: false,
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
    const type = query.type || 'dropoff'
    const route = carpool.getRoute(query.route || (app.globalData.draftOrder.selectedLine && app.globalData.draftOrder.selectedLine.id))
    this.selectAfterSave = query.from === 'map'
    const initialForm = source
      ? Object.assign(emptyForm(), source, { distanceKm: source.distanceKm || Number(String(source.distance || '1').replace('km', '')) || 1 })
      : Object.assign(emptyForm(), isCarpool ? carpool.addressDefaults(route.id) : {})
    this.searchSeq = 0
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      title: formTitle(type, Boolean(id), isCarpool, route.name),
      type,
      isCarpool,
      routeId: isCarpool ? route.id : '',
      routeName: isCarpool ? route.name : '',
      form: initialForm,
      mapKeyword: initialForm.name || ''
    })
    if (pendingMapAddress) app.globalData.pendingMapAddress = null
  },

  inputField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  inputMapKeyword(event) {
    const keyword = event.detail.value.trim()
    this.setData({ mapKeyword: keyword, 'form.name': keyword })
    if (!keyword) {
      this.setData({ mapResults: [], isSearching: false })
      return
    }
    this.searchMap(keyword)
  },

  inputSmartPaste(event) {
    this.setData({ smartPasteText: event.detail.value })
  },

  pasteAndRecognize() {
    if (this.data.recognizing) return
    const recognize = (rawText) => {
      const text = String(rawText || '').trim()
      if (!text) {
        wx.showToast({ title: '请先复制或粘贴收货信息', icon: 'none' })
        return
      }
      const parsed = addressParser.parseAddressText(text)
      if (!parsed.contact && !parsed.phone && !parsed.address) {
        wx.showToast({ title: '暂未识别到有效信息', icon: 'none' })
        return
      }

      const nextForm = Object.assign({}, this.data.form, {
        contact: parsed.contact || this.data.form.contact,
        phone: parsed.phone || this.data.form.phone,
        name: parsed.name || this.data.form.name,
        detail: parsed.address || this.data.form.detail
      })
      this.setData({
        smartPasteText: text,
        form: nextForm,
        mapKeyword: parsed.address || parsed.name || this.data.mapKeyword,
        recognizing: Boolean(parsed.address)
      })

      if (!parsed.address) {
        wx.showToast({ title: '已识别联系人，请补充地址', icon: 'none' })
        return
      }

      map.searchAddress(parsed.address, {
        region: this.data.isCarpool ? (this.data.routeId === 'cangnan' ? '苍南县' : '温州市') : app.globalData.city,
        location: app.globalData.currentLocation
      }).then((results) => {
        const selected = results && results[0]
        const recognizedForm = selected ? fillFromMapAddress(nextForm, selected) : nextForm
        recognizedForm.contact = parsed.contact || recognizedForm.contact
        recognizedForm.phone = parsed.phone || recognizedForm.phone
        recognizedForm.detail = parsed.address || recognizedForm.detail
        this.setData({
          form: recognizedForm,
          mapKeyword: selected ? selected.name : (parsed.name || parsed.address),
          mapResults: []
        })
        wx.showToast({ title: '已识别，请核对信息', icon: 'success' })
      }).catch(() => {
        wx.showToast({ title: '已识别文字，请核对地址', icon: 'none' })
      }).finally(() => this.setData({ recognizing: false }))
    }

    if (String(this.data.smartPasteText || '').trim()) {
      recognize(this.data.smartPasteText)
      return
    }
    if (!wx.getClipboardData) {
      wx.showToast({ title: '请先粘贴收货信息', icon: 'none' })
      return
    }
    wx.getClipboardData({
      success: (result) => recognize(result.data),
      fail: () => wx.showToast({ title: '无法读取剪贴板，请手动粘贴', icon: 'none' })
    })
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
      const savedAddress = this.saveLocal(address)
      if (this.selectAfterSave) {
        if (this.data.isCarpool) {
          carpool.applySelectedAddress(app.globalData.draftOrder, savedAddress, this.data.type, this.data.routeId)
        } else {
          app.globalData.draftOrder[draftKey(this.data.type)] = Object.assign({}, savedAddress)
          app.globalData.draftOrder.routeDistanceKm = 0
          app.globalData.draftOrder.routeDistanceSource = ''
          app.globalData.draftOrder.routeDuration = ''
        }
      }
      wx.showToast({ title, icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: this.selectAfterSave ? 2 : 1 }), 350)
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
