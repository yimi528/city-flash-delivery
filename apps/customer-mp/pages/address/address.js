const app = getApp()
const api = require('../../utils/api')
const map = require('../../utils/map')
const carpool = require('../../utils/carpool')

function addressMeta(type, isCarpool) {
  if (isCarpool) return { title: '选择苍南/温州地址', pinLabel: '拼', pinClass: 'pickup', toast: '已匹配拼车线路' }
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
  address.contact = address.contact || '微信用户'
  address.phone = address.phone || '13800000000'
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
    title: '选择收货地址',
    pinLabel: '收',
    pinClass: 'dropoff',
    keyword: '',
    addresses: [],
    mapResults: [],
    currentAddress: null,
    isLocating: false,
    isSearching: false,
    locationTip: '点击定位后，会按当前位置推荐附近地址',
    scopeTip: ''
  },

  onLoad(query) {
    const type = query.type || 'dropoff'
    const isCarpool = query.mode === 'carpool'
    const meta = addressMeta(type, isCarpool)
    this.searchSeq = 0
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      type,
      isCarpool,
      title: meta.title,
      pinLabel: meta.pinLabel,
      pinClass: meta.pinClass,
      currentAddress: app.globalData.currentAddress || null,
      addresses: app.globalData.addresses,
      locationTip: isCarpool ? '仅显示苍南或温州境内地址' : '点击定位后，会按当前位置推荐附近地址',
      scopeTip: isCarpool ? '选择后会自动匹配苍南线或温州线' : ''
    })
    if (isCarpool) this.loadCarpoolRecommendations()
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
    const origin = app.globalData.currentLocation
    const localAddresses = (source || []).filter((item) => {
      if (this.data.isCarpool && !carpool.isAllowedAddress(item)) return false
      return !keyword || item.name.indexOf(keyword) > -1 || item.detail.indexOf(keyword) > -1 || (item.tag || '').indexOf(keyword) > -1
    }).map((item) => decorateAddress(item, origin, { isMapResult: false, sourceLabel: item.tag || '常用' }))

    const mapResults = keyword || this.data.isCarpool ? this.data.mapResults : []
    this.setData({ addresses: mergeUnique(localAddresses.concat(mapResults)) })
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
      region: this.data.isCarpool ? '温州市' : app.globalData.city,
      location: app.globalData.currentLocation
    }).then((results) => {
      if (this.searchSeq !== searchSeq || this.data.keyword !== keyword) return
      const scopedResults = this.data.isCarpool ? results.filter(carpool.isAllowedAddress) : results
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
    Promise.all([
      map.searchAddress('苍南', { region: '温州市' }),
      map.searchAddress('温州', { region: '温州市' })
    ]).then((groups) => {
      if (this.searchSeq !== searchSeq || this.data.keyword) return
      const mapResults = mergeUnique([].concat.apply([], groups).filter(carpool.isAllowedAddress)).map((item) => decorateAddress(item, app.globalData.currentLocation, {
        isMapResult: true,
        sourceLabel: item.source === 'tencent' ? '腾讯地图推荐' : '拼车地点推荐'
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
    this.selectAddress(this.data.currentAddress)
  },

  chooseAddress(event) {
    const id = event.currentTarget.dataset.id
    const selected = this.data.addresses.find((item) => item.id === id) || app.globalData.addresses.find((item) => item.id === id)
    if (!selected) return
    this.selectAddress(selected)
  },

  selectAddress(address) {
    const selected = Object.assign({}, address)
    if (this.data.isCarpool) {
      const route = carpool.applySelectedAddress(app.globalData.draftOrder, selected, this.data.type)
      if (!route) {
        wx.showToast({ title: '拼车仅支持苍南或温州境内地址', icon: 'none' })
        return
      }
      wx.showToast({ title: `已自动匹配${route.name}线`, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
      return
    }
    const key = draftKey(this.data.type)
    app.globalData.draftOrder[key] = selected
    app.globalData.draftOrder.routeDistanceKm = 0
    app.globalData.draftOrder.routeDistanceSource = ''
    app.globalData.draftOrder.routeDuration = ''
    wx.showToast({ title: addressMeta(this.data.type, false).toast, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },

  addAddress() {
    const mode = this.data.isCarpool ? '&mode=carpool' : ''
    wx.navigateTo({ url: `/pages/address-edit/address-edit?type=${this.data.type}${mode}` })
  },

  editAddress(event) {
    const id = event.currentTarget.dataset.id
    const mode = this.data.isCarpool ? '&mode=carpool' : ''
    wx.navigateTo({ url: `/pages/address-edit/address-edit?type=${this.data.type}&id=${id}${mode}` })
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
