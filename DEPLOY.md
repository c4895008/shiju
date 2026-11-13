# 「拾句」部署手册

单进程 Node + Express（运行时 SSR 与 API 同进程）+ MySQL 8 + Nginx。以下命令均在仓库根目录执行。

## 1. 环境要求

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（建议 22 LTS） | 仓库 `.nvmrc` 为 22 |
| MySQL | 8.0+（生产验证 8.4） | 库名必须以 `shiju` 开头 |
| Nginx | 1.20+ | TLS、静态资源与反代 |
| systemd | 任意 | 单实例守护 |

## 2. 首次部署

```bash
npm ci
cp server/.env.example server/.env
# 编辑 server/.env：JWT_SECRET / IP_HASH_SALT / DB_PASSWORD / SITE_URL 必填
npm run migrate          # 建库并执行迁移（幂等）
npm run seed             # 先 dry-run 校验
node server/scripts/import-seed.mjs --apply
npm run create-admin     # 交互创建管理员；也可用 ADMIN_* 环境变量
npm run build            # 生成 client/dist 与 client/dist-ssr
npm start                # NODE_ENV=production，默认 127.0.0.1:3001
```

### 必填环境变量

```ini
PORT=3001
NODE_ENV=production
SITE_URL=https://your-domain.com
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=shiju
DB_PASSWORD=...
DB_NAME=shiju
JWT_SECRET=<≥32 字符随机串>
IP_HASH_SALT=<随机串>
BCRYPT_COST=12
SSR_ENABLED=1
SSR_CACHE_MAX=400
SSR_TIMEOUT_MS=1500
CORS_ORIGINS=https://your-domain.com
```

`SITE_URL` 用于 canonical、OG、JSON-LD 与导出链接，必须与线上域名一致（末尾不带 `/`）。
`CORS_ORIGINS` 会自动并入 `SITE_URL` 与 `http://localhost:$PORT`，同源请求不受影响。

## 3. systemd

`/etc/systemd/system/shiju.service`：

```ini
[Unit]
Description=Shiju quote site
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/shiju
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now shiju
sudo journalctl -u shiju -f
```

只允许单实例运行：SSR 缓存、限流与幂等键均为进程内实现，多实例需要外部缓存/限流改造。

## 4. Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  client_max_body_size 1m;
  gzip on;
  gzip_types text/html text/css application/javascript application/json application/xml image/svg+xml;

  # 构建产物长缓存；文件名带 hash
  location /assets/ {
    alias /srv/shiju/client/dist/assets/;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location = /favicon.svg {
    root /srv/shiju/client/public;
  }

  location = /robots.txt {
    root /srv/shiju/client/public;
  }

  # 其余全部交给 Node：SSR 页面、sitemap、API
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
  }
}

server {
  listen 80;
  server_name your-domain.com;
  return 301 https://$host$request_uri;
}
```

说明：

- 不要把 `/` 静态化到 `client/dist/index.html`，否则 SSR 失效。
- `client/dist/index.html` 只是带 `<!--app-head-->` / `<!--app-html-->` 占位符的模板，由 Node 注入。
- 私有页（`/notebook`、`/q/*/write`、`/auth/*`、`/admin`）返回 SPA 壳并带 `X-Robots-Tag: noindex, nofollow`。
- 首次上线后把 `robots.txt` 中的 Sitemap 域名改成正式域名，并在搜索引擎站长平台提交 `/sitemap.xml`。

## 5. 备份与恢复

```bash
npm run backup -w server            # 生成 server/backups/shiju-YYYYmmdd-HHMMSS.sql.gz，保留最近 14 份
bash server/scripts/restore.sh server/backups/shiju-YYYYmmdd-HHMMSS.sql.gz
```

建议每日备份并定期把 `server/backups/*.sql.gz` 同步到异地。

建议 crontab：

```cron
15 3 * * * cd /srv/shiju && /usr/bin/npm run backup -w server >> /var/log/shiju-backup.log 2>&1
```

## 6. 上线检查

```bash
curl -fsS http://127.0.0.1:3001/api/health
npm run check:seo                    # 需服务已启动，检查 title/description/canonical/JSON-LD/noindex/sitemap
npm test                             # 单元测试
npm run test:int                     # 集成测试，仅操作 shiju_test
```

人工确认：

- 首页、台词页、影片页、主题页、搜索页 SSR 输出含正文与正确的 `<title>`。
- 私有页源码不含用户数据，仅 SPA 壳。
- 登录/注册/写感悟/点赞/台词本/导出/后台全部可用。
- 台词页与影片页 301（改 slug 后）与 410（墓碑）符合预期。
- `/sitemap.xml` URL 数量与 `quote + work + theme + 首页` 一致。
- 后台「搜索报表」能看到零结果词。
