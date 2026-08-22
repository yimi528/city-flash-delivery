function navigationOptions(options) {
  // Keep the platform's normal page transition. Disabling it can leave the
  // previous page's backing surface visible while fixed elements from the new
  // page are already composited in the DevTools simulator.
  return Object.assign({}, options || {})
}

function navigateTo(runtime, options) {
  return runtime.navigateTo(navigationOptions(options))
}

function redirectTo(runtime, options) {
  return runtime.redirectTo(navigationOptions(options))
}

function afterVisible(callback) {
  const run = () => setTimeout(callback, 0)
  const runtime = typeof wx === 'undefined' ? null : wx
  if (runtime && typeof runtime.nextTick === 'function') {
    runtime.nextTick(run)
    return
  }
  run()
}

module.exports = {
  navigateTo,
  redirectTo,
  afterVisible
}
