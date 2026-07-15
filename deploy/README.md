# Cloud Deployment

This deployment targets Tencent Cloud. Staging may use one CVM; production uses two CVMs in different availability zones behind a CLB. The same images work with Alibaba Cloud or AWS when the managed PostgreSQL/Redis connection and registry names are changed.

## 1. Cloud resources

Create the following resources in one VPC and region:

- Two Linux CVMs with Docker Engine and the Compose plugin, placed in different availability zones.
- TencentDB for PostgreSQL 16 on a private subnet.
- TencentDB for Redis on a private subnet for location indexing, rate limiting, and the realtime event layer.
- A TCR namespace with three image repositories or tags.
- A public CLB with both CVMs registered as private backends; DNS records for `api.example.com` and `ops.example.com` point to the CLB.
- One TLS certificate covering both domains.

Only expose application ports from the CLB security group. Keep PostgreSQL and Redis private, allowing ports 5432 and 6379 only from the CVM security group. Restrict SSH to a bastion host or fixed management addresses.

Enable PostGIS before the first migration if the managed database does not permit application users to create extensions:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

## 2. Build and push images

Replace the registry and Git SHA before running these commands:

```bash
export REGISTRY=ccr.ccs.tencentyun.com/your-namespace
export VERSION=$(git rev-parse HEAD)

docker build --target runtime \
  -t "$REGISTRY/city-flash-api:$VERSION" server/api
docker build --target migration \
  -t "$REGISTRY/city-flash-api-migration:$VERSION" server/api
docker build \
  --build-arg VITE_API_BASE_URL=https://api.example.com/api \
  -t "$REGISTRY/city-flash-merchant:$VERSION" apps/merchant-web

docker push "$REGISTRY/city-flash-api:$VERSION"
docker push "$REGISTRY/city-flash-api-migration:$VERSION"
docker push "$REGISTRY/city-flash-merchant:$VERSION"
```

## 3. Prepare the server

Copy only the `deploy` directory to `/opt/city-flash` on both CVMs, then create the production files:

```bash
cd /opt/city-flash
cp env.production.example env.production
mkdir -p certs secrets
chmod 700 certs secrets
```

Edit `env.production` with the private TencentDB address, domains, image tags, WeChat credentials, and a new Tencent Map key. Never copy the local development `.env` to the server.

Before deployment, update `trial` and `release` in `apps/customer-mp/config/runtime.js` to the备案后的 API HTTPS 地址, then run the production gate from the repository root:

```bash
npm run release:check -- deploy/env.production
```

The gate rejects placeholders, mocks, insecure origins/callbacks, missing TLS/payment files, a mismatched Mini Program API domain, and invalid Compose configuration. The API repeats critical checks at startup and refuses to serve with an incomplete production configuration.

Install the certificate and payment files with restrictive permissions:

```bash
install -m 600 fullchain.pem certs/fullchain.pem
install -m 600 privkey.pem certs/privkey.pem
install -o 1000 -g 1000 -m 400 apiclient_key.pem secrets/apiclient_key.pem
install -o 1000 -g 1000 -m 400 wechatpay_platform.pem secrets/wechatpay_platform.pem
```

The API container runs as the image's non-root `node` user (UID/GID 1000), so the two payment files must be readable by that numeric owner. The TLS certificate files remain root-owned because they are mounted by the Nginx gateway.

## 4. Migrate and start

Run migrations before starting a new API version:

```bash
docker compose --env-file env.production -f docker-compose.cloud.yml pull
docker compose --env-file env.production -f docker-compose.cloud.yml \
  --profile tools run --rm migrate
docker compose --env-file env.production -f docker-compose.cloud.yml up -d
```

Create the first operator once, then remove `OPERATOR_BOOTSTRAP_PASSWORD` from `env.production`:

```bash
docker compose --env-file env.production -f docker-compose.cloud.yml \
  --profile tools run --rm operator-init
```

## 5. Verify

```bash
docker compose --env-file env.production -f docker-compose.cloud.yml ps
curl --fail https://api.example.com/api/health/ready
curl --fail https://ops.example.com/healthz
```

Configure `https://api.example.com` as the WeChat Mini Program request domain and configure the payment callback as:

```text
https://api.example.com/api/payments/wechat/notify
```

Before uploading the trial or release Mini Program, verify that `apps/customer-mp/config/runtime.js` matches the备案后的正式域名. The user and rider modes share this one Mini Program AppID and customer login credentials.

Before a production release, test real-device login, a small real payment, callback verification, cancellation, refund, and reconciliation. These integrations are implemented, but they cannot be accepted against WeChat's real environment without the production AppID, merchant credentials, certificates, approved domains, and a real device.

## 6. Update and rollback

For an update, push immutable image tags and run the migration once. Production must use the full Git SHA in `API_IMAGE`, `API_MIGRATION_IMAGE`, and `MERCHANT_IMAGE`; never use `latest`. Drain and update one CLB backend at a time, verify `/api/health/ready`, restore it to the CLB, and then update the second CVM:

```bash
docker compose --env-file env.production -f docker-compose.cloud.yml up -d
```

To roll back application code, restore the previous full Git SHA in `env.production`, run `docker compose ... up -d`, and verify readiness and payment callbacks before restoring traffic. Database migrations must remain backward compatible; do not attempt destructive schema rollback during an incident. Keep the previous SHA and migration version in the release record.

## 7. Backups and monitoring

Install the daily PostgreSQL job from [`backup/backup-postgres.sh`](backup/backup-postgres.sh), retain at least seven days, and rehearse a restore into an isolated database. Configure provider alerts using [`monitoring/README.md`](monitoring/README.md). The test resources (`xian-test-*`) remain separate from production resources and databases.
