const QQ_MAP_HOST = 'https://apis.map.qq.com'
const DEFAULT_REGION = '福鼎市'
const DEFAULT_LOCATION = {
  latitude: 27.3245,
  longitude: 120.216,
  name: '福鼎市中心'
}

const MOCK_POIS = [
  {
    id: 'mock-cangnan-station',
    title: '苍南站',
    address: '浙江省温州市苍南县灵溪镇站前大道',
    category: '火车站',
    city: '温州市',
    district: '苍南县',
    adcode: '330327',
    location: { lat: 27.5364, lng: 120.4164 }
  },
  {
    id: 'mock-cangnan-center',
    title: '苍南县人民政府',
    address: '浙江省温州市苍南县灵溪镇人民大道',
    category: '公共服务',
    city: '温州市',
    district: '苍南县',
    adcode: '330327',
    location: { lat: 27.5186, lng: 120.4258 }
  },
  {
    id: 'mock-wenzhou-south',
    title: '温州南站',
    address: '浙江省温州市瓯海区工业路',
    category: '火车站',
    city: '温州市',
    district: '瓯海区',
    adcode: '330304',
    location: { lat: 27.9727, lng: 120.5856 }
  },
  {
    id: 'mock-wenzhou-center',
    title: '温州市人民政府',
    address: '浙江省温州市鹿城区绣山路321号',
    category: '公共服务',
    city: '温州市',
    district: '鹿城区',
    adcode: '330302',
    location: { lat: 27.9943, lng: 120.6994 }
  },
  {
    id: 'mock-nd-wanda',
    title: '宁德万达广场',
    address: '福建省宁德市蕉城区天湖东路 1 号',
    category: '商圈',
    city: '宁德市',
    district: '蕉城区',
    location: { lat: 26.6659, lng: 119.5476 }
  },
  {
    id: 'mock-nd-hospital',
    title: '宁德市医院',
    address: '福建省宁德市蕉城区蕉城北路 7 号',
    category: '医院',
    city: '宁德市',
    district: '蕉城区',
    location: { lat: 26.6711, lng: 119.5326 }
  },
  {
    id: 'mock-hengsheng',
    title: '恒生一品苑',
    address: '福建省宁德市东侨经济技术开发区福宁北路 6 号',
    category: '住宅区',
    city: '宁德市',
    district: '东侨经济技术开发区',
    location: { lat: 26.6824, lng: 119.5558 }
  },
  {
    id: 'mock-huarun-store',
    title: '华润便利店',
    address: '福建省宁德市福宁北路与梦龙路交叉口',
    category: '便利店',
    city: '宁德市',
    district: '东侨经济技术开发区',
    location: { lat: 26.6794, lng: 119.5532 }
  },
  {
    id: 'mock-nd-station',
    title: '宁德站',
    address: '福建省宁德市蕉城区漳湾镇金马北路',
    category: '火车站',
    city: '宁德市',
    district: '蕉城区',
    location: { lat: 26.7187, lng: 119.5981 }
  },
  {
    id: 'mock-dongqiao-school',
    title: '东侨实验小学',
    address: '福建省宁德市东侨经济技术开发区闽东东路',
    category: '学校',
    city: '宁德市',
    district: '东侨经济技术开发区',
    location: { lat: 26.6613, lng: 119.5596 }
  }
]

function getGlobalData() {
  try {
    const app = getApp()
    return (app && app.globalData) || {}
  } catch (error) {
    return {}
  }
}

function getConfig() {
  const globalData = getGlobalData()
  const config = globalData.mapConfig || {}
  return {
    tencentKey: config.tencentKey || '',
    defaultRegion: config.defaultRegion || globalData.city || DEFAULT_REGION,
    distanceMode: config.distanceMode || 'bicycling',
    fallbackLocation: config.fallbackLocation || DEFAULT_LOCATION
  }
}

function getMapKey() {
  return String(getConfig().tencentKey || '').trim()
}

function hasMapKey() {
  const key = getMapKey()
  return !!key && !/YOUR|DEMO|TEST|请|填入|替换/i.test(key)
}

