const ROUTES = {
  cangnan: { id: 'cangnan', name: '苍南', price: 40 },
  wenzhou: { id: 'wenzhou', name: '温州', price: 150 },
  fuzhou: { id: 'fuzhou', name: '福州', price: 0 }
}

const FUDING_STOP = {
  id: 'carpool-fuding-stop',
  name: '福鼎',
  detail: '固定线路集合点，具体上车点由客服确认',
  city: '宁德市',
  district: '福鼎市',
  latitude: 27.3245,
  longitude: 120.216,
  contact: '顺风车客服',
  phone: '',
  isCarpoolFixedStop: true
}

function addressText(address) {
  if (!address) return ''
  return [address.name, address.detail, address.city, address.district].filter(Boolean).join('')
}

function getRouteIdForAddress(address) {
  if (!address) return ''
  const adcode = String(address.adcode || '')
  const text = addressText(address)
  if (adcode) {
    if (adcode === '330327') return 'cangnan'
    if (adcode.indexOf('3303') === 0) return 'wenzhou'
    if (adcode.indexOf('3501') === 0) return 'fuzhou'
    return ''
  }
  if (/苍南县|苍南/.test(text)) return 'cangnan'
  if (/温州市|温州/.test(text)) return 'wenzhou'
  if (/福州市|福州/.test(text)) return 'fuzhou'
  return ''
}

function getRouteForAddress(address) {
  return ROUTES[getRouteIdForAddress(address)] || null
}

function getRoute(routeId) {
  return ROUTES[routeId] || ROUTES.cangnan
}

function isAllowedAddress(address) {
  return Boolean(getRouteIdForAddress(address))
}

function isSelectedCityAddress(address, routeId) {
  if (!address || address.needsAddressSelection || address.isCarpoolFixedStop) return false
  const matchedRouteId = getRouteIdForAddress(address)
  return Boolean(matchedRouteId && (!routeId || matchedRouteId === routeId))
}

function placeholder(route) {
  const defaults = {
    cangnan: {
      name: '苍南默认测试点',
      detail: '苍南县城区默认测试地址',
      city: '温州市',
      district: '苍南县',
      adcode: '330327',
      latitude: 27.5186,
      longitude: 120.4257
    },
    wenzhou: {
      name: '温州默认测试点',
      detail: '温州市区默认测试地址',
      city: '温州市',
      district: '鹿城区',
      adcode: '330302',
      latitude: 28.0006,
      longitude: 120.6994
    },
    fuzhou: {
      name: '福州默认测试点',
      detail: '福州市区默认测试地址',
      city: '福州市',
      district: '鼓楼区',
      adcode: '350102',
      latitude: 26.0745,
      longitude: 119.2965
    }
  }
  const selected = defaults[route.id] || defaults.cangnan
  return {
    id: `carpool-${route.id}-default`,
    contact: '测试联系人',
    phone: '13800000000',
    carpoolRouteId: route.id,
    isDefaultTestAddress: true,
    ...selected
  }
}

function addressDefaults(routeId) {
  const route = getRoute(routeId)
  return {
    city: route.id === 'fuzhou' ? '福州市' : '温州市',
    district: route.id === 'cangnan' ? '苍南县' : '',
    adcode: route.id === 'cangnan' ? '330327' : ''
  }
}

function getCitySideAddress(draft) {
  if (!draft) return null
  return draft.direction === 'RETURN' ? draft.pickup : draft.dropoff
}

function applyRoute(draft, options) {
  const selectedLine = (draft && draft.selectedLine) || ROUTES.cangnan
  const requestedRouteId = options && options.routeId
  const route = getRoute(requestedRouteId || selectedLine.id)
  const outbound = (draft.direction || 'OUTBOUND') === 'OUTBOUND'
  const previous = options && options.clearAddress
    ? null
    : ((options && options.address) || getCitySideAddress(draft))
  const cityAddress = isSelectedCityAddress(previous, route.id) ? previous : placeholder(route)
  draft.selectedLine = Object.assign({}, route)
  draft.pickup = outbound ? Object.assign({}, FUDING_STOP) : cityAddress
  draft.dropoff = outbound ? cityAddress : Object.assign({}, FUDING_STOP)
  draft.quoteId = ''
  draft.routeDistanceKm = 0
  draft.routeDistanceSource = ''
  draft.routeDuration = ''
  return draft
}

function applySelectedAddress(draft, address, type, routeId) {
  const selectedRoute = getRoute(routeId || (draft.selectedLine && draft.selectedLine.id))
  const addressRoute = getRouteForAddress(address)
  if (!addressRoute || addressRoute.id !== selectedRoute.id) return null
  const selected = Object.assign({}, address, {
    carpoolRouteId: selectedRoute.id,
    needsAddressSelection: false
  })
  draft.selectedLine = Object.assign({}, selectedRoute)
  draft.direction = type === 'pickup' ? 'RETURN' : 'OUTBOUND'
  draft.pickup = draft.direction === 'RETURN' ? selected : Object.assign({}, FUDING_STOP)
  draft.dropoff = draft.direction === 'OUTBOUND' ? selected : Object.assign({}, FUDING_STOP)
  draft.quoteId = ''
  draft.routeDistanceKm = 0
  draft.routeDistanceSource = ''
  draft.routeDuration = ''
  return selectedRoute
}

function validateDraft(draft) {
  const routeId = draft && draft.selectedLine && draft.selectedLine.id
  const address = getCitySideAddress(draft)
  if (!isSelectedCityAddress(address)) return { valid: false, message: '请选择苍南或温州境内的顺风车地址' }
  if (getRouteIdForAddress(address) !== routeId) return { valid: false, message: '所选地址与顺风车线路不匹配，请重新选择' }
  return { valid: true, address }
}

module.exports = {
  ROUTES,
  FUDING_STOP,
  getRoute,
  getRouteIdForAddress,
  getRouteForAddress,
  isAllowedAddress,
  isSelectedCityAddress,
  addressDefaults,
  getCitySideAddress,
  applyRoute,
  applySelectedAddress,
  validateDraft
}
