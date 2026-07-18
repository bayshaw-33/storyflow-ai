# Universe + Actors Stage E 验证记录

日期：2026-07-18（Asia/Singapore）

## 结论

`PASS WITH MUST-FIX`。

Schema 前置、代码闸门和未登录线上可达性均已通过；真实数据全链暂不能判定为 PASS，因为 production 只有 6 个 Universe，相关 Entity、Project Link、Actor、Portrayal、Art Version 和 Production Shot 均为 0 行，当前没有可供验收的完整真实样本。浏览器控制在加载线上 Universe 页面时连续超时，因此没有伪报登录态 UI 操作通过。

## Migration rollout

迁移：`20260720020000_production_shots_prop_refs.sql`

- staging：`kiikis-staging` / `cwpyolxitkcpitqizgtq`，成功。
- production：`StoryFlow` / `vgcafbzksizlwmylphzu`，成功。
- 两环境核验：`prop_refs jsonb NOT NULL DEFAULT '[]'::jsonb`。
- 两环境迁移前 `storyflow_production_shots` 均为 0 行；迁移后非法值行数均为 0。
- 迁移为幂等加列，不改写或删除用户数据。

## Codex review patch

审查 TRAE `44a4e02..4b66a41` 时发现并修复：

1. “设为主版本”原实现会把同一 variant 下所有版本的 `metadata` 整体覆盖为 `{is_primary:false}`，存在元数据丢失风险。改为原子更新 `storyflow_art_asset_variants.approved_version_id`。
2. Actor 页面改为服务端保存成功后再更新本地状态，失败不会出现假成功。
3. Universe 主图授权链改为 version → variant → art asset → art project；不再读取实际表中不存在的 `user_id/team_id`。
4. Universe 封面改走 art version/variant/project 权威链，并只对允许访问的持久化 `storage_path` 签名；不再把客户端或临时 URL 当作长期资产。
5. Portrayal counts 数据库失败不再伪装成 0。
6. Works 列表读取并统计真实 `prop_refs`。

## Verification

- `node --test tests/*.test.mjs`：348/348 通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm run build`：通过，67/67 静态页面生成。
- `https://www.kiikis.com/`：HTTP 200。
- `https://www.kiikis.com/universes`：HTTP 200，Vercel 匹配 `/universes`。
- `https://www.kiikis.com/actors`：HTTP 200，Vercel 匹配 `/actors`。

## Production data readiness

只读盘点结果：

| Object | Rows |
| --- | ---: |
| Universe | 6 |
| Universe Entity | 0 |
| Universe Project Link | 0 |
| Actor Profile | 0 |
| Character Portrayal | 0 |
| Art Asset Version | 0 |
| Production Shot | 0 |

因此无法在不制造测试数据或假造结果的前提下完成 Universe → Work → Entity/Prop → Actor → Portrayal → 主版本 → 导出的真实链路。

## MUST-FIX / follow-up

1. 用一个可丢弃的内部验收项目创建最小真实样本：1 Universe、1 linked Project、1 Character、1 Scene、1 Prop、1 Actor、1 Portrayal、至少 2 个 actor image versions、1 Production Shot。
2. 在已登录浏览器完成：Universe 列表封面 → 作品展开 → 实体缩略图 → Actor 详情 → 切换主版本并刷新 → 参演作品反向返回 Universe。
3. 浏览器控制连接恢复后补做响应式 UI 和错误态截图验证。
