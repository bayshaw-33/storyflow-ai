# 宇宙分享（阶段 B）设计文档

**项目**: kiikis.com 社区系统
**阶段**: B（宇宙分享）—— 5 阶段路线图（A→D→B→C→E）的第三阶段
**日期**: 2026-07-25
**状态**: 已批准，实施中

## 路线图背景

社区系统 5 阶段路线图（A→D→B→C→E）：
- **A** 用户资料与公开主页（已完成）
- **D** 演员市场（已完成）
- **B** 宇宙分享（本期）—— 创作者勾选宇宙内容 + 密码访问分享
- **C** 宇宙共创邀请
- **E** 宇宙改编授权

## 1. 目标与定位

宇宙创作者可以"分享"宇宙给他人，通过密码访问。核心机制：
- 创作者在现有 `/universe/[id]` 页面点"分享"按钮，配置分享设置
- 可整体分享或按类别勾选（角色/场景/规则/演员/章节/时间线/简介）
- 访客通过密码访问分享链接，只能看到勾选的内容
- 仅"查看"，编辑权限字段保留但本期不实现编辑 API
- 不新建探索页，不新建路由（在现有页面增强）
- 社区导航入口保留，点击进入 `/community` 提示"社区即将开放"

## 2. 数据库 Schema 扩展

### 2.1 storyflow_universes 加分享字段

```sql
ALTER TABLE public.storyflow_universes
  ADD COLUMN IF NOT EXISTS share_status TEXT DEFAULT 'private'
    CHECK (share_status IN ('private','shared','removed')),
  ADD COLUMN IF NOT EXISTS share_password TEXT,
  ADD COLUMN IF NOT EXISTS share_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_permissions JSONB DEFAULT '{}';
```

字段语义：
- `share_status`: private（默认未分享）/ shared（已分享）/ removed（平台下架，本期不用预留）
- `share_password`: bcrypt 哈希（cost 10）
- `share_updated_at`: 分享配置最后修改时间（用于 JWT 失效判断）
- `share_permissions`: JSONB 权限配置

### 2.2 share_permissions 结构

```json
{
  "sections": {
    "overview": true,
    "characters": true,
    "scenes": false,
    "rules": false,
    "actors": true,
    "chapters": false,
    "timeline": false
  },
  "allow_edit": false,
  "edit_permissions": {
    "characters": false,
    "scenes": false,
    "rules": false,
    "actors": false,
    "chapters": false
  }
}
```

- `sections`: 勾选哪些类别可被访客查看（true=可见，false=隐藏）
- `allow_edit`: 是否允许访客编辑（本期只存储不实现）
- `edit_permissions`: 细化每个类别的编辑权限（本期只存储不实现）

### 2.3 RLS 策略

- 本人可读所有自己的宇宙
- 访客只能读 share_status='shared' 的宇宙
- share_password 字段不通过 API 返回给访客（API 层过滤）

## 3. API 设计

### 3.1 分享配置管理（创作者）

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/universes/[universeId]/share | 登录+所有者 | 获取分享配置 |
| PUT | /api/universes/[universeId]/share | 登录+所有者 | 更新分享配置 |

PUT 入参：
```json
{
  "share_status": "private" | "shared",
  "password": "明文密码" | null,
  "permissions": { ... }
}
```

逻辑：
- share_status='private': 关闭分享
- share_status='shared': 开启分享
- 密码 6-32 字符，bcrypt 哈希
- permissions 整体覆盖
- 更新 share_updated_at = now()

### 3.2 访客密码验证

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| POST | /api/universes/[universeId]/share/verify | 公开 | 密码验证 + 签发 JWT |

流程：
1. 查宇宙 share_status，必须为 shared，否则 403
2. bcrypt 比对密码
3. 通过 → 签发 JWT（payload: { universe_id, share_updated_at, viewer_session: true }，24h，SHARE_JWT_SECRET）
4. 返回 { token, expires_in: 86400 }

安全：不区分"宇宙不存在"和"密码错误"（防枚举）

### 3.3 访客访问宇宙内容

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/universes/[universeId]/shared | share token (JWT) | 获取分享内容（按 sections 过滤） |

鉴权：Authorization: Bearer ${shareToken} 或 ?token=xxx