function requestMap(path, data) {
  const key = getMapKey()
  return new Promise((resolve, reject) => {
    if (!hasMapKey()) {
      reject(new Error('Tencent map key is not configured'))
      return
    }
    if (typeof wx === 'undefined' || !wx.request) {
      reject(new Error('wx.request is unavailable'))
      return
    }
    wx.request({
      url: `${QQ_MAP_HOST}${path}`,
      method: 'GET',
      data: Object.assign({ key, output: 'json' }, data || {}),
      timeout: 5000,
      success(res) {
        const body = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300 && Number(body.status) === 0) {
          resolve(body)
          return
        }
        reject(new Error(body.message || `Tencent map request failed with ${res.statusCode}`))
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

function getBackendMapBaseUrl() {
  const globalData = getGlobalData()
  return String(globalData.apiBaseUrl || '').replace(/\/$/, '')
}

function shouldUseBackendMap() {
  const globalData = getGlobalData()
  return Boolean(globalData.useBackend && getBackendMapBaseUrl() && typeof wx !== 'undefined' && wx.request)
}

function requestBackendMap(path, data) {
  return new Promise((resolve, reject) => {
    if (!shouldUseBackendMap()) {
      reject(new Error('Backend map service is unavailable'))
      return
    }
    const globalData = getGlobalData()
    const headers = { 'x-app-role': globalData.appRole || 'customer' }
    if (globalData.authToken) headers.Authorization = `Bearer ${globalData.authToken}`
    wx.request({
      url: `${getBackendMapBaseUrl()}${path}`,
      method: 'GET',
      data: data || {},
      header: headers,
      timeout: 5000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {})
          return
        }
        reject(new Error((res.data && res.data.message) || `Backend map request failed with ${res.statusCode}`))
      },
      fail(error) {
        reject(error)
      }
    })
  })
}

function parseDistanceKm(value, fallback) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    const parsed = Number(normalized.replace(/[^0-9.]/g, ''))
    if (!Number.isNaN(parsed) && parsed > 0) {
      if (normalized.indexOf('km') === -1 && normalized.indexOf('m') > -1) return parsed / 1000
      return parsed
    }
  }
  return typeof fallback === 'number' ? fallback : 2.6
}

function roundDistance(value) {
  return Math.max(0.1, Math.round(Number(value || 0) * 10) / 10)
}

function normalizePoint(source) {
  if (!source) return null
  const location = source.location || {}
  const latitude = Number(source.latitude || source.lat || location.latitude || location.lat)
  const longitude = Number(source.longitude || source.lng || location.longitude || location.lng)
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null
  return { latitude, longitude, lat: latitude, lng: longitude }
}

function buildMapView(from, to, options) {
  const config = getConfig()
  const settings = options || {}
  const start = normalizePoint(from)
  const end = normalizePoint(to)
  const fallback = normalizePoint(settings.fallbackLocation || config.fallbackLocation) || DEFAULT_LOCATION
  const points = [start, end].filter(Boolean)
  const center = points.length === 2
    ? {
        latitude: (start.latitude + end.latitude) / 2,
        longitude: (start.longitude + end.longitude) / 2
      }
    : (points[0] || fallback)
  const iconPath = settings.iconPath || '/assets/tab/home_active.png'
  const markers = []
  if (start) {
    markers.push({
      id: 1,
      latitude: start.latitude,
      longitude: start.longitude,
      iconPath,
      width: 30,
      height: 30,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: settings.startTitle || '发货点',
        display: 'ALWAYS',
        padding: 8,
        borderRadius: 8,
        bgColor: '#ffffff',
        color: '#111c34',
        fontSize: 11,
        borderWidth: 1,
        borderColor: '#e7ebf2'
      }
    })
  }
  if (end) {
    markers.push({
      id: 2,
      latitude: end.latitude,
      longitude: end.longitude,
      iconPath,
      width: 30,
      height: 30,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: settings.endTitle || '收货点',
        display: 'ALWAYS',
        padding: 8,
        borderRadius: 8,
        bgColor: '#ffffff',
        color: '#111c34',
        fontSize: 11,
        borderWidth: 1,
        borderColor: '#e7ebf2'
      }
    })
  }
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    scale: points.length > 1 ? 12 : 15,
    markers,
    includePoints: points,
    polyline: points.length > 1 ? [{
      points,
      color: '#ff3b30',
      width: 5,
      borderColor: '#ffffff',
      borderWidth: 2,
      arrowLine: true,
      dottedLine: false
    }] : [],
    hasRoute: points.length > 1,
    pointCount: points.length
  }
}

