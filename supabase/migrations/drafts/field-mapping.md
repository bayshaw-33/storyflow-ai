# 字段映射清单（初稿）

> **状态**：TRAE 初稿，待 Kimi 审核字段映射正确性
> **范围**：v4_core_tables 新增表与 baseline 旧表的关系
> **原则**：只映射字段，不做数据迁移（数据迁移需单独脚本）

## 1. Casting（选角）映射

### 旧字段位置
- `storyflow_characters.cast` (JSONB) — 旧版选角存储在角色的 cast 字段
- `storyflow_drama_projects.cast` (JSONB) — 项目级选角

### 新表：storyflow_casting_assignments
| 新字段 | 旧字段来源 | 转换逻辑 |
|---|---|---|
| id | gen_random_uuid() | 新生成 |
| project_id | storyflow_drama_projects.id | 直接映射 |
| character_id | storyflow_characters.id | 直接映射 |
| actor_profile_id | characters.cast[].actor_id | 从 JSONB 提取 |
| pcv_id | characters.cast[].pcv_id | 从 JSONB 提取（若存在） |
| status | characters.cast[].status | 映射：'active'→'active', 'backup'→'standby', 其他→'active' |
| notes | characters.cast[].notes | 直接映射，缺省 '' |
| metadata | characters.cast[].metadata | 直接映射，缺省 '{}' |
| created_at | characters.created_at | 直接映射 |
| updated_at | characters.updated_at | 直接映射 |

## 2. Character Portrayals（角色造型）映射

### 旧字段位置
- `storyflow_character_appearance_variants` — 旧版角色外观变体
- `storyflow_art_asset_variants` — 美术资产变体

### 新表：storyflow_character_portrayals
| 新字段 | 旧字段来源 | 转换逻辑 |
|---|---|---|
| id | gen_random_uuid() | 新生成 |
| actor_profile_id | appearance_variants.actor_profile_id | 需确认旧表是否有此字段 |
| character_id | appearance_variants.character_id | 直接映射 |
| project_id | appearance_variants.project_id | 需通过 character 反查 |
| casting_assignment_id | NULL | 初始为空，迁移后回填 |
| portrayal_name | appearance_variants.name | 直接映射 |
| visual_prompt | appearance_variants.prompt | 直接映射 |
| costume_direction | appearance_variants.costume | 需确认旧表字段 |
| reference_image_url | appearance_variants.reference_url | 直接映射 |
| is_reusable | TRUE | 默认可复用 |
| metadata | appearance_variants.metadata | 直接映射 |

## 3. Identity Passport 映射

### 新表：storyflow_identity_passports
旧 baseline 无对应表，这是全新概念。数据来源需 Kimi 确认：
- 是否从 `storyflow_characters.identity_anchor` 字段提取？
- 是否需要人工初始化？

## 4. Assembly（剪辑工程）映射

### 新表：storyflow_assembly_sequences + storyflow_assembly_items
旧 baseline 无对应表，全新功能。无数据迁移，仅结构创建。

## 5. Export Archives 映射

### 新表：storyflow_export_archives
全新功能表，无旧数据迁移。

## 待 Kimi 确认项

1. `storyflow_characters.cast` JSONB 的实际结构（字段名、嵌套层级）
2. `storyflow_character_appearance_variants` 是否存在 `actor_profile_id` 字段
3. `storyflow_identity_passports` 的数据来源策略
4. 是否有 blob 字段需要迁移到新表
5. orphan 数据的判定标准（什么是"孤儿"——无 project 的 character？无 character 的 casting？）
