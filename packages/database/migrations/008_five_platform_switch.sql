-- 008_five_platform_switch.sql
-- five-platform 版平台切换：下线 MakerWorld / 小黑盒业务规则，seed 知乎 / X 规则。
-- 历史收藏数据保留（仅停止新同步），规则行删除不影响 collections 表。
PRAGMA user_version = 8;

BEGIN;

DELETE FROM business_rules WHERE rule_key IN (
  'makerworld_sync_likes',
  'makerworld_sync_frequency',
  'xiaoheihe_sync_frequency'
);

INSERT INTO business_rules(rule_key, rule_value, default_value, description, impact) VALUES
  ('zhihu_sync_frequency', 'daily', 'daily', '知乎自动同步频率', 'daily=每日自动同步一次，weekly=每周自动同步一次'),
  ('x_sync_frequency', 'daily', 'daily', 'X自动同步频率', 'daily=每日自动同步一次，weekly=每周自动同步一次'),
  ('zhihu_secret_set', '0', '0', '知乎开放平台 Secret 是否已配置', '1=已配置走官方 API，0=用浏览器登录态兜底')
ON CONFLICT(rule_key) DO NOTHING;

COMMIT;
