"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ImagePlus, Plus, Save, Sparkles, Trash2, Users } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createEmptyActorInput, type ActorProfile, type ActorProfileInput, type Team } from "@/lib/actors";
import { useI18n } from "@/lib/i18n/useI18n";

type TeamWithRole = Team & { role?: string };
type ActorStorageMode = "structured" | "project_snapshot" | "unavailable";

type ApiResult<T> = T & {
  success: boolean;
  error?: string;
};

const actorCopy = {
  zh: {
    kicker: "演员库",
    title: "演员库",
    subtitle: "只保存虚拟演员的基础视觉身份。角色 canon 留在 Universe，项目三视图和参考表留在具体项目。",
    authKicker: "需要登录",
    authTitle: "登录后使用团队演员库",
    authBody: "演员库需要云端权限来区分个人资产、团队资产和项目形象版本。",
    signIn: "去登录",
    listKicker: "虚拟演员",
    listTitle: "演员列表",
    loading: "加载中...",
    newActor: "新建演员",
    emptyActors: "暂无演员。先新建一个虚拟演员。",
    teamKicker: "团队",
    teamName: "新团队名称",
    createTeam: "创建",
    noTeams: "暂无团队。团队用于共享演员库和 Universe。",
    profileKicker: "档案",
    editActor: "编辑演员",
    deleteActor: "删除",
    saveActor: "保存演员",
    saving: "保存中",
    actorSaved: "演员已保存。",
    actorDeleted: "演员已删除。",
    teamCreated: "团队已创建。",
    promptGenerated: "提示词已生成。",
    avatarGenerated: "头像已生成。",
    referenceGenerated: "角色参考表已生成。",
    signInToSave: "请先登录后再保存演员。",
    signInToUpload: "请先登录后再上传或生成演员资产。",
    saveBeforeImage: "请先保存演员，再生成图像资产。",
    uploadImageOnly: "请上传图片文件。",
    uploadLimit: "头像文件请控制在 1.5MB 以内。",
    avatarLoaded: "头像已载入，保存演员后会进入演员资产。",
    fallbackWarning: "演员结构化表暂不可用，当前使用项目快照兜底保存。个人演员可用，团队共享和权限控制需要部署 docs/supabase-actor-team-migration.sql 后生效。",
    structuredReady: "结构化云端演员库可用。",
    cloudFallbackSaved: "已保存到云端项目快照兜底；团队共享需部署演员库表结构。",
    cloudReadySaved: "已保存到结构化云端演员库。",
    name: "演员名称",
    namePlaceholder: "例如：Astra Lin",
    visibility: "可见范围",
    privateActor: "个人演员",
    teamActor: "团队共享",
    team: "所属团队",
    noTeamSelected: "未选择团队",
    age: "年龄感",
    agePlaceholder: "例如：20代后半",
    gender: "性别表达",
    genderPlaceholder: "例如：冷感女性 / 少年感男性",
    ethnicity: "族裔 / 地域气质",
    ethnicityPlaceholder: "例如：东亚都市感",
    face: "脸型与五官",
    hair: "发型与发质",
    body: "体型与比例",
    temperament: "气质关键词",
    temperamentPlaceholder: "冷静, 危险, 克制",
    playableRoles: "可出演类型",
    playableRolesPlaceholder: "反派, 白切黑, 狼人女主",
    bio: "演员简介",
    bioPlaceholder: "只描述这个虚拟演员的基础视觉身份，不写剧情 canon。",
    assetsKicker: "AI 资产",
    assetsTitle: "生成资产",
    uploadAvatar: "上传头像",
    avatar: "头像",
    referenceSheet: "角色参考表",
    generatePrompt: "生成提示词",
    generateAvatar: "生成头像",
    generating: "生成中",
    projectStyle: "项目画风",
    projectStylePlaceholder: "例如：暗黑狼人短剧，冷蓝月光",
    characterRole: "角色设定",
    characterRolePlaceholder: "例如：狼人族继承人",
    costume: "服装与妆造",
    costumePlaceholder: "例如：黑色皮质长外套，银色狼纹项链",
    basePrompt: "基础 Prompt",
    negativePrompt: "Negative Prompt",
    member: "member",
    requestFailed: "请求失败。",
  },
  en: {
    kicker: "Actor Library",
    title: "Actor Library",
    subtitle: "Store virtual actors' base visual identity here. Character canon stays in Universe, while project-specific three-views and reference sheets stay with each project.",
    authKicker: "Login required",
    authTitle: "Sign in to use the team actor library",
    authBody: "Actor Library needs cloud access to separate personal assets, team assets, and project appearance versions.",
    signIn: "Sign in",
    listKicker: "Virtual actors",
    listTitle: "Actors",
    loading: "Loading...",
    newActor: "New actor",
    emptyActors: "No actors yet. Create a virtual actor first.",
    teamKicker: "Team",
    teamName: "New team name",
    createTeam: "Create",
    noTeams: "No teams yet. Teams share Actor Library and Universe assets.",
    profileKicker: "Profile",
    editActor: "Edit actor",
    deleteActor: "Delete",
    saveActor: "Save actor",
    saving: "Saving",
    actorSaved: "Actor saved.",
    actorDeleted: "Actor deleted.",
    teamCreated: "Team created.",
    promptGenerated: "Prompt generated.",
    avatarGenerated: "Avatar generated.",
    referenceGenerated: "Reference sheet generated.",
    signInToSave: "Sign in before saving an actor.",
    signInToUpload: "Sign in before uploading or generating actor assets.",
    saveBeforeImage: "Save the actor before generating image assets.",
    uploadImageOnly: "Please upload an image file.",
    uploadLimit: "Keep avatar files under 1.5MB.",
    avatarLoaded: "Avatar loaded. Save the actor to add it to actor assets.",
    fallbackWarning: "Structured actor tables are unavailable. Kiikis is using a project snapshot fallback. Personal actors work, but team sharing and permission control require docs/supabase-actor-team-migration.sql.",
    structuredReady: "Structured cloud actor library is available.",
    cloudFallbackSaved: "Saved to the cloud project snapshot fallback. Deploy actor tables to enable team sharing.",
    cloudReadySaved: "Saved to the structured cloud actor library.",
    name: "Actor name",
    namePlaceholder: "Example: Astra Lin",
    visibility: "Visibility",
    privateActor: "Personal actor",
    teamActor: "Team shared",
    team: "Team",
    noTeamSelected: "No team selected",
    age: "Age impression",
    agePlaceholder: "Example: late 20s",
    gender: "Gender expression",
    genderPlaceholder: "Example: cold feminine / boyish masculine",
    ethnicity: "Ethnicity / regional tone",
    ethnicityPlaceholder: "Example: East Asian urban tone",
    face: "Face and features",
    hair: "Hair and texture",
    body: "Body and proportions",
    temperament: "Temperament tags",
    temperamentPlaceholder: "calm, dangerous, restrained",
    playableRoles: "Playable roles",
    playableRolesPlaceholder: "villain, hidden heir, werewolf heroine",
    bio: "Actor bio",
    bioPlaceholder: "Describe only this virtual actor's base visual identity, not story canon.",
    assetsKicker: "AI assets",
    assetsTitle: "Generate assets",
    uploadAvatar: "Upload avatar",
    avatar: "Avatar",
    referenceSheet: "Reference sheet",
    generatePrompt: "Generate prompt",
    generateAvatar: "Generate avatar",
    generating: "Generating",
    projectStyle: "Project style",
    projectStylePlaceholder: "Example: dark werewolf short drama, cold moonlight",
    characterRole: "Character role",
    characterRolePlaceholder: "Example: werewolf clan heir",
    costume: "Costume and styling",
    costumePlaceholder: "Example: black leather long coat, silver wolf necklace",
    basePrompt: "Base Prompt",
    negativePrompt: "Negative Prompt",
    member: "member",
    requestFailed: "Request failed.",
  },
} as const;

