-- 「拾句」一期初始化：13 张表
-- 约定：InnoDB / utf8mb4 / UTC；用户删除感悟为物理删除，管理员隐藏为 status=2

CREATE TABLE `user` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`       VARCHAR(20)     NOT NULL,
  `password_hash`  VARCHAR(72)     NOT NULL,
  `nickname`       VARCHAR(20)     NOT NULL,
  `avatar_preset`  TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '预设头像序号，0-11',
  `role`           TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 普通用户 / 9 管理员',
  `token_version`  INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '改密/禁用时自增，使 JWT 失效',
  `status`         TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '0 禁用 / 1 正常',
  `phone`          VARCHAR(20)     NULL COMMENT '预留：短信登录',
  `login_type`     TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 用户名密码 / 2 手机号（预留）',
  `agreed_at`      DATETIME(3)     NULL COMMENT '同意用户协议与隐私条款的时间',
  `created_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_username` (`username`),
  UNIQUE KEY `uk_user_phone` (`phone`),
  CONSTRAINT `chk_user_role` CHECK (`role` IN (1, 9)),
  CONSTRAINT `chk_user_status` CHECK (`status` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `work` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`           TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 电影 / 2 剧集（预留）',
  `slug`           VARCHAR(80)     NOT NULL,
  `title`          VARCHAR(120)    NOT NULL,
  `original_title` VARCHAR(160)    NULL,
  `year`           SMALLINT UNSIGNED NULL,
  `director`       VARCHAR(120)    NULL,
  `country`        VARCHAR(40)     NULL,
  `synopsis`       VARCHAR(1000)   NULL,
  `status`         TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '0 草稿 / 1 发布 / 2 下线',
  `quote_count`    INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '已发布台词数，写时维护',
  `created_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_slug` (`slug`),
  KEY `idx_work_status_year` (`status`, `year`),
  CONSTRAINT `chk_work_type` CHECK (`type` IN (1, 2)),
  CONSTRAINT `chk_work_status` CHECK (`status` IN (0, 1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quote` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_id`      BIGINT UNSIGNED NOT NULL,
  `slug`         VARCHAR(96)     NOT NULL,
  `quote_text`   VARCHAR(600)    NOT NULL COMMENT '台词原文，应用层限制 <= 60 字',
  `speaker`      VARCHAR(60)     NULL COMMENT '说话角色',
  `context`      VARCHAR(800)    NULL COMMENT '场景说明，一句话',
  `search_text`  TEXT            NOT NULL COMMENT '写入时规范化：台词+角色+影片+导演+主题',
  `pinyin`       TEXT            NOT NULL COMMENT '全拼 + 首字母，空格分隔，供拼音搜索',
  `featured`     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '1 首页精选',
  `status`       TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '0 草稿 / 1 发布 / 2 下线 / 3 墓碑',
  `source_key`   CHAR(40)        NULL COMMENT 'sha1(work.slug + \\n + quote_text)，导入幂等',
  `published_at` DATETIME(3)     NULL,
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_quote_slug` (`slug`),
  UNIQUE KEY `uk_quote_source` (`source_key`),
  KEY `idx_quote_work` (`work_id`, `status`, `published_at` DESC),
  KEY `idx_quote_feed` (`status`, `published_at` DESC, `id` DESC),
  KEY `idx_quote_featured` (`featured`, `status`, `published_at` DESC),
  CONSTRAINT `fk_quote_work` FOREIGN KEY (`work_id`) REFERENCES `work` (`id`),
  CONSTRAINT `chk_quote_status` CHECK (`status` IN (0, 1, 2, 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `theme` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `slug`        VARCHAR(40)     NOT NULL,
  `name`        VARCHAR(30)     NOT NULL,
  `description` VARCHAR(300)    NULL,
  `sort_order`  INT             NOT NULL DEFAULT 0,
  `status`      TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '0 隐藏 / 1 发布',
  `created_at`  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_theme_slug` (`slug`),
  UNIQUE KEY `uk_theme_name` (`name`),
  CONSTRAINT `chk_theme_status` CHECK (`status` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quote_theme` (
  `quote_id` BIGINT UNSIGNED NOT NULL,
  `theme_id` INT UNSIGNED    NOT NULL,
  PRIMARY KEY (`quote_id`, `theme_id`),
  KEY `idx_qt_theme` (`theme_id`, `quote_id`),
  CONSTRAINT `fk_qt_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qt_theme` FOREIGN KEY (`theme_id`) REFERENCES `theme` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reflection` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `quote_id`     BIGINT UNSIGNED NOT NULL,
  `user_id`      BIGINT UNSIGNED NOT NULL,
  `body`         VARCHAR(500)    NOT NULL,
  `visibility`   TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 私密 / 1 好友 / 2 公开',
  `status`       TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 正常 / 2 管理员隐藏',
  `like_count`   INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '冗余计数，点赞事务内维护',
  `published_at` DATETIME(3)     NULL COMMENT '公开时间，visibility=2 时写入',
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reflection_user_quote` (`user_id`, `quote_id`),
  KEY `idx_reflection_public` (`quote_id`, `visibility`, `status`, `like_count` DESC, `created_at` DESC, `id` DESC),
  KEY `idx_reflection_user` (`user_id`, `status`, `created_at` DESC, `id` DESC),
  CONSTRAINT `fk_reflection_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`),
  CONSTRAINT `fk_reflection_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `chk_reflection_visibility` CHECK (`visibility` IN (0, 1, 2)),
  CONSTRAINT `chk_reflection_status` CHECK (`status` IN (1, 2)),
  CONSTRAINT `chk_reflection_body` CHECK (CHAR_LENGTH(`body`) BETWEEN 1 AND 500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reflection_like` (
  `reflection_id` BIGINT UNSIGNED NOT NULL,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `created_at`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`reflection_id`, `user_id`),
  KEY `idx_like_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_like_reflection` FOREIGN KEY (`reflection_id`) REFERENCES `reflection` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_like_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quote_request` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `text`       VARCHAR(200)    NOT NULL COMMENT '用户想收录的台词',
  `work_title` VARCHAR(120)    NULL COMMENT '用户填写的影片名',
  `note`       VARCHAR(300)    NULL,
  `status`     TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 待处理 / 2 已收录 / 3 忽略',
  `created_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_request_status` (`status`, `created_at`),
  KEY `idx_request_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_request_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`),
  CONSTRAINT `chk_request_status` CHECK (`status` IN (1, 2, 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `search_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `query`        VARCHAR(100)    NOT NULL,
  `normalized`   VARCHAR(100)    NOT NULL,
  `result_count` SMALLINT UNSIGNED NOT NULL,
  `user_id`      BIGINT UNSIGNED NULL,
  `ip_hash`      CHAR(32)        NULL COMMENT 'sha256(ip + salt) 前 32 位',
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_search_zero` (`result_count`, `created_at`),
  KEY `idx_search_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `seed_batch` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `batch_name`  VARCHAR(60)     NOT NULL,
  `file_sha256` CHAR(64)        NOT NULL,
  `total`       INT UNSIGNED    NOT NULL,
  `inserted`    INT UNSIGNED    NOT NULL,
  `updated`     INT UNSIGNED    NOT NULL,
  `skipped`     INT UNSIGNED    NOT NULL,
  `report`      JSON            NULL,
  `created_at`  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seed_sha` (`file_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `slug_redirect` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `entity`     TINYINT UNSIGNED NOT NULL COMMENT '1 台词 / 2 作品 / 3 主题',
  `old_slug`   VARCHAR(96)     NOT NULL,
  `new_slug`   VARCHAR(96)     NOT NULL,
  `created_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_redirect` (`entity`, `old_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `export_log` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`          BIGINT UNSIGNED NOT NULL,
  `format`           TINYINT UNSIGNED NOT NULL COMMENT '1 txt / 2 md',
  `reflection_count` INT UNSIGNED    NOT NULL,
  `bytes`            INT UNSIGNED    NOT NULL,
  `created_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_export_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `daily_pick` (
  `pick_date`  DATE            NOT NULL,
  `quote_id`   BIGINT UNSIGNED NOT NULL,
  `note`       VARCHAR(200)    NULL,
  `created_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`pick_date`),
  KEY `idx_pick_quote` (`quote_id`),
  CONSTRAINT `fk_pick_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
