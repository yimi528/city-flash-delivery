const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')
const addressBook = require('../../utils/address-book.js')
const navigation = require('../../utils/navigation')
const addressValidation = require('../../utils/address-validation')

function addressMeta(type, isCarpool, routeName) {
  if (isCarpool) return { title: `填写${routeName || '线路'}地址`, pinLabel: '址', pinClass: 'pickup', toast: '已选择线路地址' }
  if (type === 'pickup') return { title: '选择发货地址', pinLabel: '发', pinClass: 'pickup', toast: '已选发货地址' }
  if (type === 'purchase') return { title: '选择购买地址', pinLabel: '买', pinClass: 'purchase', toast: '已选购买地址' }
  return { title: '选择收货地址', pinLabel: '收', pinClass: 'dropoff', toast: '已选收货地址' }
}

function draftKey(type) {
  return type === 'purchase' ? 'purchaseAddress' : type
}

function decorateAddress(item, origin, extra) {
  const address = Object.assign({}, item, extra || {})
  if (!address.distance && address.distanceKm) address.distance = `${address.distanceKm}km`
  if (origin && map.normalizePoint(address)) {
    const distanceKm = map.getAddressDistanceKm(origin, address)
    address.distanceKm = distanceKm
    address.distance = `${distanceKm}km`
  }
  return address
}

function mergeUnique(items) {
  const seen = {}
  return items.filter((item) => {
    const key = item.id || `${item.name}-${item.detail}`
    if (seen[key]) return false
    seen[key] = true
    return true
  })
}

