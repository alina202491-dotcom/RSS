# Cloudflare-FreeRSS

将任意网站“抓取为”RSS 2.0 Feed，部署在 Cloudflare Workers 上，零服务器成本。支持：
- 通过查询参数临时生成 Feed（/feed?url=...）
- 通过 KV 保存规则并按 ID 生成 Feed（/f/:id）
- 简单的 Admin API（Bearer Token）
- Cloudflare 缓存（默认 5 分钟）

> 新手请先阅读：《部署超详细教程》见 `DEPLOY_GUIDE_ZH.md`

## 快速开始

1) 安装依赖

```bash
npm install
```

2) 本地开发

```bash
npm run dev
```

3) 部署

- 在 `wrangler.toml` 中配置：
  - `name`
  - `[[kv_namespaces]]` 的 `id`（生产）与 `preview_id`（预览/开发）
  - `ADMIN_TOKEN`

```bash
npm run deploy
```

## 用法

- 临时 Feed（通过查询参数）：

```
/feed?url=https://example.com/blog&item=.post&title=.title&link=a@href&content=.summary&limit=20
```

- 保存规则并使用：

```bash
# 创建/更新规则
curl -X PUT "https://<your-worker>/admin/rule/example" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{
    "sourceUrl": "https://example.com/blog",
    "item": ".post",
    "title": ".title",
    "link": "a@href",
    "content": ".summary",
    "site": {"title": "Example Blog", "link": "https://example.com"},
    "limit": 20
  }'

# 查看规则
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://<your-worker>/admin/rule/example"

# 删除规则
curl -X DELETE -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://<your-worker>/admin/rule/example"

# 列出规则
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://<your-worker>/admin/rules"
```

- 访问 Feed：

```
/f/example
```

## 选择器语法

- 字段选择器支持 `selector@attr` 提取属性，例如：`a@href`、`time@datetime`
- 特殊选择器 `self`/`.` 表示当前条目元素
- `item` 是每一条目容器的 CSS 选择器
- 字段未填写则尝试文本内容

## 缓存

- 对 `GET /feed` 与 `GET /f/:id` 结果使用 Cloudflare Worker 内置缓存（默认 5 分钟）
- 如需自定义，修改 `src/worker.ts` 中的 `cache-control` 设置

## 注意

- 解析使用 `linkedom`，大多数站点可用；极个别站点需自定义 UA（`ua` 参数或规则内 `userAgent`）
- 日期解析：支持时间戳（秒/毫秒）或可被 `Date.parse` 解析的字符串

## 开发脚本

- `npm run dev`：本地开发（需要已配置 KV 绑定）
- `npm run deploy`：部署到 Cloudflare
- `npm run check`：TypeScript 类型检查

## 许可证

MIT