function formatLocation(point) {
  const normalized = normalizePoint(point)
  if (!normalized) return ''
  return `${normalized.latitude},${normalized.longitude}`
}

function haversineKm(from, to) {
  const start = normalizePoint(from)
  const end = normalizePoint(to)
  if (!start || !end) return 0
  const rad = Math.PI / 180
  const dLat = (end.latitude - start.latitude) * rad
  const dLng = (end.longitude - start.longitude) * rad
  const lat1 = start.latitude * rad
  const lat2 = end.latitude * rad
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getAddressDistanceKm(from, to) {
  const start = normalizePoint(from)
  const end = normalizePoint(to)
  if (start && end) {
    return roundDistance(haversineKm(start, end) * 1.25)
  }
  if (to) return roundDistance(parseDistanceKm(to.distanceKm || to.distance, 2.6))
  return 2.6
}

function stableId(prefix, text) {
  const source = String(text || Date.now())
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i)
    hash |= 0
  }
  return `${prefix}-${Math.abs(hash)}`
}

function normalizeSuggestion(item, options) {
  const config = getConfig()
  const origin = options && options.location ? options.location : getGlobalData().currentLocation
  const point = normalizePoint(item)
  const rawDistance = item && item._distance ? Number(item._distance) / 1000 : 0
  const distanceKm = rawDistance || (point && origin ? getAddressDistanceKm(origin, point) : parseDistanceKm(item && (item.distanceKm || item.distance), 1.2))
  const title = item.title || item.name || '地图位置'
  const detail = item.address || item.detail || `${item.city || config.defaultRegion} ${item.district || ''}`.trim()
  const city = item.city || (item.ad_info && item.ad_info.city) || config.defaultRegion
  const district = item.district || (item.ad_info && item.ad_info.district) || ''
  const id = item.id || item.mapPoiId || stableId('map', `${title}-${detail}`)
  return {
    id,
    mapPoiId: id,
    userId: getGlobalData().userId || 'demo-user',
    name: title,
    detail,
    contact: item.contact || '',
    phone: item.phone || '',
    tag: item.tag || item.category || '地图',
    distance: `${roundDistance(distanceKm)}km`,
    distanceKm: roundDistance(distanceKm),
    latitude: point ? point.latitude : '',
    longitude: point ? point.longitude : '',
    location: point || null,
    city,
    district,
    adcode: item.adcode || (item.ad_info && item.ad_info.adcode) || '',
    source: item.source || (hasMapKey() ? 'tencent' : 'mock')
  }
}

function localAddressToPoi(address) {
  return Object.assign({}, address, {
    title: address.name,
    address: address.detail,
    category: address.tag || '地址簿',
    source: 'local'
  })
}

function mockSuggest(keyword, options) {
  const clean = String(keyword || '').trim().toLowerCase()
  if (!clean) return []
  const globalData = getGlobalData()
  const localPois = (globalData.addresses || []).map(localAddressToPoi)
  return localPois.concat(MOCK_POIS).filter((item) => {
    const text = `${item.title || item.name || ''} ${item.address || item.detail || ''} ${item.category || item.tag || ''}`.toLowerCase()
    return text.indexOf(clean) > -1 || text.indexOf(keyword) > -1
  }).slice(0, 10).map((item) => normalizeSuggestion(item, options))
}

