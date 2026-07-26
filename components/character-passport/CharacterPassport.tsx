"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Save, X, AlertCircle, CheckCircle2 } from "lucide-react";
import type {
  CharacterPassportDTO,
  PassportIdentity,
  PassportActor,
  PassportPortrayal,
  PassportAppearanceVariant,
  PassportPrompt,
  PassportIdentityInput,
  PassportPromptInput,
} from "@/lib/character-passport/types";

// ============================================================
// 文案
// ============================================================

type Copy = {
  back: string;
  identity: string;
  actors: string;
  portrayals: string;
  appearanceVariants: string;
  prompt: string;
  voice: string;
  voiceComingSoon: string;
  loading: string;
  loadFailed: string;
  retry: string;
  empty: string;
  save: string;
  cancel: string;
  edit: string;
  locked: string;
  unlocked: string;
  identityCore: string;
  currentAppearance: string;
  sceneOverride: string;
  saveIdentityOk: string;
  savePromptOk: string;
  noActor: string;
  noPortrayal: string;
  noAppearance: string;
  noPassport: string;
  sourceActorDefault: string;
  sourceProjectOverride: string;
  sourceSceneOverride: string;
  sourceEmpty: string;
  unlockToEdit: string;
  age: string;
  nationality: string;
  roleFunction: string;
  identityLabel: string;
  goal: string;
  trauma: string;
  secret: string;
  forbiddenChanges: string;
  tags: string;
  canonStatus: string;
  summary: string;
  name: string;
  scope: string;
  scopeActorDefault: string;
  scopeProjectOverride: string;
  scopeSceneOverride: string;
  applyToShotPrompt: string;
  applyToShotPromptHint: string;
};

function getCopy(isZh: boolean): Copy {
  if (isZh) {
    return {
      back: "返回 Universe",
      identity: "基础身份",
      actors: "演员",
      portrayals: "项目形象",
      appearanceVariants: "造型变化",
      prompt: "三层 Prompt",
      voice: "声音档案",
      voiceComingSoon: "Voice Profile 将在 V2.0 阶段 03 提供",
      loading: "加载 Passport 中…",
      loadFailed: "加载失败",
      retry: "重试",
      empty: "未找到该角色",
      save: "保存",
      cancel: "取消",
      edit: "编辑",
      locked: "已锁定",
      unlocked: "未锁定",
      identityCore: "Identity Core（身份核心）",
      currentAppearance: "Current Appearance（当前造型）",
      sceneOverride: "Scene Override（场景覆盖）",
      saveIdentityOk: "身份已更新",
      savePromptOk: "Prompt 已更新",
      noActor: "该角色尚未绑定演员",
      noPortrayal: "暂无项目形象",
      noAppearance: "暂无造型变化版本",
      noPassport: "尚未配置 Passport",
      sourceActorDefault: "来自演员默认",
      sourceProjectOverride: "来自项目覆盖",
      sourceSceneOverride: "来自场景覆盖",
      sourceEmpty: "未配置",
      unlockToEdit: "解锁后可编辑",
      age: "年龄/年龄段",
      nationality: "国籍/文化背景",
      roleFunction: "角色功能",
      identityLabel: "身份",
      goal: "目标",
      trauma: "创伤",
      secret: "秘密",
      forbiddenChanges: "禁止变化规则",
      tags: "标签",
      canonStatus: "Canon 状态",
      summary: "摘要",
      name: "角色名",
      scope: "写入维度",
      scopeActorDefault: "演员默认",
      scopeProjectOverride: "项目覆盖",
      scopeSceneOverride: "场景覆盖",
      applyToShotPrompt: "应用到 Shot Prompt（预览）",
      applyToShotPromptHint: "（V2-04 提供 Shot 应用入口）",
    };
  }
  return {
    back: "Back to Universe",
    identity: "Identity",
    actors: "Actors",
    portrayals: "Portrayals",
    appearanceVariants: "Appearance Variants",
    prompt: "Three-Layer Prompt",
    voice: "Voice Profile",
    voiceComingSoon: "Voice Profile will arrive in V2.0 phase 03",
    loading: "Loading Passport…",
    loadFailed: "Load failed",
    retry: "Retry",
    empty: "Character not found",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    locked: "Locked",
    unlocked: "Unlocked",
    identityCore: "Identity Core",
    currentAppearance: "Current Appearance",
    sceneOverride: "Scene Override",
    saveIdentityOk: "Identity updated",
    savePromptOk: "Prompt updated",
    noActor: "No actor bound to this character",
    noPortrayal: "No portrayals",
    noAppearance: "No appearance variants",
    noPassport: "Passport not configured",
    sourceActorDefault: "From actor default",
    sourceProjectOverride: "From project override",
    sourceSceneOverride: "From scene override",
    sourceEmpty: "Not configured",
    unlockToEdit: "Unlock to edit",
    age: "Age / range",
    nationality: "Nationality / culture",
    roleFunction: "Role function",
    identityLabel: "Identity",
    goal: "Goal",
    trauma: "Trauma",
    secret: "Secret",
    forbiddenChanges: "Forbidden changes",
    tags: "Tags",
    canonStatus: "Canon status",
    summary: "Summary",
    name: "Name",
    scope: "Scope",
    scopeActorDefault: "Actor default",
    scopeProjectOverride: "Project override",
    scopeSceneOverride: "Scene override",
    applyToShotPrompt: "Apply to Shot Prompt (preview)",
    applyToShotPromptHint: "(Shot apply arrives in V2-04)",
  };
}

