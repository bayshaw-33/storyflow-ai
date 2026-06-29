"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ImagePlus, Plus, Save, Sparkles, Trash2, Users } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createEmptyActorInput, type ActorProfile, type ActorProfileInput, type Team } from "@/lib/actors";

type TeamWithRole = Team & { role?: string };

type ApiResult<T> = T & {
  success: boolean;
  error?: string;
};

export default function ActorsPage() {
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
        apiFetch<{ actors: ActorProfile[] }>("/api/actors", nextSession.access_token),
        apiFetch<{ teams: TeamWithRole[] }>("/api/teams", nextSession.access_token),
      ]);
      setActors(actorResult.actors);
      setTeams(teamResult.teams);
      if (!selectedId && actorResult.actors[0]) setSelectedId(actorResult.actors[0].id);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "加载演员库失败。");
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
      setError("请先登录后再保存演员。");
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
      setStatus("演员已保存。");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "保存演员失败。");
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
      setStatus("演员已删除。");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "删除演员失败。");
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
      setStatus("团队已创建。");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "创建团队失败。");
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
      setStatus("提示词已生成。");
      if (selectedId) await load();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "生成提示词失败。");
    } finally {
      setGenerating("");
    }
  }

  async function generateImage(kind: "avatar" | "reference") {
    if (!session?.access_token || !selectedId) {
      setError("请先保存演员，再生成图像资产。");
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
      setStatus(kind === "avatar" ? "头像已生成。" : "角色参考表已生成。");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : kind === "avatar" ? "生成头像失败。" : "生成参考表失败。");
    } finally {
      setGenerating("");
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件。");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setError("头像文件请控制在 1.5MB 以内。");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setUploadedPreview(dataUrl);
    setStatus("头像已载入，保存演员后会进入演员资产。");
  }

  const authRequired = !session;

  return (
    <main className="actors-page">
      <header className="universe-title-band container">
        <Link className="universe-brand-inline" href="/">
          <KiikisLogo compact />
        </Link>
        <div>
          <span>Actor Library</span>
          <h1>演员库</h1>
          <p>只保存虚拟演员的基础视觉身份。角色 canon 留在 Universe，项目三视图和参考表留在具体项目。</p>
        </div>
      </header>

      <section className="actors-layout">
        {authRequired ? (
          <div className="dashboard-panel actors-auth-panel">
            <span className="simple-zone-label">Login required</span>
            <h2>登录后使用团队演员库</h2>
            <p>演员库需要云端权限来区分个人资产、团队资产和项目形象版本。</p>
            <Link className="primary-button" href="/login">去登录</Link>
          </div>
        ) : (
          <>
            <aside className="dashboard-panel actors-sidebar">
              <div className="actors-panel-head">
                <div>
                  <span className="simple-zone-label">Virtual actors</span>
                  <h2>演员列表</h2>
                </div>
                <button className="icon-button" type="button" onClick={startNewActor} aria-label="新建演员">
                  <Plus size={18} />
                </button>
              </div>

              {loading ? <p className="subtle">加载中...</p> : null}
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
                      <small>{actor.visibility === "team" ? "团队共享" : "个人演员"} · {actor.status}</small>
                    </span>
                  </button>
                ))}
                {!actors.length && !loading ? <p className="actors-empty">暂无演员。先新建一个虚拟演员。</p> : null}
              </div>

              <div className="actors-team-box">
                <span className="simple-zone-label">Team</span>
                <div className="actors-team-create">
                  <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="新团队名称" />
                  <button className="secondary-button" type="button" onClick={createTeam} disabled={saving || !teamName.trim()}>
                    <Users size={16} /> 创建
                  </button>
                </div>
                <div className="actors-team-list">
                  {teams.map((team) => (
                    <small key={team.id}>{team.name} · {team.role || "member"}</small>
                  ))}
                  {!teams.length ? <small>暂无团队。团队用于共享演员库和 Universe。</small> : null}
                </div>
              </div>
            </aside>

            <section className="dashboard-panel actors-editor">
              <div className="actors-panel-head">
                <div>
                  <span className="simple-zone-label">Profile</span>
                  <h2>{selectedId ? "编辑演员" : "新建演员"}</h2>
                </div>
                <div className="simple-action-row">
                  {selectedId ? (
                    <button className="secondary-button" type="button" onClick={deleteActor} disabled={saving}>
                      <Trash2 size={16} /> 删除
                    </button>
                  ) : null}
                  <button className="primary-button" type="button" onClick={saveActor} disabled={saving}>
                    <Save size={16} /> {saving ? "保存中" : "保存演员"}
                  </button>
                </div>
              </div>

              {error ? <div className="notice error">{error}</div> : null}
              {status ? <div className="notice success">{status}</div> : null}

              <div className="actors-form-grid">
                <label className="simple-field">
                  演员名称
                  <input value={form.name || ""} onChange={(event) => updateForm("name", event.target.value)} placeholder="例如：Astra Lin" />
                </label>
                <label className="simple-field">
                  可见范围
                  <select value={form.visibility || "private"} onChange={(event) => updateForm("visibility", event.target.value)}>
                    <option value="private">个人演员</option>
                    <option value="team">团队共享</option>
                  </select>
                </label>
                <label className="simple-field">
                  所属团队
                  <select
                    value={form.team_id || ""}
                    onChange={(event) => updateForm("team_id", event.target.value || null)}
                    disabled={form.visibility !== "team"}
                  >
                    <option value="">未选择团队</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label className="simple-field">
                  年龄感
                  <input value={form.age_range || ""} onChange={(event) => updateForm("age_range", event.target.value)} placeholder="例如：20代后半" />
                </label>
                <label className="simple-field">
                  性别表达
                  <input value={form.gender_expression || ""} onChange={(event) => updateForm("gender_expression", event.target.value)} placeholder="例如：冷感女性 / 少年感男性" />
                </label>
                <label className="simple-field">
                  族裔 / 地域气质
                  <input value={form.ethnicity_style || ""} onChange={(event) => updateForm("ethnicity_style", event.target.value)} placeholder="例如：东亚都市感" />
                </label>
                <label className="simple-field">
                  脸型与五官
                  <textarea value={form.face_description || ""} onChange={(event) => updateForm("face_description", event.target.value)} />
                </label>
                <label className="simple-field">
                  发型与发质
                  <textarea value={form.hair_description || ""} onChange={(event) => updateForm("hair_description", event.target.value)} />
                </label>
                <label className="simple-field">
                  体型与比例
                  <textarea value={form.body_description || ""} onChange={(event) => updateForm("body_description", event.target.value)} />
                </label>
                <label className="simple-field">
                  气质关键词
                  <input value={tagsToString(form.temperament)} onChange={(event) => updateForm("temperament", event.target.value)} placeholder="冷静, 危险, 克制" />
                </label>
                <label className="simple-field">
                  可出演类型
                  <input value={tagsToString(form.playable_roles)} onChange={(event) => updateForm("playable_roles", event.target.value)} placeholder="反派, 白切黑, 狼人女主" />
                </label>
                <label className="simple-field actors-wide">
                  演员简介
                  <textarea value={form.bio || ""} onChange={(event) => updateForm("bio", event.target.value)} placeholder="只描述这个虚拟演员的基础视觉身份，不写剧情 canon。" />
                </label>
              </div>
            </section>

            <aside className="dashboard-panel actors-tools">
              <span className="simple-zone-label">AI assets</span>
              <h2>生成资产</h2>
              <label className="actors-upload">
                <ImagePlus size={18} />
                <span>上传头像</span>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} />
              </label>
              <div className="actors-preview-grid">
                <AssetPreview title="头像" src={uploadedPreview || selectedActor?.avatar_url || ""} />
                <AssetPreview title="角色参考表" src={selectedActor?.reference_sheet_url || ""} />
              </div>

              <button className="secondary-button full" type="button" onClick={generatePrompt} disabled={generating === "prompt"}>
                <Sparkles size={16} /> {generating === "prompt" ? "生成中" : "生成提示词"}
              </button>
              <button className="secondary-button full" type="button" onClick={() => generateImage("avatar")} disabled={!selectedId || generating === "avatar"}>
                <Sparkles size={16} /> {generating === "avatar" ? "生成中" : "生成头像"}
              </button>

              <div className="actors-tool-divider" />
              <label className="simple-field">
                项目画风
                <input value={projectStyle} onChange={(event) => setProjectStyle(event.target.value)} placeholder="例如：暗黑狼人短剧，冷蓝月光" />
              </label>
              <label className="simple-field">
                角色设定
                <input value={characterRole} onChange={(event) => setCharacterRole(event.target.value)} placeholder="例如：狼人族继承人" />
              </label>
              <label className="simple-field">
                服装与妆造
                <textarea value={costumeDirection} onChange={(event) => setCostumeDirection(event.target.value)} placeholder="例如：黑色皮质长外套，银色狼纹项链" />
              </label>
              <button className="primary-button full" type="button" onClick={() => generateImage("reference")} disabled={!selectedId || generating === "reference"}>
                <Sparkles size={16} /> {generating === "reference" ? "生成中" : "生成角色参考表"}
              </button>

              <div className="actors-tool-divider" />
              <label className="simple-field">
                基础 Prompt
                <textarea value={form.base_prompt || ""} onChange={(event) => updateForm("base_prompt", event.target.value)} />
              </label>
              <label className="simple-field">
                Negative Prompt
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
    reader.onerror = () => reject(new Error("读取图片失败。"));
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
