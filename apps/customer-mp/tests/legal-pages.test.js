const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('legal and qualification pages are registered and reachable from profile', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const profile = fs.readFileSync(path.join(root, 'pages/profile/profile.js'), 'utf8')
  const legal = fs.readFileSync(path.join(root, 'pages/legal/legal.js'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/legal/legal'))
  assert.match(profile, /type=terms/)
  assert.match(profile, /type=qualification/)
  assert.match(legal, /隐私政策/)
  assert.match(legal, /待配置：网站 ICP 备案号及小程序\/App 备案号/)
})
