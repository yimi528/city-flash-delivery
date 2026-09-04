const fs = require('node:fs')
const path = require('node:path')
const ci = require('miniprogram-ci')

const repoRoot = path.resolve(__dirname, '..')
const configPath = path.join(repoRoot, 'project.config.json')
const projectConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const miniProgramConfigPath = path.join(repoRoot, 'apps/customer-mp/project.config.json')
const miniProgramConfig = JSON.parse(fs.readFileSync(miniProgramConfigPath, 'utf8'))

if (!projectConfig.appid || projectConfig.appid !== miniProgramConfig.appid) {
  throw new Error('根目录与 apps/customer-mp 的 AppID 不一致，已停止上传')
}

const action = process.env.WECHAT_ACTION || 'preview'
const version = process.env.WECHAT_VERSION
const privateKeyPath = process.env.WECHAT_PRIVATE_KEY_PATH
const qrcodeOutputDest = process.env.WECHAT_QRCODE_PATH || path.join(repoRoot, 'mini-program-preview.jpg')

if (!['preview', 'upload', 'validate'].includes(action)) {
  throw new Error('WECHAT_ACTION 必须是 preview、upload 或 validate')
}

if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('WECHAT_VERSION 必须是合法版本号，例如 1.0.0')
}

if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
  throw new Error('缺少有效的 WECHAT_PRIVATE_KEY_PATH；不要把微信上传密钥提交到仓库')
}

const project = new ci.Project({
  appid: process.env.WECHAT_APPID || projectConfig.appid,
  type: 'miniProgram',
  // 根目录是微信开发者工具的正式项目目录，project.config.json 再指向 apps/customer-mp。
  projectPath: repoRoot,
  privateKeyPath,
  ignores: [
    'node_modules/**/*',
    '.git/**/*',
    'server/**/*',
    'apps/merchant-web/**/*',
    'deploy/**/*',
    'docs/**/*',
    'work/**/*',
    'outputs/**/*',
    '.qa_*/*'
  ]
})

const commonOptions = {
  project,
  version,
  desc: process.env.WECHAT_DESCRIPTION || `xian ${version}`,
  robot: Number(process.env.WECHAT_ROBOT || 1),
  setting: {
    es6: true,
    minify: true,
    minifyJS: true,
    minifyWXML: true,
    minifyWXSS: true
  },
  onProgressUpdate: (progress) => {
    if (progress && progress.phase) {
      console.log(`[miniprogram-ci] ${progress.phase}`)
    }
  }
}

async function main() {
  const remoteProject = await project.attr()
  if (remoteProject && remoteProject.appid && remoteProject.appid !== projectConfig.appid) {
    throw new Error(`上传密钥对应的 AppID 与项目不一致：${remoteProject.appid}`)
  }
  console.log(`[miniprogram-ci] AppID 已校验：${projectConfig.appid}`)

  if (action === 'validate') {
    console.log('[miniprogram-ci] 上传密钥与远端项目属性校验完成')
    return
  }

  if (action === 'preview') {
    fs.mkdirSync(path.dirname(qrcodeOutputDest), { recursive: true })
    await ci.preview({
      ...commonOptions,
      qrcodeFormat: 'image',
      qrcodeOutputDest
    })
    console.log(`[miniprogram-ci] 预览二维码已生成：${qrcodeOutputDest}`)
    return
  }

  await ci.upload(commonOptions)
  console.log(`[miniprogram-ci] 小程序 ${version} 上传完成`)
}

main().catch((error) => {
  console.error('[miniprogram-ci] 执行失败')
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 1
})
