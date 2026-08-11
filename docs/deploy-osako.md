# 在 osako（Apple Silicon Mac）上用 Docker 部署

本文把项目的 API、PostgreSQL/PostGIS、Redis 和商家运营后台统一放进根目录 Docker Compose。目标是：osako 只安装 Docker Desktop，Node、npm、PostgreSQL、PostGIS、Redis 和 Nginx 都不需要单独安装。

Cloudflare Tunnel 是可选的独立容器。它负责把已经存在的域名转发到 Compose 网络中的 API 和商家后台；Docker 本身不会自动生成公网地址。

## 一、osako 需要安装什么

在 osako 上安装适用于 Apple Silicon 的 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，启动 Docker Desktop 并确认 Docker Engine 正常运行。

Git 已经存在，不需要重复安装。部署模式不需要在宿主机安装 Node、npm、PostgreSQL、PostGIS、Redis 或 Nginx。

微信开发者工具仍然只在需要调试或上传微信小程序时使用。小程序页面和请求逻辑由微信客户端运行，不属于本 Compose 服务；商家后台的页面代码也最终由浏览器运行，只是静态文件由 `merchant-web` 容器中的 Nginx 提供。

仓库中的 `scripts/dev.sh` 继续保留为本机热更新开发模式，它需要宿主机 Node/npm，并使用 Vite 开发服务器；osako 的部署模式不运行这个脚本，只运行根目录 `docker-compose.yml`。两种模式不要同时启动，否则会争用 API 和前端宿主机端口。

## 二、把项目拉到 osako

如果仓库还没有拉到 osako，在终端执行：

```bash
git clone <仓库地址> city-flash-delivery
cd city-flash-delivery
```

如果仓库已经存在：

```bash
cd /你的路径/city-flash-delivery
git pull
```

不要把开发机上的 `.env`、微信私钥或 Cloudflare Token 一起复制到 Git 仓库；在 osako 单独创建部署用 `.env`。

## 三、创建 Docker 环境文件

在项目根目录执行：

```bash
cp .env.docker.example .env
```

`.env` 已被 `.gitignore` 忽略。至少检查这些变量：

| 变量 | 用途 | 注意事项 |
| --- | --- | --- |
| `POSTGRES_USER` | PostgreSQL 用户名 | 修改时同步修改 `DATABASE_URL` |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 | 真实部署不要使用示例密码 |
| `POSTGRES_DB` | 数据库名 | 修改时同步修改 `DATABASE_URL` |
| `DATABASE_URL` | API/迁移服务连接 PostgreSQL | 容器内主机名必须是 `postgres`，不能写 `127.0.0.1` |
| `REDIS_URL` | API 连接 Redis | 容器内主机名必须是 `redis`，不能写 `127.0.0.1` |
| `VITE_API_BASE_URL` | 编译进商家后台、供浏览器调用的 API 地址 | 不能写 `http://api:3000/api`；公网使用类似 `https://api.example.com/api` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel 容器的 Token | 只放在未提交的 `.env` 中 |

`VITE_API_BASE_URL` 和 `DATABASE_URL` 是两种不同的地址：

- `DATABASE_URL` 给 API 和迁移容器使用，所以写 `postgres` 服务名。
- `VITE_API_BASE_URL` 会进入浏览器 JavaScript，所以必须是浏览器实际能访问的地址。Cloudflare 场景应使用 API 的 HTTPS 域名。

微信 App Secret、微信上传私钥、微信支付私钥、Cloudflare Token 都不能写进仓库、Dockerfile 或已提交的文档。

## 四、构建并启动普通 Docker 模式

普通启动不会启动 Cloudflare Tunnel，因此没有 Tunnel Token 也不会失败：

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Compose 中的服务关系是：

```text
postgres ──健康──┐
                 ├─> api-migrate（Prisma generate + migrate deploy 成功）
redis ─────健康──┘                         │
                                           └─> api ──健康──> merchant-web
                                                               │
                                                               └─> cloudflared（可选 profile）
```

`api-migrate` 是一次性的迁移容器。API 重启不会在它自己的启动命令里重复执行 Prisma 迁移或危险的数据初始化；只有 Compose 需要迁移服务时才运行 `prisma generate` 和 `prisma migrate deploy`。现有 API 代码中的目录/配置初始化仍是幂等的 upsert 逻辑，不会执行 `prisma migrate reset` 或删除数据。

访问地址（默认端口）：

