const test = require('node:test')
const assert = require('node:assert/strict')

const { parseAddressText } = require('../utils/address-parser')

test('recognizes a shopping-style pasted contact, mobile number and address', () => {
  const result = parseAddressText('张三 13800138000 福建省宁德市福鼎市桐城街道恒生一品苑2单元301')

  assert.equal(result.contact, '张三')
  assert.equal(result.phone, '13800138000')
  assert.match(result.address, /恒生一品苑2单元301/)
  assert.equal(result.name, '恒生一品苑')
})

test('recognizes labelled multiline receiver information', () => {
  const result = parseAddressText('收货人：李小明\n电话：13912345678\n收货地址：福建省宁德市福鼎市太姥山镇海滨花园6栋802')

  assert.equal(result.contact, '李小明')
  assert.equal(result.phone, '13912345678')
  assert.equal(result.address, '福建省宁德市福鼎市太姥山镇海滨花园6栋802')
  assert.equal(result.name, '海滨花园')
})

test('recognizes multiline smart-fill text with a separated address line and formatted phone', () => {
  const result = parseAddressText('姓名：王小宁\n手机号：138 0013 8000\n地址：\n福建省宁德市福鼎市桐城街道锦绣家园3栋2单元901')

  assert.equal(result.contact, '王小宁')
  assert.equal(result.phone, '13800138000')
  assert.equal(result.address, '福建省宁德市福鼎市桐城街道锦绣家园3栋2单元901')
  assert.equal(result.name, '锦绣家园')
})

test('recognizes 11 or 12 digits starting with 1 or 0 as a phone, including an address-adjacent tail', () => {
  const result = parseAddressText('砖头🧱火星市哈迪斯社区66栋60311451448990')

  assert.equal(result.contact, '砖头')
  assert.equal(result.phone, '11451448990')
  assert.equal(result.address, '火星市哈迪斯社区66栋603')
  assert.equal(result.name, '哈迪斯社区')

  const twelveDigits = parseAddressText('联系人：王五\n电话：012345678901\n地址：福州市鼓楼区软件园A区1号')
  assert.equal(twelveDigits.phone, '012345678901')
})

test('recognizes common delivery labels, full-width digits and partial information', () => {
  const result = parseAddressText('收件人：陈小美\n联系电话：１３８ ００１３ ８０００\n送货地址：福建省福鼎市桐城街道锦绣家园5栋802')

  assert.equal(result.contact, '陈小美')
  assert.equal(result.phone, '13800138000')
  assert.equal(result.address, '福建省福鼎市桐城街道锦绣家园5栋802')
  assert.equal(result.complete, true)
  assert.deepEqual(parseAddressText('联系人：陈小美').missingFields, ['手机号', '地址'])
})
