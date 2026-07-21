const STORAGE_KEY = 'address-use-stats-v1'
const HISTORY_KEY = 'address-history-v1'

function readStats() {
  try {
    return wx.getStorageSync ? (wx.getStorageSync(STORAGE_KEY) || {}) : {}
  } catch (error) {
    return {}
  }
}

function writeStats(stats) {
  try {
    if (wx.setStorageSync) wx.setStorageSync(STORAGE_KEY, stats)
  } catch (error) {}
}

function readHistory() {
  try {
    const history = wx.getStorageSync ? wx.getStorageSync(HISTORY_KEY) : []
    return Array.isArray(history) ? history : []
  } catch (error) {
    return []
  }
}

function writeHistory(history) {
  try {
    if (wx.setStorageSync) wx.setStorageSync(HISTORY_KEY, history.slice(0, 20))
  } catch (error) {}
}

function addressKey(address) {
  return address.id || `${address.name || ''}|${address.detail || ''}`
}

function remember(address) {
  if (!address || address.isMapResult || !String(address.name || '').trim() || !String(address.detail || '').trim()) return address
  const key = addressKey(address)
  const history = readHistory().filter((item) => addressKey(item) !== key)
  history.unshift(Object.assign({}, address, {
    historySavedAt: new Date().toISOString()
  }))
  writeHistory(history)
  return address
}

function getHistory() {
  return readHistory()
}

function mergeHistory(items) {
  const source = Array.isArray(items) ? items : []
  const seen = {}
  const merged = source.concat(readHistory()).filter((item) => {
    const key = addressKey(item)
    if (seen[key]) return false
    seen[key] = true
    return true
  })
  return merged
}

function usageMeta(address, stats) {
  const local = (stats || readStats())[address.id] || {}
  const remoteCount = Number(address.usageCount || 0)
  const localCount = Number(local.usageCount || 0)
  return {
    usageCount: Math.max(remoteCount, localCount),
    lastUsedAt: local.lastUsedAt || address.lastUsedAt || ''
  }
}

function rank(items) {
  const stats = readStats()
  return (items || []).map((item) => Object.assign({}, item, usageMeta(item, stats))).sort((left, right) => {
    const countDelta = Number(right.usageCount || 0) - Number(left.usageCount || 0)
    if (countDelta) return countDelta
    const usedDelta = new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime()
    if (usedDelta) return usedDelta
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
  })
}

function recordUse(address) {
  if (!address || !address.id || address.isMapResult) return address
  const stats = readStats()
  const current = usageMeta(address, stats)
  const next = {
    usageCount: Number(current.usageCount || 0) + 1,
    lastUsedAt: new Date().toISOString()
  }
  stats[address.id] = next
  writeStats(stats)
  remember(Object.assign({}, address, next))
  return Object.assign({}, address, next)
}

function forget(addressId) {
  if (!addressId) return
  const stats = readStats()
  if (stats[addressId]) {
    delete stats[addressId]
    writeStats(stats)
  }
  writeHistory(readHistory().filter((item) => item.id !== addressId))
}

function syncDeletedAddress(globalData, addressId, defaultAddressId) {
  const state = globalData || {}
  state.addresses = (state.addresses || []).filter((item) => item.id !== addressId).map((item) => (
    defaultAddressId === undefined ? item : Object.assign({}, item, { isDefault: item.id === defaultAddressId })
  ))
  const draft = state.draftOrder || {}
  ;['pickup', 'dropoff', 'purchaseAddress'].forEach((key) => {
    if (draft[key] && draft[key].id === addressId) draft[key] = null
  })
  if (!draft.pickup || !draft.dropoff) {
    draft.routeDistanceKm = 0
    draft.routeDistanceSource = ''
    draft.routeDuration = ''
  }
  if (state.pendingMapAddress && state.pendingMapAddress.id === addressId) state.pendingMapAddress = null
  forget(addressId)
  return state.addresses
}

module.exports = { rank, recordUse, remember, getHistory, mergeHistory, forget, syncDeletedAddress }
