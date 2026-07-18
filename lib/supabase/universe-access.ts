import { serviceFetch } from "@/lib/supabase/server";

type UniverseAccessRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
};

const WRITE_ROLES = new Set(["owner", "admin", "editor"]);

export async function assertUniverseWriteAccess(userId: string, universeId: string) {
  const rows = await serviceFetch<UniverseAccessRow[]>(
    `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(universeId)}&select=id,user_id,team_id&limit=1`,
  );
  const universe = rows[0];
  if (!universe) throw new Error("UNIVERSE_FORBIDDEN");
  if (universe.user_id === userId) return;
  if (!universe.team_id) throw new Error("UNIVERSE_FORBIDDEN");

  const memberships = await serviceFetch<Array<{ role: string }>>(
    `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(universe.team_id)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=role&limit=1`,
  );
  if (!WRITE_ROLES.has(memberships[0]?.role || "")) throw new Error("UNIVERSE_FORBIDDEN");
}