返回（根据 sections 过滤）：
```json
{
  "universe": { "id", "name", "cover_url", "tagline", "description" },
  "permissions": { "sections": {...}, "allow_edit": false, "edit_permissions": {...} },
  "sections": {
    "characters": [...],
    "scenes": [...],
    "rules": null,
    "actors": [...],
    "chapters": null,
    "timeline": null
  }
}
```

关键：
- share_password 不返回
- 每个 section 根据权限决定是否返回
- allow_edit=false 时只读

## 4. 页面与交互

### 4.1 创作者分享配置（在现有 /universe/[id] 增强）

- 现有宇宙详情页顶部操作区加"分享"按钮（Share2 图标）
- 点击弹出 ShareConfigDialog（Modal）
- Dialog 内容：
  - 分享状态 radio（未分享/已分享）
  - 访问密码输入 + 生成随机密码按钮
  - 可见内容勾选（7 个类别 checkbox）
  - 编辑权限（灰色禁用，标注"即将开放"）
  - 分享链接 + 复制按钮
  - 取消/保存
- 已分享状态下，顶部显示"已分享"徽标
- 保存调 PUT /api/universes/[id]/share

### 4.2 访客访问流程（现有 /universe/[id] 路由分流）

访问逻辑：
1. 访客打开 /universe/[id]（可能带 ?share=1）
2. 服务端判断：
   - 本人所有者 → 正常创作者视图（现有逻辑）
   - 他人宇宙 + share_status='shared' → 检查 share token
     - 无 token → 密码输入页（SharePasswordGate）
     - token 有效 → 访客视图（SharedUniverseView）
     - token 无效/过期 → 密码输入页
   - 他人宇宙 + share_status='private' → "该宇宙未公开"提示
   - 不存在 → 404

密码输入页：
- 锁图标 + 宇宙封面 + 名称 + 创作者
- 密码输入框 + 进入按钮
- 调 POST /api/universes/[id]/share/verify
- 成功后存 JWT 到 localStorage，跳转刷新

访客视图：
- 宇宙封面 + 名称 + 创作者 + 简介
- 仅显示 sections 勾选的 Tab（角色/场景/演员/章节/时间线）
- 未勾选的 Tab 不显示（不显示"无权限"）
- 底部提示"这是分享内容，仅供查看"

### 4.3 社区页面 /community

纯静态页：
- 中文："社区即将开放"
- 英文："Community Coming Soon"

### 4.4 GlobalSideNav 调整

保留 Community 入口，跳转目标改为 /community（原跳 /u/[username]）

## 5. 关键设计点

- 密码 bcrypt 哈希（cost 10）
- JWT 独立 secret（SHARE_JWT_SECRET），24h 有效期
- JWT payload 含 share_updated_at，修改密码后旧 JWT 自动失效
- JWT 存 localStorage，每次请求带 header
- 不新建路由，全部在现有 /universe/[id] 上增强
- 访客编辑本期不做（字段保留存储）
- 先发布后审核本期不做

## 6. 文件结构

### 新增 migration
- `supabase/migrations/20260803000000_universe_share.sql`

### 新增 lib
- `lib/universe-share/permissions.ts` — share_permissions 校验
- `lib/universe-share/password.ts` — bcrypt 哈希/比对
- `lib/universe-share/share-token.ts` — JWT 签发/验证
- `lib/supabase/universe-share-queries.ts` — 分享配置 CRUD + 访客内容查询

### 新增 API 路由
- `app/api/universes/[universeId]/share/route.ts` — GET/PUT
- `app/api/universes/[universeId]/share/verify/route.ts` — POST
- `app/api/universes/[universeId]/shared/route.ts` — GET

### 新增组件
- `components/universe/ShareConfigDialog.tsx`
- `components/universe/SharePasswordGate.tsx`
- `components/universe/SharedUniverseView.tsx`
- `components/universe/universe-share.module.css`

### 新增页面
- `app/community/page.tsx`
- `app/community/community.module.css`

### 修改文件
- `app/universe/[universeId]/page.tsx` — 加分享按钮 + 访客身份分流
- `components/layout/GlobalSideNav.tsx` — Community 跳 /community
- `lib/i18n/dictionaries.ts` — share/community 文案
- `.env.example` — 加 SHARE_JWT_SECRET

## 7. 实施顺序

1. DB migration
2. lib 层
3. API 路由
4. 组件层
5. 页面层 + 导航
6. i18n + 环境变量
7. 本地构建验证 + commit + push