function searchAddress(keyword, options) {
  const clean = String(keyword || '').trim()
  if (!clean) return Promise.resolve([])
  const config = getConfig()
  const location = (options && options.location) || getGlobalData().currentLocation
  if (shouldUseBackendMap() && !(options && options.skipBackendMap)) {
    const point = normalizePoint(location)
    return requestBackendMap('/maps/suggestion', {
      keyword: clean,
      region: (options && options.region) || config.defaultRegion,
      lat: point ? point.latitude : '',
      lng: point ? point.longitude : ''
    }).then((body) => {
      const items = body && Array.isArray(body.items) ? body.items : []
      if (items.length) {
        return items.map((item) => normalizeSuggestion(Object.assign({}, item, { source: 'tencent' }), Object.assign({}, options, { location })))
      }
      return searchAddress(clean, Object.assign({}, options, { location, skipBackendMap: true }))
    }).catch(() => searchAddress(clean, Object.assign({}, options, { location, skipBackendMap: true })))
  }
  if (!hasMapKey()) return Promise.resolve(mockSuggest(clean, Object.assign({}, options, { location })))

  const data = {
    keyword: clean,
    region: (options && options.region) || config.defaultRegion,
    region_fix: 1,
    policy: 1,
    get_subpois: 1,
    page_index: 1,
    page_size: 10
  }
  if (location) data.location = formatLocation(location)

  return requestMap('/ws/place/v1/suggestion', data).then((body) => {
    return (body.data || []).map((item) => normalizeSuggestion(item, Object.assign({}, options, { location })))
  }).catch(() => mockSuggest(clean, Object.assign({}, options, { location })))
}

function mockCurrentAddress(location) {
  const config = getConfig()
  const point = normalizePoint(location) || config.fallbackLocation
  return normalizeSuggestion({
    id: 'current-location',
    title: '当前位置',
    address: `${config.defaultRegion} · 定位坐标 ${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`,
    category: '定位',
    city: config.defaultRegion,
    tag: '定位',
    distanceKm: 0.1,
    location: point,
    source: 'device'
  }, { location: point })
}

function reverseGeocode(location, options) {
  const point = normalizePoint(location)
  if (!point) return Promise.resolve(mockCurrentAddress(getConfig().fallbackLocation))
  if (shouldUseBackendMap() && !(options && options.skipBackendMap)) {
    return requestBackendMap('/maps/reverse-geocode', {
      lat: point.latitude,
      lng: point.longitude
    }).then((body) => {
      if (body && body.result) return normalizeReverseGeocode(body.result, point)
      return reverseGeocode(point, { skipBackendMap: true })
    }).catch(() => reverseGeocode(point, { skipBackendMap: true }))
  }
  if (!hasMapKey()) return Promise.resolve(mockCurrentAddress(point))

  return requestMap('/ws/geocoder/v1/', {
    location: formatLocation(point),
    get_poi: 1
  }).then((body) => normalizeReverseGeocode(body.result || {}, point)).catch(() => mockCurrentAddress(point))
}

function normalizeReverseGeocode(result, point) {
  const component = result.address_component || {}
  const formatted = result.formatted_addresses || {}
  const poi = result.pois && result.pois[0] ? result.pois[0] : {}
  return normalizeSuggestion({
    id: 'current-location',
    title: formatted.recommend || poi.title || component.street_number || '当前位置',
    address: result.address || formatted.rough || `${component.city || ''}${component.district || ''}${component.street || ''}`,
    category: '定位',
    city: component.city,
    district: component.district,
    adcode: component.adcode,
    tag: '定位',
    distanceKm: 0.1,
    location: point,
    source: 'tencent'
  }, { location: point })
}

function getCurrentLocation() {
  const config = getConfig()
  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || !wx.getLocation) {
      resolve(Object.assign({}, config.fallbackLocation, { source: 'fallback' }))
      return
    }
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      success(res) {
        const location = {
          latitude: res.latitude,
          longitude: res.longitude,
          speed: res.speed,
          accuracy: res.accuracy,
          source: 'device'
        }
        const globalData = getGlobalData()
        globalData.currentLocation = location
        resolve(location)
      },
      fail() {
        const fallback = Object.assign({}, config.fallbackLocation, { source: 'fallback' })
        getGlobalData().currentLocation = fallback
        resolve(fallback)
      }
    })
  })
}

