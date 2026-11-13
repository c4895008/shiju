-- 「拾句」读友：双向好友申请与已接受关系
-- 约定：status=1 即互为读友；同一对用户只保留一条有效记录

CREATE TABLE `friend_request` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `requester_id` BIGINT UNSIGNED NOT NULL,
  `addressee_id` BIGINT UNSIGNED NOT NULL,
  `status`       TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 待处理 / 1 已接受 / 2 已拒绝',
  `created_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `responded_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_friend_pair` (`requester_id`, `addressee_id`),
  KEY `idx_friend_addressee` (`addressee_id`, `status`, `created_at`),
  KEY `idx_friend_requester` (`requester_id`, `status`, `created_at`),
  CONSTRAINT `fk_friend_requester` FOREIGN KEY (`requester_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_friend_addressee` FOREIGN KEY (`addressee_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_friend_not_self` CHECK (`requester_id` <> `addressee_id`),
  CONSTRAINT `chk_friend_status` CHECK (`status` IN (0, 1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
