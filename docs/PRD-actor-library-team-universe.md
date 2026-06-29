# Kiikis 演员库、团队共享与分镜预生产 PRD

## 1. 背景

Kiikis 正在从单点 AI 工作台升级为 Universe-first 的创作系统。小说、剧本、分镜、视频和歌曲工作台需要共享同一套世界观、角色 canon 和生产资产，但视觉生产还缺少一个核心环节：可复用的虚拟演员资产。

演员库不是角色库。演员库回答“谁来演”，Universe 角色回答“演什么角色”，项目形象版本回答“这个演员在这部作品里如何呈现”。这三层必须分开保存、分开继承，避免演员基础形象、角色 canon 和项目妆造互相覆盖。

## 2. 产品目标

1. 新增“演员库”入口，位于左侧导航“宇宙”之后、“订阅”之前。
2. 建立只支持虚拟演员的演员库，支持个人资产和团队共享资产。
3. 支持通过文字资料创建虚拟演员，生成演员提示词、头像和角色参考表。
4. 支持上传虚拟演员头像，基于头像生成角色参考表，后续再补充资料并保存。
5. 将演员库与 Universe 角色、剧本工作台、分镜工作台打通。
6. 在项目内保存“演员饰演角色”的项目形象版本，包括三视图、定妆图、参考表和 prompt。
7. 调整分镜创作流程：先完成美术设计、角色形象和场景图，再生成分镜。
8. 新增团队基础能力，同团队共享演员库和 Universe。

## 3. 非目标

- 第一版不支持真实演员肖像授权流程。
- 第一版不做公开演员市场。
- 第一版不做多人实时协同编辑。
- 第一版不允许 AI 直接写入 Universe canon，仍必须进入 Inbox。
- 第一版不把项目形象版本反向覆盖到演员基础形象或 Universe 角色 canon。
- 第一版图像生成先接 MiniMax，GPT / Seedance 作为后续 provider。

## 4. 核心资产边界

### 4.1 演员库 Actor Library

保存虚拟演员的基础视觉身份：

- 演员名称
- 基础头像
- 基础外貌描述
- 年龄感、性别表达、体型、脸型、发型、肤色、气质
- 风格标签
- 基础 prompt
- 负面 prompt
- 角色参考表资产
- 可见范围：private / team
- 所属团队

演员库不保存剧情身份、角色关系或 canon。

### 4.2 Universe 角色 Canon

保存故事角色的正史设定：

- 角色身份
- 欲望、秘密、成长线
- 关系网
- 时间线状态
- locked canon facts
- 世界规则中的角色约束

Universe 角色不保存某个项目里的具体妆造、服装或三视图。

### 4.3 项目形象版本 Character Appearance Variant

保存演员在具体项目中饰演某个角色时的视觉版本：

- actor_id
- universe_entity_id / character_id
- project_id
- 角色名
- 项目画风
- 服装与妆造
- 三视图
- 角色参考表
- 表情与手势参考
- prompt pack
- 来源生成任务

项目形象版本属于项目资产，可被分镜和视频工作台调用，但不自动覆盖演员库或 Universe canon。

## 5. 演员创建流程

### 5.1 文字创建虚拟演员

1. 用户进入演员库。
2. 点击“新建演员”。
3. 输入虚拟演员资料：
   - 名称
   - 年龄感
   - 性别表达
   - 族裔 / 地域气质
   - 脸型、五官、发型、体型
   - 气质关键词
   - 可出演类型
   - 禁止元素
4. 系统生成演员基础 prompt。
5. 用户确认后调用 MiniMax 生成头像。
6. 用户点击“生成角色参考表”。
7. 系统生成参考表并保存到演员资产。

### 5.2 上传头像创建虚拟演员

1. 用户上传虚拟演员头像。
2. 系统保存头像为 actor source image。
3. 用户点击“生成角色参考表”。
4. MiniMax 基于头像生成参考表。
5. 用户补充演员资料并保存。

## 6. 默认角色参考表 Prompt 模板

第一版使用用户提供的模板作为系统默认模板，并做参数化：

```text
为图1生成专业完整角色参考表，
纯白色无缝背景上干净整洁的网格布局，
该表包括：
主全身体态转面图（正面、3/4 视角、侧面、背面），
左侧有主体身份+比例尺（最大），右上角有6-8 色调色板，
8 帧情绪进阶，5 帧微表情，多角度头部细节表，
中性站姿，姿态变化，1 张特写，
底部一排为服装和配饰特写细节（头发质地、外套面料、鞋子、配饰细节），
多种手势参考，角色轮廓指南。
所有画面中人物的脸部和身体比例一致，
4:3 横版，完美布局对齐。

演员基础信息：
{actorProfile}

头像参考：
{avatarReference}

项目画风：
{projectStyle}

角色设定：
{characterRole}

服装与妆造：
{costumeDirection}

必须保持：
- 同一张脸
- 同一身体比例
- 同一发型和关键识别点
- 参考表排版整齐
- 不生成多个人物
```

## 7. 剧本工作台联动

剧本创作页面中的角色模块增加“选择演员”能力：

1. 用户在角色卡中选择演员库演员。
2. 系统建立 actor-character-project 绑定。
3. 生成或选择该演员饰演该角色的项目形象版本。
4. 剧本项目保存 actor_id、character_id、appearance_variant_id。
5. 剧本导出和 Universe Inbox 只提交角色设定，不把项目妆造写入 canon。

## 8. 分镜工作台流程重构

当前分镜流程不应直接从剧本进入 shot list。新版流程：

1. 剧本导入
   - 粘贴剧本
   - 上传剧本 / JSON / Markdown
   - 从剧本项目导入

