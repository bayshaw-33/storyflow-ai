import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { AUDIO_BUCKET } from "@/lib/audio/storage";
import { isUuid } from "@/lib/validation/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AudioAssetRow = {
  id: string;
  project_id: string | null;
  storage_path: string | null;
  asset_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticateRequest(request);
    const { universeId } = await context.params;
    if (!isUuid(universeId)) return NextResponse.json({ success: false, error: "universeId 必须是有效 UUID。", code: "INVALID_UNIVERSE_ID", requestId }, { status: 422 });
    if (!hasServiceRoleConfig()) return NextResponse.json({ success: false, error: "Cloud data service is not configured.", code: "service_unavailable", requestId, retryable: true, retryAfter: 5 }, { status: 503 });
    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const entities = await serviceFetch<Array<{ id: string }>>(`/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(universeId)}&select=id&limit=1000`);
    const entityIds = (entities || []).map((entity) => entity.id).filter(isUuid);
    if (!entityIds.length) return NextResponse.json({ success: true, requestId, audioAssets: [] });
    const metadataFilters = entityIds.flatMap((id) => [`metadata->>universeEntityId.eq.${encodeURIComponent(id)}`, `metadata->>universe_entity_id.eq.${encodeURIComponent(id)}`]);
    const rows = await serviceFetch<AudioAssetRow[]>(`/rest/v1/storyflow_assets?user_id=eq.${encodeURIComponent(user.id)}&asset_type=eq.audio&or=(${metadataFilters.join(",")})&select=id,project_id,storage_path,asset_type,metadata,created_at&order=created_at.desc&limit=200`);
    const audioAssets = await Promise.all((rows || []).filter((row) => row.storage_path).map(async (row) => {
      const signed = await serverClient.storage.from(AUDIO_BUCKET).createSignedUrl(row.storage_path!, 60 * 60);
      if (signed.error || !signed.data?.signedUrl) return null;
      const metadata = row.metadata || {};
      return {
        id: row.id,
        name: typeof metadata.title === "string" ? metadata.title : typeof metadata.role === "string" ? metadata.role : "音频资产",
        role: typeof metadata.role === "string" ? metadata.role : "audio",
        provider: typeof metadata.provider === "string" ? metadata.provider : null,
        model: typeof metadata.model === "string" ? metadata.model : null,
        projectId: row.project_id,
        universeEntityId: typeof metadata.universeEntityId === "string" ? metadata.universeEntityId : typeof metadata.universe_entity_id === "string" ? metadata.universe_entity_id : null,
        playableUrl: signed.data.signedUrl,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: row.created_at,
      };
    }));
    return NextResponse.json({ success: true, requestId, audioAssets: audioAssets.filter(Boolean) });
  } catch {
    return NextResponse.json({ success: false, error: "Universe 音频资产暂时无法加载，请稍后重试。", code: "service_unavailable", requestId, retryable: true, retryAfter: 5 }, { status: 503 });
  }
}
