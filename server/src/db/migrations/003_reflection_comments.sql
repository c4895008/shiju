-- 「拾句」感悟评论：单层平铺，随感悟与用户级联删除
-- 约定：评论可见性完全继承所属感悟；status=2 仅管理员隐藏，不做编辑

CREATE TABLE `reflection_comment` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reflection_id` BIGINT UNSIGNED NOT NULL,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `body`          VARCHAR(300)    NOT NULL,
  `status`        TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 正常 / 2 管理员隐藏',
  `created_at`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_comment_reflection` (`reflection_id`, `status`, `created_at`, `id`),
  KEY `idx_comment_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_comment_reflection` FOREIGN KEY (`reflection_id`) REFERENCES `reflection` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_comment_status` CHECK (`status` IN (1, 2)),
  CONSTRAINT `chk_comment_body` CHECK (CHAR_LENGTH(`body`) BETWEEN 1 AND 300)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
