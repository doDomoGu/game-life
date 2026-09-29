# Game Life

一个面向移动端（兼容 Pad）的多小游戏合集平台。用户注册登录后游玩小游戏；**每一局结束都会写入一条对局记录**，个人可查看历史。**首期只实现一款游戏**，排行榜与多游戏大厅后续迭代；架构仍按多游戏扩展预留。

## 产品目标

| 能力 | 说明 |
|------|------|
| 首期范围 | **一款小游戏** + 登录注册 + 提交对局 + **个人对局历史** |
| 对局数据 | **每玩一局存一条记录**（不合并、不覆盖历史） |
| 排行榜 | **首期不做**（单游戏榜、全站榜均后续再加） |
| 多游戏（后续） | 注册表 + `gameId` 接入方式预留，第二期起加大厅与更多游戏 |
| 用户体系 | 仅用户名 + 密码注册登录 |
| 终端 | 手机优先布局，Pad 断点适配（触控、安全区、横竖屏） |

## 已确定的技术决策

| 项 | 决定 |
|----|------|
| 仓库 | **pnpm workspace** Monorepo（`apps/web`、`apps/server`、`packages/shared`） |
| 鉴权 | **JWT**，客户端在请求头携带 `Authorization: Bearer <token>` |
| 首期产品范围 | **单款游戏**；**存每条对局**；**无排行榜 API / 页面** |

## 技术选型

| 层级 | 选型 | 理由 |
|------|------|------|
| 前端 | Vue 3 + Vite + Vue Router + Pinia | 生态成熟，按需加载小游戏模块，状态清晰 |
| 移动端 UI | 自研布局 + 可选 Vant 4 | 组件贴近移动场景；Pad 用 CSS 断点放大栅格与触控区域 |
| 后端 | Node.js + Fastify（或 Express） | 轻量 REST，与前端同语言，便于共享类型 |
| 密码 | bcrypt | 只存哈希，不存明文 |
| 存储 | 服务器本地 JSON 文件 + 原子写入 | 前期数据量小，零依赖数据库，易备份与迁移 |
| 语言 | 全栈 TypeScript（推荐） | API 与实体类型可在 `packages/shared` 复用 |

后期若数据量或并发上升，可将 **Repository 层** 从文件实现替换为 PostgreSQL/Redis，业务与 API 形状尽量不变。

---

## 对局与成绩模型

### 首期（当前范围）

1. **一条对局 = 一条持久化记录**  
   用户每完成一局（或明确结束一局），客户端调用 `POST /api/games/:gameId/records`，服务端校验后 **追加** 到 `records.json`，不删不改旧记录。

2. **记录字段（建议）**

   | 字段 | 说明 |
   |------|------|
   | `id` | UUID |
   | `userId` | 所属用户 |
   | `gameId` | 首期固定为第一款游戏的 id |
   | `rawScore` | 本局成绩（首期第一款游戏的计分规则由该游戏定义） |
   | `durationMs` | 可选，本局耗时 |
   | `playedAt` | ISO 时间 |
   | `meta` | 可选 JSON，扩展字段（关卡、连击等） |

3. **个人历史**  
   `GET /api/me/records`：按 `playedAt` 倒序分页；首期默认就是这一款游戏的记录，仍保留 `gameId` 字段便于以后筛选。

4. **不做排行榜**  
   不在 UI 展示名次，不提供 `leaderboards` 接口；个人页可展示简单 **统计**（如总局数、历史最高分），由服务端对 **该用户自己的 records** 聚合即可，不涉及他人数据。

5. **首期只有一款游戏**  
   可以暂时没有「游戏大厅」多卡片，登录后直接进入该游戏或单一入口；`GET /api/games` 仍返回长度为 1 的列表，方便后续加游戏。

### 后续（预留，首期不实现）

| 阶段 | 内容 |
|------|------|
| 加游戏 | 大厅、多 `gameId`、按游戏筛历史 |
| 单游戏排行榜 | 按 `gameId` 聚合每人 best 再排序 |
| 全站榜 | 多游戏归一化 + 加权总积分 |

排行相关字段（如 `rankMode`）可在加榜时写入游戏注册表；首期注册表只需 **成绩校验**（上下界、必填字段）。

---

## 应用架构

### 总体形态

