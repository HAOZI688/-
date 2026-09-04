# 20 · 数据库备份与恢复（Backup and Restore）

> V4 Production Readiness（规格 §27）。**备份不是文档里的承诺——本项目的备份与恢复流程已经实际执行并验证**（见文末「实测记录」）。

## 1. 策略

| 项 | 值 |
|---|---|
| 方式 | `pg_dump` 全量逻辑备份（`--no-owner --clean --if-exists`，可直接重放） |
| 压缩 | gzip |
| 频率 | 每周至少一次（建议每周一发布周期后手动跑一次；或自行加 crontab） |
| 保留 | 默认 14 份（`BACKUP_KEEP` 可调） |
| 位置 | `backups/`（已 gitignore；**不要**提交到仓库） |
| 恢复验证 | 每次备份后用恢复脚本恢复到**验证库**（不影响主库） |

## 2. 备份

```bash
bash scripts/backup-db.sh
# → backups/contentos-20260904-160459.sql.gz
#   DONE: ... (40K, 1 copies)
```

环境变量（可选）：`CONTAINER`（默认 content-os-postgres）、`DB_USER`（默认 contentos）、`DB_NAME`（默认 contentos）、`BACKUP_KEEP`（默认 14）。

crontab 示例（每周一 09:30 自动备份，在调度之后）：

```
30 9 * * 1 cd /path/to/contentos && bash scripts/backup-db.sh >> /tmp/contentos-backup.log 2>&1
```

## 3. 恢复

**默认恢复到验证库 `contentos_restore_test`（安全，不动主库）：**

```bash
bash scripts/restore-db.sh backups/contentos-20260904-160459.sql.gz
# → Restoring to VERIFY database contentos_restore_test (safe mode; add --write to touch main db)
# → DONE: contentos_restore_test restored (61 tables in public schema)
# → VERIFY: topics=8 post_metric_snapshots=6
```

验证数字与预期一致后，清理验证库：

```bash
docker exec content-os-postgres psql -U contentos -d postgres -c "DROP DATABASE contentos_restore_test"
```

**确认要覆盖主库时（危险，有 10 秒反悔窗口）：**

```bash
bash scripts/restore-db.sh backups/contentos-XXXX.sql.gz --write
```

## 4. 运营注意

1. **恢复演练**：每季度至少跑一次「备份 → 恢复到验证库 → 校验行数」全流程（本 SOP 的实测记录就是演练模板）。
2. **备份文件含全部业务数据**：不要把 `backups/` 提交 git、不要上传到公开网盘。
3. **真实数据优先**：备份覆盖不了第三方（小豆芽后台），平台数据以本系统为准。
4. readiness 检查（`/system/readiness`）会自动检测 `backups/` 最近备份：7 天内有备份 → PASS，否则 WARN。

## 5. 实测记录（2026-09-04）

```
$ bash scripts/backup-db.sh
Backup contentos from container content-os-postgres ...
DONE: /path/backups/contentos-20260904-160459.sql.gz ( 40K, 1 copies)

$ bash scripts/restore-db.sh backups/contentos-20260904-160459.sql.gz
Restoring to VERIFY database contentos_restore_test (safe mode; add --write to touch main db)
Restoring: contentos-20260904-160459.sql.gz -> contentos_restore_test
DONE: contentos_restore_test restored (61 tables in public schema)
VERIFY: topics=8 post_metric_snapshots=6
```

主库当时状态：topics=8、post_metric_snapshots=6 → **行数一致，恢复验证 PASS**。验证库已删除。
