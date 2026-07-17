# 旧导出入口迁移清单

> 任务卡：KIIKIS-TR-G0-002-6
> 审计日期：2026-07-18
> 范围：所有绕过服务端 Compliance Export Gate 的客户端 Blob 导出点 + 旧服务端端点

## 总览

| # | 站点 | 文件 | 导出格式 | 迁移策略 | Phase 0 |
|---|------|------|----------|----------|---------|
| 1 | Creation Workbench | `lib/creation/downloads.ts` + `components/creation/CreationWorkbench.tsx` | MD, DOCX, ZIP | 改调 `/api/exports/request` (sourceKind=production_script) | ✅ |
| 2 | Production ExportMenu | `components/production/ExportMenu.tsx` | MD, JSON, SRT, CSV | MD/JSON 改调 Request API；SRT/CSV 暂隐藏为 Internal Preview | ✅ |
| 3 | Production AutoAssembly | `components/production/AutoAssemblyPanel.tsx` | EDL, FCPXML | 暂隐藏为 Internal Preview（Phase 0 无对应 writer） | ❌ |
| 4 | Universe Detail | `app/universes/[universeId]/page.tsx` | JSON, MD | 改调 `/api/exports/request` (sourceKind=universe_json) | ✅ |
| 5 | Projects Detail | `app/projects/[projectId]/page.tsx` | MD, Word, PDF, full-MD | MD 改调 Request API；Word/PDF 暂隐藏（Phase 0 无 docx/pdf writer） | ✅ |
| 6 | Viral Workbench | `app/viral-workbench/page.tsx` | MD | 改调 `/api/exports/request` (sourceKind=viral_script) | ✅ |
| 7 | Archive History | `app/archive-history/page.tsx` | JSON manifest | 改调 `/api/exports/request` (sourceKind=archive_manifest) | ✅ |
| 8 | Art Asset Detail | `components/art/ArtAssetDetail.tsx` | Image (直接 URL) | 改调 `/api/exports/request` (sourceKind=art_asset) 或暂时隐藏 | ❌ |
| S1 | 旧服务端端点 | `app/api/exports/route.ts` | JSON, MD | 隐藏或重定向到 `/api/exports/request` | ✅ |

**Phase 0 可迁移：6 个站点 + 1 个服务端端点**
**Phase 0 暂隐藏（Internal Preview）：2 个站点（AutoAssembly EDL/FCPXML、Art Asset Image）**

---

## 逐站点迁移计划

### 1. Creation Workbench

**当前实现：** `lib/creation/downloads.ts` 中的 `downloadMarkdown()` / `downloadDocx()` / `downloadDeliveryZip()` 直接构造 `new Blob()` + `createObjectURL()` + `anchor.click()`，完全在客户端完成。

**调用方：** `components/creation/CreationWorkbench.tsx:761-762`

**迁移方案：**
- 新建 `lib/exports/client.ts` 中的 `requestExport()` 辅助函数（fetch POST `/api/exports/request`）
- CreationWorkbench 按钮改为调用 `requestExport({ projectId, exportType: "markdown", sourceKind: "production_script", ... })`
- 拿到 `downloadUrl` 后用 `window.location.href = downloadUrl` 或 `<a href>` 触发下载
- DOCX/ZIP 在 Phase 0 无 writer 支持 → 按钮改为 "Internal Preview" 或隐藏

**迁移后 `lib/creation/downloads.ts`：** 保留 `downloadBlob` 仅用于 Internal Preview 路径

---

### 2. Production ExportMenu

**当前实现：** `components/production/ExportMenu.tsx:30-40` — `handleExport(format)` 构造 Blob 下载

**导出格式：** Markdown, JSON, SRT, CSV

**迁移方案：**
- MD → `requestExport({ sourceKind: "production_script", exportType: "markdown" })`
- JSON → `requestExport({ sourceKind: "production_script", exportType: "json" })`
- SRT → Phase 0 无 sidecar writer → 按钮标签加 "(Internal Preview)"，仍走 Blob
- CSV → 同 SRT，Internal Preview

---

### 3. Production AutoAssembly

**当前实现：** `components/production/AutoAssemblyPanel.tsx:86-106` — `exportEDL()` / `exportFCPXML()`

**导出格式：** EDL, FCPXML

**迁移方案：** Phase 0 无对应格式 writer（EDL/FCPXML 不在 FORMAT_REGISTRY 中）→ 按钮改为 Internal Preview，添加 tooltip "正式导出将在 Phase 1 支持"

---

### 4. Universe Detail

**当前实现：** `app/universes/[universeId]/page.tsx:316-320` — `exportBundle(format)` 构造 Blob