采用 **前后端分离 + 同仓 Monorepo**：一个仓库内包含 Web 应用、API 服务、共享类型与（可选）游戏元数据配置。

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (Mobile / Pad)                 │
│  Vue SPA：路由 / 鉴权 / 游戏壳 / 各小游戏 UI              │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS  REST JSON
┌──────────────────────────▼──────────────────────────────┐
│              Node API（鉴权、业务、游戏结算）               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Auth 模块   │  │ Game 注册表   │  │ 对局记录 / 个人统计 │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Repository 抽象 → FileStore（JSON + 文件锁/原子写）   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
                    server/data/*.json
```

### 核心模块划分

1. **认证（Auth）**  
   注册、登录、登出、当前用户；用户名唯一校验；密码强度可后期再加。

2. **游戏注册表（Game Registry）**  
   每个小游戏有稳定 `gameId`、展示名、图标、规则说明、**积分计算器**、**成绩校验器**（防无脑刷分的基础校验）。  
   前端路由与后端 `gameId` 保持一致，避免硬编码散落。

3. **对局记录（Record）**  
   每局结束上报一次；服务端校验后 **追加一条** 记录，返回保存后的记录（含 `id`、`playedAt`）。

4. **用户与历史（User / History）**  
   用户表仅存账号信息。  
   历史接口只查 **当前登录用户** 的对局列表；可选 `GET /api/me/stats` 仅聚合本人数据（局数、最佳分等）。

5. **文件存储（File Store）**  
   读写 JSON；写操作：**先写临时文件再 rename**；多请求时用简单 **队列锁** 或 `proper-lockfile` 避免并发写坏文件。  
   定期备份 `data/` 目录即可。

### 移动端与 Pad

- **Viewport**：`width=device-width`，关注 `safe-area-inset`（刘海、底栏）。  
- **布局**：移动单列；Pad（如 `min-width: 768px`）游戏区最大宽度居中，列表可多列。  
- **交互**：按钮最小触控约 44px；游戏页尽量全屏，共用顶部返回与积分条。  
- **性能**：每个小游戏 **路由级懒加载**，减小首屏包体。

### API 草案（REST）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/auth/logout` | 登出（客户端清除 token 即可；服务端可选黑名单） |
| GET | `/api/auth/me` | 当前用户信息（一期不含全站总积分） |
| GET | `/api/games` | 游戏列表（元数据） |
| POST | `/api/games/:gameId/records` | 提交一局结果 |
| GET | `/api/me/records` | 个人对局历史（分页；`gameId` 可选，首期可省略） |
| GET | `/api/me/stats` | 可选：本人总局数、最佳 `rawScore` 等（仅读自己的 records） |

### 数据文件（前期）

```
data/
  users.json          # 用户 id、username、passwordHash、createdAt
  records.json        # 对局：userId、gameId、rawScore、durationMs、playedAt、…
  meta.json           # 可选：版本号、最后迁移号
```

`users.json` 与 `records.json` 用 `id` / `userId` 关联；`records` 只追加。数据量大后再拆文件或迁库；加排行榜时再考虑聚合索引。

---

## 代码目录结构（底座 + 独立游戏）

```
game-life/
├── apps/
│   ├── web/src/main.ts          # 壳：注册要上线的游戏插件
│   └── server/src/index.ts      # 壳：createServer + data 目录
│
├── packages/
│   ├── shared/                  # 用户、对局、鉴权 DTO；游戏插件接口
│   ├── platform-web/            # 登录/首页/历史、API、路由、样式
│   └── platform-server/       # 鉴权、对局存储、REST、游戏注册表
│
└── games/
    └── poker-memory/            # 独立游戏包（元数据 + 前端玩法 + 服务端校验）
        ├── src/meta.ts
        ├── src/server.ts        # ServerGamePlugin
        ├── src/web.ts           # WebGamePlugin
        └── src/web/Play.vue …
```

### 新增一个小游戏

1. 在 `games/<game-id>/` 新建包：`intro.config.ts`、`routes.ts`、`server.ts`、`web.ts`、`src/web/` 玩法 UI。  
2. 在 `apps/server/src/index.ts` 的 `games: [...]` 中挂上 `server` 插件。  
3. 在 `apps/web/src/main.ts` 的 `games: [...]` 中挂上 `web` 插件。  

介绍页由底座 **`GameIntroView`** 统一渲染；在 `WebGamePlugin.intro` 里配置 `rules`、`bestRecordLabel` 等即可，不必单独写 Intro 页面。

---

## 首期游戏：扑克记忆翻牌

- **gameId**：`poker-memory`
- 16 张牌、8 对（A～7，♠/♥ 同点数配对）
- **成绩 `rawScore`**：全部配对完成时的翻开次数（每翻开 2 张计 1 次，最少 8 次）
- 规则说明见 [docs/games/poker-memory.md](docs/games/poker-memory.md)

## 本地开发

```bash
pnpm install          # 若本机 pnpm 异常，可用：npx pnpm@9 install
pnpm dev              # 同时启动 API :3000 与 Web :5173
# 或分别：pnpm dev:server / pnpm dev:web
```

浏览器打开 `http://localhost:5173`，注册登录后「开始游戏」。

**手机同 WiFi 访问**（API 仍走本机 3000，由 Vite 代理 `/api`）：

```bash
pnpm dev:lan
# 或：npx pnpm@9 dev:lan
```

终端会打印 `Network: http://192.168.x.x:5173`，手机浏览器打开该地址即可。本机 IP 也可执行：`ipconfig getifaddr en0`（macOS WiFi 多为 `en0`）。

前端使用 **Vite 5**（兼容 Node 20.11.x；Vite 7 需 Node 20.19+）。

## 开发与部署（简要）

- **开发**：`web` 走 Vite 代理到 `server`；或同源由 server 反代。  
- **生产**：`web` 构建为静态资源；Node 提供 API，并可 `fastify-static` 托管 `dist`。  
- **环境变量**：`JWT_SECRET`、`DATA_DIR`、`PORT`；切勿将 `data/` 与密钥提交到 Git。  
- **`.gitignore`**：`node_modules`、`dist`、`apps/server/data/*.json`、`.env`。

---

## 风险与后续演进

| 项 | 前期做法 | 后续 |
|----|----------|------|
| 刷分 | 每游戏服务端 `validate` + 合理上下界 | 会话 token、关键步骤服务端校验 |
| 并发写文件 | 进程内锁 + 原子 rename | 迁 SQLite/Postgres |
| 排行榜 | 首期无 | 读 `records` 聚合 best 或预计算榜 |
| 密码找回 | 不做 | 再加邮箱或管理员重置 |

---

## 许可证

待定。
