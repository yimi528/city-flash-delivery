# GitHub Actions CI/CD

`.github/workflows/ci-cd.yml` provides the repository pipeline:

- Pull requests run the Mini Program tests, API tests/lint/build/Prisma validation, dependency audit, and production image builds.
- Pushes to `main` publish three immutable images to GHCR using the full commit SHA, then deploy them to the configured production host.
- `workflow_dispatch` can rerun the pipeline; production deployment is restricted to the `main` ref.
- `.github/workflows/miniprogram-release.yml` remains a separate manual workflow for uploading the WeChat Mini Program.

The older duplicate `ci.yml` and `publish-images.yml` workflows were removed so a push to `main` has one authoritative CI/CD path and cannot publish the mutable `latest` tag.

## GitHub configuration

Create a protected GitHub Environment named `production`. Require an approval for this environment if production releases should wait for an operator review.

Add these repository variables:

| Variable | Example | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://api.example.com/api` | Optional override for the API URL compiled into the merchant web image; when omitted, the workflow reads the `release` URL from `apps/customer-mp/config/runtime.js` |
| `VITE_TENCENT_MAP_JS_KEY` | `...` | Optional browser map key |
| `DEPLOY_HEALTHCHECK_URL` | `https://api.example.com/api/health/ready` | Optional post-deploy readiness check |

Add these `production` environment secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST` | Production server hostname or IP |
| `DEPLOY_USER` | SSH deployment user with Docker access |
| `DEPLOY_PATH` | Optional remote path; defaults to `/opt/city-flash` |
| `DEPLOY_SSH_KEY` | Private SSH key for the deployment user |
| `DEPLOY_KNOWN_HOSTS` | The verified `known_hosts` line for the production host |
| `GHCR_USERNAME` | GHCR account used by the server to pull images |
| `GHCR_PULL_TOKEN` | Fine-grained token with read-only package access |

The production host must already have Docker Compose, `deploy/env.production`, TLS files, payment files when applicable, and access to PostgreSQL/Redis. The workflow synchronizes only the non-secret files under `deploy/`; it never overwrites `env.production`, `certs/`, or `secrets/`.

Before the first release, set `API_IMAGE`, `API_MIGRATION_IMAGE`, and `MERCHANT_IMAGE` in the server's environment file to valid GHCR image locations or let the workflow override them for each deployment. The workflow runs the migration image before restarting the API and merchant services.

For GHCR, the repository's `GITHUB_TOKEN` publishes images. The server uses a separate read-only token because the GitHub runner token is not available on the production host.