```text
商家后台：http://127.0.0.1:8080
API 健康：http://127.0.0.1:3000/api/health
API Swagger：http://127.0.0.1:3000/api/docs
```

API 和商家后台只绑定宿主机 `127.0.0.1`，数据库和 Redis 没有 `ports` 配置，不会直接暴露到公网。Cloudflare Tunnel 通过 Compose 服务名访问它们：

```text
http://api:3000
http://merchant-web:80
```

Tunnel 容器内绝对不能使用 `127.0.0.1` 访问 API；那只会指向 Tunnel 容器自己。

## 五、启动 Cloudflare Tunnel

### 临时 Quick Tunnel（不需要自己的域名）

如果只是临时让本机或真机访问 osako 上的 API，且 osako 所在网络允许访问 Cloudflare Tunnel 的 7844 端口，可以启动 Quick Tunnel：

```bash
docker compose --profile quick-tunnel up -d cloudflared-quick
docker compose logs -f cloudflared-quick
```

日志会打印一个类似 `https://随机字符串.trycloudflare.com` 的临时 HTTPS 地址。小程序请求地址需要使用这个地址并追加 `/api`，例如：

```text
https://随机字符串.trycloudflare.com/api
```

Quick Tunnel 不需要 Cloudflare Token 或自有域名，但地址由 Cloudflare 随机分配，Tunnel 停止或重启后可能变化。它适合一次性开发/真机联调，不适合作为长期体验版或正式入口；地址变化后，商家后台构建参数、小程序配置和微信后台的 request 合法域名都需要重新处理。

当前 osako 已直接运行 Compose 中的 `cloudflared-quick`，公网请求不再经过开发机。osako 上的 Clash Verge/iKuuuVPN 如果启用了 TUN/增强模式，会接管 Cloudflare 的 Tunnel 路由并导致 7844 握手失败；启动 Tunnel 前应关闭 TUN/增强模式，Tailscale 不需要关闭。当前入口为：

```bash
https://regarded-memorial-lauderdale-rest.trycloudflare.com
```

验证入口：

```bash
curl --fail https://regarded-memorial-lauderdale-rest.trycloudflare.com/api/health/ready
```

如果必须重启或重建 Quick Tunnel，Cloudflare 可能分配新地址；新地址需要同步更新小程序配置、商家后台构建参数和微信后台的 request 合法域名。当前方案不依赖开发机在线，但 Quick Tunnel 仍是临时入口，不应当作为正式生产域名。

停止临时 Tunnel：

```bash
docker compose --profile quick-tunnel stop cloudflared-quick
```

### 稳定 Tunnel（推荐）

先在 Cloudflare Zero Trust 中创建一个可复用的 Tunnel Token，把 Token 写入 osako 项目根目录的 `.env`：

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=真实的未提交Token
```

然后启动带 Tunnel profile 的服务：

```bash
docker compose --profile tunnel up -d
docker compose ps
docker compose logs -f cloudflared
```

Cloudflare Tunnel 的 Public Hostname/路由建议配置为：

```text
api.example.com  -> http://api:3000
ops.example.com  -> http://merchant-web:80
```

如果路由是通过 Cloudflare Dashboard 管理的，两个目标仍然使用上面的 Compose 服务名和容器端口。不要把 Token 写入 `docker-compose.yml`，也不要在仓库中新增真实 Token 文件。

使用 Tunnel 后，重新修改 `.env` 并重建商家后台，使浏览器使用 API 的公网 HTTPS 地址：

```dotenv
VITE_API_BASE_URL=https://api.example.com/api
CORS_ORIGINS=https://ops.example.com
```

```bash
docker compose build merchant-web
docker compose up -d
```

`VITE_API_BASE_URL` 是 Vite 构建时注入的，不是运行时由 Nginx 动态读取；改完后必须重新构建 `merchant-web`。

## 六、查看日志、停止服务

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 api-migrate
docker compose logs --tail=200 postgres
docker compose logs --tail=200 redis
docker compose logs --tail=200 merchant-web
docker compose logs --tail=200 cloudflared
```

不删除数据地停止服务：

```bash
docker compose down
```

`down` 会删除容器和网络，但保留 `city_flash_pgdata` 与 `city_flash_redis` 两个 Docker 卷。下次 `docker compose up -d` 会继续使用它们。

不要随意执行：

```bash
docker compose down -v
```

`-v` 会删除 Compose 声明的数据库和 Redis 卷，PostgreSQL 中的订单、用户、运营配置等数据将丢失；Redis 中的缓存和在线状态也会丢失。删除卷通常不可恢复，除非已有备份。

