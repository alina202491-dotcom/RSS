## Cloudflare-FreeRSS 超详细部署教程（面向新手）

本文手把手教你把本项目部署到 Cloudflare Workers。零服务器成本，几分钟上线。即使是第一次使用 Cloudflare，也能顺利完成。

---

### 一、准备工作（账号与工具）

1. 注册/登录 Cloudflare 账号
   - 访问 `https://dash.cloudflare.com/`，注册并登录。

2. 安装 Node.js 与 npm（本地环境）
   - 建议 Node.js 版本 ≥ 18。可从 `https://nodejs.org/` 下载 LTS 版本。
   - 安装完成后在终端运行：
     ```bash
     node -v
     npm -v
     ```
     能输出版本号即成功。

3. 克隆本仓库并安装依赖
   ```bash
   git clone <你的仓库地址> cloudflare-freerss
   cd cloudflare-freerss
   npm install
   ```

---

### 二、认识项目结构与关键配置

- 入口文件：`src/worker.ts`
- 构建/部署工具：Wrangler（Cloudflare 官方）
- 配置文件：`wrangler.toml`
- 类型检查：`tsconfig.json`（本项目不本地产出 dist，交给 Wrangler 打包）
- 依赖：`package.json`

重点看 `wrangler.toml`：
```toml
name = "cloudflare-freerss"
main = "src/worker.ts"
compatibility_date = "2024-08-21"
minify = true
node_compat = false

[vars]
ADMIN_TOKEN = "changeme"

[[kv_namespaces]]
binding = "FEED_RULES"
id = "your_prod_kv_id"
preview_id = "local_dev_kv_id"
```

- `name`：你的 Worker 名称。
- `main`：入口脚本（Wrangler 会自动打包 TypeScript）。
- `[vars].ADMIN_TOKEN`：管理 API 使用的令牌（相当于密码）。
- `[[kv_namespaces]]`：KV 存储绑定，`binding` 必须是 `FEED_RULES`（与代码一致）。
  - `id`：生产环境 KV Namespace 的 ID。
  - `preview_id`：预览/本地开发使用的 KV Namespace ID。

---

### 三、在 Cloudflare 控制台创建 KV Namespace

1. 打开 Cloudflare Dashboard：`Workers & Pages` → 左侧导航 `KV` → `Create a namespace`
2. 分别创建两个命名空间（也可以只创建一个先用着）：
   - 生产：名称如 `freerss-prod`
   - 预览/开发：名称如 `freerss-dev`
3. 进入每个命名空间详情页，复制其 `Namespace ID`。
4. 回到本地，编辑 `wrangler.toml`：
   - 将 `id` 替换为生产 `Namespace ID`
   - 将 `preview_id` 替换为开发 `Namespace ID`

示例：
```toml
[[kv_namespaces]]
binding = "FEED_RULES"
id = "3a1b2c3d4e5f6..."          # 替换为生产 KV 的 ID
preview_id = "1a2b3c4d5e6f7..."   # 替换为开发 KV 的 ID
```

---

### 四、设置管理令牌 ADMIN_TOKEN（很重要）

`ADMIN_TOKEN` 用于保护管理接口（`/admin/...`）。部署前请将默认的 `changeme` 改为一个足够复杂的随机字符串。

两种方式：

1) 直接写在 `wrangler.toml`（简单、直观）
```toml
[vars]
ADMIN_TOKEN = "请改成一串足够随机的字符串"
```

2) 使用 `wrangler secret`（更安全，保存在 Cloudflare 端）
```bash
npx wrangler secret put ADMIN_TOKEN
# 按提示输入令牌内容
```
注意：若使用 secret，`wrangler.toml` 中可以删除 `[vars].ADMIN_TOKEN`，或者保留但会被 secret 覆盖。

---

### 五、本地开发与验证

1. 启动本地开发服务（需要你已配置好 preview 的 KV）
```bash
npm run dev
```

2. 终端会显示本地开发地址（通常是 `http://127.0.0.1:8787`）。打开浏览器访问根路径 `/`，能看到项目主页即成功。

3. 快速验证生成临时 Feed：
```text
/feed?url=https://example.com/blog&item=.post&title=.title&link=a@href&content=.summary&limit=20
```
在浏览器地址栏将上面的路径拼到本地地址后面访问，应该返回一段 RSS XML。如果 502，多半是目标站点访问失败或选择器不对，详见后文故障排查。

