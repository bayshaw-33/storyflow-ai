# Sprint 0: 双法域合规导出 Gate（Compliance Export Gate）

## 功能概述

针对 EU AI Act Article 50（2026-08-02 适用）与中国《人工智能生成合成内容标识办法》（2025-09-01 生效）的双法域要求，导出管线在放行下载前强制执行：

1. **机器可读标识写入**：按格式把规范化 AI Manifest（`kiikis.ai-manifest/0.1`，canonical JSON）嵌入文件元数据；
2. **可见披露**：服务端统一生成中英文披露文案（UI / 片尾卡 / 片尾字幕模式）；
3. **sha256 元数据哈希**：`metadata_hash` 与内容一同入库，可独立复核；
4. **验证回读**：写入后重新解析文件，确认标识存在且哈希一致；
5. **审计日志**：每次 Gate 执行写 `storyflow_export_compliance_runs`，每次标识写 `storyflow_ai_label_records`。

**失败即封闭（fail-closed）**：EU/CN 正式导出中，标识写入失败、验证失败或审计写入失败一律不放行下载。

## 架构分层（文字图）

```
POST /api/compliance/export (multipart)
  └─ app/api/compliance/export/route.ts        薄 HTTP 层：鉴权 / 表单解析 / 二进制或 JSON 响应
       └─ lib/compliance/adapter.ts            ComplianceMarkingAdapter：编排
            ├─ [C2PA Writer]        c2pa.ts        Phase 0 桩：恒 not_configured（真实签名链后续接入）
            ├─ [Export Gate]        gate.ts        7 步顺序执行 + 阻断逻辑 + 审计落库
            │     ├─ [Metadata Writer]  writers/   png / jpeg / webp / mp4 / wav / mp3 / pdf / sidecar
            │     ├─ [Verification Runner] verify.ts  回读 + 哈希比对（manifest.ts 提供 canonical JSON / sha256）
            │     └─ [Compliance Log Writer] log-writer.ts  Sink 模式（Supabase / 内存）
            └─ [Visible Disclosure Composer] disclosure.ts  服务端披露文案模板
  └─ feature-flags.ts                          10 个环境开关（纯函数解析）
```

## 10 个 Feature Flags

| Flag | 生产默认 | 作用 |
| --- | --- | --- |
| `COMPLIANCE_EXPORT_GATE` | ✅ | Gate 总开关；关闭时全部步骤跳过但仍写审计 run 行 |
| `EU_ART50_MACHINE_MARKING` | ✅ | EU 法域机器可读标识功能 |
| `EU_ART50_VISIBLE_DISCLOSURE` | ❌ | EU 法域可见披露要求 |
| `EU_ART50_STRICT_EXPORT_BLOCK` | ✅ | EU 法域严格阻断（标识失败即禁下载） |
| `CN_AIGC_MACHINE_MARKING` | ✅ | 中国法域机器可读标识功能 |
| `CN_AIGC_VISIBLE_MARKING` | ❌ | 中国法域显式标识要求 |
| `CN_AIGC_STRICT_EXPORT_BLOCK` | ✅ | 中国法域严格阻断 |
| `DUAL_JURISDICTION_MARKING` | ❌ | 双法域（EU_CN_DUAL）标识功能；未开且严格阻断开 → `feature_disabled` |
| `UNMARKED_EXPORT_EXCEPTION` | ❌ | 例外通道：仅把"可见披露缺失"降级为放行（不影响语音授权/参考素材阻断） |
| `GDPR_REGION_ROUTING` | ❌ | 预留：GDPR 区域路由 |

取值规则：`"true"/"1"` 开、`"false"/"0"` 关（大小写不敏感）；未设置时按上表环境默认值；非生产环境全部默认关闭。

## 数据库表（migration 20260718000000）

- `storyflow_ai_label_records`：每次标识记录（PRD §2.5 字段：content_kind、ai_generated/ai_modified、jurisdiction_profile、provider_code、content_id、machine_readable_formats、visible_disclosure_mode、c2pa_manifest_id、metadata_hash、verification_json、status(marked/verified/failed/blocked)、error_code）。
- `storyflow_export_compliance_runs`：每次 Gate 审计（decision、blocking_reason_code、gate_steps_json、label_record_id 外键、metadata 含 resolved_flags）。
- 另有 `storyflow_compliance_profiles`（用户/项目策略）、`storyflow_jurisdiction_rules`（法域规则参考，含法条引用种子数据）、`storyflow_provider_codes`（Provider 编码注册表）。

