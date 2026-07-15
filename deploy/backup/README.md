# PostgreSQL backup and restore

Run `backup-postgres.sh` once per day from a protected host or scheduled job. Keep `DATABASE_URL` in the scheduler's secret store, not in the repository. The default retention is seven days; set `RETENTION_DAYS` to a larger value when the operating policy requires it.

Example scheduler command:

```bash
DATABASE_URL='postgresql://...' \
BACKUP_DIR=/var/backups/city-flash/postgres \
/opt/city-flash/deploy/backup/backup-postgres.sh
```

Perform a monthly restore rehearsal into an isolated database. A custom-format dump can be restored with:

```bash
createdb city_flash_restore
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname='postgresql://...' /var/backups/city-flash/postgres/city-flash-YYYYMMDDTHHMMSSZ.dump
```

Record the backup timestamp, migration version, row-count checks, and application health check in the incident/operations log. Never restore over production during a rehearsal.
