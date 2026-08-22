const app = getApp()
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')

const MAX_SAVED_ADDRESSES = 10

function draftKey(type) {
  return type === 'purchase' ? 'purchaseAddress' : type
}

function pickerTitle(type, isCarpool, routeName) {
  if (isCarpool) return `选择${routeName || '顺风车'}地址`
  if (type === 'pickup') return '选择发货位置'
  if (type === 'purchase') return '选择购买位置'
  return '选择收货位置'
}

function pointFrom(value) {
  return map.normalizePoint(value)
}

function pointKey(point) {
  const normalized = pointFrom(point)
  return normalized
    ? `${normalized.latitude.toFixed(6)},${normalized.longitude.toFixed(6)}`
    : ''
}

function samePoint(left, right) {
  return pointKey(left) === pointKey(right)
}

function emptyForm() {
  return { name: '', detail: '', contact: '', phone: '', tag: '', city: '', district: '', adcode: '', mapPoiId: '', isDefault: false }
}

function formFromAddress(address) {
  const source = address || {}
  return Object.assign(emptyForm(), {
    name: source.name || '',
    detail: source.detail || '',
    city: source.city || '',
    district: source.district || '',
    adcode: source.adcode || '',
    mapPoiId: source.mapPoiId || source.id || ''
  })
}

