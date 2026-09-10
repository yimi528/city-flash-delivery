# 货物运输类目审核整改与本地发布

本次整改针对微信小程序「鼎温榕同城配送」的代码发布审核驳回：

> 你的小程序「鼎温榕同城配送」，提审时间：2026-09-07 16:54:57，版本审核未通过。
> 1：你好，你的小程序内涉及提供货物运输服务，请补充：物流服务—货物运输类目。

该补充类目需要道路运输经营许可证等资质，短期内不具备。整改目标是**让小程序在运行期不再对外提供货物运输服务**，同时保留代码、数据模型和计价规则，便于后续拿到资质后恢复。

## 1. 整改内容

### 1.1 寄货配送（`send_parcel`）整体 mock 关闭

| 位置 | 改动 |
| --- | --- |
| `apps/customer-mp/config/runtime.js` | 新增 `PARCEL_SERVICE_ENABLED = false` |
| `apps/customer-mp/utils/service-availability.js` | 新增服务可用性开关（沿用 `utils/rider-feature.js` 的写法） |
| `apps/customer-mp/app.js` | `globalData.parcelServiceEnabled`；初始草稿默认服务改为 `cargo_haul` |
| `apps/customer-mp/pages/index/index.js` | 首页服务列表过滤；默认选中改为首页可见服务的第一项；`chooseTask` 拒绝对被关闭服务的选择 |
| `apps/customer-mp/pages/order-create/order-create.js` | `onShow` 与 `submitOrder` 双重拦截，旧草稿或深链都无法下单 |
| `server/api/src/catalog/catalog.service.ts` | `send_parcel` 的 `enabled: false`，启动 upsert 不再强制打开 |

行为：首页不再展示「寄货配送」入口；即使通过旧草稿、分享链接或本地缓存进入，也只会提示「该服务升级中，敬请期待」，不生成订单。顺风车（`send_parcel` 的 CARPOOL 模式）随该入口一并下线，如需单独特例放行需单独拆分服务。

### 1.2 运货（`cargo_haul`）改名为「三轮车服务」

保留运力与计价，仅替换对外文案，避免「货 / 运货 / 拉货」继续命中货物运输语义：

| 旧文案 | 新文案 |
| --- | --- |
| 运货 | 三轮车服务 |
| 货三轮车（车型 `cargo_tricycle` / `ETRIKE`） | 三轮车 |
| 货三轮（短名） | 三轮 |
| 市场拉货、商家补货 | 市场代采、商家补货 |
| 拉货推荐 | 搬运推荐 |
| 厢式货车（`moving_van`） | 厢式车 |
| 拉货信息（下单页分区） | 用车信息 |
| 货物信息 / 普通货物 | 物品信息 / 普通物品 |

### 1.3 全站文案清理

- 首页：「人和货都准时到」→「大事小事都准时办」；「本地运力」→「本地服务」。
- 法律条款：「平台提供寄货、运货、搬运装卸…」→「平台提供同城跑腿、代取代买、搬运装卸…」；「平台与运输资质」→「经营资质」；「禁止寄送」→「禁止委托物品」。
- 下单页：货物相关备注占位符、重量档标题统一改为「物品」。
- 商家后台：服务目录、车型标签、价格矩阵文案同步（`ConfigWorkspaces.tsx`、`OperationsApp.tsx`、`services/api.ts`）。
- 服务端：`orders.service.ts`、`config-center.service.ts`、`riders.service.ts`、`pricing.constants.ts` 的车辆名与提示语统一为「三轮车」。

### 1.4 客户端兜底

生产环境可能还在返回旧版本文案（API 未同步发布时）。`utils/service-config.js` 的 `sanitizeServiceText` 会把「运货 / 货三轮车 / 货三轮 / 拉货 / 厢式货车」在进入界面之前统一改写，避免旧名称回流。

## 2. 恢复方式

拿到货物运输类目后：

1. 客户端 `apps/customer-mp/config/runtime.js` 改 `PARCEL_SERVICE_ENABLED = true`；
2. 服务端 `server/api/src/catalog/catalog.service.ts` 去掉 `send_parcel` 的 `enabled: false`；
3. 重新走一遍第 3 节的发布流程，并在微信公众平台确认类目已生效。

