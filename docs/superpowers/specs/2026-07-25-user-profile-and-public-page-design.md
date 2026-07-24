# 用户资料与公开主页（阶段 A）设计文档

**项目**: kiikis.com 社区系统
**阶段**: A（用户资料与公开主页）—— 5 阶段路线图（A→D→B→C→E）的第一阶段
**日期**: 2026-07-25
**状态**: 已批准，实施中

## 路线图背景

社区系统包含 5 个子系统，按 A→D→B→C→E 顺序推进：
- **A** 用户资料与公开主页（本期）
- **D** 演员市场（付费使用 + 订单 + 分账）
- **B** 作品/宇宙公开展示（探索页 + 发布流程）
- **C** 宇宙共创邀请（基于 universe_shares 扩展）
- **E** 宇宙改编授权（免费/收费授权合约）

## 1. 目标与定位

用户公开主页（`/u/[username]`）定位为**创作者中心（Creator Hub）**：
- 展示作品/宇宙/演员
- 个人简介 + 创作统计
- 徽章成就（6 枚里程碑）
- 无动态流、无关注/粉丝（本期不做）

## 2. 数据库 Schema 扩展

### 2.1 storyflow_profiles 新增字段

```sql
ALTER TABLE public.storyflow_profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS username_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES public.storyflow_assets(id),
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS language_preference TEXT DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS pronouns TEXT,
  ADD COLUMN IF NOT EXISTS creative_tags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public','private'));
```

### 2.2 徽章定义表

```sql
CREATE TABLE IF NOT EXISTS public.storyflow_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_zh TEXT,
  description_en TEXT,
  icon_asset_id UUID,
  category TEXT DEFAULT 'milestone',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.3 用户徽章授予表

```sql
CREATE TABLE IF NOT EXISTS public.storyflow_user_badge_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.storyflow_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, badge_id)
);
```

### 2.4 AI 头像生成白名单表

```sql
CREATE TABLE IF NOT EXISTS public.storyflow_ai_avatar_whitelist (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);
```

### 2.5 6 枚徽章 seed

```sql
INSERT INTO public.storyflow_badges (badge_key, name_zh, name_en, description_zh, description_en, category, sort_order) VALUES
  ('first_signup',  '加入 kiikis',   'Joined kiikis',   '完成注册',                       'Completed signup',         'milestone', 1),
  ('first_work',    '处女作',        'First Work',      '发布第一部作品',                 'Published first work',     'milestone', 2),
  ('first_universe','创世者',        'Universe Creator','建立第一个宇宙',                 'Created first universe',   'milestone', 3),
  ('first_actor',   '选角导演',      'Casting Director','创建第一个演员',                 'Created first actor',      'milestone', 4),
  ('first_used',    '被看见',        'Being Seen',      '作品/演员首次被他人使用',        'First usage by others',    'milestone', 5),
  ('first_adapted', '被传承',        'Being Adapted',   '宇宙首次被他人改编',             'First universe adaptation','milestone', 6)
ON CONFLICT (badge_key) DO NOTHING;
```

### 2.6 徽章触发 trigger

统一函数 `award_badge_if_first()` 绑定到 6 张表的 `AFTER INSERT`：
- `auth.users` → first_signup
- `storyflow_projects` → first_work
- `storyflow_universes` → first_universe
- `storyflow_actor_profiles` → first_actor
- `storyflow_actor_usages` → first_used（仅当 consumer_id != actor_owner_id 且 owner 此前无任何被使用记录）
- `storyflow_universe_project_links` → first_adapted（仅当 link.user_id != universe.user_id 且 project_role = 'adaptation' 且 owner 此前无任何被改编记录）

### 2.7 历史数据回填

迁移脚本中一次性回填已有用户的徽章（first_signup/first_work/first_universe/first_actor/first_used/first_adapted）。

### 2.8 白名单初始化

- 现有用户全量插入 `storyflow_ai_avatar_whitelist`
- 新用户 trigger 自动加入白名单（本期策略）

### 2.9 RLS 策略

- `storyflow_profiles`: 本人可读可写；他人只读 `profile_visibility = 'public'` 的字段
- `storyflow_user_badge_awards`: 本人可读；他人只读公开用户的徽章
- `storyflow_badges`: 所有人可读 active 徽章
- `storyflow_ai_avatar_whitelist`: 本人可查；管理员可写

## 3. API 设计

### 3.1 Profile 读写

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/profile/me` | 必须登录 | 获取本人完整 profile |
| PATCH | `/api/profile/me` | 必须登录 | 更新本人 profile |
| GET | `/api/profile/check-username?username=xxx` | 必须登录 | 校验 username 可用性 + 冷静期 |
| GET | `/api/profile/avatar/whitelist-status` | 必须登录 | 查询当前用户是否在 AI 头像白名单 |