2. 美术设计
   - 画风
   - 色彩
   - 光影
   - 摄影质感
   - 时代与题材基调

3. 角色形象
   - 从 Universe 读取角色
   - 从演员库选择演员
   - 生成演员饰演角色的三视图 / 参考表
   - 保存为项目形象版本

4. 场景图
   - 场景列表
   - 关键地点
   - 氛围图
   - 道具和空间关系

5. 分镜生成
   - 拆 Scene
   - 拆 Shot
   - 每个 shot 继承画风、角色形象、场景图
   - 生成 shot prompt 和预览图

6. 发送视频工作台
   - 传递 shot list
   - 传递角色参考图
   - 传递场景图
   - 传递画风 prompt

## 9. 团队功能

### 9.1 Team

团队是共享 Universe 和演员库的权限边界。

角色：

- owner：管理团队、成员、账单、所有资产。
- admin：管理成员、共享演员、共享 Universe、确认 canon。
- editor：创建项目、提交 Inbox、创建项目形象版本。
- viewer：只读 Universe、演员和项目资产。

### 9.2 团队共享演员库

演员可见范围：

- private：仅创建者可见。
- team：团队成员按权限可见。

共享规则：

- viewer 可查看演员、头像、参考表。
- editor 可在项目中使用演员并创建项目形象版本。
- admin / owner 可编辑团队演员基础信息。

### 9.3 团队共享 Universe

Universe 可绑定 team_id。

权限规则：

- viewer：只读 canon、角色、关系、时间线、资产。
- editor：可提交 Inbox、创建项目链接、创建项目形象版本。
- admin / owner：可 accept / edit accept / reject Inbox，确认 canon，管理共享范围。

AI 抽取结果仍必须进入 Inbox，不允许绕过用户确认直接写 canon。

## 10. 数据模型草案

```ts
type Team = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  status: "active" | "invited" | "removed";
  createdAt: string;
  updatedAt: string;
};

type ActorProfile = {
  id: string;
  ownerId: string;
  teamId?: string | null;
  visibility: "private" | "team";
  name: string;
  bio: string;
  ageRange: string;
  genderExpression: string;
  ethnicityStyle: string;
  faceDescription: string;
  hairDescription: string;
  bodyDescription: string;
  temperament: string[];
  playableRoles: string[];
  basePrompt: string;
  negativePrompt: string;
  avatarAssetId?: string | null;
  referenceSheetAssetId?: string | null;
  status: "draft" | "ready" | "archived";
  createdAt: string;
  updatedAt: string;
};

type CharacterAppearanceVariant = {
  id: string;
  projectId: string;
  universeId?: string | null;
  actorId: string;
  universeEntityId?: string | null;
  characterName: string;
  projectStyle: string;
  costumeDirection: string;
  promptPack: Record<string, string>;
  frontAssetId?: string | null;
  threeViewAssetId?: string | null;
  referenceSheetAssetId?: string | null;
  status: "draft" | "approved" | "archived";
  createdAt: string;
  updatedAt: string;
};
```

## 11. API 草案

演员：

- `GET /api/actors`
- `POST /api/actors`
- `PATCH /api/actors`
- `DELETE /api/actors?id=<actorId>`

演员资产生成：

- `POST /api/actors/generate-prompt`
- `POST /api/actors/generate-avatar`
- `POST /api/actors/generate-reference-sheet`

项目形象版本：

- `GET /api/projects/[projectId]/appearance-variants`
- `POST /api/projects/[projectId]/appearance-variants`
- `PATCH /api/projects/[projectId]/appearance-variants`

团队：

- `GET /api/teams`
- `POST /api/teams`
- `PATCH /api/teams`
- `POST /api/teams/invite`
- `PATCH /api/teams/members`

Universe 共享：

- `PATCH /api/universe/share`
- `GET /api/universe/access?universeId=<id>`

## 12. MiniMax 接入

第一版图像生成 provider：

- 头像生成：MiniMax image generation。
- 头像到参考表：MiniMax image-to-image / reference-image workflow。
- 项目三视图：MiniMax image generation with actor reference and project style.

后续 provider：

- GPT image
- Seedance / 视频模型
- 其他图像参考模型

所有生成必须记录：

- provider
- model
- input prompt
- reference asset ids
- output asset ids
- generation task id
- user id / team id

## 13. 验收标准

第一阶段完成后应满足：

1. 左侧导航出现“演员库”，位置在“宇宙”之后、“订阅”之前。
2. 用户可进入演员库页面。
3. 用户可新建虚拟演员并保存资料。
4. 用户可上传虚拟演员头像。
5. 用户可生成演员基础 prompt。
6. 用户可调用 MiniMax 生成头像。
7. 用户可基于头像或文字资料生成角色参考表。
8. 演员可设置 private / team 可见性。
9. 团队成员可按权限查看或使用团队演员。
10. Universe 可设置 team_id 并对团队成员开放只读 / 写入权限。
11. 剧本角色可绑定演员。
12. 分镜角色形象可选择演员并生成项目形象版本。
13. 分镜工作台先展示美术设计、角色形象、场景图，再进入 shot list。
14. AI 抽取和 canon 写入仍遵守 Inbox 规则。

## 14. 推荐开发顺序

1. 数据契约与 Supabase migration。
2. 团队基础表、成员权限和 RLS。
3. 演员库数据模型、本地兜底和 API。
4. 演员库页面：列表、新建、详情、上传头像。
5. MiniMax 头像 / 参考表生成 API。
6. 项目形象版本数据模型和 API。
7. 剧本角色绑定演员 UI。
8. 分镜工作台流程重构：美术设计、角色形象、场景图、分镜。
9. Universe 团队共享。
10. 端到端验证和权限测试。
