# 微信云托管下一次发布 Runbook

本文是本项目下一次发布的主入口，记录已经验证过的微信云托管发布顺序、验收条件和常见故障。命令以当前仓库和本机 `wxcloud` CLI 1.1.8 的实际帮助为准；正式操作前仍要重新执行帮助和查询命令。

官方入口：

- [微信云托管文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/)
- [微信云托管 CLI](https://cloud.weixin.qq.com/cli/)
- [云托管部署细节](deploy-wxcloud.md)
- [小程序上传说明](../deploy/miniprogram-ci.md)

## 1. 先理解一次发布包含什么

一次发布可能包含三个相互独立的动作：

1. Git 提交和推送：保存代码与文档版本，推送 `main` 默认只触发 CI。
2. 云托管发布：分别发布 API 和商家后台两个服务。
3. 小程序上传：只有小程序代码或配置变化时才执行，不能由云托管服务发布代替。

当前版本通道与 API 运行环境的映射是两个独立维度：

| 小程序版本 | API/云托管环境 |
| --- | --- |
| `develop` | 本机 |
| `trial` | `prod` |
| `release` | `prod` |

因此，“体验版”不等于名为 `test` 的云环境；只有代码显式配置为测试环境时才使用测试环境。

## 2. 当前目标快照与动态核验

下面是 2026-09-04 最近一次成功发布使用的快照，仅用于定位，不是永久配置。每次发布必须以 `wxcloud service:list` 和控制台返回的当前值为准。

| 项目 | 当前快照 |
| --- | --- |
| 微信 AppID | `wxee631108a5a95efc` |
| 云托管环境 | `ding-delivery-prod-d8c1eea132b4c` |
| API 服务 | `city-flash-api:3000` |
| 商家服务 | `city-flash-merchant:80` |
| API 公网域名 | `city-flash-api-298025-11-1469830209.sh.run.tcloudbase.com` |
| 商家公网域名 | `city-flash-merchant-298025-11-1469830209.sh.run.tcloudbase.com` |

域名必须从服务查询结果的 `DefaultPublicDomain` 或控制台复制，不能根据环境名、服务名或历史记录自行拼接。API、商家端构建时的 `VITE_API_BASE_URL`、API 的 `CORS_ORIGINS` 和小程序云环境 ID 必须属于同一环境。

## 3. 发布前静态检查

从仓库根目录开始，先确认当前代码、版本和 CLI：

~~~sh
cd /Users/shun/Projects/city-flash-delivery
set -Eeuo pipefail

PROJECT_APP_ID="$(node -p "require('./project.config.json').appid")"
CLOUD_ENV_ID="$(node -p "require('./apps/customer-mp/config/runtime.js').WX_CLOUD_PROD_ENV_ID")"
CLOUD_REGION="ap-shanghai"
API_SERVICE_NAME="city-flash-api"
MERCHANT_SERVICE_NAME="city-flash-merchant"
RELEASE_SHA="$(git rev-parse --short HEAD)"

git status --short
git diff --check
wxcloud --version
wxcloud login --help
wxcloud env:list --help
wxcloud service:list --help
wxcloud run:deploy --help
~~~

如果依赖尚未安装，再执行安装和质量门禁：

~~~sh
npm ci
npm --prefix server/api ci
npm --prefix apps/merchant-web ci
npm run check:quality
~~~

`npm run check:quality` 必须完整通过，当前覆盖共享包测试、小程序测试与语法检查、API Jest/lint/build/Prisma 校验，以及商家端 TypeScript/Vite 构建。检查失败时不要进入发布步骤。

## 4. 登录和目标服务核验

### 4.1 只选择匹配当前 AppID 的云托管密钥

`deploy/secrets/` 只保留本地未跟踪凭证。密钥文件名必须包含当前项目 AppID；不要把第一个 `.key` 文件当成默认凭证，也不要把支付私钥或小程序上传私钥拿来登录云托管。

~~~sh
KEY_COUNT="$(find deploy/secrets -maxdepth 1 -type f -name "*${PROJECT_APP_ID}*.key" | wc -l | tr -d ' ')"
test "$KEY_COUNT" = 1
KEY_FILE="$(find deploy/secrets -maxdepth 1 -type f -name "*${PROJECT_APP_ID}*.key" -print -quit)"
chmod 600 "$KEY_FILE"
CLOUD_PRIVATE_KEY="$(<"$KEY_FILE")"
test -n "$CLOUD_PRIVATE_KEY"

wxcloud login --appId "$PROJECT_APP_ID" --privateKey "$CLOUD_PRIVATE_KEY"
wxcloud env:list --region "$CLOUD_REGION" --json
wxcloud service:list --envId "$CLOUD_ENV_ID" --region "$CLOUD_REGION" --json
~~~

将上一条服务查询结果中的当前 `DefaultPublicDomain` 手工复制到后续变量；不要从历史快照或环境名推测：

~~~sh
# 以下两个值必须替换为当前 service:list/控制台返回的域名
API_DOMAIN="<current-api-DefaultPublicDomain>"
MERCHANT_DOMAIN="<current-merchant-DefaultPublicDomain>"
~~~

登录成功后核对：

- 环境确实是目标 `prod` 环境；
- `city-flash-api` 和 `city-flash-merchant` 都存在，状态为正常且已开启公网访问；
- 两个服务各自只有一个端口，分别为 3000 和 80；
- API 的生产变量满足 `scripts/validate-production.sh` 和 API 生产配置校验；
- `RUN_MIGRATIONS_ON_STARTUP=true`，`RUN_OPERATOR_INITIALIZATION_ON_STARTUP=false`；
- 登录和支付 Mock 均关闭，生产环境没有默认 JWT、默认运营员密码或 Redis 依赖；
- API 的 CORS 已包含当前商家公网域名，商家端构建使用当前 API HTTPS 域名。

如果出现 AppID 与密钥不匹配，先停止并重新选择匹配当前 AppID 的密钥。出现 `Tenant not found` 时，这是租户或权限边界，不能靠重复发布解决，应先修复账号或项目权限。

## 5. 提交和推送代码

只暂存本次确认过的明确路径，并在提交前检查密钥排除规则：

~~~sh
git add -- <本次确认过的代码、配置和文档路径>
git diff --cached --check
git diff --cached --name-status
! git diff --cached --name-only | rg -i '(^|/)(deploy/secrets|\.env($|\.)|.*\.(pem|key|p12|pfx|crt|cer))'
git commit -m "说明本次发布内容"

git fetch origin main
git rev-list --left-right --count HEAD...origin/main
git push origin main

git rev-parse HEAD
git ls-remote origin refs/heads/main
~~~

如果 `origin/main` 在本地提交之后又有新提交，先停止发布，按项目协作约定处理 rebase 或合并并重新跑质量门禁。推送 `main` 只会触发 `.github/workflows/ci.yml`；云托管发布工作流仍是手动触发，并受 `WX_CLOUD_DEPLOY_ENABLED` 和生产环境保护控制。

## 6. 发布 API：必须使用精简临时上下文

`wxcloud run:deploy` 会打包目标目录中的内容。`.dockerignore` 只影响 Docker 构建上下文，不是 CLI 上传过滤器；如果直接把本地带有 `node_modules` 的 `server/api` 作为上传目录，可能触发 `ERR_FR_MAX_BODY_LENGTH_EXCEEDED`。

使用只包含 Docker 构建所需文件的临时目录：

~~~sh
RELEASE_ROOT="$(mktemp -d -t city-flash-release.XXXXXX)"
API_CONTEXT="$RELEASE_ROOT/api"
mkdir -p "$API_CONTEXT"

cp server/api/package.json \
  server/api/package-lock.json \
  server/api/Dockerfile \
  server/api/.dockerignore \
  server/api/nest-cli.json \
  server/api/tsconfig.json \
  server/api/tsconfig.build.json \
  "$API_CONTEXT/"
cp -R server/api/src server/api/prisma "$API_CONTEXT/"
mkdir -p "$API_CONTEXT/scripts"
cp server/api/scripts/create-operator.mjs "$API_CONTEXT/scripts/"

if find "$API_CONTEXT" -type f | rg -q '(^|/)(node_modules|dist)/|(^|/)\.env($|\.)|.*\.(pem|key|p12|pfx|crt|cer)$'; then
  echo "发布上下文包含依赖、构建产物、环境文件或证书"
  exit 1
fi

wxcloud run:deploy "$API_CONTEXT" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 3000 \
  --envId "$CLOUD_ENV_ID" \
  --serviceName "$API_SERVICE_NAME" \
  --region "$CLOUD_REGION" \
  --releaseType FULL \
  --remark "Git $RELEASE_SHA API" \
  --override \
  --noConfirm
~~~

`--override` 的含义是版本参数缺省时沿用旧版本配置，不是回滚，也不会自动修正服务环境变量。当前 CLI 的 `--envParams` 会把传入的键值同步为服务环境变量；不要只传一两个变量覆盖完整配置。必须传环境变量时，应先导出并审计完整集合，再一次性传入；不需要修改服务变量时省略 `--envParams`。

API 镜像启动时仅在 `RUN_MIGRATIONS_ON_STARTUP=true` 时执行 `prisma migrate deploy`。禁止使用 `prisma migrate reset`、删除数据库或执行破坏性初始化。运营员初始化保持关闭，按项目的显式运维流程单独处理。

## 7. 构建和发布商家后台

`VITE_API_BASE_URL` 是构建时注入值，不是容器启动时动态读取。先从服务查询结果取得 `API_DOMAIN`，确认 CORS 后再构建：

~~~sh
cd /Users/shun/Projects/city-flash-delivery/apps/merchant-web
npm ci
VITE_API_BASE_URL="https://$API_DOMAIN/api" \
VITE_TENCENT_MAP_JS_KEY="${VITE_TENCENT_MAP_JS_KEY:-}" \
npm run build

MERCHANT_CONTEXT="$(mktemp -d -t city-flash-merchant-release.XXXXXX)"
cp Dockerfile.cloud "$MERCHANT_CONTEXT/Dockerfile"
cp nginx.conf "$MERCHANT_CONTEXT/nginx.conf"
cp -R dist "$MERCHANT_CONTEXT/dist"

if find "$MERCHANT_CONTEXT" -type f | rg -q '(^|/)(node_modules|coverage)/|(^|/)\.env($|\.)|.*\.(pem|key|p12|pfx|crt|cer)$'; then
  echo "商家发布上下文包含不应上传的文件"
  exit 1
fi

cd /Users/shun/Projects/city-flash-delivery
wxcloud run:deploy "$MERCHANT_CONTEXT" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 80 \
  --envId "$CLOUD_ENV_ID" \
  --serviceName "$MERCHANT_SERVICE_NAME" \
  --region "$CLOUD_REGION" \
  --releaseType FULL \
  --remark "Git $RELEASE_SHA merchant" \
  --noConfirm
~~~

上面 `VITE_TENCENT_MAP_JS_KEY` 的值来自当前 shell 或本地安全存储；不要把真实值写入脚本、日志或 Git。发布后必须重新查询商家服务版本，确认状态正常、流量 100%、至少有一个副本。

如果商家首页能打开但 API 请求失败，优先检查构建产物中的 API 域名是否是当前值，以及 API `CORS_ORIGINS` 是否包含商家域名。若商家域名发生变化，先把完整的 CORS 环境变量集合更新到 API，再重新发布 API。

## 8. 发布小程序（按需）

云托管发布不会上传小程序代码。小程序有变化时，按 [deploy/miniprogram-ci.md](../deploy/miniprogram-ci.md) 使用 `miniprogram-ci` 上传：

~~~sh
WECHAT_PRIVATE_KEY_PATH="/安全位置/匹配当前 AppID 的小程序上传私钥" \
WECHAT_VERSION="x.y.z" \
npm run miniprogram:upload
~~~

上传前确认 `project.config.json` 的 AppID 正确；体验版和正式版都按当前运行时代码访问 `prod`，不要把版本通道名称当作云环境名称。

## 9. 发布后验收

从 `wxcloud service:list` 或控制台复制最新服务域名和版本信息，不要只看 CLI 终端最后一行：

~~~sh
curl -fsS "https://$API_DOMAIN/api/health/ready"
curl -fsS -o /dev/null -w '%{http_code}\n' "https://$MERCHANT_DOMAIN/healthz"
curl -fsS -o /dev/null -w '%{http_code}\n' "https://$MERCHANT_DOMAIN/"
rg -n --fixed-strings "https://$API_DOMAIN/api" apps/merchant-web/dist
~~~

验收必须同时满足：

- API `/api/health/ready` 返回 HTTP 200，响应中的 `database` 为 `true`；
- 商家 `/healthz` 和 `/` 都返回 HTTP 200；
- API 和商家最新版本均为正常状态、流量 100%、至少一个副本；
- 商家构建产物包含当前 API 域名；
- 生产变量仍满足 Mock 关闭、迁移开启、运营员启动初始化关闭等约束；
- 小程序若本次有上传，上传版本、AppID、版本通道和目标环境记录一致。

CLI 可能在发布过程中显示 `ResourceNotFound.TopicNotExist`，或重复打印历史日期的日志。这类输出不能单独作为失败依据；先检查任务是否 `finished`、最新版本状态/流量/副本和独立 HTTP 健康检查。只有任务未完成、版本异常或健康检查失败时才按失败处理，避免立即重复发布。

## 10. 常见坑速查

| 现象 | 原因 | 正确处理 |
| --- | --- | --- |
| CLI 登录失败，提示 AppID/密钥不匹配 | 选中了旧 AppID 的云托管密钥 | 只使用文件名匹配当前 AppID 的 `.key` |
| `Tenant not found` | 当前账号没有目标租户或项目权限 | 停止操作，核对账号和权限 |
| `TopicNotExist` 或旧日志反复出现 | CLI 任务日志观察器可能返回陈旧或无关日志 | 查任务、版本详情、健康检查，不要仅凭日志重跑 |
| `ERR_FR_MAX_BODY_LENGTH_EXCEEDED` | CLI 把本地 `node_modules` 一起上传 | 使用本 Runbook 的精简临时上下文 |
| 只传部分 `--envParams` 后服务变量消失 | 当前 CLI 会用传入集合替换服务环境变量 | 传完整审计后的集合，或不传该参数 |
| 商家页面正常但接口失败 | `VITE_API_BASE_URL` 是旧值，或 API CORS 未包含商家域名 | 先查询域名，再构建并检查 CORS |
| `npm ci` 长时间无输出 | 依赖安装仍在进行，或网络较慢 | 先检查进程和网络，不要并发重复安装 |
| 体验版被误认为测试环境 | 版本通道和云环境是两个维度 | 按 `develop→local`、`trial→prod`、`release→prod` 核对 |
| zsh 中定义 `path` 后命令异常 | zsh 的 `path` 与 `PATH` 绑定 | 使用 `endpoint_path` 等其他变量名 |
| 凭证拿错用途 | 云托管、支付、小程序上传使用不同密钥 | 按命令用途选择对应密钥，任何凭证都不入 Git |
| 把 `tcb` 当成 `wxcloud` | 混用了 CloudBase CLI 和微信云托管 CLI | 本项目统一使用官方 `@wxcloud/cli` 的 `wxcloud` 命令 |

## 11. 最近一次成功发布记录

以下是用于比对流程的历史证据，下一次发布应替换为新的 SHA 和版本号：

- Git：`4ff03fd7a971bbdba1cab1c6caa5aeca84c1b2c0`
- API：任务 `2073404` 完成，版本 `city-flash-api-012`，状态正常，流量 100%，1 个副本；
- 商家：版本 `city-flash-merchant-009`，状态正常，流量 100%，1 个副本；
- API `/api/health/ready`、商家 `/healthz` 和首页均通过 HTTP 200，API 响应中的数据库状态为 `true`；
- 生产变量核验通过：迁移开启、运营员启动初始化关闭、登录和支付 Mock 关闭；
- 发布后工作树只保留本地未跟踪的 `deploy/secrets/`，没有把凭证提交到 Git。

只有 Git 版本、两个云托管服务版本、独立健康检查和生产变量都通过，才算发布完成；“任务创建成功”或“首页能打开”都不够。