### 3.2 头像

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| POST | `/api/profile/avatar/upload` | 必须登录 | 上传图片 → 转 asset → 更新 avatar_asset_id |
| POST | `/api/profile/avatar/ai-generate` | 必须登录 + 管理员/白名单 | 调 Flux API 生成 1 张 → 转 asset → 更新 avatar_asset_id |

**AI 生成约束**：
- 每次生成 1 张（非 4 张）
- 每日最多 3 次（服务端 UTC 日校验）
- 不消耗 KK 币
- 接 Flux API（环境变量 `FLUX_API_KEY` / `FLUX_API_URL`）

### 3.3 公开主页

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/u/[username]` | 公开（public 用户） | 一次性返回 profile + stats + badges + 默认 Tab 首屏 |
| GET | `/api/u/[username]/works?cursor=xxx&limit=12` | 公开 | 作品分页 |
| GET | `/api/u/[username]/universes?cursor=xxx&limit=12` | 公开 | 宇宙分页 |
| GET | `/api/u/[username]/actors?cursor=xxx&limit=12` | 公开 | 演员分页 |
| GET | `/api/u/[username]/badges` | 公开 | 徽章列表 |

### 3.4 username 校验规则

- 3-20 字符
- 仅 `[a-z0-9_-]`
- 不能以 `-` 开头/结尾
- 保留字：`admin`, `api`, `settings`, `u`, `login`, `dashboard`, `universes`, `actors`, `subscription`, `production`, `novel-workbench`, `song-workbench`, `viral-workbench`, `video-workbench`, `storyboard-workbench`, `art-workbench`, `production-workbench`
- 30 天冷静期（`username_changed_at` 距今 < 30 天则拒绝）

### 3.5 统计数字

本期实时聚合（不缓存）：
- `works_count`: `storyflow_projects` WHERE user_id AND deleted_at IS NULL
- `universes_count`: `storyflow_universes` WHERE user_id AND status != 'archived'
- `actors_count`: `storyflow_actor_profiles` WHERE owner_id AND status != 'archived'
- `used_count`: `storyflow_actor_usages` JOIN actor_profiles WHERE owner_id AND consumer_id != owner_id AND revoked_at IS NULL
- `adapted_count`: `storyflow_universe_project_links` JOIN universes WHERE universe.user_id AND link.user_id != universe.user_id AND project_role = 'adaptation'

## 4. 页面与路由

### 4.1 新增路由

- `/u/[username]` — 用户公开主页（紧凑型布局）
- `/settings/profile` — 资料编辑（新增 Tab）
- `/settings/api` — 现有 API 配置迁移
- `/settings/subscription` — 现有套餐迁移
- `/settings` — 重定向到 `/settings/profile`

### 4.2 主页布局（紧凑型）

```
┌─────────────────────────────────────────────┐
│ [TopNav]                                    │
├─────────────────────────────────────────────┤
│ [GlobalSideNav]                             │
│  ┌─────────────────────────────────────────┐│
│  │ [头像] Kiikis @kiikis [Pro]             ││  顶部资料卡
│  │        AI GC 导演 · 专注于都市情感短剧  ││
│  │        12 作品 · 3 宇宙 · 8 演员 · 234 被使用 │
│  │                          [本人:编辑]    ││
│  ├─────────────────────────────────────────┤│
│  │ [作品·12] [宇宙·3] [演员·8] [成就]      ││  Tab
│  ├─────────────────────────────────────────┤│
│  │ [作品网格 3 列]                         ││
│  │ [加载更多]                              ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 4.3 交互

- 本人访问：显示"编辑"按钮 → `/settings/profile`
- 他人访问：纯浏览
- 未登录访客访问 public 用户：正常展示
- 未登录访客访问 private 用户：404 或提示
- 不存在的 username：404
- Tab 切换：URL query param `?tab=universes`
- 空状态：Tab 为 0 时显示"暂无内容"，本人额外提示"去创作"

## 5. 资料编辑表单

### 5.1 头像方案

- **默认头像**：字母头像（display_name 首字母 + user_id 哈希决定渐变色，前端纯计算）
- **上传**：本地图片 → 客户端裁剪（1:1，最小 200x200）→ Supabase Storage `avatars` bucket → asset → avatar_asset_id
- **AI 生成**：接 Flux API，每次 1 张，每日 3 次上限，不扣 KK 币，仅管理员+白名单可用

### 5.2 表单字段

| 字段 | 校验 |
|---|---|
| username | 3-20 字符，`^[a-z0-9_-]+$`，保留字，30 天冷静期 |
| display_name | 1-32 字符 |
| bio | 0-500 字符 |
| creative_tags | 数组，最多 5 个，每项 2-8 字符 |
| location | 0-64 字符 |
| language_preference | 'en-US' \| 'zh-CN' |
| pronouns | 0-32 字符 |
| social_links | 见 5.3 |
| profile_visibility | 'public' \| 'private' |

### 5.3 社交链接（双地区并存）