如果 osako 之前使用过 `server/api/docker-compose.yml`，旧开发栈可能使用名为 `api_city_flash_pgdata` 的卷。根 Compose 默认使用 `city_flash_pgdata`，不会自动把两个卷混用。要复用旧数据，必须先确认旧 PostgreSQL 容器已停止，再在根目录 `.env` 中显式设置 `POSTGRES_VOLUME_NAME=api_city_flash_pgdata`；绝不能让两个 PostgreSQL 容器同时挂载同一个数据目录。

## 七、备份 PostgreSQL

备份前先确认服务正在运行。下面的命令从 PostgreSQL 容器中执行 `pg_dump`，备份文件写到 osako 当前项目目录：

```bash
mkdir -p backups
docker compose exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "backups/city_flash_$(date +%Y%m%d_%H%M%S).dump"
```

如果密码或变量值包含特殊 shell 字符，请改用显式、已确认的值执行备份，不要把密码写进命令历史。至少保留一份脱离 Docker Desktop 数据目录的备份，并定期在临时数据库中测试恢复。

恢复会覆盖目标数据库中的对象，必须先确认目标和备份文件：

```bash
docker compose exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < backups/确认过的备份文件.dump
```

## 八、微信小程序公网配置

微信小程序的 `apps/customer-mp` 代码在微信客户端运行，不由 `merchant-web` 容器提供。小程序请求 API 时使用 `apps/customer-mp/config/runtime.js` 中对应环境的地址。

使用当前临时 Quick Tunnel 做开发版真机和体验版联调时：

1. `develop`、`developDevice` 和 `trial` 当前统一使用 `https://regarded-memorial-lauderdale-rest.trycloudflare.com/api`；本仓库配置文件已写入该地址。
2. 在微信公众平台的“开发—开发管理—开发设置—服务器域名”中，把 `https://regarded-memorial-lauderdale-rest.trycloudflare.com` 配置为 `request 合法域名`。
3. Quick Tunnel 重启或重建后可能生成新地址；新地址必须同时更新 `apps/customer-mp/config/runtime.js`、商家后台构建参数和微信后台合法域名，并重新上传体验版。
4. `release` 仍应使用稳定的正式 API HTTPS 地址，例如 `https://api.example.com/api`，不要把 Quick Tunnel 当作正式入口。
5. 如果小程序上传、登录、支付回调或地图服务还有其他域名要求，按微信后台对应字段配置；不要把 `http://api:3000` 或 `http://127.0.0.1:3000` 填入微信后台。

内网穿透不是 Docker 自动提供的公网地址。公网 HTTPS 域名必须由 Cloudflare Tunnel、反向代理或其他明确的网络入口提供，并且要在微信后台配置为合法域名。

体验版上传使用 `.github/workflows/miniprogram-release.yml` 的手动 workflow，上传私钥只从 GitHub Secret `WECHAT_PRIVATE_KEY` 读取。若出现微信接口 `errCode:-10008 invalid ip`，说明微信后台的 CI 上传 IP 白名单未允许当前 GitHub runner 出口；GitHub-hosted runner 的出口 IP 可能变化，应更新白名单，或改用位于固定出口网络的 self-hosted runner。上传失败不代表小程序代码打包失败，先看 workflow 日志中的微信接口错误。

## 九、部署前检查清单

```bash
docker compose config
docker compose build postgres
docker compose build api
docker compose build api-migrate
docker compose build merchant-web
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:8080/healthz
docker compose exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS postgis; SELECT PostGIS_Version();"'
docker compose exec -T redis redis-cli ping
docker compose exec -T api node -e "const Redis=require('ioredis'); const r=new Redis(process.env.REDIS_URL); r.ping().then(v=>{console.log(v); return r.quit()}).catch(()=>process.exit(1))"
git diff --check
```

检查商家后台构建产物时，应确认其中出现的是浏览器可访问的 `VITE_API_BASE_URL`，而不是 `http://api:3000/api`。例如本地默认构建可以执行：

```bash
docker compose exec -T merchant-web sh -c "grep -R -q 'http://127.0.0.1:3000/api' /usr/share/nginx/html"
docker compose exec -T merchant-web sh -c "! grep -R -q 'http://api:3000/api' /usr/share/nginx/html"
```

如果普通模式启动失败，先看 `api-migrate`、`postgres` 和 `api` 日志；不要通过重新加入 `linux/amd64` 或兼容层来掩盖 Apple Silicon 架构问题。