// ============================================================
// 通用样式
// ============================================================

const CARD: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.02)",
  padding: 16,
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const VALUE: React.CSSProperties = {
  fontSize: 14,
  color: "rgba(255,255,255,0.9)",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,0.9)",
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 13,
};

const TEXTAREA: React.CSSProperties = {
  ...INPUT,
  minHeight: 60,
  resize: "vertical" as const,
  fontFamily: "inherit",
};

const BUTTON_PRIMARY: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "rgba(99,102,241,0.2)",
  border: "1px solid rgba(99,102,241,0.4)",
  borderRadius: 4,
  color: "#a5b4fc",
  cursor: "pointer",
  fontSize: 12,
};

const BUTTON_GHOST: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4,
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontSize: 12,
};

// ============================================================
// 主组件
// ============================================================

type CharacterPassportProps = {
  universeId: string;
  entityId: string;
  accessToken: string | null;
  isZh: boolean;
};

export const CharacterPassport = memo(function CharacterPassport({
  universeId,
  entityId,
  accessToken,
  isZh,
}: CharacterPassportProps) {
  const copy = useMemo(() => getCopy(isZh), [isZh]);
  const [passport, setPassport] = useState<CharacterPassportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setError(isZh ? "请先登录" : "Please sign in first");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/characters/${encodeURIComponent(entityId)}/passport`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "load failed");
      }
      setPassport(data.passport as CharacterPassportDTO);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [accessToken, universeId, entityId, isZh]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const handleIdentitySaved = useCallback((identity: PassportIdentity) => {
    setPassport((prev) => (prev ? { ...prev, identity } : prev));
    setToast({ kind: "ok", text: copy.saveIdentityOk });
  }, [copy.saveIdentityOk]);

  const handlePromptSaved = useCallback((prompt: PassportPrompt) => {
    setPassport((prev) => (prev ? { ...prev, prompt } : prev));
    setToast({ kind: "ok", text: copy.savePromptOk });
  }, [copy.savePromptOk]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
        {copy.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#f87171" }}>
        <p>{copy.loadFailed}: {error}</p>
        <button onClick={reload} style={{ ...BUTTON_GHOST, marginTop: 8 }}>{copy.retry}</button>
      </div>
    );
  }

  if (!passport) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
        {copy.empty}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          href={`/universes/${encodeURIComponent(universeId)}?tab=graph`}
          style={{ ...BUTTON_GHOST, textDecoration: "none" }}
        >
          <ArrowLeft size={14} /> {copy.back}
        </Link>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{passport.identity.name}</div>
        <div style={{ width: 120 }} />
      </div>

      <IdentitySection
        identity={passport.identity}
        accessToken={accessToken}
        universeId={universeId}
        entityId={entityId}
        copy={copy}
        isZh={isZh}
        onSaved={handleIdentitySaved}
      />

      <ActorSection actors={passport.actors} copy={copy} />

      <PortrayalSection portrayals={passport.portrayals} copy={copy} />

      <AppearanceSection variants={passport.appearanceVariants} copy={copy} />

      <PromptSection
        prompt={passport.prompt}
        actors={passport.actors}
        accessToken={accessToken}
        universeId={universeId}
        entityId={entityId}
        copy={copy}
        isZh={isZh}
        onSaved={handlePromptSaved}
        setError={(text) => setToast({ kind: "err", text })}
      />

      <VoicePlaceholder copy={copy} />

      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "10px 14px",
            borderRadius: 6,
            background: toast.kind === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${toast.kind === "ok" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
            color: toast.kind === "ok" ? "#86efac" : "#fca5a5",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 50,
          }}
        >
          {toast.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
});

// ============================================================
// Identity Section
// ============================================================

type IdentitySectionProps = {
  identity: PassportIdentity;
  accessToken: string | null;
  universeId: string;
  entityId: string;
  copy: Copy;
  isZh: boolean;
  onSaved: (identity: PassportIdentity) => void;
};

function IdentitySection({
  identity,
  accessToken,
  universeId,
  entityId,
  copy,
  onSaved,
}: IdentitySectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PassportIdentityInput>({
    name: identity.name,
    summary: identity.summary,
    details: {
      age: identity.details.age ?? "",
      nationality: identity.details.nationality ?? "",
      role_function: identity.details.role_function ?? "",
      identity: identity.details.identity ?? "",
      goal: identity.details.goal ?? "",
      trauma: identity.details.trauma ?? "",
      secret: identity.details.secret ?? "",
      forbidden_changes: identity.details.forbidden_changes ?? "",
    },
    tags: identity.tags,
  });

  const handleSave = useCallback(async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/characters/${encodeURIComponent(entityId)}/passport`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ section: "identity", identity: form }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "save failed");
      onSaved(data.identity as PassportIdentity);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }, [accessToken, universeId, entityId, form, onSaved]);

  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>{copy.identity}</h2>
      {!editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={copy.name} value={identity.name} />
          <Field label={copy.canonStatus} value={identity.canonStatus} />
          <Field label={copy.age} value={identity.details.age ?? "—"} />
          <Field label={copy.nationality} value={identity.details.nationality ?? "—"} />
          <Field label={copy.roleFunction} value={identity.details.role_function ?? "—"} />
          <Field label={copy.identityLabel} value={identity.details.identity ?? "—"} />
          <Field label={copy.goal} value={identity.details.goal ?? "—"} />
          <Field label={copy.trauma} value={identity.details.trauma ?? "—"} />
          <Field label={copy.secret} value={identity.details.secret ?? "—"} />
          <Field label={copy.tags} value={identity.tags.join(", ") || "—"} />
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={LABEL}>{copy.summary}</div>
            <div style={VALUE}>{identity.summary || "—"}</div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={LABEL}>{copy.forbiddenChanges}</div>
            <div style={VALUE}>{identity.details.forbidden_changes || "—"}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <LabeledInput label={copy.name} value={form.name ?? ""} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <LabeledTextarea label={copy.summary} value={form.summary ?? ""} onChange={(v) => setForm((f) => ({ ...f, summary: v }))} />
          <LabeledInput label={copy.age} value={(form.details?.age as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, age: v } }))} />
          <LabeledInput label={copy.nationality} value={(form.details?.nationality as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, nationality: v } }))} />
          <LabeledInput label={copy.roleFunction} value={(form.details?.role_function as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, role_function: v } }))} />
          <LabeledInput label={copy.identityLabel} value={(form.details?.identity as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, identity: v } }))} />
          <LabeledInput label={copy.goal} value={(form.details?.goal as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, goal: v } }))} />
          <LabeledInput label={copy.trauma} value={(form.details?.trauma as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, trauma: v } }))} />
          <LabeledInput label={copy.secret} value={(form.details?.secret as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, secret: v } }))} />
          <LabeledTextarea label={copy.forbiddenChanges} value={(form.details?.forbidden_changes as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, details: { ...f.details!, forbidden_changes: v } }))} />
        </div>
      )}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={BUTTON_GHOST}>{copy.edit}</button>
        ) : (
          <>
            <button onClick={handleSave} disabled={saving} style={BUTTON_PRIMARY}>
              {saving ? "..." : <><Save size={12} /> {copy.save}</>}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} style={BUTTON_GHOST}>
              <X size={12} /> {copy.cancel}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Actor Section