```json
{
  "social_links": {
    "overseas": {
      "twitter": "https://x.com/kiikis",
      "facebook": "https://facebook.com/kiikis",
      "instagram": "https://instagram.com/kiikis"
    },
    "china": {
      "douyin": "https://douyin.com/...",
      "xiaohongshu": "https://xiaohongshu.com/...",
      "douban": "https://douban.com/..."
    },
    "display_region": "overseas"
  }
}
```

- 两地区可同时填写，不清空
- `display_region` 决定主页展示哪个地区（默认根据 language_preference 推断）
- 每个 URL 必须 https:// 开头，允许空值

## 6. 徽章触发逻辑

6 枚徽章触发条件见 2.6。使用 PostgreSQL trigger 自动授奖，幂等（UNIQUE 约束）。历史数据回填见 2.7。

## 7. 主页渲染

- SSR 首屏：服务端调 `/api/u/[username]` 获取 profile + stats + badges + 默认 Tab 首屏
- Tab 切换：客户端调 `/api/u/[username]/{tab}?cursor=xxx` 增量加载
- SWR 缓存 + mutate

### Tab 内容

| Tab | 数据源 | 卡片组件 | 网格 |
|---|---|---|---|
| 作品 | storyflow_projects | 复用 UniverseCard 样式 | 3 列 |
| 宇宙 | storyflow_universes | 复用 UniverseCard | 3 列 |
| 演员 | storyflow_actor_profiles | 复用 ActorCard | 4 列 |
| 成就 | storyflow_user_badge_awards | 新建 BadgeCard | 6 列 |

### 字母头像算法（前端）

```ts
function getLetterAvatar(displayName: string, userId: string) {
  const letter = (displayName || '?').charAt(0).toUpperCase();
  const hash = simpleHash(userId);
  const gradients = [
    'linear-gradient(135deg, #00d4ff, #0066ff)',
    'linear-gradient(135deg, #ff6b6b, #ff8c00)',
    'linear-gradient(135deg, #a78bfa, #ec4899)',
    // 6-8 组预设渐变
  ];
  return { letter, gradient: gradients[hash % gradients.length] };
}
```

## 8. 导航集成

### 8.1 TopNav 改造

现有：账号名文本 + Sign out 按钮
改为：头像（24px）+ 账号名 + 下拉菜单（UserMenu 组件）
- 我的主页 → /u/[username]（未设 username 跳 /settings/profile）
- 账号设置 → /settings/profile
- 退出登录

### 8.2 GlobalSideNav 改造

现有 5 入口：Home / Dashboard / Universe / Actors / Pricing
新增第 6 个：Community（位置：Dashboard 下方）
- 登录 → /u/[username]（未设跳 /settings/profile）
- 未登录 → /login

## 9. 文件结构

### 新增文件

```
app/
├── u/[username]/
│   ├── page.tsx                          # 用户公开主页（SSR）
│   ├── loading.tsx
│   └── not-found.tsx
├── settings/
│   ├── profile/page.tsx                  # 资料编辑
│   ├── api/page.tsx                      # API 配置迁移
│   └── subscription/page.tsx             # 套餐迁移
└── api/
    ├── profile/
    │   ├── me/route.ts                   # GET/PATCH 本人 profile
    │   ├── check-username/route.ts       # GET username 可用性
    │   ├── avatar/whitelist-status/route.ts
    │   ├── avatar/upload/route.ts
    │   └── avatar/ai-generate/route.ts
    └── u/[username]/
        ├── route.ts                      # 主页聚合
        ├── works/route.ts
        ├── universes/route.ts
        ├── actors/route.ts
        └── badges/route.ts

components/
├── profile/
│   ├── ProfileHeader.tsx
│   ├── ProfileTabs.tsx
│   ├── WorksGrid.tsx
│   ├── UniversesGrid.tsx
│   ├── ActorsGrid.tsx
│   ├── BadgesGrid.tsx
│   ├── BadgeCard.tsx
│   └── LetterAvatar.tsx
├── settings/
│   ├── SettingsTabs.tsx
│   ├── ProfileEditor.tsx
│   ├── AvatarUploader.tsx
│   ├── AvatarAIGenerator.tsx
│   ├── UsernameField.tsx
│   ├── TagInput.tsx
│   └── SocialLinksEditor.tsx
└── layout/UserMenu.tsx

lib/
├── profile/
│   ├── username-validation.ts
│   ├── avatar-url.ts
│   └── letter-avatar.ts
└── supabase/profile-queries.ts

supabase/migrations/
└── 20260728000000_community_profile.sql
```

### 修改文件

- `app/settings/page.tsx` → 重定向到 /settings/profile
- `components/layout/TopNav.tsx` → 加头像 + UserMenu
- `components/layout/GlobalSideNav.tsx` → 加 Community 入口
- `lib/i18n/dictionaries.ts` → 加 profile/community 文案
- `app/globals.css` → 加社区相关样式（如需要）

## 10. 实施顺序

1. DB migration
2. lib 层
3. API 路由
4. 组件层
5. 页面层
6. 导航改造
7. i18n 文案
8. 本地构建验证 + commit + push
