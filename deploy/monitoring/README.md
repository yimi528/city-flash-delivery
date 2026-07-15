# Production monitoring checklist

Attach the provider's uptime check and alerting rules to these signals:

- `GET https://$API_DOMAIN/api/health/ready` availability and latency.
- HTTP 5xx rate, request latency, container restarts, and database connection failures.
- Payment notify/refund-notify responses, refund failures, reconciliation failures, and unmatched payment records.
- PostgreSQL backup age and restore-rehearsal result.

Every request returns an `X-Request-Id` response header. Include that value in support tickets and error-tracking events. Alerts should page the operator for sustained readiness failure, payment callback failure, or a backup older than 24 hours; warning alerts can cover elevated 5xx and restart counts.

The monitoring provider, webhook URLs, and notification credentials are environment-specific and must be configured in Sealos or the cloud provider's secret/alerting store. They do not belong in Git.