// ============================================================

function ActorSection({ actors, copy }: { actors: PassportActor[]; copy: Copy }) {
  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>{copy.actors} <span style={{ opacity: 0.5, fontSize: 11 }}>({actors.length})</span></h2>
      {actors.length === 0 ? (
        <Empty text={copy.noActor} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {actors.map((actor) => (
            <div key={actor.actorId} style={{ padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {actor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={actor.avatarUrl} alt={actor.name} style={{ width: 48, height: 48, borderRadius: 4, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 4, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {actor.name.charAt(0)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{actor.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {actor.ageRange} / {actor.genderExpression} / {actor.ethnicityStyle}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {actor.bio || "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Portrayal Section
// ============================================================

function PortrayalSection({ portrayals, copy }: { portrayals: PassportPortrayal[]; copy: Copy }) {
  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>{copy.portrayals} <span style={{ opacity: 0.5, fontSize: 11 }}>({portrayals.length})</span></h2>
      {portrayals.length === 0 ? (
        <Empty text={copy.noPortrayal} />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {portrayals.map((p) => (
            <div key={p.id} style={{ padding: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.9)" }}>{p.portrayalName || p.actorName}</span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{p.projectId ?? "—"}</span>
              </div>
              {p.visualPrompt ? <div style={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{p.visualPrompt}</div> : null}
              {p.costumeDirection ? <div style={{ color: "rgba(255,255,255,0.5)" }}>{p.costumeDirection}</div> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Appearance Section
// ============================================================

function AppearanceSection({ variants, copy }: { variants: PassportAppearanceVariant[]; copy: Copy }) {
  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>{copy.appearanceVariants} <span style={{ opacity: 0.5, fontSize: 11 }}>({variants.length})</span></h2>
      {variants.length === 0 ? (
        <Empty text={copy.noAppearance} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {variants.map((v) => (
            <div key={v.id} style={{ padding: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
              {v.frontAssetUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.frontAssetUrl} alt={v.characterName} style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 4 }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "9/16", background: "rgba(255,255,255,0.05)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                  9:16
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.9)" }}>{v.characterName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {v.status} · {v.projectStyle || "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Prompt Section（三层 Prompt 编辑器）
// ============================================================

type PromptSectionProps = {
  prompt: PassportPrompt;
  actors: PassportActor[];
  accessToken: string | null;
  universeId: string;
  entityId: string;
  copy: Copy;
  isZh: boolean;
  onSaved: (prompt: PassportPrompt) => void;
  setError: (text: string) => void;
};

function PromptSection({
  prompt,
  actors,
  accessToken,
  universeId,
  entityId,
  copy,
  onSaved,
  setError,
}: PromptSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PassportPromptInput>({
    identityCorePrompt: prompt.identityCorePrompt,
    currentAppearancePrompt: prompt.currentAppearancePrompt,
    sceneOverridePrompt: prompt.sceneOverridePrompt,
    coreIdentityLocked: prompt.coreIdentityLocked,
    appearanceLockedByDefault: prompt.appearanceLockedByDefault,
    projectOverrideAllowed: prompt.projectOverrideAllowed,
    scope: "actor_default",
  });

  const sourceLabel = useMemo(() => {
    switch (prompt.source) {
      case "actor_default":
        return copy.sourceActorDefault;
      case "project_override":
        return copy.sourceProjectOverride;
      case "scene_override":
        return copy.sourceSceneOverride;
      default:
        return copy.sourceEmpty;
    }
  }, [prompt.source, copy]);

  const handleSave = useCallback(async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/characters/${encodeURIComponent(entityId)}/passport`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ section: "prompt", prompt: form }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "save failed");
      onSaved(data.prompt as PassportPrompt);
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "save failed";
      setError(msg);
      alert(msg);
    } finally {
      setSaving(false);
    }
  }, [accessToken, universeId, entityId, form, onSaved, setError]);

  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>
        {copy.prompt}
        <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6 }}>· {sourceLabel}</span>
      </h2>

      {!editing ? (
        <>
          <PromptField label={copy.identityCore} value={prompt.identityCorePrompt} locked={prompt.coreIdentityLocked} copy={copy} />
          <PromptField label={copy.currentAppearance} value={prompt.currentAppearancePrompt} locked={prompt.appearanceLockedByDefault} copy={copy} />
          <PromptField label={copy.sceneOverride} value={prompt.sceneOverridePrompt} locked={false} copy={copy} />
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setEditing(true)} style={BUTTON_GHOST}>{copy.edit}</button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{copy.applyToShotPromptHint}</span>
          </div>
        </>
      ) : (
        <>
          <PromptEditor
            label={copy.identityCore}
            value={form.identityCorePrompt ?? ""}
            locked={form.coreIdentityLocked ?? true}
            copy={copy}
            onChange={(v) => setForm((f) => ({ ...f, identityCorePrompt: v }))}
            onLockChange={(locked) => setForm((f) => ({ ...f, coreIdentityLocked: locked }))}
          />
          <PromptEditor
            label={copy.currentAppearance}
            value={form.currentAppearancePrompt ?? ""}
            locked={form.appearanceLockedByDefault ?? true}
            copy={copy}
            onChange={(v) => setForm((f) => ({ ...f, currentAppearancePrompt: v }))}
            onLockChange={(locked) => setForm((f) => ({ ...f, appearanceLockedByDefault: locked }))}
          />
          <PromptEditor
            label={copy.sceneOverride}
            value={form.sceneOverridePrompt ?? ""}
            locked={false}
            copy={copy}
            onChange={(v) => setForm((f) => ({ ...f, sceneOverridePrompt: v }))}
            onLockChange={() => undefined}
          />
          <div style={{ marginTop: 8 }}>
            <div style={LABEL}>{copy.scope}</div>
            <select
              value={form.scope ?? "actor_default"}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as PassportPromptInput["scope"] }))}
              style={INPUT}
            >
              <option value="actor_default">{copy.scopeActorDefault}</option>
              <option value="project_override">{copy.scopeProjectOverride}</option>
              <option value="scene_override">{copy.scopeSceneOverride}</option>
            </select>
          </div>
          {(form.scope === "project_override" || form.scope === "scene_override") && actors.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <div style={LABEL}>Actor</div>
              <select
                value={form.actorProfileId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, actorProfileId: e.target.value }))}
                style={INPUT}
              >
                <option value="">—</option>
                {actors.map((a) => (
                  <option key={a.actorId} value={a.actorId}>{a.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={BUTTON_PRIMARY}>
              {saving ? "..." : <><Save size={12} /> {copy.save}</>}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} style={BUTTON_GHOST}>
              <X size={12} /> {copy.cancel}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PromptField({ label, value, locked, copy }: { label: string; value: string; locked: boolean; copy: Copy }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...LABEL, display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {locked ? (
          <span style={{ color: "rgba(239,68,68,0.7)", display: "inline-flex", alignItems: "center", gap: 2 }}>
            <Lock size={10} /> {copy.locked}
          </span>
        ) : null}
      </div>
      <div style={{ ...VALUE, whiteSpace: "pre-wrap", fontFamily: "ui-monospace,monospace", fontSize: 12, opacity: value ? 1 : 0.4 }}>
        {value || "—"}
      </div>
    </div>
  );
}

function PromptEditor({
  label,
  value,
  locked,
  copy,
  onChange,
  onLockChange,
}: {
  label: string;
  value: string;
  locked: boolean;
  copy: Copy;
  onChange: (v: string) => void;
  onLockChange: (locked: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...LABEL, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{label}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => onLockChange(e.target.checked)}
          />
          <Lock size={10} /> {locked ? copy.locked : copy.unlocked}
        </label>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked}
        placeholder={locked ? copy.unlockToEdit : ""}
        style={{ ...TEXTAREA, opacity: locked ? 0.5 : 1, fontFamily: "ui-monospace,monospace" }}
      />
    </div>
  );
}

// ============================================================
// Voice 占位（V2-03）
// ============================================================

function VoicePlaceholder({ copy }: { copy: Copy }) {
  return (
    <section style={{ ...CARD, opacity: 0.5 }}>
      <h2 style={SECTION_TITLE}>{copy.voice}</h2>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{copy.voiceComingSoon}</div>
    </section>
  );
}

// ============================================================
// 通用小工具
// ============================================================

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{value}</div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={INPUT} />
    </div>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} style={TEXTAREA} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
      {text}
    </div>
  );
}
