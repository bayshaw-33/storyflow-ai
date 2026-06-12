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

const PROJECT_TABLE = "storyflow_projects";
const GROUP_TABLE = "storyflow_project_groups";

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export async function syncProjectsWithSupabase(localProjects: DramaProject[]) {
  if (!isSupabaseConfigured()) {
    return {
      projects: localProjects,
      groups: readProjectGroupsFromStorage(),
      enabled: false,
      error: "",
    };
  }

  try {
    const [cloudProjects, cloudGroups] = await Promise.all([
      readProjectsFromSupabase(),
      readProjectGroupsFromSupabase(),
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
      ...mergedProjects.map((project) => upsertProjectToSupabase(project)),
      ...groups.map((group) => upsertProjectGroupToSupabase(group)),
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

export async function readProjectsFromSupabase(): Promise<DramaProject[]> {
  const rows = await supabaseFetch<ProjectRow[]>(
    `${tableUrl(PROJECT_TABLE)}?select=*&order=updated_at.desc`,
  );

  return rows.map(rowToProject);
}

export async function readProjectFromSupabase(id: string): Promise<DramaProject | null> {
  const rows = await supabaseFetch<ProjectRow[]>(
    `${tableUrl(PROJECT_TABLE)}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  return rows[0] ? rowToProject(rows[0]) : null;
}

export async function upsertProjectToSupabase(project: DramaProject) {
  if (!isSupabaseConfigured()) return;

  await supabaseFetch(`${tableUrl(PROJECT_TABLE)}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(projectToRow(project)),
  });
}

export async function deleteProjectFromSupabase(id: string) {
  if (!isSupabaseConfigured()) return;

  await supabaseFetch(`${tableUrl(PROJECT_TABLE)}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function readProjectGroupsFromSupabase(): Promise<string[]> {
  const rows = await supabaseFetch<GroupRow[]>(
    `${tableUrl(GROUP_TABLE)}?select=name&order=name.asc`,
  );
  return mergeGroups(rows.map((row) => row.name));
}

export async function upsertProjectGroupToSupabase(name: string) {
  if (!isSupabaseConfigured()) return;
  const group = normalizeGroup(name);
  await supabaseFetch(`${tableUrl(GROUP_TABLE)}?on_conflict=name`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ name: group }),
  });
}

export async function saveProjectGroupsToSupabase(groups: string[]) {
  if (!isSupabaseConfigured()) return;
  await Promise.allSettled(mergeGroups(groups).map((group) => upsertProjectGroupToSupabase(group)));
}

function projectToRow(project: DramaProject): ProjectRow {
  return {
    id: project.id,
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

async function supabaseFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
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