Page({
  data: {
    statusBarHeight: 24,
    title: '地图选点',
    type: 'dropoff',
    isCarpool: false,
    routeId: '',
    routeName: '',
    latitude: 27.518,
    longitude: 120.42,
    scale: 16,
    selectedAddress: null,
    requiresContact: true,
    form: emptyForm(),
    tags: ['家', '公司', '门店', '学校', '商场', '药店'],
    smartPasteText: '',
    smartResult: '',
    recognizing: false,
    saveToAddressBook: false,
    resolving: true,
    moving: false,
    locating: false,
    errorMessage: ''
  },

  onLoad(query) {
    const globalData = app.globalData || {}
    const draft = globalData.draftOrder || {}
    const type = query.type || 'dropoff'
    const isCarpool = query.mode === 'carpool'
    const route = carpool.getRoute(query.route || (draft.selectedLine && draft.selectedLine.id))
    const pendingMapAddress = globalData.pendingMapAddress || null
    const draftAddress = draft[draftKey(type)]
    const initialAddress = pendingMapAddress || (query.from === 'add' ? null : draftAddress)
    const initialPoint = pointFrom(initialAddress) || pointFrom(globalData.currentLocation)
    const requiresContact = type === 'dropoff'

    this.resolveSeq = 0
    this.activeResolveKey = ''
    this.lastResolvedKey = ''
    this.ignoreRegionEventsUntil = 0
    this.setData({
      statusBarHeight: globalData.statusBarHeight || 24,
      title: pickerTitle(type, isCarpool, route.name),
      type,
      requiresContact,
      isCarpool,
      routeId: isCarpool ? route.id : '',
      routeName: isCarpool ? route.name : '',
      form: formFromAddress(initialAddress),
      saveToAddressBook: false,
      latitude: initialPoint ? initialPoint.latitude : this.data.latitude,
      longitude: initialPoint ? initialPoint.longitude : this.data.longitude
    })
    if (pendingMapAddress) app.globalData.pendingMapAddress = null
    this.initialPoint = initialPoint
  },

  onReady() {
    this.mapContext = wx.createMapContext('pickerMap', this)
    if (this.initialPoint) {
      this.resolveLocation(this.initialPoint)
      return
    }
    this.useCurrentLocation()
  },

  onUnload() {
    this.resolveSeq = (this.resolveSeq || 0) + 1
    this.activeResolveKey = ''
    this.lastResolvedKey = ''
    this.ignoreRegionEventsUntil = Date.now() + 1000
  },

  onRegionChange(event) {
    if (Date.now() < this.ignoreRegionEventsUntil) return
    if (event.type === 'begin') {
      this.setData({ moving: true, errorMessage: '' })
      return
    }
    if (event.type !== 'end') return
    this.readMapCenter()
  },

  readMapCenter() {
    if (!this.mapContext || !this.mapContext.getCenterLocation) return
    this.setData({ moving: false, resolving: true, errorMessage: '' })
    this.mapContext.getCenterLocation({
      success: (location) => this.resolveLocation(location),
      fail: () => this.setData({ resolving: false, errorMessage: '无法读取地图中心位置，请重试' })
    })
  },

  resolveLocation(location) {
    const point = pointFrom(location)
    if (!point) {
      this.setData({ resolving: false, errorMessage: '当前位置坐标无效，请重新选择' })
      return
    }
    const key = pointKey(point)
    if (this.activeResolveKey === key) return
    if (this.lastResolvedKey === key && this.data.selectedAddress) {
      this.setData({ moving: false, resolving: false })
      return
    }
    const resolveSeq = (this.resolveSeq || 0) + 1
    this.resolveSeq = resolveSeq
    this.activeResolveKey = key
    const coordinateUpdate = samePoint(this.data, point)
      ? {}
      : { latitude: point.latitude, longitude: point.longitude }
    if (Object.keys(coordinateUpdate).length) this.ignoreRegionEventsUntil = Date.now() + 900
    this.setData(Object.assign({ resolving: true, errorMessage: '' }, coordinateUpdate))
    map.reverseGeocode(point).then((address) => {
      if (this.resolveSeq !== resolveSeq) return
      const selectedAddress = Object.assign({}, address, {
        id: '',
        latitude: point.latitude,
        longitude: point.longitude,
        location: point,
        source: address.source || 'tencent',
        isDefault: false
      })
      const outsideRoute = this.data.isCarpool && !carpool.isSelectedCityAddress(selectedAddress, this.data.routeId)
      this.setData({
        selectedAddress,
        form: Object.assign({}, this.data.form, {
          name: selectedAddress.name || this.data.form.name,
          city: selectedAddress.city || this.data.form.city,
          district: selectedAddress.district || this.data.form.district,
          adcode: selectedAddress.adcode || this.data.form.adcode,
          mapPoiId: selectedAddress.mapPoiId || selectedAddress.id || this.data.form.mapPoiId,
          latitude: point.latitude,
          longitude: point.longitude
        }),
        resolving: false,
        moving: false,
        errorMessage: outsideRoute ? `该位置不在${this.data.routeName}境内，请移动图钉` : ''
      })
      this.lastResolvedKey = key
      this.activeResolveKey = ''
    }).catch(() => {
      if (this.resolveSeq === resolveSeq) {
        this.setData({ resolving: false, moving: false, errorMessage: '地址解析失败，请检查网络后重试' })
        this.activeResolveKey = ''
      }
    })
  },

  useCurrentLocation() {
    if (this.data.locating) return
    this.setData({ locating: true, errorMessage: '' })
    map.getCurrentLocation().then((location) => {
      const point = pointFrom(location)
      app.globalData.currentLocation = location
      this.ignoreRegionEventsUntil = Date.now() + 1200
      this.setData({
        latitude: point.latitude,
        longitude: point.longitude,
        scale: 17,
        locating: false
      })
      this.resolveLocation(point)
    }).catch(() => {
      this.setData({ locating: false, resolving: false, errorMessage: '定位失败，请检查位置权限' })
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

  toggleSaveToAddressBook() {
    this.setData({ saveToAddressBook: !this.data.saveToAddressBook })
  },

  inputSmartPaste(event) {
    this.setData({ smartPasteText: event.detail.value, smartResult: '' })
  },

  smartRecognize() {
    if (this.data.recognizing) return
    const addressParser = require('../../utils/address-parser')
    const recognize = (rawText) => {
      const text = String(rawText || '').trim()
      const parsed = addressParser.parseAddressText(text)
      if (!parsed.contact && !parsed.phone && !parsed.address) {
        this.setData({ smartResult: '未识别到有效信息，请补充姓名、电话或地址' })
        wx.showToast({ title: '暂未识别到有效信息', icon: 'none' })
        return
      }
      this.setData({
        smartPasteText: text,
        smartResult: '已识别，请核对下方信息',
        'form.name': parsed.name || this.data.form.name,
        'form.detail': parsed.address || this.data.form.detail,
        'form.contact': this.data.requiresContact ? (parsed.contact || this.data.form.contact) : '',
        'form.phone': this.data.requiresContact ? (parsed.phone || this.data.form.phone) : ''
      })
      wx.showToast({ title: '已识别，请核对信息', icon: 'success' })
    }
    const typedText = String(this.data.smartPasteText || '').trim()
    if (typedText) {
      this.setData({ recognizing: true })
      recognize(typedText)
      this.setData({ recognizing: false })
      return
    }
    if (!wx.getClipboardData) {
      wx.showToast({ title: '请先输入或粘贴地址信息', icon: 'none' })
      return
    }
    this.setData({ recognizing: true })
    wx.getClipboardData({
      success: (result) => recognize(result.data),
      fail: () => wx.showToast({ title: '无法读取剪贴板，请手动输入', icon: 'none' }),
      complete: () => this.setData({ recognizing: false })
    })
  },

  saveLocal(address) {
    const saved = Object.assign({}, address, { id: address.id || `addr-${Date.now()}`, distance: `${address.distanceKm || 1}km` })
    if (saved.isDefault) app.globalData.addresses.forEach((item) => { item.isDefault = false })
    const index = app.globalData.addresses.findIndex((item) => item.id === saved.id)
    if (index > -1) app.globalData.addresses.splice(index, 1, saved)
    else app.globalData.addresses.unshift(saved)
    return saved
  },

  finishAddress(address, shouldSave) {
    const selected = shouldSave ? this.saveLocal(address) : Object.assign({}, address, { id: '' })
    if (this.data.isCarpool) {
      carpool.applySelectedAddress(app.globalData.draftOrder, selected, this.data.type, this.data.routeId)
    } else {
      app.globalData.draftOrder[draftKey(this.data.type)] = selected
      app.globalData.draftOrder.routeDistanceKm = 0
      app.globalData.draftOrder.routeDistanceSource = ''
      app.globalData.draftOrder.routeDuration = ''
    }
    wx.showToast({ title: shouldSave ? '地址已保存' : '已使用此地址', icon: 'success' })
    setTimeout(() => wx.navigateBack({ delta: 1 }), 350)
  },

  confirmLocation() {
    const selected = this.data.selectedAddress
    if (!selected || this.data.resolving || this.data.moving) {
      wx.showToast({ title: '请等待地址识别完成', icon: 'none' })
      return
    }
    if (this.data.isCarpool && !carpool.isSelectedCityAddress(selected, this.data.routeId)) {
      wx.showToast({ title: `请选择${this.data.routeName}境内地址`, icon: 'none' })
      return
    }

    const form = Object.assign({}, selected, this.data.form)
    if (!form.name || !form.detail || (this.data.requiresContact && (!form.contact || !form.phone))) {
      wx.showToast({ title: this.data.requiresContact ? '请填写完整收货信息' : '请填写详细门牌号', icon: 'none' })
      return
    }
    if (this.data.requiresContact && !/^1[3-9]\d{9}$/.test(form.phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' })
      return
    }
    const shouldSave = this.data.saveToAddressBook
    if (shouldSave && app.globalData.addresses.length >= MAX_SAVED_ADDRESSES) {
      wx.showToast({ title: `我的地址最多保存${MAX_SAVED_ADDRESSES}个`, icon: 'none' })
      return
    }
    const payload = Object.assign({}, form, {
      id: '',
      userId: app.globalData.userId,
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      location: { latitude: this.data.latitude, longitude: this.data.longitude },
      isDefault: !!form.isDefault
    })
    if (!shouldSave) {
      this.finishAddress(payload, false)
      return
    }
    if (!app.globalData.useBackend) {
      this.finishAddress(payload, true)
      return
    }
    const api = require('../../utils/api')
    api.createAddress(payload).then((address) => this.finishAddress(address, true)).catch((error) => {
      wx.showToast({ title: error.message || '地址保存失败，请稍后重试', icon: 'none' })
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