4. 管理 API 验证（以创建规则为例）：
```bash
curl -X PUT "http://127.0.0.1:8787/admin/rule/example" \
  -H "Authorization: Bearer <你的ADMIN_TOKEN>" \
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
```

查看规则：
```bash
curl -H "Authorization: Bearer <你的ADMIN_TOKEN>" \
  "http://127.0.0.1:8787/admin/rule/example"
```

访问规则生成的 Feed：
```text
/f/example
```

---

### 六、部署到 Cloudflare（生产环境）

1. 确保 `wrangler` 已安装（本项目已作为 devDependency 安装）。
   - 首次登录 Cloudflare 账号（如未登录）：
     ```bash
     npx wrangler login
     ```

2. 部署命令：
```bash
npm run deploy
```

3. 部署完成后，终端会显示形如：
```
⬣  Successfully published your Worker!
  https://cloudflare-freerss.your-subdomain.workers.dev
```
复制该地址，在浏览器访问根路径 `/`、`/health`、`/feed?...`、`/f/...` 做最终验证。

---

### 七、常见用法示例

- 临时 Feed（通过查询参数直接生成）：
```text
/feed?url=https://example.com/blog&item=.post&title=.title&link=a@href&content=.summary&limit=20
```

- 保存规则（更方便复用）：
```bash
curl -X PUT "https://<你的域名>/admin/rule/news" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{
    "sourceUrl": "https://example.com/news",
    "item": ".article",
    "title": ".headline",
    "link": "a@href",
    "content": ".summary",
    "date": "time@datetime",
    "site": {"title": "Example News", "link": "https://example.com"},
    "limit": 50
  }'
```

访问：`/f/news`

---

### 八、进阶与优化

- 缓存：默认对 `/feed` 与 `/f/:id` 响应使用 Cloudflare 缓存 5 分钟（见 `src/worker.ts` 中的 `cache-control`）。可根据需要调整数值或策略。
- UA 自定义：部分站点需要自定义 User-Agent，临时使用时通过查询参数 `ua`，保存规则时写入 `userAgent` 字段。
- 日期解析：`date` 字段支持 `selector@attr` 或可被 `Date.parse` 解析的文本；也支持时间戳（秒/毫秒）。

---

### 九、故障排查与常见错误

1. 无法访问管理接口，提示 401 Unauthorized
   - 检查请求头的 `Authorization: Bearer <ADMIN_TOKEN>` 是否正确。
   - 若使用了 `wrangler secret`，确认 secret 已设置并在对应环境可用。

2. 返回 502 Bad Gateway
   - 目标站点阻断或返回非 200：尝试加 UA（`ua` 参数或规则里的 `userAgent`）。
   - 选择器不匹配：调整 `item`、`title`、`link`、`content` 等 CSS 选择器。
   - 网络临时问题：稍后重试。

3. 访问 `/f/:id` 提示 Rule not found
   - 确认已用管理接口 `PUT /admin/rule/:id` 成功创建。
   - 确认已指向正确的环境（本地/生产）。
   - 检查 KV 绑定是否正确（`FEED_RULES`、`id/preview_id` 是否为有效的 Namespace ID）。

4. 部署成功但访问地址 404
   - 确认访问路径是否为根路径 `/`、`/feed`、`/f/...`、`/admin/...`（其他路径会返回 Not Found）。

5. 想生成 `dist/worker.mjs`
   - 本项目默认由 Wrangler 打包，无需本地产物。
   - 若你确实需要：
     ```bash
     npm i -D esbuild
     npx esbuild src/worker.ts --bundle --format=esm --target=es2022 --outfile=dist/worker.mjs --minify
     ```
   - 可选：将 `wrangler.toml` 的 `main` 改为 `dist/worker.mjs`。

---

### 十、安全与运营建议

- 妥善保管 `ADMIN_TOKEN`，不要泄漏到公开仓库或截图。
- 如需多人协作，建议使用 `wrangler secret` 并分配最小权限。
- 对外暴露的管理接口仅在可信环境调用；必要时在 Cloudflare Access 前加一道保护。
- 定期评估目标站点的抓取频率与法律合规。

---

### 十一、更新与维护

- 本地更新依赖：
```bash
npm install
```
- 查看 TypeScript 类型是否正常：
```bash
npm run check
```
- 重新部署：
```bash
npm run deploy
```

---

如果你在任一步骤遇到问题，先对照“故障排查与常见错误”，仍未解决可在 Issue 中附上报错信息与你已尝试的步骤。

