import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";

type ModelRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  provider: string;
  modality: string;
  model_id: string;
  capabilities: Record<string, unknown>;
  is_default: boolean;
  status: string;
  config: Record<string, unknown>;
  notes: string;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const modality = request.nextUrl.searchParams.get("modality");
    const filter = modality
      ? `&modality=eq.${encodeURIComponent(modality)}`
      : "";
    const rows = await serviceFetch<ModelRow[]>(
      `/rest/v1/storyflow_model_registry?user_id=eq.${encodeURIComponent(user.id)}${filter}&select=*&order=modality.asc,is_default.desc,created_at.desc`,
    );
    return ok({ models: rows });
  } catch (error) {
    return apiError(error, "读取模型注册表失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const provider = String(body.provider || "").trim();
    const modality = String(body.modality || "").trim();
    const modelId = String(body.modelId || "").trim();
    if (!name || !provider || !modality || !modelId) {
      return apiError(new Error("MISSING_PARAMS"), "缺少必填字段。");
    }
    if (!["image", "video", "text"].includes(modality)) {
      return apiError(new Error("INVALID_MODALITY"), "modality 必须是 image/video/text。");
    }

    // If setting as default, unset other defaults of same modality first
    if (body.isDefault) {
      await serviceFetch(
        `/rest/v1/storyflow_model_registry?user_id=eq.${encodeURIComponent(user.id)}&modality=eq.${encodeURIComponent(modality)}&is_default=eq.true`,
        { method: "PATCH", body: JSON.stringify({ is_default: false, updated_at: new Date().toISOString() }) },
      );
    }

    const payload = {
      id: crypto.randomUUID(),
      user_id: user.id,
      team_id: body.teamId || null,
      name,
      provider,
      modality,
      model_id: modelId,
      capabilities: body.capabilities || {},
      is_default: !!body.isDefault,
      status: body.status || "active",
      config: body.config || {},
      notes: String(body.notes || ""),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const rows = await serviceFetch<ModelRow[]>("/rest/v1/storyflow_model_registry", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    return ok({ model: rows[0] });
  } catch (error) {
    return apiError(error, "创建模型失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const recordId = String(body.recordId || "");
    if (!recordId) return apiError(new Error("MISSING_MODEL_ID"), "缺少模型 ID。");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = String(body.name);
    if (body.provider !== undefined) patch.provider = String(body.provider);
    if (body.modality !== undefined) {
      if (!["image", "video", "text"].includes(String(body.modality))) {
        return apiError(new Error("INVALID_MODALITY"), "modality 必须是 image/video/text。");
      }
      patch.modality = String(body.modality);
    }
    if (body.modelIdentifier !== undefined) patch.model_id = String(body.modelIdentifier);
    if (body.capabilities !== undefined) patch.capabilities = body.capabilities;
    if (body.config !== undefined) patch.config = body.config;
    if (body.notes !== undefined) patch.notes = String(body.notes);
    if (body.status !== undefined) patch.status = String(body.status);

    // If setting as default, unset other defaults of same modality first
    if (body.isDefault === true && body.modality) {
      await serviceFetch(
        `/rest/v1/storyflow_model_registry?user_id=eq.${encodeURIComponent(user.id)}&modality=eq.${encodeURIComponent(String(body.modality))}&is_default=eq.true&id=neq.${encodeURIComponent(recordId)}`,
        { method: "PATCH", body: JSON.stringify({ is_default: false, updated_at: new Date().toISOString() }) },
      );
    }
    if (body.isDefault !== undefined) patch.is_default = !!body.isDefault;

    await serviceFetch(
      `/rest/v1/storyflow_model_registry?id=eq.${encodeURIComponent(recordId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    return ok({ updated: true });
  } catch (error) {
    return apiError(error, "更新模型失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const modelId = request.nextUrl.searchParams.get("modelId") || "";
    if (!modelId) return apiError(new Error("MISSING_MODEL_ID"), "缺少模型 ID。");

    await serviceFetch(
      `/rest/v1/storyflow_model_registry?id=eq.${encodeURIComponent(modelId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: "DELETE" },
    );
    return ok({ removed: true });
  } catch (error) {
    return apiError(error, "删除模型失败。");
  }
}
