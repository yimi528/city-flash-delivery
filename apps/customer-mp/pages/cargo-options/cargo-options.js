const app = getApp()
const vehicleConfig = require('../../utils/vehicle-config')
const map = require('../../utils/map')

function formatLine(draft) {
  if (!draft) return '按当前任务推荐车型'
  if (draft.selectedLine && draft.selectedLine.name) return `${draft.taskName || draft.service} · ${draft.selectedLine.name} ￥${draft.selectedLine.price}`
  return `${draft.taskName || draft.service || '当前任务'} · ${draft.priceSummary || '按规则计价'}`
}

function mapDataForDraft(draft) {
  const view = map.buildMapView(draft && draft.pickup, draft && (draft.dropoff || draft.purchaseAddress), {
    startTitle: '出发点',
    endTitle: '目的地'
  })
  return {
    mapLatitude: view.latitude,
    mapLongitude: view.longitude,
    mapScale: view.scale,
    mapMarkers: view.markers,
    mapIncludePoints: view.includePoints,
    mapPolyline: view.polyline,
    mapHasRoute: view.hasRoute,
    mapPointCount: view.pointCount,
    mapStartPoint: draft && draft.pickup ? map.normalizePoint(draft.pickup) : null,
    mapEndPoint: draft && (draft.dropoff || draft.purchaseAddress)
      ? map.normalizePoint(draft.dropoff || draft.purchaseAddress)
      : null,
    mapRouteText: view.hasRoute ? '正在加载腾讯地图路线' : '等待地址坐标'
  }
}

Page({
  data: {
    statusBarHeight: 24,
    vehicles: vehicleConfig.VEHICLES,
    selectedVehicle: 'small_car',
    selectedVehicleName: '小车',
    taskName: '寄货',
    routeText: '按当前任务推荐车型',
    from: '',
    mapLatitude: 27.3245,
    mapLongitude: 120.216,
    mapScale: 13,
    mapMarkers: [],
    mapIncludePoints: [],
    mapPolyline: [],
    mapHasRoute: false,
    mapPointCount: 0,
    mapRouteText: '正在准备腾讯地图'
  },

  onLoad(query) {
    const draft = app.globalData.draftOrder || {}
    const selectedVehicle = vehicleConfig.recommendVehicleId(draft)
    const mapData = mapDataForDraft(draft)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      from: query.from || '',
      selectedVehicle,
      selectedVehicleName: vehicleConfig.findVehicle(selectedVehicle).name,
      taskName: draft.taskName || draft.service || '寄货',
      routeText: formatLine(draft),
      ...mapData
    })
    this.loadTencentRoute(mapData)
  },

  loadTencentRoute(mapData) {
    if (!mapData.mapHasRoute || !mapData.mapStartPoint || !mapData.mapEndPoint) return
    const routeKey = [
      mapData.mapStartPoint.latitude,
      mapData.mapStartPoint.longitude,
      mapData.mapEndPoint.latitude,
      mapData.mapEndPoint.longitude
    ].join(',')
    this.mapRouteKey = routeKey
    map.route(mapData.mapStartPoint, mapData.mapEndPoint, {
      mode: app.globalData.mapConfig && app.globalData.mapConfig.distanceMode || 'bicycling'
    }).then((result) => {
      if (this.mapRouteKey !== routeKey) return
      const route = result && result.route
      if (!route || !Array.isArray(route.polyline) || route.polyline.length < 2) {
        this.setData({ mapRouteText: '腾讯地图已显示起终点' })
        return
      }
      this.setData({
        mapPolyline: [{
          points: route.polyline,
          color: '#ff3b30',
          width: 6,
          borderColor: '#ffffff',
          borderWidth: 2,
          arrowLine: true,
          dottedLine: false
        }],
        mapRouteText: `腾讯地图路线 · ${route.distanceKm}km`
      })
    }).catch(() => this.setData({ mapRouteText: '腾讯地图已显示起终点' }))
  },

  onMapMarkerTap(event) {
    const markerId = event.detail && event.detail.markerId
    wx.showToast({ title: markerId === 1 ? '出发点' : '目的地', icon: 'none' })
  },

  selectVehicle(event) {
    const selectedVehicle = event.currentTarget.dataset.id
    this.setData({
      selectedVehicle,
      selectedVehicleName: vehicleConfig.findVehicle(selectedVehicle).name
    })
  },

  confirm() {
    const draft = app.globalData.draftOrder
    const vehicle = vehicleConfig.applyVehicleToDraft(draft, this.data.selectedVehicle)
    wx.showToast({ title: `已选择${vehicle.name}`, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 260)
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goBack() {
    wx.navigateBack()
  }
})