Page({
  data: {
    statusBarHeight: 24,
    type: 'dropoff',
    isCarpool: false,
    isCarpoolRide: false,
    routeId: '',
    routeName: '',
    selectedDistrict: '',
    title: '选择收货地址',
    pinLabel: '收',
    pinClass: 'dropoff',
    keyword: '',
    addresses: [],
    myAddresses: [],
    frequentAddresses: [],
    mapResults: [],
    currentAddress: null,
    isLocating: false,
    isSearching: false,
    locationTip: '点击定位后，会按当前位置推荐附近地址',
    scopeTip: ''
  },

  onLoad(query) {
    const globalData = app.globalData || {}
    const draftOrder = globalData.draftOrder || {}
    const savedAddresses = Array.isArray(globalData.addresses) ? globalData.addresses : []
    const type = query.type || 'dropoff'
    const isCarpool = query.mode === 'carpool' || query.mode === 'delivery'
    const isCarpoolRide = query.mode === 'carpool'
    const route = carpool.getRoute(query.route || (draftOrder.selectedLine && draftOrder.selectedLine.id))
    const selectedDistrict = query.district ? decodeURIComponent(query.district) : ''
    const meta = addressMeta(type, isCarpool, route.name)
    this.searchSeq = 0
    this.pendingDeleteIds = {}
    this.deletedAddressIds = {}
    this.setData({
      statusBarHeight: globalData.statusBarHeight || 24,
      type,
      isCarpool,
      isCarpoolRide,
      routeId: isCarpool ? route.id : '',
      routeName: isCarpool ? route.name : '',
      selectedDistrict,
      title: meta.title,
      pinLabel: meta.pinLabel,
      pinClass: meta.pinClass,
      currentAddress: globalData.currentAddress || null,
      addresses: savedAddresses,
      locationTip: isCarpool ? (route.allowAnyCity ? `仅显示${route.city}境内地址` : `仅显示${route.name}线路指定行政区地址`) : '点击定位后，会按当前位置推荐附近地址',
      scopeTip: isCarpool ? (route.allowAnyCity ? `已选${route.name}线，支持${route.city}境内地址` : `已选${route.name} · ${selectedDistrict || '请选择行政区'}，仅支持 ${(route.allowedDistricts || []).join('、')}`) : ''
    })
    if (isCarpool) this.loadCarpoolRecommendations()
  },

  onShow() {
    const loginReady = app.globalData.useBackend && !app.globalData.isLoggedIn && app.loginReady
      ? app.loginReady
      : Promise.resolve()
    navigation.afterVisible(() => loginReady.then(() => this.loadAddresses()))
  },

  loadAddresses() {
    const savedAddresses = Array.isArray(app.globalData.addresses) ? app.globalData.addresses : []
    if (!app.globalData.useBackend) {
      this.applySearch(savedAddresses)
      return Promise.resolve()
    }
    return api.getAddresses(app.globalData.userId).then((addresses) => {
      Object.keys(this.deletedAddressIds || {}).forEach((id) => {
        if (!addresses.some((item) => item.id === id)) delete this.deletedAddressIds[id]
      })
      const visibleAddresses = addresses.filter((item) => !this.pendingDeleteIds[item.id] && !this.deletedAddressIds[item.id])
      app.globalData.addresses = visibleAddresses
      this.applySearch(visibleAddresses)
    }).catch((error) => {
      this.applySearch(savedAddresses)
      const message = String(error && (error.message || error.errMsg) || '')
      const title = /401|请先登录|登录凭证|未授权/.test(message)
        ? '请先完成微信登录'
        : /url not in domain list|合法域名/.test(message)
          ? '当前开发包未配置合法域名'
          : '无法连接服务，暂时使用本地地址'
      wx.showToast({ title, icon: 'none' })
    })
  },

  applySearch(source) {
    const keyword = this.data.keyword.trim()
    const origin = app.globalData.currentLocation
    // 地址簿只展示用户明确保存过的地址；使用历史不能升级为已保存地址。
    const allAddresses = Array.isArray(source) ? source : []
    const isVisible = (item) => {
      if (this.pendingDeleteIds && this.pendingDeleteIds[item.id]) return false
      if (this.deletedAddressIds && this.deletedAddressIds[item.id]) return false
      if (this.data.isCarpool && !carpool.isSelectedCityAddress(item, this.data.routeId, this.data.selectedDistrict)) return false
      return !keyword || item.name.indexOf(keyword) > -1 || item.detail.indexOf(keyword) > -1 || (item.tag || '').indexOf(keyword) > -1
    }
    const localAddresses = addressBook.rank(allAddresses).filter(isVisible).map((item) => decorateAddress(item, origin, { isMapResult: false, sourceLabel: item.tag || '' }))

    const mapResults = keyword || this.data.isCarpool ? this.data.mapResults : []
    const myAddresses = localAddresses.slice(0, 10)
    const frequentAddresses = keyword ? [] : localAddresses.slice(0, 5)
      .map((item) => Object.assign({}, item, { sourceLabel: '你常去的' }))
    const addresses = mergeUnique(myAddresses.concat(mapResults))
    this.setData({
      myAddresses,
      frequentAddresses,
      addresses
    })
  },

  onSearch(event) {
    const keyword = event.detail.value.trim()
    this.setData({ keyword, mapResults: keyword ? this.data.mapResults : [] }, () => this.applySearch(app.globalData.addresses))
    if (!keyword) {
      if (this.data.isCarpool) this.loadCarpoolRecommendations()
      return
    }
    this.searchMap(keyword)
  },

  searchMap(keyword) {
    const searchSeq = (this.searchSeq || 0) + 1
    this.searchSeq = searchSeq
    this.setData({ isSearching: true })
    map.searchAddress(keyword, {
      region: this.data.isCarpool ? carpool.getRoute(this.data.routeId).city : app.globalData.city,
      location: app.globalData.currentLocation
    }).then((results) => {
      if (this.searchSeq !== searchSeq || this.data.keyword !== keyword) return
      const scopedResults = this.data.isCarpool ? results.filter((item) => carpool.isSelectedCityAddress(item, this.data.routeId, this.data.selectedDistrict)) : results
      const mapResults = scopedResults.map((item) => decorateAddress(item, app.globalData.currentLocation, {
        isMapResult: true,
        sourceLabel: item.source === 'tencent' ? '腾讯地图' : '地图建议'
      }))
      this.setData({ mapResults, isSearching: false }, () => this.applySearch(app.globalData.addresses))
    }).catch(() => {
      if (this.searchSeq === searchSeq) this.setData({ mapResults: [], isSearching: false })
    })
  },

  loadCarpoolRecommendations() {
    const searchSeq = (this.searchSeq || 0) + 1
    this.searchSeq = searchSeq
    this.setData({ isSearching: true })
    const route = carpool.getRoute(this.data.routeId)
    const keyword = route.name
    map.searchAddress(keyword, { region: route.city }).then((results) => {
      if (this.searchSeq !== searchSeq || this.data.keyword) return
      const mapResults = mergeUnique(results.filter((item) => carpool.isSelectedCityAddress(item, this.data.routeId, this.data.selectedDistrict))).map((item) => decorateAddress(item, app.globalData.currentLocation, {
        isMapResult: true,
        sourceLabel: item.source === 'tencent' ? '腾讯地图推荐' : '顺风车地点推荐'
      }))
      this.setData({ mapResults, isSearching: false })
      this.applySearch(app.globalData.addresses)
    }).catch(() => {
      if (this.searchSeq === searchSeq) this.setData({ mapResults: [], isSearching: false })
    })
  },

  locateCurrent() {
    this.setData({ isLocating: true, locationTip: '正在获取当前位置...' })
    map.getCurrentLocation().then((location) => {
      app.globalData.currentLocation = location
      return map.reverseGeocode(location)
    }).then((address) => {
      app.globalData.currentAddress = address
      if (address.city) app.globalData.city = address.city
      this.setData({
        currentAddress: address,
        isLocating: false,
        locationTip: `${address.source === 'tencent' ? '腾讯地图' : '本地'}定位 · ${address.distance}`
      }, () => this.applySearch(app.globalData.addresses))
      wx.showToast({ title: '定位成功', icon: 'success' })
    }).catch(() => {
      this.setData({ isLocating: false, locationTip: '定位失败，请检查授权后重试' })
      wx.showToast({ title: '定位失败', icon: 'none' })
    })
  },

  chooseCurrent() {
    if (!this.data.currentAddress) {
      this.locateCurrent()
      return
    }
    this.openMapAddress(this.data.currentAddress)
  },

  openMapPicker() {
    const mode = this.data.isCarpool ? `&mode=delivery&route=${this.data.routeId}&district=${encodeURIComponent(this.data.selectedDistrict || '')}` : ''
    navigation.navigateTo(wx, { url: `/pages/map-picker/map-picker?type=${this.data.type}${mode}` })
  },

  chooseAddress(event) {
    const id = event.currentTarget.dataset.id
    const selected = this.data.frequentAddresses.find((item) => item.id === id) || this.data.addresses.find((item) => item.id === id) || app.globalData.addresses.find((item) => item.id === id)
    if (!selected) return
    if (selected.isMapResult) {
      this.openMapAddress(selected)
      return
    }
    this.selectAddress(selected)
  },

  openMapAddress(address) {
    app.globalData.pendingMapAddress = Object.assign({}, address, { id: '', isDefault: false })
    const mode = this.data.isCarpool ? `&mode=delivery&route=${this.data.routeId}&district=${encodeURIComponent(this.data.selectedDistrict || '')}` : ''
    navigation.navigateTo(wx, { url: `/pages/address-edit/address-edit?type=${this.data.type}&from=map${mode}` })
  },

  selectAddress(address) {
    const selected = Object.assign({}, address)
    const validation = addressValidation.validateAddress(selected)
    if (!validation.valid) {
      wx.showToast({ title: `该地址信息不完整：${validation.message}`, icon: 'none' })
      if (selected.id) {
        const mode = this.data.isCarpool ? `&mode=delivery&route=${this.data.routeId}&district=${encodeURIComponent(this.data.selectedDistrict || '')}` : ''
        navigation.navigateTo(wx, { url: `/pages/address-edit/address-edit?type=${this.data.type}&id=${selected.id}${mode}` })
      }
      return
    }
    if (this.data.isCarpoolRide) {
      const route = carpool.applySelectedAddress(app.globalData.draftOrder, selected, this.data.type, this.data.routeId, this.data.selectedDistrict)
      if (!route) {
        wx.showToast({ title: `请选择${this.data.routeName}境内地址`, icon: 'none' })
        return
      }
      this.recordUse(address)
      wx.showToast({ title: `已选择${route.name}线地址`, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
      return
    }
    if (this.data.isCarpool && this.data.routeId) {
      const key = draftKey(this.data.type)
      app.globalData.draftOrder[key] = selected
      app.globalData.draftOrder.routeDistanceKm = 0
      app.globalData.draftOrder.routeDistanceSource = ''
      app.globalData.draftOrder.routeDuration = ''
      this.recordUse(address)
      wx.showToast({ title: '已选择线路地址', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
      return
    }
    const key = draftKey(this.data.type)
    app.globalData.draftOrder[key] = selected
    app.globalData.draftOrder.routeDistanceKm = 0
    app.globalData.draftOrder.routeDistanceSource = ''
    app.globalData.draftOrder.routeDuration = ''
    this.recordUse(address)
    wx.showToast({ title: addressMeta(this.data.type, false).toast, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },

  addAddress() {
    const mode = this.data.isCarpool ? `&mode=delivery&route=${this.data.routeId}&district=${encodeURIComponent(this.data.selectedDistrict || '')}` : ''
    navigation.navigateTo(wx, { url: `/pages/map-picker/map-picker?type=${this.data.type}&from=add${mode}` })
  },

  editAddress(event) {
    const id = event.currentTarget.dataset.id
    const mode = this.data.isCarpool ? `&mode=delivery&route=${this.data.routeId}&district=${encodeURIComponent(this.data.selectedDistrict || '')}` : ''
    navigation.navigateTo(wx, { url: `/pages/address-edit/address-edit?type=${this.data.type}&id=${id}${mode}` })
  },

  recordUse(address) {
    if (!address || address.isMapResult) return
    const used = addressBook.recordUse(address)
    const index = app.globalData.addresses.findIndex((item) => item.id === address.id)
    if (index > -1) app.globalData.addresses.splice(index, 1, Object.assign({}, app.globalData.addresses[index], used))
    if (app.globalData.useBackend) api.recordAddressUse(address.id).catch(() => {})
  },

  deleteAddress(event) {
    const id = event.currentTarget.dataset.id
    if (!id || (this.pendingDeleteIds && this.pendingDeleteIds[id])) return
    const existing = app.globalData.addresses.find((item) => item.id === id)
    if (!existing) return
    const previousAddresses = app.globalData.addresses.map((item) => Object.assign({}, item))

    const removeOptimistically = () => {
      this.pendingDeleteIds[id] = true
      const remaining = app.globalData.addresses.filter((item) => item.id !== id)
      const replacement = existing.isDefault ? addressBook.rank(remaining)[0] : null
      app.globalData.addresses = replacement
        ? remaining.map((item) => Object.assign({}, item, { isDefault: item.id === replacement.id }))
        : remaining
      this.applySearch(app.globalData.addresses)
    }
    const rollback = () => {
      delete this.pendingDeleteIds[id]
      app.globalData.addresses = previousAddresses
      this.applySearch(app.globalData.addresses)
    }
    const finish = (defaultAddressId) => {
      delete this.pendingDeleteIds[id]
      this.deletedAddressIds[id] = true
      addressBook.syncDeletedAddress(app.globalData, id, defaultAddressId)
      this.applySearch(app.globalData.addresses)
      wx.showToast({ title: '地址已删除', icon: 'success' })
    }

    wx.showModal({
      title: '删除地址',
      content: '删除后无法恢复，确认删除这个地址吗？',
      confirmText: '删除',
      confirmColor: '#d93025',
      success: (result) => {
        if (!result.confirm) return
        removeOptimistically()
        if (!app.globalData.useBackend) {
          const replacement = existing.isDefault
            ? addressBook.rank(app.globalData.addresses)[0]
            : app.globalData.addresses.find((item) => item.isDefault)
          finish(replacement ? replacement.id : null)
          return
        }
        api.deleteAddress(id).then((result) => {
          finish(result && Object.prototype.hasOwnProperty.call(result, 'defaultAddressId') ? result.defaultAddressId : undefined)
        }).catch(() => {
          rollback()
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
        })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
