const CONTACT_LABEL = /(?:收货人|联系人|姓名)\s*[:：]?\s*([A-Za-z\u4e00-\u9fa5·]{1,20})/
const ADDRESS_LABELS = ['收货地址', '详细地址', '地址']
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

function findPhone(text) {
  const matcher = /\d(?:[\d -]*\d)?/g
  let match
  while ((match = matcher.exec(text))) {
    const digits = match[0].replace(/\D/g, '')
    const lengths = digits.length > 12 ? [12, 11] : [digits.length]
    for (const length of lengths) {
      if (![11, 12].includes(length)) continue
      const value = digits.slice(-length)
      if (!/^[10]/.test(value)) continue
      let seenDigits = 0
      let startOffset = 0
      while (startOffset < match[0].length && seenDigits < digits.length - length) {
        if (/\d/.test(match[0][startOffset])) seenDigits += 1
        startOffset += 1
      }
      const raw = match[0].slice(startOffset).trim()
      return {
        value,
        raw,
        index: match.index + startOffset
      }
    }
  }
  return null
}

function extractLabelValue(text, labels) {
  const labelPattern = labels.join('|')
  const trailingField = new RegExp(`\\s+(?:收货人|联系人|姓名|联系电话|手机号码|手机号|手机|电话|收货地址|详细地址|地址)\\s*[:：]?.*$`)
  const inline = text.match(new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*([^\\n]*)`))
  if (inline) {
    const value = cleanSegment(inline[1]).replace(trailingField, '').trim()
    if (value) return value
  }

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    const match = line.match(new RegExp(`^(?:${labelPattern})\\s*[:：]?\\s*(.*)$`))
    if (!match) continue
    const sameLine = cleanSegment(match[1])
    if (sameLine) return sameLine.replace(trailingField, '').trim()
    const nextLine = lines.slice(index + 1).find((item) => item.trim() && !/^(?:收货人|联系人|姓名|联系电话|手机号码|手机号|手机|电话|收货地址|详细地址|地址)\s*[:：]?/.test(item.trim()))
    if (nextLine) return cleanSegment(nextLine)
  }
  return ''
}

function looksLikeContact(value) {
  const text = cleanSegment(value)
  return /^[A-Za-z\u4e00-\u9fa5·]{1,12}$/.test(text) && !ADDRESS_HINT.test(text)
}

function guessContact(text, phoneMatch) {
  const labelled = text.match(CONTACT_LABEL)
  if (labelled) return cleanSegment(labelled[1])

  const beforePhone = phoneMatch ? text.slice(0, phoneMatch.index) : text
  const candidates = beforePhone.split(/[\n,，;；|]+|\s+|[^A-Za-z\u4e00-\u9fa5·]+/).map(cleanSegment).filter(Boolean)
  const direct = candidates.find(looksLikeContact)
  if (direct) return direct

  const words = beforePhone.split(/\s+/).map(cleanSegment).filter(Boolean)
  return words.find(looksLikeContact) || ''
}

function stripPhone(text, phoneMatch) {
  if (!phoneMatch) return text
  return `${text.slice(0, phoneMatch.index)} ${text.slice(phoneMatch.index + phoneMatch.raw.length)}`
}

function guessAddressName(address) {
  const text = cleanSegment(address)
  if (!text) return ''
  const markers = ['小区', '家园', '花园', '大厦', '广场', '中心', '公寓', '学校', '医院', '商场', '门店', '公司', '社区', '村', '苑', '园', '府']
  let best = ''
  for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
    const marker = markers[markerIndex]
    const index = text.indexOf(marker)
    if (index < 0) continue
    const end = index + marker.length
    const prefix = text.slice(0, end)
    const separatorSource = text.slice(0, index)
    const separators = ['省', '市', '区', '县', '镇', '乡', '街道', '路', '街', '巷', '号']
    const start = separators.reduce((latest, separator) => {
      const position = separatorSource.lastIndexOf(separator)
      return position >= 0 && position + separator.length > latest ? position + separator.length : latest
    }, 0)
    const candidate = prefix.slice(start).replace(/^[\d-]+/, '').trim()
    if (candidate.length >= 2 && candidate.length <= 30) best = candidate
  }
  return best || '手动地址'
}

function parseAddressText(value) {
  const text = normalizeText(value)
  if (!text) return { contact: '', phone: '', address: '', name: '' }

  const phoneMatch = findPhone(text)
  const phone = phoneMatch ? phoneMatch.value : ''
  const contact = guessContact(text, phoneMatch)
  let address = extractLabelValue(text, ADDRESS_LABELS)

  if (!address) {
    let remainder = stripPhone(text, phoneMatch)
      .replace(CONTACT_LABEL, ' ')
      .replace(/(?:联系电话|手机号码|手机号|手机|电话)\s*[:：]?/g, ' ')
      .replace(/(?:收货地址|详细地址|地址)\s*[:：]?/g, ' ')
    if (contact) remainder = remainder.replace(contact, ' ')
    const parts = remainder
      .split(/[\n,，;；|]+|[^A-Za-z\u4e00-\u9fa5·0-9\s.-]+/)
      .map(cleanSegment)
      .filter(Boolean)
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
