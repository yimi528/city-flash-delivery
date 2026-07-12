const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

let requestHandler = null
let paymentHandler = null

global.wx = {
  request(options) {
    requestHandler(options)
  },
  requestPayment(options) {
    paymentHandler(options)
  }
}

global.getApp = () => ({
  globalData: {
    apiBaseUrl: 'http://127.0.0.1:3000/api',
    appRole: 'customer',
    authToken: 'signed-customer-token'
  }
})

const api = require(path.resolve(__dirname, '../utils/api.js'))

test('WeChat login sends the temporary code and profile to the backend', async () => {
  requestHandler = (options) => {
    assert.match(options.url, /\/auth\/wechat-login$/)
    assert.equal(options.method, 'POST')
    assert.equal(options.data.code, 'wx-code')
    assert.equal(options.data.nickname, '测试用户')
    options.success({ statusCode: 200, data: { token: 'token', user: { id: 'user-1' } } })
  }

  const result = await api.wechatLogin({ code: 'wx-code', userInfo: { nickName: '测试用户' } })
  assert.equal(result.user.id, 'user-1')
})

test('payment requests include the bearer token and confirm development mock payments', async () => {
  const paths = []
  requestHandler = (options) => {
    paths.push(options.url)
    assert.equal(options.header.Authorization, 'Bearer signed-customer-token')
    if (options.url.endsWith('/prepay')) {
      options.success({ statusCode: 200, data: { mode: 'mock', orderId: 'order-1' } })
      return
    }
    assert.match(options.url, /\/mock-confirm$/)
    options.success({ statusCode: 200, data: { paymentStatus: 'PAID' } })
  }

  const payment = await api.createWechatPayment('order-1')
  const result = await api.requestWechatPayment(payment)

  assert.equal(result.paymentStatus, 'PAID')
  assert.equal(paths.length, 2)
})

test('real JSAPI payment parameters are passed to wx.requestPayment', async () => {
  paymentHandler = (options) => {
    assert.equal(options.timeStamp, '100')
    assert.equal(options.nonceStr, 'nonce')
    assert.equal(options.package, 'prepay_id=wx123')
    assert.equal(options.signType, 'RSA')
    assert.equal(options.paySign, 'signature')
    options.success({ errMsg: 'requestPayment:ok' })
  }

  const result = await api.requestWechatPayment({
    mode: 'wechat',
    params: {
      timeStamp: '100',
      nonceStr: 'nonce',
      package: 'prepay_id=wx123',
      signType: 'RSA',
      paySign: 'signature'
    }
  })

  assert.equal(result.errMsg, 'requestPayment:ok')
})

test('customer order status follows quote, payment, then fulfillment lifecycle', () => {
  const awaitingPayment = api.normalizeOrder({
    id: 'order-quote',
    status: 'PENDING',
    isManualQuote: true,
    quoteStatus: 'ACCEPTED',
    paymentStatus: 'UNPAID'
  })
  const awaitingAcceptance = api.normalizeOrder({
    id: 'order-paid',
    status: 'PENDING',
    isManualQuote: true,
    quoteStatus: 'ACCEPTED',
    paymentStatus: 'PAID'
  })

  assert.equal(awaitingPayment.displayStatus, '待支付')
  assert.equal(awaitingPayment.eta, '请完成支付后安排服务')
  assert.equal(awaitingPayment.rider, '等待用户支付')
  assert.equal(awaitingAcceptance.displayStatus, '待接单')
})

test('customer progress labels match the selected service', () => {
  const moving = api.normalizeOrder({
    id: 'moving-order',
    serviceName: '搬运装卸',
    status: 'PICKING_UP',
    paymentStatus: 'PAID'
  })
  const passenger = api.normalizeOrder({
    id: 'passenger-order',
    serviceName: '拼车',
    status: 'DELIVERING',
    paymentStatus: 'PAID'
  })

  assert.equal(moving.status, '取货中')
  assert.equal(moving.displayStatus, '上门途中')
  assert.equal(moving.statusIndex, 3)
  assert.equal(passenger.status, '配送中')
  assert.equal(passenger.displayStatus, '行程中')
  assert.equal(passenger.statusIndex, 4)
})