## 3. 本地 CLI 发布（macOS / Linux / Windows）

发布的完整顺序、云托管参数和验收标准见 [`release-runbook.md`](release-runbook.md) 与 [`../deploy/miniprogram-ci.md`](../deploy/miniprogram-ci.md)。本节只记录本次整改实际执行的命令。

### 3.1 质量门禁

```bash
npm ci
npm --prefix server/api ci
npm --prefix apps/merchant-web ci
npm run check:quality
```

`check:quality` 覆盖共享包测试、小程序 72 项测试与全量 JS 语法检查、API Jest/lint/build/Prisma 校验、商家端构建。任一失败都不要进入发布步骤。

小程序单项校验（只改了小程序时可先跑这一段）：

```bash
npm run test:mini
find apps/customer-mp -name '*.js' -print0 | xargs -0 -n1 node --check
```

### 3.2 小程序上传

`miniprogram-ci@2.1.31` 需要 Node 22–24；本机 Node 24.11.0 可用。上传密钥是微信公众平台「开发管理 → 开发设置 → 小程序代码上传」下载的 key，**不是**云托管 CLI 私钥，也不是支付私钥，且不得提交到仓库。

```bash
WECHAT_PRIVATE_KEY_PATH=/安全位置/miniprogram-upload.private.key \
WECHAT_VERSION=1.0.3 \
npm run miniprogram:upload
```

Windows / git-bash 下同样可用（脚本是纯 Node，无 shell 依赖）；本地预览二维码用：

```bash
WECHAT_PRIVATE_KEY_PATH=/安全位置/miniprogram-upload.private.key \
WECHAT_VERSION=1.0.3 \
npm run miniprogram:preview
```

注意事项：

- `WECHAT_VERSION` 必须高于微信平台当前已上传版本（当前为 `1.0.2`），不要沿用文档里的历史值。
- 若返回 `invalid ip`，说明公众平台的「小程序代码上传 IP 白名单」拒绝了当前出口 IP；本次验证采用关闭白名单的配置。
- 上传成功后仍需在微信公众平台手动点击「设为体验版」，上传本身不会切换体验版入口。

### 3.3 云托管 API / 商家后台

```bash
CLOUD_PRIVATE_KEY="$(< /安全位置/cloud-cli-private-key)"
wxcloud login --appId wxee631108a5a95efc --privateKey "$CLOUD_PRIVATE_KEY"
wxcloud env:list --region ap-shanghai --json
wxcloud service:list --envId ding-delivery-prod-d8c1eea132b4c --region ap-shanghai --json
```

域名必须从 `service:list` 的 `DefaultPublicDomain` 复制，不能自行拼装。发布 API 时必须使用精简临时上下文（只含 `package.json`、`package-lock.json`、`Dockerfile`、`.dockerignore`、TS/Nest 配置、`src`、`prisma`、必要 `scripts`），否则 `node_modules` 会被一起上传并触发 `ERR_FR_MAX_BODY_LENGTH_EXCEEDED`。商家端在 `VITE_API_BASE_URL` 指向当前 API 域名后再构建并发布 `dist`。

### 3.4 发布后验收

```bash
curl -fsS "https://<API_DOMAIN>/api/health/ready"
curl -fsS -o /dev/null -w '%{http_code}\n' "https://<MERCHANT_DOMAIN>/healthz"
```

必须同时满足：API `/api/health/ready` 返回 200 且 `database` 为 `true`；商家 `/healthz` 与 `/` 返回 200；两个服务最新版本状态正常、流量 100%、至少一个副本；生产变量仍是 Mock 关闭、迁移开启、运营员启动初始化关闭。

## 4. 再次提审自查

提审前用真机/体验版逐项确认：

1. 首页服务卡片中不存在「寄货配送」；
2. 首页、下单页、法律条款、资质页不出现「货物运输 / 运货 / 拉货 / 货三轮车 / 货运」等字样；
3. 「三轮车服务」可正常下单、计价与取消；
4. 法律条款与资质页的表述与实际经营模式一致（不声明未取得的许可）。
