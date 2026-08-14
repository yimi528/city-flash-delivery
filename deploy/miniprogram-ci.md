# miniprogram-ci 发布说明

用户端和骑手端共用 `apps/customer-mp` 下的同一个微信小程序和 AppID `wx4878475053d6a722`。
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
WECHAT_PRIVATE_KEY_PATH=/secure/path/miniprogram-upload.private.key \\
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

1. 本机开发版使用本地 API 和本地 MySQL，不会初始化微信云托管环境；
2. 先部署微信云托管 API 和商家后台，并确认 API 健康检查通过；
3. `apps/customer-mp/config/runtime.js` 中的 `WX_CLOUD_TEST_ENV_ID` 供体验版使用；正式上线前必须填写独立的 `WX_CLOUD_PROD_ENV_ID`；
4. 在 Actions 中选择 `upload` 上传小程序代码；
5. 上传成功后，在微信公众平台开发管理中将该版本设置为体验版，再进行用户端、骑手端、登录和订单流程验证。

运行时隔离规则：`develop` 使用本地 Docker/本地数据库，`trial` 使用当前云托管测试环境，`release` 只有在配置独立生产环境 ID 后才会访问云托管。真机开发版如需访问本机 API，可继续使用 `developerApiBaseUrl` 临时覆盖本机局域网地址。

GitHub Actions 当前只执行上传，不生成或保存预览二维码。若需要本地预览二维码，仍可使用上面的
`npm run miniprogram:preview` 命令。

`miniprogram-ci` 只负责小程序预览和上传；微信云托管 API、MySQL 和商家后台的部署见
[`docs/deploy-wxcloud.md`](../docs/deploy-wxcloud.md)。