## API 契约

`POST /api/compliance/export`，`multipart/form-data`：

- `file`（必填，≤ 50MB）
- 文本字段：`assetId`、`assetVersionId`、`jurisdictionProfile`（EU_ART50 / CN_AIGC / EU_CN_DUAL / INTERNAL_ONLY）、`aiGenerated`/`aiModified`（"true"/"false"）、`providerCode`、`contentId`、`visibleDisclosureMode`（none/ui/watermark/end_card/credits）、可选 `contentKind`（缺省按扩展名推导）、`modelProvider`、`modelName`、`modelVersion`、`projectId`、`episodeId`、`syntheticVoice`、`voiceLicenseStatus`、`referenceRightsStatus`

### 成功（200，二进制下载）

```bash
curl -X POST "$BASE/api/compliance/export" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@shot.png" \
  -F "assetId=a1" -F "assetVersionId=v1" \
  -F "jurisdictionProfile=EU_ART50" \
  -F "aiGenerated=true" -F "aiModified=false" \
  -F "providerCode=KIIKIS" -F "contentId=c1" \
  -F "visibleDisclosureMode=ui" \
  -o shot.marked.png -D -
```

- 普通格式直接返回嵌入标识后的字节；txt/md/srt 返回 ZIP（原文件 + `<name>.ai-manifest.json` + `disclosure.txt`）。
- 响应头：`X-Compliance-Run-Id`、`X-Compliance-Label-Id`、`X-Compliance-Metadata-Hash`、`X-Compliance-Disclosure-B64`（披露 payload 的 base64url JSON）。

### 阻断（422）

```json
{ "success": false, "error": "导出被合规策略阻止。", "code": "disclosure_mode_missing", "steps": [ ... ], "runId": "uuid" }
```

### 失败（500，fail-closed）

标识写入失败 / 验证失败 / 审计写入失败（如 `machine_marking_failed`、`verification_failed`、`compliance_record_write_failed`），JSON 形状同 422，不输出文件。

## 验收命令

```bash
node tests/compliance-marking.test.mjs   # 30 个用例全绿
pnpm exec tsc --noEmit                   # 全项目类型检查
pnpm run build                           # Next 生产构建
```

## 手动 QA（staging 5 步）

1. 应用迁移：`supabase db push`（含种子数据），确认 5 张表存在。
2. staging 环境设置 10 个 flag（生产等价：5 个 true-set 打开）。
3. 用上方 curl 分别导出 PNG / WAV / SRT：确认 200、响应头齐全、SRT 返回 ZIP。
4. 用 `visibleDisclosureMode=watermark` 重复请求：确认 422 `disclosure_mode_missing`；设 `UNMARKED_EXPORT_EXCEPTION=true` 后确认放行。
5. 查库核对：`storyflow_ai_label_records`（status=verified、metadata_hash 64 位）与 `storyflow_export_compliance_runs`（decision、gate_steps_json 完整）。

## 回滚步骤

1. 在数据库手动执行迁移文件头部注释中的 `DROP TABLE IF EXISTS`（5 张表，顺序见注释）；
2. revert 本 Sprint 的代码 commit（`lib/compliance/**`、`app/api/compliance/**`、`tests/compliance-marking.test.mjs`、本文档）；
3. 将 10 个环境 flag 全部置 `false` 或删除（Gate 关闭时导出路径不经过合规逻辑）。

## Phase 0 限制

- **C2PA 未接入**：`c2pa.ts` 恒返回 `not_configured`，验证报告如实标注；合规基线 = 元数据写入 + Manifest + sha256 + 审计日志（PRD §2.2 回退策略），真实签名链为后续增强。
- **watermark 像素写入不支持**：`watermark` 模式 `supported=false`，严格法域视为披露未满足（阻断）；像素级水印为后续迭代。
- **ffprobe 等媒体深校验后续接入**：当前验证器只做容器结构 + 元数据回读，不解码音视频流。
- PDF 的 XMP metadata 流未写入（可选项），合规载体为 Info 字典（Producer/Keywords + 自定义 `KIIManifest` 条目）。
