import {
  DEFAULT_PROJECT_GROUP,
  DramaProject,
  normalizeStoredProject,
  readProjectGroupsFromStorage,
  saveProjectGroupsToStorage,
  saveProjectsToStorage,
} from "@/lib/projects";

type ProjectRow = {
  id: string;
  user_id?: string | null;
  title: string | null;
  workflow_type: string | null;
  project_group: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  data: Partial<DramaProject>;
};

type GroupRow = {
  name: string;
};

type SupabaseSyncOptions = {
  accessToken?: string | null;
};

const PROJECT_TABLE = "storyflow_projects";
const GROUP_TABLE = "storyflow_project_groups";

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export async function syncProjectsWithSupabase(localProjects: DramaProject[], options: SupabaseSyncOptions = {}) {
  if (!isSupabaseConfigured() || !options.accessToken) {
    return {
      projects: localProjects,
      groups: readProjectGroupsFromStorage(),
      enabled: false,
      error: "",
    };
  }

  try {
    const [cloudProjects, cloudGroups] = await Promise.all([
      readProjectsFromSupabase(options),
      readProjectGroupsFromSupabase(options),
    ]);
    const mergedProjects = mergeProjects(localProjects, cloudProjects);
    const groups = mergeGroups([
      ...readProjectGroupsFromStorage(),
      ...cloudGroups,
      ...mergedProjects.map((project) => project.projectGroup || DEFAULT_PROJECT_GROUP),
    ]);

    saveProjectsToStorage(mergedProjects);
    saveProjectGroupsToStorage(groups);

    await Promise.allSettled([
      ...mergedProjects.map((project) => upsertProjectToSupabase(project, options)),
      ...groups.map((group) => upsertProjectGroupToSupabase(group, options)),
    ]);

    return {
      projects: mergedProjects,
      groups,
      enabled: true,
      error: "",
    };
  } catch (error) {
    return {
      projects: localProjects,
      groups: readProjectGroupsFromStorage(),
      enabled: true,
      error: error instanceof Error ? error.message : "Supabase 同步失败，已使用本地缓存。",
    };
  }
}

export async function readProjectsFromSupabase(options: SupabaseSyncOptions = {}): Promise<DramaProject[]> {
  if (!options.accessToken) return [];

  const rows = await supabaseFetch<ProjectRow[]>(
    `${tableUrl(PROJECT_TABLE)}?select=*&order=updated_at.desc`,
    {},
    options,
  );

  return rows.map(rowToProject);
}

export async function readProjectFromSupabase(id: string, options: SupabaseSyncOptions = {}): Promise<DramaProject | null> {
  if (!options.accessToken) return null;

  const rows = await supabaseFetch<ProjectRow[]>(
    `${tableUrl(PROJECT_TABLE)}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    {},
    options,
  );
  return rows[0] ? rowToProject(rows[0]) : null;
}

export async function upsertProjectToSupabase(project: DramaProject, options: SupabaseSyncOptions = {}) {
  if (!isSupabaseConfigured() || !options.accessToken) return;

  await supabaseFetch(`${tableUrl(PROJECT_TABLE)}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(projectToRow(project, options.accessToken)),
  }, options);
}

export async function deleteProjectFromSupabase(id: string, options: SupabaseSyncOptions = {}) {
  if (!isSupabaseConfigured() || !options.accessToken) return;

  await supabaseFetch(`${tableUrl(PROJECT_TABLE)}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  }, options);
}

export async function readProjectGroupsFromSupabase(options: SupabaseSyncOptions = {}): Promise<string[]> {
  if (!options.accessToken) return [];

  const rows = await supabaseFetch<GroupRow[]>(
    `${tableUrl(GROUP_TABLE)}?select=name&order=name.asc`,
    {},
    options,
  );
  return mergeGroups(rows.map((row) => row.name));
}

export async function upsertProjectGroupToSupabase(name: string, options: SupabaseSyncOptions = {}) {
  if (!isSupabaseConfigured() || !options.accessToken) return;
  const group = normalizeGroup(name);
  await supabaseFetch(`${tableUrl(GROUP_TABLE)}?on_conflict=user_id,name`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ name: group, user_id: getUserIdFromAccessToken(options.accessToken) }),
  }, options);
}

export async function saveProjectGroupsToSupabase(groups: string[], options: SupabaseSyncOptions = {}) {
  if (!isSupabaseConfigured() || !options.accessToken) return;
  await Promise.allSettled(mergeGroups(groups).map((group) => upsertProjectGroupToSupabase(group, options)));
}

function projectToRow(project: DramaProject, accessToken?: string | null): ProjectRow {
  return {
    id: project.id,
    user_id: getUserIdFromAccessToken(accessToken),
    title: project.title,
    workflow_type: project.workflowType,
    project_group: project.projectGroup || DEFAULT_PROJECT_GROUP,
    status: project.status,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    data: project,
  };
}

function rowToProject(row: ProjectRow): DramaProject {
  return normalizeStoredProject({
    ...row.data,
    id: row.id || row.data?.id,
    title: row.data?.title || row.title || "未命名短剧项目",
    workflowType: row.data?.workflowType || (row.workflow_type === "continuation" ? "continuation" : "creation"),
    projectGroup: row.data?.projectGroup || row.project_group || DEFAULT_PROJECT_GROUP,
    status: row.data?.status || (row.status as DramaProject["status"]) || "draft",
    createdAt: row.data?.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: row.data?.updatedAt || row.updated_at || new Date().toISOString(),
  });
}

function mergeProjects(localProjects: DramaProject[], cloudProjects: DramaProject[]) {
  const byId = new Map<string, DramaProject>();

  for (const project of [...cloudProjects, ...localProjects]) {
    const existing = byId.get(project.id);
    if (!existing || project.updatedAt.localeCompare(existing.updatedAt) > 0) {
      byId.set(project.id, project);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergeGroups(groups: string[]) {
  return Array.from(new Set([DEFAULT_PROJECT_GROUP, ...groups.map(normalizeGroup).filter(Boolean)]));
}

function normalizeGroup(group: string) {
  return group.trim() || DEFAULT_PROJECT_GROUP;
}

async function supabaseFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
  options: SupabaseSyncOptions = {},
): Promise<T> {
  const authToken = options.accessToken || getSupabaseAnonKey();

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase 请求失败：${response.status}${text ? ` ${text.slice(0, 180)}` : ""}`);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function tableUrl(table: string) {
  return `${getSupabaseUrl()}/rest/v1/${table}`;
}

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function getUserIdFromAccessToken(accessToken?: string | null) {
  if (!accessToken) return undefined;

  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(decoded) as { sub?: string };
    return claims.sub;
  } catch {
    return undefined;
  }
}