export default function ActorsPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const ui = actorCopy[isZh ? "zh" : "en"];
  const [session, setSession] = useState<Session | null>(null);
  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<ActorProfileInput>(createEmptyActorInput());
  const [uploadedPreview, setUploadedPreview] = useState("");
  const [teamName, setTeamName] = useState("");
  const [projectStyle, setProjectStyle] = useState("");
  const [characterRole, setCharacterRole] = useState("");
  const [costumeDirection, setCostumeDirection] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [storageMode, setStorageMode] = useState<ActorStorageMode>("structured");
  const [schemaWarning, setSchemaWarning] = useState("");

  const selectedActor = useMemo(() => actors.find((actor) => actor.id === selectedId) || null, [actors, selectedId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      void load(data.session || null);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void load(nextSession);
      }) || {};

    if (!supabase) void load(null);
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedActor) return;
    setForm({
      team_id: selectedActor.team_id || null,
      visibility: selectedActor.visibility,
      name: selectedActor.name,
      bio: selectedActor.bio,
      age_range: selectedActor.age_range,
      gender_expression: selectedActor.gender_expression,
      ethnicity_style: selectedActor.ethnicity_style,
      face_description: selectedActor.face_description,
      hair_description: selectedActor.hair_description,
      body_description: selectedActor.body_description,
      temperament: selectedActor.temperament,
      playable_roles: selectedActor.playable_roles,
      base_prompt: selectedActor.base_prompt,
      negative_prompt: selectedActor.negative_prompt,
    });
    setUploadedPreview("");
  }, [selectedActor]);

  async function load(nextSession = session) {
    setLoading(true);
    setError("");
    try {
      if (!nextSession?.access_token) {
        setActors([]);
        setTeams([]);
        return;
      }

      const [actorResult, teamResult] = await Promise.all([
        apiFetch<{ actors: ActorProfile[]; storageMode?: ActorStorageMode; warning?: string }>("/api/actors", nextSession.access_token),
        apiFetch<{ teams: TeamWithRole[] }>("/api/teams", nextSession.access_token),
      ]);
      setActors(actorResult.actors);
      setTeams(teamResult.teams);
      setStorageMode(actorResult.storageMode || "structured");
      setSchemaWarning(actorResult.warning || (actorResult.storageMode === "project_snapshot" ? ui.fallbackWarning : ""));
      if (!selectedId && actorResult.actors[0]) setSelectedId(actorResult.actors[0].id);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : (isZh ? "加载演员库失败。" : "Failed to load Actor Library."));
    } finally {
      setLoading(false);
    }
  }

  function startNewActor() {
    setSelectedId("");
    setForm(createEmptyActorInput());
    setUploadedPreview("");
    setError("");
    setStatus("");
  }

  async function saveActor() {
    if (!session?.access_token) {
      setError(ui.signInToSave);
      return;
    }
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const payload = {
        ...form,
        uploaded_avatar_data_url: uploadedPreview || undefined,
      };
      const result = selectedId
        ? await apiFetch<{ actor: ActorProfile }>("/api/actors", session.access_token, {
            method: "PATCH",
            body: JSON.stringify({ ...payload, id: selectedId }),
          })
        : await apiFetch<{ actor: ActorProfile }>("/api/actors", session.access_token, {
            method: "POST",
            body: JSON.stringify(payload),
          });

      setActors((current) => upsertActor(current, result.actor));
      setSelectedId(result.actor.id);
      setUploadedPreview("");
      if (result.actor.storage_source === "project_snapshot") {
        setStorageMode("project_snapshot");
        setSchemaWarning(ui.fallbackWarning);
        setStatus(ui.cloudFallbackSaved);
      } else {
        setStatus(ui.cloudReadySaved);
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : (isZh ? "保存演员失败。" : "Failed to save actor."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteActor() {
    if (!session?.access_token || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/actors?id=${encodeURIComponent(selectedId)}`, session.access_token, { method: "DELETE" });
      setActors((current) => current.filter((actor) => actor.id !== selectedId));
      startNewActor();
      setStatus(ui.actorDeleted);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : (isZh ? "删除演员失败。" : "Failed to delete actor."));
    } finally {
      setSaving(false);
    }
  }

  async function createTeam() {
    if (!session?.access_token) return;
    const name = teamName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{ team: TeamWithRole }>("/api/teams", session.access_token, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setTeams((current) => [result.team, ...current.filter((team) => team.id !== result.team.id)]);
      setTeamName("");
      setStatus(ui.teamCreated);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : (isZh ? "创建团队失败。" : "Failed to create team."));
    } finally {
      setSaving(false);
    }
  }

  async function generatePrompt() {
    if (!session?.access_token) return;
    setGenerating("prompt");
    setError("");
    try {
      const result = await apiFetch<{ basePrompt: string; negativePrompt: string }>("/api/actors/generate-prompt", session.access_token, {
        method: "POST",
        body: JSON.stringify({ actorId: selectedId || null, actor: form }),
      });
      setForm((current) => ({
        ...current,
        base_prompt: result.basePrompt,
        negative_prompt: result.negativePrompt,
      }));
      setStatus(ui.promptGenerated);
      if (selectedId) await load();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : (isZh ? "生成提示词失败。" : "Failed to generate prompt."));
    } finally {
      setGenerating("");
    }
  }

  async function generateImage(kind: "avatar" | "reference") {
    if (!session?.access_token || !selectedId) {
      setError(selectedId ? ui.signInToUpload : ui.saveBeforeImage);
      return;
    }

    setGenerating(kind);
    setError("");
    try {
      const endpoint = kind === "avatar" ? "/api/actors/generate-avatar" : "/api/actors/generate-reference-sheet";
      const result = await apiFetch<{ actor: ActorProfile }>(endpoint, session.access_token, {
        method: "POST",
        body: JSON.stringify({
          actorId: selectedId,
          prompt: form.base_prompt,
          projectStyle,
          characterRole,
          costumeDirection,
        }),
      });
      setActors((current) => upsertActor(current, result.actor));
      setSelectedId(result.actor.id);
      setStatus(kind === "avatar" ? ui.avatarGenerated : ui.referenceGenerated);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : kind === "avatar" ? (isZh ? "生成头像失败。" : "Failed to generate avatar.") : (isZh ? "生成参考表失败。" : "Failed to generate reference sheet."));
    } finally {
      setGenerating("");
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(ui.uploadImageOnly);
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setError(ui.uploadLimit);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUploadedPreview(dataUrl);
      setStatus(ui.avatarLoaded);
    } catch {
      setError(isZh ? "读取图片失败。" : "Failed to read image.");
    }
  }

  const authRequired = !session;

  return (
    <main className="actors-page">
      <header className="universe-title-band container">
        <Link className="universe-brand-inline" href="/">
          <KiikisLogo compact />
        </Link>
        <div>
          <span>{ui.kicker}</span>
          <h1>{ui.title}</h1>
          <p>{ui.subtitle}</p>
        </div>
      </header>

      <section className="actors-layout">
        {authRequired ? (
          <div className="dashboard-panel actors-auth-panel">
            <span className="simple-zone-label">{ui.authKicker}</span>
            <h2>{ui.authTitle}</h2>
            <p>{ui.authBody}</p>
            <Link className="primary-button" href="/login">{ui.signIn}</Link>
          </div>
        ) : (
          <>
            <aside className="dashboard-panel actors-sidebar">
              <div className="actors-panel-head">
                <div>
                  <span className="simple-zone-label">{ui.listKicker}</span>
                  <h2>{ui.listTitle}</h2>
                </div>
                <button className="icon-button" type="button" onClick={startNewActor} aria-label={ui.newActor}>
                  <Plus size={18} />
                </button>
              </div>

              {schemaWarning ? <div className="notice warning actors-storage-notice">{schemaWarning}</div> : null}
              {!schemaWarning && storageMode === "structured" ? <div className="notice success actors-storage-notice">{ui.structuredReady}</div> : null}
              {loading ? <p className="subtle">{ui.loading}</p> : null}
              <div className="actors-list">
                {actors.map((actor) => (
                  <button
                    key={actor.id}
                    className={actor.id === selectedId ? "active" : ""}
                    type="button"
                    onClick={() => setSelectedId(actor.id)}
                  >
                    <ActorThumb actor={actor} />
                    <span>
                      <strong>{actor.name}</strong>
                      <small>{actor.visibility === "team" ? ui.teamActor : ui.privateActor} · {actor.status}</small>
                    </span>
                  </button>
                ))}
                {!actors.length && !loading ? <p className="actors-empty">{ui.emptyActors}</p> : null}
              </div>

              <div className="actors-team-box">
                <span className="simple-zone-label">{ui.teamKicker}</span>
                <div className="actors-team-create">
                  <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder={ui.teamName} />
                  <button className="secondary-button" type="button" onClick={createTeam} disabled={saving || !teamName.trim()}>
                    <Users size={16} /> {ui.createTeam}
                  </button>
                </div>
                <div className="actors-team-list">
                  {teams.map((team) => (
                    <small key={team.id}>{team.name} · {team.role || ui.member}</small>
                  ))}
                  {!teams.length ? <small>{ui.noTeams}</small> : null}
                </div>
              </div>
            </aside>

            <section className="dashboard-panel actors-editor">
              <div className="actors-panel-head">
                <div>
                  <span className="simple-zone-label">{ui.profileKicker}</span>
                  <h2>{selectedId ? ui.editActor : ui.newActor}</h2>
                </div>
                <div className="simple-action-row">
                  {selectedId ? (
                    <button className="secondary-button" type="button" onClick={deleteActor} disabled={saving}>
                      <Trash2 size={16} /> {ui.deleteActor}
                    </button>
                  ) : null}
                  <button className="primary-button" type="button" onClick={saveActor} disabled={saving}>
                    <Save size={16} /> {saving ? ui.saving : ui.saveActor}
                  </button>
                </div>
              </div>

              {error ? <div className="notice error">{error}</div> : null}
              {status ? <div className="notice success">{status}</div> : null}

              <div className="actors-form-grid">
                <label className="simple-field">
                  {ui.name}
                  <input value={form.name || ""} onChange={(event) => updateForm("name", event.target.value)} placeholder={ui.namePlaceholder} />
                </label>
                <label className="simple-field">
                  {ui.visibility}
                  <select value={form.visibility || "private"} onChange={(event) => updateForm("visibility", event.target.value)}>
                    <option value="private">{ui.privateActor}</option>
                    <option value="team">{ui.teamActor}</option>
                  </select>
                </label>
                <label className="simple-field">
                  {ui.team}
                  <select
                    value={form.team_id || ""}
                    onChange={(event) => updateForm("team_id", event.target.value || null)}
                    disabled={form.visibility !== "team"}
                  >
                    <option value="">{ui.noTeamSelected}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label className="simple-field">
                  {ui.age}
                  <input value={form.age_range || ""} onChange={(event) => updateForm("age_range", event.target.value)} placeholder={ui.agePlaceholder} />
                </label>
                <label className="simple-field">
                  {ui.gender}
                  <input value={form.gender_expression || ""} onChange={(event) => updateForm("gender_expression", event.target.value)} placeholder={ui.genderPlaceholder} />
                </label>
                <label className="simple-field">
                  {ui.ethnicity}
                  <input value={form.ethnicity_style || ""} onChange={(event) => updateForm("ethnicity_style", event.target.value)} placeholder={ui.ethnicityPlaceholder} />
                </label>
                <label className="simple-field">
                  {ui.face}
                  <textarea value={form.face_description || ""} onChange={(event) => updateForm("face_description", event.target.value)} />
                </label>
                <label className="simple-field">
                  {ui.hair}
                  <textarea value={form.hair_description || ""} onChange={(event) => updateForm("hair_description", event.target.value)} />
                </label>
                <label className="simple-field">
                  {ui.body}
                  <textarea value={form.body_description || ""} onChange={(event) => updateForm("body_description", event.target.value)} />
                </label>
                <label className="simple-field">
                  {ui.temperament}
                  <input value={tagsToString(form.temperament)} onChange={(event) => updateForm("temperament", event.target.value)} placeholder={ui.temperamentPlaceholder} />
                </label>
                <label className="simple-field">
                  {ui.playableRoles}
                  <input value={tagsToString(form.playable_roles)} onChange={(event) => updateForm("playable_roles", event.target.value)} placeholder={ui.playableRolesPlaceholder} />
                </label>
                <label className="simple-field actors-wide">
                  {ui.bio}
                  <textarea value={form.bio || ""} onChange={(event) => updateForm("bio", event.target.value)} placeholder={ui.bioPlaceholder} />
                </label>
              </div>
            </section>

            <aside className="dashboard-panel actors-tools">
              <span className="simple-zone-label">{ui.assetsKicker}</span>
              <h2>{ui.assetsTitle}</h2>
              <label className="actors-upload">
                <ImagePlus size={18} />
                <span>{ui.uploadAvatar}</span>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} />
              </label>
              <div className="actors-preview-grid">
                <AssetPreview title={ui.avatar} src={uploadedPreview || selectedActor?.avatar_url || ""} />
                <AssetPreview title={ui.referenceSheet} src={selectedActor?.reference_sheet_url || ""} />
              </div>

              <button className="secondary-button full" type="button" onClick={generatePrompt} disabled={generating === "prompt"}>
                <Sparkles size={16} /> {generating === "prompt" ? ui.generating : ui.generatePrompt}
              </button>
              <button className="secondary-button full" type="button" onClick={() => generateImage("avatar")} disabled={!selectedId || generating === "avatar"}>
                <Sparkles size={16} /> {generating === "avatar" ? ui.generating : ui.generateAvatar}
              </button>

              <div className="actors-tool-divider" />
              <label className="simple-field">
                {ui.projectStyle}
                <input value={projectStyle} onChange={(event) => setProjectStyle(event.target.value)} placeholder={ui.projectStylePlaceholder} />
              </label>
              <label className="simple-field">
                {ui.characterRole}
                <input value={characterRole} onChange={(event) => setCharacterRole(event.target.value)} placeholder={ui.characterRolePlaceholder} />
              </label>
              <label className="simple-field">
                {ui.costume}
                <textarea value={costumeDirection} onChange={(event) => setCostumeDirection(event.target.value)} placeholder={ui.costumePlaceholder} />
              </label>
              <button className="primary-button full" type="button" onClick={() => generateImage("reference")} disabled={!selectedId || generating === "reference"}>
                <Sparkles size={16} /> {generating === "reference" ? ui.generating : ui.referenceSheet}
              </button>

              <div className="actors-tool-divider" />
              <label className="simple-field">
                {ui.basePrompt}
                <textarea value={form.base_prompt || ""} onChange={(event) => updateForm("base_prompt", event.target.value)} />
              </label>
              <label className="simple-field">
                {ui.negativePrompt}
                <textarea value={form.negative_prompt || ""} onChange={(event) => updateForm("negative_prompt", event.target.value)} />
              </label>
            </aside>
          </>
        )}
      </section>
    </main>
  );

  function updateForm(key: keyof ActorProfileInput, value: ActorProfileInput[keyof ActorProfileInput]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function ActorThumb({ actor }: { actor: ActorProfile }) {
  if (actor.avatar_url) return <img src={actor.avatar_url} alt="" />;
  return <span>{actor.name.slice(0, 1).toUpperCase() || "A"}</span>;
}

function AssetPreview({ title, src }: { title: string; src: string }) {
  return (
    <div className="actors-asset-preview">
      {src ? <img src={src} alt={title} /> : <span>{title}</span>}
    </div>
  );
}

function upsertActor(list: ActorProfile[], actor: ActorProfile) {
  return [actor, ...list.filter((item) => item.id !== actor.id)];
}

function tagsToString(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

async function apiFetch<T>(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || data.success === false) throw new Error(data.error || "请求失败。");
  return data as ApiResult<T>;
}