**导出格式：** JSON, MD

**迁移方案：**
- JSON → `requestExport({ sourceKind: "universe_json", exportType: "json" })`
- MD → `requestExport({ sourceKind: "universe_json", exportType: "markdown" })`

**注意：** `buildExportPayload` 目前只取 project 数据，universe 数据需要确认是否已在 payload 中。如果不在，Phase 0 先保持 Blob 导出并标记为 Internal Preview。

---

### 5. Projects Detail

**当前实现：** `app/projects/[projectId]/page.tsx:1250-1300` — `downloadBlob()` + `downloadSection(format)`

**导出格式：** Markdown, Word (HTML-as-.doc), PDF (print-to-PDF), full-project Markdown

**迁移方案：**
- MD → `requestExport({ sourceKind: "project_markdown", exportType: "markdown" })`
- full-project MD → `requestExport({ sourceKind: "project_markdown", exportType: "markdown" })`
- Word → Phase 0 无 docx writer → Internal Preview
- PDF → Phase 0 无 pdf writer → 移除 print-to-PDF 按钮（或保留但标记 Internal Preview）

---

### 6. Viral Workbench

**当前实现：** `app/viral-workbench/page.tsx:824-832` — `downloadText()`

**导出格式：** Markdown

**迁移方案：** `requestExport({ sourceKind: "viral_script", exportType: "markdown" })`

---

### 7. Archive History

**当前实现：** `app/archive-history/page.tsx:240-248` — `handleDownloadManifest()`

**导出格式：** JSON manifest

**迁移方案：** `requestExport({ sourceKind: "archive_manifest", exportType: "json" })`

---

### 8. Art Asset Detail

**当前实现：** `components/art/ArtAssetDetail.tsx:191` — `<a href={imageUrl} download>` 直接下载原始图片 URL

**导出格式：** Image (PNG/JPEG/WEBP)

**迁移方案：** Phase 0 暂时隐藏下载按钮或改为 "Internal Preview"（art_asset sourceKind 在 Request API 中已定义，但 Phase 0 同步处理仅支持 project_json/project_markdown）。Phase 1 上线后改为 `requestExport({ sourceKind: "art_asset", exportType: "image" })`。

---

### S1. 旧服务端端点 `app/api/exports/route.ts`

**当前实现：** POST handler 直接调用 `exportProjectAsJson` / `exportProjectAsMarkdown`，走 `recordExport` 审计但**不经过 Compliance Gate**。

**迁移方案：**
- **Phase 0：** 将此端点的 POST handler 改为返回 410 Gone + 提示 "请使用 POST /api/exports/request"
- 或者：将 POST handler 改为内部代理，调用新的 Request API 逻辑
- 客户端所有调用此端点的地方改为调用 `/api/exports/request`

---

## 客户端辅助函数设计

新建 `lib/exports/client.ts`（Phase 0 客户端调用层）：

```typescript
// 伪代码
export async function requestExport(input: ExportRequestInput): Promise<ExportRequestResponse> {
  const res = await fetch("/api/exports/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data as ExportRequestResponse;
}

export async function downloadExport(exportId: string): Promise<void> {
  window.location.href = `/api/exports/${exportId}/download`;
}

export async function pollExportStatus(exportId: string): Promise<ExportStatusResponse> {
  const res = await fetch(`/api/exports/${exportId}/status`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json();
  return data as ExportStatusResponse;
}
```

---

## 迁移优先级

```text
P0（Phase 0 必须完成）：
  ├─ S1. 旧服务端端点隐藏/重定向
  ├─ 1. Creation Workbench MD/JSON
  ├─ 4. Universe Detail JSON/MD
  ├─ 5. Projects Detail MD
  └─ 6. Viral Workbench MD

P1（Phase 0 尽量完成）：
  ├─ 2. Production ExportMenu MD/JSON
  └─ 7. Archive History JSON

P2（Phase 0 隐藏为 Internal Preview）：
  ├─ 1. Creation Workbench DOCX/ZIP
  ├─ 2. Production ExportMenu SRT/CSV
  ├─ 3. Production AutoAssembly EDL/FCPXML
  ├─ 5. Projects Detail Word/PDF
  └─ 8. Art Asset Detail Image
```

---

## 验收标准

- [ ] 所有 P0 站点不再直接构造 `new Blob()` 下载
- [ ] 所有 P0 站点调用 `/api/exports/request` 并通过 Compliance Gate
- [ ] P2 站点的导出按钮明确标注 "Internal Preview"
- [ ] 旧 `app/api/exports/route.ts` POST 返回 410 或代理到新 API
- [ ] E2E 测试覆盖至少 2 个迁移后的站点
