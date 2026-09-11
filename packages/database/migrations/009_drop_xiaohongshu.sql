-- 009_drop_xiaohongshu.sql
-- 四平台版：下线小红书业务规则（历史收藏数据保留，仅停止新同步）。
PRAGMA user_version = 9;

BEGIN;

DELETE FROM business_rules WHERE rule_key IN (
  'xiaohongshu_sync_frequency'
);

COMMIT;
