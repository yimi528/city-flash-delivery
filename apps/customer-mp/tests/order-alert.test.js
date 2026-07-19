const assert = require('node:assert/strict')
const test = require('node:test')

test('new-order alert creates one short local sound and reuses it', () => {
  let written = null
  let playCount = 0
  let destroyCount = 0
  global.wx = {
    env: { USER_DATA_PATH: '/mock-user-data' },
    getFileSystemManager: () => ({
      accessSync() { throw new Error('missing') },
      writeFileSync(path, data) { written = { path, data } }
    }),
    setInnerAudioOption() {},
    createInnerAudioContext: () => ({
      autoplay: false,
      loop: false,
      volume: 1,
      src: '',
      stop() {},
      seek() {},
      play() { playCount += 1 },
      destroy() { destroyCount += 1 }
    })
  }

  const { createOrderAlert } = require('../utils/order-alert')
  const alert = createOrderAlert()
  assert.equal(alert.play(), true)
  assert.equal(alert.play(), true)
  assert.equal(written.path, '/mock-user-data/new-order-alert.wav')
  assert.ok(written.data instanceof ArrayBuffer)
  assert.ok(written.data.byteLength > 2000)
  assert.equal(playCount, 2)
  alert.destroy()
  assert.equal(destroyCount, 1)
})
