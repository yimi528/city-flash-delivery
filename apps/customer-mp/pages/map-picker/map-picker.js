const app = getApp()
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')

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
    const draftAddress = draft[draftKey(type)]
    const initialPoint = pointFrom(draftAddress) || pointFrom(globalData.currentLocation)

    this.resolveSeq = 0
    this.activeResolveKey = ''
    this.lastResolvedKey = ''
    this.ignoreRegionEventsUntil = 0
    this.setData({
      statusBarHeight: globalData.statusBarHeight || 24,
      title: pickerTitle(type, isCarpool, route.name),
      type,
      isCarpool,
      routeId: isCarpool ? route.id : '',
      routeName: isCarpool ? route.name : '',
      latitude: initialPoint ? initialPoint.latitude : this.data.latitude,
      longitude: initialPoint ? initialPoint.longitude : this.data.longitude
    })
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

    app.globalData.pendingMapAddress = Object.assign({}, selected, { id: '', isDefault: false })
    const mode = this.data.isCarpool ? `&mode=carpool&route=${this.data.routeId}` : ''
    wx.redirectTo({ url: `/pages/address-edit/address-edit?type=${this.data.type}&from=map${mode}` })
  },

  goBack() {
    wx.navigateBack()
  }
})
