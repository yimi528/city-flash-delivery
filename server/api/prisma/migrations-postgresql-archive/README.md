# PostgreSQL migration archive（只读）

这些迁移是迁移到 MySQL 之前的 PostgreSQL/PostGIS 历史记录，仅用于审计和数据迁移参考，不会被 Prisma 执行。

当前可执行迁移位于 `../migrations/`，包括 MySQL baseline 及后续 MySQL 迁移。本目录永远只读、不会被 Prisma 执行；不要把这里的 SQL 文件复制回活动迁移目录，也不要用它初始化生产数据库。
