const ROUTES = {
  wenzhou_parcel: { id: 'wenzhou_parcel', name: '温州', price: 0, priceUnit: 'PER_ORDER', pending: true, city: '温州市', allowedDistricts: ['鹿城区', '瓯海区', '龙湾区'], districts: ['鹿城区', '瓯海区', '龙湾区'], districtText: '鹿城区、瓯海区、龙湾区' },
  fuzhou_parcel: { id: 'fuzhou_parcel', name: '福州', price: 0, priceUnit: 'PER_ORDER', pending: true, city: '福州市', allowedDistricts: ['鼓楼区', '仓山区', '晋安区', '台江区'], districts: ['鼓楼区', '仓山区', '晋安区', '台江区'], districtText: '鼓楼区、仓山区、晋安区、台江区' },
  // Legacy route IDs remain readable for existing drafts/orders but are no longer exposed as customer services.
  cangnan: { id: 'cangnan', name: '苍南', price: 40, city: '温州市', allowedDistricts: ['苍南县'] },
  wenzhou: { id: 'wenzhou', name: '温州', price: 150, city: '温州市', allowedDistricts: [], allowAnyCity: true, cityAdcodePrefixes: ['3303'] },
  fuzhou: { id: 'fuzhou', name: '福州', price: 0, city: '福州市', allowedDistricts: [], allowAnyCity: true, cityAdcodePrefixes: ['3501'] }
}

const ROUTE_ADCODE_PREFIXES = {
  wenzhou_parcel: ['330302', '330304', '330303'],
  wenzhou: ['330302', '330304', '330303'],
  fuzhou_parcel: ['350102', '350104', '350111', '350103'],
  fuzhou: ['350102', '350104', '350111', '350103'],
  cangnan: ['330327']
}
const DISTRICT_ADCODES = {
  鹿城区: ['330302'], 瓯海区: ['330304'], 龙湾区: ['330303'],
  鼓楼区: ['350102'], 仓山区: ['350104'], 晋安区: ['350111'], 台江区: ['350103'],
  苍南县: ['330327']
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
    const matched = Object.keys(ROUTE_ADCODE_PREFIXES).find((routeId) => ROUTE_ADCODE_PREFIXES[routeId].some((prefix) => adcode === prefix || adcode.startsWith(`${prefix.slice(0, 4)}00`)))
    if (matched) return matched
  }
  if (/苍南县|苍南/.test(text)) return 'cangnan'
  if (/鹿城区/.test(text)) return 'wenzhou_parcel'
  if (/瓯海区/.test(text)) return 'wenzhou_parcel'
  if (/龙湾区/.test(text)) return 'wenzhou_parcel'
  if (/鼓楼区|仓山区|晋安区|台江区/.test(text)) return 'fuzhou_parcel'
  return ''
}

function getRouteForAddress(address) {
  return ROUTES[getRouteIdForAddress(address)] || null
}

function getRoute(routeId) {
  return ROUTES[routeId] || ROUTES.wenzhou_parcel
}

function isAllowedAddress(address) {
  return Boolean(getRouteIdForAddress(address))
}

function isSelectedCityAddress(address, routeId, selectedDistrict) {
  if (!address || address.needsAddressSelection || address.isCarpoolFixedStop) return false
  const route = getRoute(routeId)
  const text = addressText(address)
  const district = String(address.district || '').trim()
  const adcode = String(address.adcode || '')
  if (route.allowAnyCity) {
    return (route.cityAdcodePrefixes || []).some((prefix) => adcode.startsWith(prefix)) || text.includes(route.city)
  }
  const districtScope = selectedDistrict ? [selectedDistrict] : route.allowedDistricts
  const allowedDistrict = districtScope && districtScope.some((item) => district === item || text.includes(item))
  const codePrefixes = selectedDistrict ? (DISTRICT_ADCODES[selectedDistrict] || []) : (ROUTE_ADCODE_PREFIXES[route.id] || [])
  const allowedAdcode = codePrefixes.some((prefix) => adcode === prefix || adcode.startsWith(prefix))
  return Boolean(allowedDistrict || allowedAdcode)
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
    wenzhou_parcel: {
      name: '温州默认测试点',
      detail: '温州市区默认测试地址',
      city: '温州市',
      district: '鹿城区',
      adcode: '330302',
      latitude: 28.0006,
      longitude: 120.6994
    },
    fuzhou_parcel: {
      name: '福州默认测试点',
      detail: '福州市区默认测试地址',
      city: '福州市',
      district: '鼓楼区',
      adcode: '350102',
      latitude: 26.0745,
      longitude: 119.2965
    }
  }
  const selected = defaults[route.id] || defaults.wenzhou_parcel
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
    city: route.city || '温州市',
    district: route.allowedDistricts ? route.allowedDistricts[0] : '',
    adcode: (ROUTE_ADCODE_PREFIXES[route.id] || [])[0] || ''
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
  const cityAddress = isSelectedCityAddress(previous, route.id, draft.selectedDistrict)
    ? previous
    : (options && options.usePlaceholder === false ? null : placeholder(route))
  draft.selectedLine = Object.assign({}, route)
  draft.pickup = outbound ? Object.assign({}, FUDING_STOP) : cityAddress
  draft.dropoff = outbound ? cityAddress : Object.assign({}, FUDING_STOP)
  draft.quoteId = ''
  draft.routeDistanceKm = 0
  draft.routeDistanceSource = ''
  draft.routeDuration = ''
  return draft
}

function applySelectedAddress(draft, address, type, routeId, selectedDistrict) {
  const selectedRoute = getRoute(routeId || (draft.selectedLine && draft.selectedLine.id))
  if (!isSelectedCityAddress(address, selectedRoute.id, selectedDistrict || draft.selectedDistrict)) return null
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
  const route = getRoute(routeId)
  if (!route.allowAnyCity && !draft.selectedDistrict) return { valid: false, message: `请选择${route.name}行政区` }
  if (!isSelectedCityAddress(address, routeId, draft.selectedDistrict)) return { valid: false, message: `请选择${draft.selectedDistrict}内的地址` }
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
