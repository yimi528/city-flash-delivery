# miniprogram-ci 发布说明

用户端和骑手端共用 `apps/customer-mp` 下的同一个微信小程序和 AppID `wxee631108a5a95efc`。
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
3. `apps/customer-mp/config/runtime.js` 中的 `WX_CLOUD_PROD_ENV_ID` 同时供体验版和正式版使用；`WX_CLOUD_TEST_ENV_ID` 仅保留给开发联调或后续显式切换；
4. 在 Actions 中选择 `upload` 上传小程序代码；
5. 上传成功后，在微信公众平台开发管理中将该版本设置为体验版，再进行用户端、骑手端、登录和订单流程验证。

运行时规则：`develop` 默认使用本地 Docker/本地数据库，开发联调时可通过 `developerApiBaseUrl` 或专门的测试配置切换到 `test`；`trial` 和 `release` 均使用客户正式云托管环境。体验版产生的订单、支付和业务数据都属于生产数据。

注意不要混淆两个维度：`develop`、`trial`、`release` 是小程序版本通道；本机、`test`、`prod` 是 API/云托管运行环境。当前映射为 `develop → 本机`、`trial → prod`、`release → prod`。切换小程序版本不会自动切换云托管环境，修改云托管环境也不会自动改变已上传的小程序版本。

商家后台也按云托管环境分配公网域名。`test` 和 `prod` 的 API 域名、商家后台域名原则上不同；商家后台构建时必须把 `VITE_API_BASE_URL` 指向同一环境的 API，API 的 `CORS_ORIGINS` 也必须登记同一环境的商家域名。当前生产地址记录在 [`docs/deploy-wxcloud.md`](../docs/deploy-wxcloud.md)；测试地址以对应云托管服务详情为准。

GitHub Actions 当前只执行上传，不生成或保存预览二维码。若需要本地预览二维码，仍可使用上面的
`npm run miniprogram:preview` 命令。

`miniprogram-ci` 只负责小程序预览和上传；微信云托管 API、MySQL 和商家后台的部署见
[`docs/deploy-wxcloud.md`](../docs/deploy-wxcloud.md)。