function estimateDistance(from, to, options) {
  const start = normalizePoint(from)
  const end = normalizePoint(to)
  const fallbackDistance = getAddressDistanceKm(from, to)
  const fallback = {
    distanceKm: fallbackDistance,
    distance: fallbackDistance,
    duration: Math.max(8, Math.round(fallbackDistance * 7)),
    source: start && end ? '直线估算' : '地址簿距离'
  }
  if (!start || !end) return Promise.resolve(fallback)

  if (shouldUseBackendMap() && !(options && options.skipBackendMap)) {
    return requestBackendMap('/maps/distance', {
      fromLat: start.latitude,
      fromLng: start.longitude,
      toLat: end.latitude,
      toLng: end.longitude,
      mode: (options && options.mode) || getConfig().distanceMode
    }).then((body) => {
      if (body && body.route) {
        return {
          distanceKm: Number(body.route.distanceKm),
          distance: Number(body.route.distanceKm),
          duration: Number(body.route.duration || fallback.duration),
          source: body.route.source || '腾讯地图'
        }
      }
      return estimateDistance(from, to, Object.assign({}, options, { skipBackendMap: true }))
    }).catch(() => estimateDistance(from, to, Object.assign({}, options, { skipBackendMap: true })))
  }

  if (!hasMapKey()) return Promise.resolve(fallback)

  const config = getConfig()
  return requestMap('/ws/distance/v1/matrix', {
    mode: (options && options.mode) || config.distanceMode,
    from: formatLocation(start),
    to: formatLocation(end)
  }).then((body) => {
    const element = body.result && body.result.rows && body.result.rows[0] && body.result.rows[0].elements && body.result.rows[0].elements[0]
    const meters = element && Number(element.distance)
    if (!meters || Number.isNaN(meters)) return fallback
    const distanceKm = roundDistance(meters / 1000)
    return {
      distanceKm,
      distance: distanceKm,
      duration: element.duration ? Math.max(1, Math.round(Number(element.duration) / 60)) : fallback.duration,
      source: '腾讯地图'
    }
  }).catch(() => fallback)
}

function decodeTencentPolyline(encoded) {
  if (!Array.isArray(encoded) || encoded.length < 2) return []
  const points = []
  let latitude = Number(encoded[0])
  let longitude = Number(encoded[1])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
  points.push({ latitude, longitude })
  for (let index = 2; index + 1 < encoded.length; index += 2) {
    latitude += Number(encoded[index]) / 1000000
    longitude += Number(encoded[index + 1]) / 1000000
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      points.push({ latitude, longitude })
    }
  }
  return points
}

function route(from, to, options) {
  const start = normalizePoint(from)
  const end = normalizePoint(to)
  if (!start || !end) return Promise.resolve({ configured: false, route: null })
  const config = getConfig()
  const mode = (options && options.mode) || config.distanceMode || 'bicycling'
  if (shouldUseBackendMap() && !(options && options.skipBackendMap)) {
    return requestBackendMap('/maps/route', {
      fromLat: start.latitude,
      fromLng: start.longitude,
      toLat: end.latitude,
      toLng: end.longitude,
      mode
    }).then((body) => {
      if (body && body.route) return body
      return route(from, to, Object.assign({}, options, { skipBackendMap: true }))
    }).catch(() => route(from, to, Object.assign({}, options, { skipBackendMap: true })))
  }
  if (!hasMapKey()) return Promise.resolve({ configured: false, route: null })
  const endpoint = mode === 'walking'
    ? '/ws/direction/v1/walking'
    : mode === 'driving'
      ? '/ws/direction/v1/driving'
      : '/ws/direction/v1/bicycling'
  return requestMap(endpoint, {
    from: formatLocation(start),
    to: formatLocation(end)
  }).then((body) => {
    const firstRoute = body.result && body.result.routes && body.result.routes[0]
    const polyline = decodeTencentPolyline(firstRoute && firstRoute.polyline)
    if (!firstRoute || polyline.length < 2) return { configured: true, route: null }
    return {
      configured: true,
      route: {
        distanceKm: roundDistance(Number(firstRoute.distance || 0) / 1000),
        duration: firstRoute.duration ? Math.max(1, Math.round(Number(firstRoute.duration) / 60)) : null,
        source: '腾讯地图',
        polyline
      }
    }
  }).catch(() => ({ configured: true, route: null }))
}

module.exports = {
  hasMapKey,
  buildMapView,
  route,
  searchAddress,
  reverseGeocode,
  getCurrentLocation,
  estimateDistance,
  getAddressDistanceKm,
  normalizePoint,
  normalizeSuggestion,
  parseDistanceKm
}
