# miniprogram-ci 发布说明

用户端和骑手端共用 `apps/customer-mp` 下的同一个微信小程序和 AppID `wxee631108a5a95efc`。
仓库根目录的 `project.config.json` 是微信开发者工具项目入口，它的
`miniprogramRoot` 指向 `apps/customer-mp/`，因此 CI 也必须以仓库根目录作为
`miniprogram-ci` 的 `projectPath`。

## 本地预览

先从微信公众平台的「开发管理 → 开发设置 → 小程序代码上传」下载当前 AppID 的代码上传密钥，
再通过环境变量提供密钥路径。代码上传密钥不是微信云托管 CLI 私钥，也不是微信支付私钥：

```bash
WECHAT_PRIVATE_KEY_PATH=/secure/path/private.key \\
WECHAT_VERSION=<next-version> \\
npm run miniprogram:preview
```

本机如果使用 Downloads 中的密钥，可以直接执行：

```bash
WECHAT_PRIVATE_KEY_PATH=/secure/path/miniprogram-upload.private.key \\
WECHAT_VERSION=<next-version> \\
npm run miniprogram:preview
```

密钥文件应保持 `600` 权限；不要复制进仓库，也不要把它写入配置文件。

`miniprogram-ci@2.1.31` 的本地上传使用 Node 22–24；如果系统 Node 更高，先切换到兼容运行时再执行上传脚本。脚本会在编译前校验根目录与 `apps/customer-mp/project.config.json` 的 AppID，并向微信项目属性接口校验密钥是否属于该 AppID。

二维码默认写入仓库根目录的 `mini-program-preview.jpg`，该文件不应提交到 Git。

## GitHub Actions

工作流文件为 `.github/workflows/miniprogram-release.yml`，由
`.github/workflows/wxcloud-deploy.yml` 在手动发布 tag 并通过云托管健康检查后调用。工作流自动将 Git 发布标签
`vX.Y.Z` 解析为微信所需的 `X.Y.Z` 版本号，并校验 tag 指向当前发布提交。项目会自动读取根目录
`project.config.json` 中的 AppID，因此只需要设置以下仓库 Secret：

- `WECHAT_PRIVATE_KEY`：微信代码上传密钥完整内容。

仓库当前工作流使用 GitHub 托管 Runner；其出口 IP 会变化，本次验证采用关闭微信公众平台
「小程序代码上传 IP 白名单」的配置。如果必须启用白名单，应先切换到具有固定出口 IP 的自托管
Runner，再将该固定 IP 加入白名单；不要把某一次 GitHub 托管 Runner 的 IP 当作长期配置。
上传密钥仍只放在 GitHub Secret `WECHAT_PRIVATE_KEY` 中，绝不写入仓库。

## 发布顺序

1. 本机开发版使用本地 API 和本地 MySQL，不会初始化微信云托管环境；
2. 质量检查通过后，将代码推送到 `main`，创建并推送指向该提交的 `vX.Y.Z` tag；
3. 先部署微信云托管 API 和商家后台，并确认 API 健康检查通过；
4. `apps/customer-mp/config/runtime.js` 中的 `WX_CLOUD_PROD_ENV_ID` 同时供体验版和正式版使用；`WX_CLOUD_TEST_ENV_ID` 仅保留给开发联调或后续显式切换；
5. 推送 `vX.Y.Z` tag 后，发布工作流自动解析版本并上传小程序代码；
6. 上传成功后，在微信公众平台开发管理中将该版本设置为体验版，再进行用户端、骑手端、登录和订单流程验证。

运行时规则：`develop` 在微信开发者工具内默认使用本地 Docker/本地数据库，开发联调时可通过 `developerApiBaseUrl` 或专门的测试配置切换到 `test`；`develop` 的真机、预览和审核容器，以及 `trial`、`release`，一律使用客户正式云托管环境。本机地址（`http://127.0.0.1`）只允许开发者工具请求，其他环境回落到它会被微信以 `request:fail url not in domain list` 拒绝。体验版产生的订单、支付和业务数据都属于生产数据。

注意不要混淆两个维度：`develop`、`trial`、`release` 是小程序版本通道；本机、`test`、`prod` 是 API/云托管运行环境。当前映射为：微信开发者工具内的 `develop → 本机`，真机、预览、审核容器与 `trial`、`release → prod`。当前已上传版本为 `1.0.10`；下一次上传必须使用更高版本号。

商家后台也按云托管环境分配公网域名。`test` 和 `prod` 的 API 域名、商家后台域名原则上不同；商家后台构建时必须把 `VITE_API_BASE_URL` 指向同一环境的 API，API 的 `CORS_ORIGINS` 也必须登记同一环境的商家域名。当前生产地址记录在 [`docs/deploy-wxcloud.md`](../docs/deploy-wxcloud.md)；测试地址以对应云托管服务详情为准。

GitHub Actions 中的小程序子工作流只执行上传，不生成或保存预览二维码。若需要本地预览二维码，仍可使用上面的
`npm run miniprogram:preview` 命令。

工作流不提供静态默认版本，避免重复上传过期版本；版本号来自本次 `release_tag`，并且必须高于微信平台当前版本。同一时间只允许一个上传任务运行。若上传失败，
工作流会在失败步骤后打印 Runner 出口 IP，便于判断微信返回的 `invalid ip` 是否来自上传白名单。

`miniprogram-ci` 只负责小程序预览和上传；微信云托管 API、MySQL 和商家后台的部署见
[`docs/deploy-wxcloud.md`](../docs/deploy-wxcloud.md)。
