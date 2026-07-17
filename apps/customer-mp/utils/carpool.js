const ROUTES = {
  cangnan: { id: 'cangnan', name: '苍南', price: 40 },
  wenzhou: { id: 'wenzhou', name: '温州', price: 150 }
}

const FUDING_STOP = {
  id: 'carpool-fuding-stop',
  name: '福鼎',
  detail: '固定线路集合点，具体上车点由客服确认',
  city: '宁德市',
  district: '福鼎市',
  contact: '拼车客服',
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
    return ''
  }
  if (/苍南县|苍南/.test(text)) return 'cangnan'
  if (/温州市|温州/.test(text)) return 'wenzhou'
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
  return {
    id: `carpool-${route.id}-placeholder`,
    name: `请选择${route.name}境内地址`,
    detail: '地址簿将优先推荐可用地点',
    city: '温州市',
    district: route.id === 'cangnan' ? '苍南县' : '',
    needsAddressSelection: true
  }
}

function addressDefaults(routeId) {
  const route = getRoute(routeId)
  return {
    city: '温州市',
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
  if (!isSelectedCityAddress(address)) return { valid: false, message: '请选择苍南或温州境内的拼车地址' }
  if (getRouteIdForAddress(address) !== routeId) return { valid: false, message: '所选地址与拼车线路不匹配，请重新选择' }
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
