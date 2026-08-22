const CONTACT_LABELS = ['收货人', '收件人', '联系人', '姓名', '收货姓名', '联系人姓名']
const PHONE_LABELS = ['联系电话', '联系电话号码', '手机号码', '手机号', '手机', '电话', '收货人电话', '联系人电话']
const ADDRESS_LABELS = ['收货地址', '收件地址', '送货地址', '配送地址', '收货地点', '详细地址', '地址']
const ALL_FIELD_LABELS = [...new Set([...CONTACT_LABELS, ...PHONE_LABELS, ...ADDRESS_LABELS])]
const FIELD_LINE_RE = new RegExp(`^(?:${ALL_FIELD_LABELS.join('|')})\\s*[:：]?\\s*`)
const CONTACT_LABEL_RE = new RegExp(`(?:${CONTACT_LABELS.join('|')})\\s*[:：]?\\s*([A-Za-z\\u4e00-\\u9fa5·]{1,20})`)
const ADDRESS_HINT = /(省|市|区|县|镇|乡|街道|路|街|巷|号|小区|花园|大厦|广场|公寓|苑|府|城|村|社区|学校|医院|商场|门店|公司|楼|栋|单元|室)/

function normalizeDigits(value) {
  return String(value || '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
}

function normalizeText(value) {
  return normalizeDigits(value)
    .replace(/[\r\u2028\u2029]/g, '\n')
    .replace(/[\t\u00a0\u3000]+/g, ' ')
    .replace(/[﹕：]/g, ':')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function cleanSegment(value) {
  return String(value || '')
    .replace(new RegExp(`^(?:${ALL_FIELD_LABELS.join('|')})\\s*[:：]?\\s*`), '')
    .replace(/^[,，;；|\s]+|[,，;；|\s]+$/g, '')
    .trim()
}

function extractLabelValue(text, labels) {
  const labelPattern = labels.join('|')
  const trailingField = new RegExp(`\\s+(?:${ALL_FIELD_LABELS.join('|')})\\s*[:：]?.*$`)
  const valueFrom = (raw) => cleanSegment(raw).replace(trailingField, '').trim()
  const lines = text.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    const match = line.match(new RegExp(`^(?:${labelPattern})\\s*[:：]?\\s*(.*)$`))
    if (!match) continue
    const sameLine = valueFrom(match[1])
    if (sameLine) return sameLine
    const nextLine = lines.slice(index + 1).find((item) => item.trim() && !FIELD_LINE_RE.test(item.trim()))
    if (nextLine) return valueFrom(nextLine)
  }

  const inline = text.match(new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*([^\\n]*)`))
  return inline ? valueFrom(inline[1]) : ''
}

function findPhone(text) {
  const labelled = extractLabelValue(text, PHONE_LABELS)
  const labelledDigits = normalizeDigits(labelled).replace(/\D/g, '')
  if (/^(?:1\d{10}|0\d{11})$/.test(labelledDigits)) {
    return { value: labelledDigits, raw: labelled, index: text.indexOf(labelled) }
  }

  const matcher = /(?:\+?86[\s-]*)?\d(?:[\d\s-]*\d)?/g
  let match
  while ((match = matcher.exec(text))) {
    const digits = match[0].replace(/\D/g, '')
    for (const length of [11, 12]) {
      if (digits.length < length) continue
      const value = digits.slice(-length)
      if (!/^(?:1\d{10}|0\d{11})$/.test(value)) continue
      let seenDigits = 0
      let startOffset = 0
      while (startOffset < match[0].length && seenDigits < digits.length - length) {
        if (/\d/.test(match[0][startOffset])) seenDigits += 1
        startOffset += 1
      }
      return { value, raw: match[0].slice(startOffset).trim(), index: match.index + startOffset }
    }
  }
  return null
}

function looksLikeContact(value) {
  const text = cleanSegment(value)
  return /^[A-Za-z\u4e00-\u9fa5·]{1,12}$/.test(text) && !ADDRESS_HINT.test(text)
}

function guessContact(text, phoneMatch) {
  const labelled = extractLabelValue(text, CONTACT_LABELS)
  if (looksLikeContact(labelled)) return labelled
  const beforePhone = phoneMatch ? text.slice(0, phoneMatch.index) : text
  const candidates = beforePhone
    .split(/[\n,，;；|]+|\s+|[^A-Za-z\u4e00-\u9fa5·]+/)
    .map(cleanSegment)
    .filter(Boolean)
  return candidates.find(looksLikeContact) || ''
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
  for (const marker of markers) {
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
  if (!text) return { contact: '', phone: '', address: '', name: '', missingFields: ['联系人', '手机号', '地址'], missingText: '联系人、手机号和地址', complete: false }

  const phoneMatch = findPhone(text)
  const phone = phoneMatch ? phoneMatch.value : ''
  const contact = guessContact(text, phoneMatch)
  let address = extractLabelValue(text, ADDRESS_LABELS)

  if (!address) {
    let remainder = stripPhone(text, phoneMatch)
      .replace(CONTACT_LABEL_RE, ' ')
      .replace(new RegExp(`(?:${PHONE_LABELS.join('|')})\\s*[:：]?`, 'g'), ' ')
      .replace(new RegExp(`(?:${ADDRESS_LABELS.join('|')})\\s*[:：]?`, 'g'), ' ')
    if (contact) remainder = remainder.replace(contact, ' ')
    const parts = remainder
      .split(/[\n,，;；|]+|[^A-Za-z\u4e00-\u9fa5·0-9\s.-]+/)
      .map(cleanSegment)
      .filter(Boolean)
    const addressParts = parts.filter((part) => ADDRESS_HINT.test(part) || /\d/.test(part) || part.length > 8)
    address = cleanSegment((addressParts.length ? addressParts : parts).join(' '))
  }

  const missingFields = []
  if (!contact) missingFields.push('联系人')
  if (!phone) missingFields.push('手机号')
  if (!address) missingFields.push('地址')
  return { contact, phone, address, name: guessAddressName(address), missingFields, missingText: missingFields.join('、'), complete: missingFields.length === 0 }
}

module.exports = { guessAddressName, parseAddressText }
