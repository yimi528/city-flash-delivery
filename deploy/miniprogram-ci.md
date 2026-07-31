# miniprogram-ci 发布说明

`xian` 的用户端和骑手端共用 `apps/customer-mp` 下的同一个微信小程序和 AppID。
仓库根目录的 `project.config.json` 是微信开发者工具项目入口，它的
`miniprogramRoot` 指向 `apps/customer-mp/`，因此 CI 也必须以仓库根目录作为
`miniprogram-ci` 的 `projectPath`。

## 本地预览

先从微信公众平台的「开发管理 → 开发设置 → 小程序代码上传」下载代码上传密钥，
再通过环境变量提供密钥路径：

```bash
WECHAT_PRIVATE_KEY_PATH=/secure/path/private.key \\
WECHAT_VERSION=1.0.0 \\
npm run miniprogram:preview
```

本机如果使用 Downloads 中的密钥，可以直接执行：

```bash
WECHAT_PRIVATE_KEY_PATH=/Users/Admin1/Downloads/private.wx9243db2c195c61b6.key \\
WECHAT_VERSION=1.0.0 \\
npm run miniprogram:preview
```

密钥文件应保持 `600` 权限；不要复制进仓库，也不要把它写入配置文件。

二维码默认写入仓库根目录的 `mini-program-preview.jpg`，该文件不应提交到 Git。

## GitHub Actions

工作流文件为 `.github/workflows/miniprogram-release.yml`，通过 GitHub Actions 的
`workflow_dispatch` 手动触发。项目会自动读取根目录 `project.config.json` 中的 AppID，
因此只需要设置以下仓库 Secret：

- `WECHAT_PRIVATE_KEY`：微信代码上传密钥完整内容。

建议只允许固定出口 IP 的自托管 Runner 访问微信上传接口，并在微信公众平台配置 IP
白名单。若使用 GitHub 托管 Runner，出口 IP 可能变化，不能把上传密钥当作普通密码长期
暴露在不受控环境中。

## 发布顺序

1. 先部署 API 和商家后台，并确认 API 健康检查通过；
2. 确认 `apps/customer-mp/config/runtime.js` 中 `trial`、`release` 使用备案后的 HTTPS API；
3. 在 Actions 中选择 `preview` 生成体验二维码；
4. 完成用户端、骑手端、登录和订单流程验证后，再选择 `upload` 上传版本。

`miniprogram-ci` 只负责小程序预览和上传，不负责 Sealos、NestJS、PostgreSQL、Redis
或商家后台的部署。
