# Kiikis 2.0 公开首页文案设计

- 状态：文案与五屏结构已确认，待实施
- 日期：2026-08-14
- 页面：公开营销首页 `/`
- 第一受众：创作者与制作团队
- 叙事方向：作品生产 + Universe 资产

## 1. 目标

首页表层回答“Kiikis 如何帮助我完成作品”，深层回答“为什么每完成一个项目，我的角色、世界与 IP 资产都会继续积累”。

用户应在首屏理解 Kiikis 的实际用途，再在后续内容中理解 Universe、演员资产和创作留痕带来的长期价值。

## 2. 不可变更的品牌约束

1. 品牌主标题任何时候都不能修改、改写或替换。
2. 实施时保持当前源码中的主标题字符、断行、标点、装饰符号和视觉样式原样，不做“顺手统一”。
3. 英文品牌主标题同样锁定：`Every universe begins with one idea.`
4. 所有优化只发生在副标题、分屏文案、内容顺序和 CTA。

## 3. 叙事结构

```text
念头 → 项目 → 作品 → 资产 → Universe → 下一部作品
```

页面使用五屏结构，与当前首页实际渲染的五张 Hero 图片一一对应：

| 屏幕 | 内容 | 图片令牌 |
| --- | --- | --- |
| 1 | 品牌与产品承诺 | `HERO_MAIN` |
| 2 | 完整创作链 | `HERO_SECTION_3` |
| 3 | Universe 继承 | `HERO_SECTION_6` |
| 4 | 演员资产 | `HERO_SECTION_5` |
| 5 | 创作留痕 | `HERO_SECTION_7` |

不新增独立收尾 CTA 屏，也不单独增加多模型、KK、市场或融资介绍屏。这些能力应在产品页、白皮书或实际交互中呈现，避免首页重新变成功能目录。

## 4. 《硬科技浪潮》理念的用户化表达

首页不直接堆叠“创意熵减”、“技因演化”和“知本主义”等概念词，而是将其翻译成创作者能立即理解的价值：

| 长期理念 | 首页表达 |
| --- | --- |
| 创意熵减 | 前一步确认的成果，直接成为下一步的起点 |
| 技因演化 | 角色、世界规则和作品关系可继承、变化并保留来路 |
| 知本主义 | 创作成果持续积累，为今后的复用、协作与授权留下基础 |

## 5. 定稿文案

### 第一屏：品牌与产品承诺

主标题：保持现有内容与样式原样。

中文副标题：

> 从故事到影像，让创作彼此相连，让成果持续积累。

英文副标题：

> From story to screen, every step connects—and every creation builds on the last.

主 CTA：

> 开始创作 / Start Creating

### 第二屏：完整创作链

标题：

> 不是一排工具，而是一条完整的创作链。

说明：

> 小说、剧本、美术、分镜、视频与音乐共享同一个项目。前一步确认的成果，直接成为下一步创作的起点。

英文标题：

> Not a collection of tools. One connected creative pipeline.

英文说明：

> Novels, scripts, art, storyboards, video, and music share one project. Every approved result becomes the starting point for what comes next.

实施时移除当前“我要原创 / 我要制作 / 我要改编”三组长文案卡片，不用新的功能列表稀释这一屏的核心判断。

### 第三屏：Universe 继承

栏目：

> UNIVERSE · 创作资产

标题：

> 下一部作品，不必再从头开始。

说明：

> 已经确认的角色、场景、世界规则和故事关系，会沉淀到 Universe。续集、改编或新项目，可以继承这些资产继续创作。

英文标题：

> Your next project doesn’t have to start from scratch.

英文说明：

> Approved characters, locations, world rules, and story relationships are preserved in your Universe—ready for sequels, adaptations, and whatever comes next.

CTA：

> 了解 Universe / Explore Universe

### 第四屏：演员资产

栏目：

> ACTORS · 演员资产

标题：

> 演员，不是一次性生成的面孔。

说明：

> Kiikis 将演员、角色与作品造型分别保存：演员保留稳定身份，角色属于 Universe，造型随每部作品变化。

英文标题：

> An actor is more than a face generated once.

英文说明：

> Kiikis keeps actors, characters, and production looks distinct: the actor retains a stable identity, the character belongs to a Universe, and each production creates its own portrayal.

CTA 沿用现有有效入口：

> 打开演员库 / Open Actor Library

### 第五屏：创作留痕

栏目：

> PROVENANCE · 创作留痕

标题：

> 每一次改变，都知道从哪里来。

说明：

> 从最初的提示词到最终成片，重要版本、修改与生成过程被持续记录。你可以看见作品如何演变，也能找到每项资产的来源。

英文标题：

> Every change has a history.

英文说明：

> From the first prompt to the final cut, key versions, revisions, and generations stay connected—so you can see how the work evolved and where each asset came from.

CTA：

> 了解创作留痕 / Explore Provenance

## 6. 能力边界

1. 不宣称 Universe 已经完全成熟，但可清楚表达 Kiikis 2.0 的产品承诺。
2. 不宣称所有工作台已经无条件自动串联；只表达共享项目、已确认成果向下游继承的目标体验。
3. 不宣称法律确权、自动跨境分账、已开放资产交易或所有创作步骤已全量留痕。
4. 演员屏的核心是 Actor / Character / Portrayal 分层，不宣称“永久一致”或“一次生成永久使用”。
5. 多模型底座是真实能力，但不作为首页主叙事；模型是生产手段，项目关系与创作资产才是 Kiikis 的长期价值。

## 7. 实施边界

预计仅修改首页文案与必要的分屏结构：

- `components/home/HeroSection.tsx`
- `app/page.tsx`
- `lib/i18n/dictionaries.ts`
- 与五屏文案排版直接相关的必要首页样式

不更换首页视觉资产，不重做导航、登录流程、工作台弹窗或其他产品页。

## 8. 验收标准

1. 中英文品牌主标题与实施前逐字符一致。
2. 首屏副标题在手机窄屏下可快速读完，不变成功能列表。
3. 五屏顺序与本文档一致，五张 Hero 图片与五屏文案一一对应，每屏只保留一个核心判断。
4. 中英文语义一致，英文使用自然的产品语言，不做逐字直译。
5. 所有 CTA 使用现有有效路由或页内锚点，不产生死链接。
6. 页面不出现“Universe 已完全成熟”、“永久一致”、“全自动确权”或其他无法支撑的承诺。
7. 首页依然首要服务创作者转化，不混入投资人白皮书话术。
