const test = require('node:test')
const assert = require('node:assert/strict')
const navigation = require('../utils/navigation')

test('navigation keeps the platform transition options intact', () => {
  const calls = []
  const runtime = {
    navigateTo(options) {
      calls.push(['navigateTo', options])
      return 'navigate-result'
    },
    redirectTo(options) {
      calls.push(['redirectTo', options])
      return 'redirect-result'
    }
  }
  const navigateOptions = { url: '/pages/order-create/order-create', animationDuration: 180 }
  const redirectOptions = { url: '/pages/order-detail/order-detail?id=1' }

  assert.equal(navigation.navigateTo(runtime, navigateOptions), 'navigate-result')
  assert.equal(navigation.redirectTo(runtime, redirectOptions), 'redirect-result')
  assert.deepEqual(calls, [
    ['navigateTo', navigateOptions],
    ['redirectTo', redirectOptions]
  ])
})
