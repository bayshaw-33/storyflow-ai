import type { ArtAction, ArtAssetKind } from "./types.ts";

const SAFE_TYPES = new Set(["create_asset", "create_variant", "update_asset", "attach_upload"]);
const CONFIRM_TYPES = new Set(["delete_asset", "replace_approved_version", "change_universe", "publish_asset", "withdraw_asset"]);

export function normalizeArtActions(value: unknown): ArtAction[] {
  if (!Array.isArray(value)) return [];
  const actions: ArtAction[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const type = String(record.type || "");
    if (CONFIRM_TYPES.has(type)) {
      actions.push({ type: "request_confirmation", reason: confirmationReason(type), pendingAction: record });
      continue;
    }
    if (!SAFE_TYPES.has(type)) continue;
    if (type === "create_asset") {
      const kind = normalizeKind(record.kind);
      const name = String(record.name || "").trim();
      if (!kind || !name) continue;
      actions.push({ type, kind, name, narrativeRole: String(record.narrativeRole || ""), description: String(record.description || "") });
    } else if (type === "create_variant") {
      const assetId = String(record.assetId || "").trim();
      const name = String(record.name || "").trim();
      if (assetId && name) actions.push({ type, assetId, name, description: String(record.description || "") });
    } else if (type === "update_asset") {
      const assetId = String(record.assetId || "").trim();
      if (!assetId) continue;
      const source = record.patch && typeof record.patch === "object" && !Array.isArray(record.patch) ? record.patch as Record<string, unknown> : {};
      const patch = Object.fromEntries(["name", "narrativeRole", "description", "identityAnchor"]
        .filter((key) => typeof source[key] === "string")
        .map((key) => [key, String(source[key])])) as Extract<ArtAction, { type: "update_asset" }>["patch"];
      actions.push({ type, assetId, patch });
    } else if (type === "attach_upload") {
      const uploadId = String(record.uploadId || "").trim();
      const purpose = record.purpose === "master" || record.purpose === "candidate" ? record.purpose : "reference";
      if (uploadId) actions.push({ type, uploadId, assetId: String(record.assetId || "").trim() || undefined, purpose });
    }
  }
  return actions;
}

function normalizeKind(value: unknown): ArtAssetKind | null {
  return value === "character" || value === "scene" || value === "prop" ? value : null;
}

function confirmationReason(type: string) {
  const reasons: Record<string, string> = {
    delete_asset: "删除资产需要确认。",
    replace_approved_version: "替换已锁定终稿需要确认。",
    change_universe: "更换 Universe 关联需要确认。",
    publish_asset: "发布到 Universe 需要确认。",
    withdraw_asset: "撤回已发布资产需要确认。",
  };
  return reasons[type] || "该操作需要确认。";
}
