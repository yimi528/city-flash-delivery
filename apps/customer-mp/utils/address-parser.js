const CONTACT_LABEL = /(?:收货人|联系人|姓名)\s*[:：]?\s*([A-Za-z\u4e00-\u9fa5·]{2,20})/
const ADDRESS_LABEL = /(?:收货地址|详细地址|地址)\s*[:：]?\s*([^\n]+)/
const PHONE_PATTERN = /1[3-9]\d{9}/
const ADDRESS_HINT = /(省|市|区|县|镇|乡|街道|路|街|巷|号|小区|花园|大厦|广场|公寓|苑|府|城|村|社区|学校|医院|商场|门店|公司|楼|栋|单元|室)/

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function cleanSegment(value) {
  return String(value || '')
    .replace(/^(?:收货人|联系人|姓名|联系电话|手机号码|手机号|手机|电话|收货地址|详细地址|地址)\s*[:：]?\s*/, '')
    .replace(/^[,，;；|\s]+|[,，;；|\s]+$/g, '')
    .trim()
}

function looksLikeContact(value) {
  const text = cleanSegment(value)
  return /^[A-Za-z\u4e00-\u9fa5·]{2,12}$/.test(text) && !ADDRESS_HINT.test(text)
}

function guessContact(text, phoneMatch) {
  const labelled = text.match(CONTACT_LABEL)
  if (labelled) return cleanSegment(labelled[1])

  const beforePhone = phoneMatch ? text.slice(0, phoneMatch.index) : text
  const candidates = beforePhone.split(/[\n,，;；|]+|\s{2,}/).map(cleanSegment).filter(Boolean)
  const direct = candidates.find(looksLikeContact)
  if (direct) return direct

  const words = beforePhone.split(/\s+/).map(cleanSegment).filter(Boolean)
  return words.find(looksLikeContact) || ''
}

function guessAddressName(address) {
  const text = cleanSegment(address)
  if (!text) return ''
  const markers = ['小区', '花园', '大厦', '广场', '中心', '公寓', '学校', '医院', '商场', '门店', '公司', '社区', '村', '苑', '府', '城']
  for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
    const marker = markers[markerIndex]
    const index = text.indexOf(marker)
    if (index < 0) continue
    const end = index + marker.length
    const prefix = text.slice(0, end)
    const separators = ['省', '市', '区', '县', '镇', '乡', '街道', '路', '街', '巷', '号']
    let start = 0
    separators.forEach((separator) => {
      const position = prefix.lastIndexOf(separator)
      if (position >= start) start = position + separator.length
    })
    const candidate = prefix.slice(start).replace(/^[\d-]+/, '').trim()
    if (candidate.length >= 2 && candidate.length <= 30) return candidate
  }
  return '手动地址'
}

function parseAddressText(value) {
  const text = normalizeText(value)
  if (!text) return { contact: '', phone: '', address: '', name: '' }

  const phoneMatch = text.match(PHONE_PATTERN)
  const phone = phoneMatch ? phoneMatch[0] : ''
  const contact = guessContact(text, phoneMatch)
  const labelledAddress = text.match(ADDRESS_LABEL)
  let address = labelledAddress ? cleanSegment(labelledAddress[1]) : ''

  if (!address) {
    let remainder = text
      .replace(CONTACT_LABEL, ' ')
      .replace(PHONE_PATTERN, ' ')
      .replace(/(?:联系电话|手机号码|手机号|手机|电话)\s*[:：]?/g, ' ')
      .replace(/(?:收货地址|详细地址|地址)\s*[:：]?/g, ' ')
    if (contact) remainder = remainder.replace(contact, ' ')
    const parts = remainder.split(/[\n,，;；|]+/).map(cleanSegment).filter(Boolean)
    const addressParts = parts.filter((part) => ADDRESS_HINT.test(part) || /\d/.test(part) || part.length > 8)
    address = cleanSegment((addressParts.length ? addressParts : parts).join(' '))
  }

  return {
    contact,
    phone,
    address,
    name: guessAddressName(address)
  }
}

module.exports = {
  guessAddressName,
  parseAddressText
}
