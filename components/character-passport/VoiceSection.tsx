"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import type {
  VoiceProfileDTO,
  VoiceLineDTO,
  CreateVoiceProfileInput,
} from "@/lib/voice/types";

// ============================================================
// 文案
// ============================================================

type Copy = {
  title: string;
  empty: string;
  createProfile: string;
  editProfile: string;
  save: string;
  cancel: string;
  voiceLabel: string;
  voiceProvider: string;
  voiceProviderVoiceId: string;
  language: string;
  speed: string;
  pitch: string;
  stability: string;
  stylePrompt: string;
  status: string;
  voiceLines: string;
  newLine: string;
  textPlaceholder: string;
  generate: string;
  generating: string;
  approve: string;
  unapprove: string;
  approved: string;
  retry: string;
  noAudio: string;
  loadFailed: string;
  providerUnavailable: string;
  saved: string;
  statusDraft: string;
  statusReady: string;
  statusQueued: string;
  statusGenerating: string;
  statusGenerated: string;
  statusFailed: string;
  statusProviderTimeout: string;
  statusModerationBlocked: string;
  revision: string;
  approvedBadge: string;
};

function getCopy(isZh: boolean): Copy {
  if (isZh) {
    return {
      title: "声音档案",
      empty: "尚未创建 Voice Profile",
      createProfile: "创建 Voice Profile",
      editProfile: "编辑",
      save: "保存",
      cancel: "取消",
      voiceLabel: "声音标签",
      voiceProvider: "Provider",
      voiceProviderVoiceId: "Provider Voice ID",
      language: "语言",
      speed: "语速 (0.5–2.0)",
      pitch: "音高 (-12–12)",
      stability: "稳定性 (0–1)",
      stylePrompt: "风格 Prompt",
      status: "状态",
      voiceLines: "对白音频",
      newLine: "新建对白",
      textPlaceholder: "输入对白文本…",
      generate: "生成",
      generating: "生成中…",
      approve: "批准",
      unapprove: "撤销批准",
      approved: "已批准",
      retry: "重试",
      noAudio: "尚未生成音频",
      loadFailed: "加载失败",
      providerUnavailable: "TTS Provider 未配置，无法生成",
      saved: "已保存",
      statusDraft: "草稿",
      statusReady: "就绪",
      statusQueued: "排队中",
      statusGenerating: "生成中",
      statusGenerated: "已生成",
      statusFailed: "失败",
      statusProviderTimeout: "Provider 超时",
      statusModerationBlocked: "内容审核拦截",
      revision: "版本",
      approvedBadge: "已批准",
    };
  }
  return {
    title: "Voice Profile",
    empty: "No Voice Profile yet",
    createProfile: "Create Voice Profile",
    editProfile: "Edit",
    save: "Save",
    cancel: "Cancel",
    voiceLabel: "Voice label",
    voiceProvider: "Provider",
    voiceProviderVoiceId: "Provider Voice ID",
    language: "Language",
    speed: "Speed (0.5–2.0)",
    pitch: "Pitch (-12–12)",
    stability: "Stability (0–1)",
    stylePrompt: "Style prompt",
    status: "Status",
    voiceLines: "Voice Lines",
    newLine: "New line",
    textPlaceholder: "Enter dialogue text…",
    generate: "Generate",
    generating: "Generating…",
    approve: "Approve",
    unapprove: "Unapprove",
    approved: "Approved",
    retry: "Retry",
    noAudio: "No audio generated yet",
    loadFailed: "Load failed",
    providerUnavailable: "TTS Provider not configured",
    saved: "Saved",
    statusDraft: "Draft",
    statusReady: "Ready",
    statusQueued: "Queued",
    statusGenerating: "Generating",
    statusGenerated: "Generated",
    statusFailed: "Failed",
    statusProviderTimeout: "Provider timeout",
    statusModerationBlocked: "Moderation blocked",
    revision: "Rev",
    approvedBadge: "Approved",
  };
}

// ============================================================
// 样式
// ============================================================

const CARD: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.02)",
  padding: 16,
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

const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
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

const BUTTON_SUCCESS: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "rgba(34,197,94,0.15)",
  border: "1px solid rgba(34,197,94,0.4)",
  borderRadius: 4,
  color: "#86efac",
  cursor: "pointer",
  fontSize: 12,
};

const STATUS_COLORS: Record<string, string> = {
  draft: "rgba(255,255,255,0.5)",
  ready: "#60a5fa",
  queued: "#fbbf24",
  generating: "#fbbf24",
  result_ingesting: "#a78bfa",
  generated: "#60a5fa",
  approved: "#4ade80",
  failed: "#f87171",
  provider_timeout: "#f87171",
  moderation_blocked: "#f87171",
};

// ============================================================
// 主组件
// ============================================================

type VoiceSectionProps = {
  universeId: string;
  entityId: string;
  accessToken: string | null;
  isZh: boolean;
  initialProfile: VoiceProfileDTO | null;
  onSaved?: (profile: VoiceProfileDTO) => void;
};

export const VoiceSection = memo(function VoiceSection({
  universeId,
  entityId,
  accessToken,
  isZh,
  initialProfile,
  onSaved,
}: VoiceSectionProps) {
  const copy = getCopy(isZh);
  const [profile, setProfile] = useState<VoiceProfileDTO | null>(initialProfile);
  const [voiceLines, setVoiceLines] = useState<VoiceLineDTO[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lineText, setLineText] = useState("");
  const [creatingLine, setCreatingLine] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 当 initialProfile 变化时同步
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const reloadLines = useCallback(async () => {
    if (!accessToken || !profile) {
      setVoiceLines([]);
      return;
    }
    setLoadingLines(true);
    setError("");
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/characters/${encodeURIComponent(entityId)}/voice-lines`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "load failed");
      setVoiceLines(data.voiceLines ?? []);
      if (data.voiceProfile) setProfile(data.voiceProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoadingLines(false);
    }
  }, [accessToken, profile, universeId, entityId]);

  useEffect(() => {
    if (profile) {
      void reloadLines();
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveProfile = useCallback(
    async (input: Partial<CreateVoiceProfileInput>) => {
      if (!accessToken) return;
      setSaving(true);
      setError("");
      try {
        const res = await fetch(
          `/api/universes/${encodeURIComponent(universeId)}/characters/${encodeURIComponent(entityId)}/passport`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ section: "voice", voice: input }),
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.error || "save failed");
        setProfile(data.voiceProfile as VoiceProfileDTO);
        onSaved?.(data.voiceProfile as VoiceProfileDTO);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "save failed");
      } finally {
        setSaving(false);
      }
    },
    [accessToken, universeId, entityId, onSaved],
  );

  const handleCreateLine = useCallback(async () => {
    if (!accessToken || !profile || !lineText.trim()) return;
    setCreatingLine(true);
    setError("");
    try {
      const res = await fetch(
        `/api/universes/${encodeURIComponent(universeId)}/characters/${encodeURIComponent(entityId)}/voice-lines`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ text: lineText.trim() }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "create failed");
      setVoiceLines((prev) => [data.voiceLine as VoiceLineDTO, ...prev]);
      setLineText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreatingLine(false);
    }
  }, [accessToken, profile, universeId, entityId, lineText]);

  const handleGenerate = useCallback(
    async (lineId: string) => {
      if (!accessToken) return;
      setBusyLineId(lineId);
      setError("");
      try {
        const res = await fetch(
          `/api/voice-lines/${encodeURIComponent(lineId)}/generate`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.error || "generate failed");
        if (data.voiceLine) {
          setVoiceLines((prev) => prev.map((l) => (l.id === lineId ? (data.voiceLine as VoiceLineDTO) : l)));
        } else if (data.async && data.jobId) {
          setVoiceLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, status: "generating" } : l)));
          for (let attempt = 0; attempt < 20; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 4000));
            const poll = await fetch(`/api/audio/jobs/${encodeURIComponent(data.jobId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!poll.ok) break;
            const pollData = await poll.json().catch(() => null);
            const nextLine = pollData?.job?.target_type === "voice_line" ? pollData.job : null;
            if (nextLine?.status === "completed" || pollData?.job?.status === "failed" || pollData?.job?.status === "provider_timeout") {
              await reloadLines();
              break;
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "generate failed");
      } finally {
        setBusyLineId(null);
      }
    },
    [accessToken],
  );

  const handleApprove = useCallback(
    async (lineId: string, unapprove: boolean) => {
      if (!accessToken) return;
      setBusyLineId(lineId);
      setError("");
      try {
        const url = unapprove
          ? `/api/voice-lines/${encodeURIComponent(lineId)}/approve?action=unapprove`
          : `/api/voice-lines/${encodeURIComponent(lineId)}/approve`;
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.error || "approve failed");
        setVoiceLines((prev) =>
          prev.map((l) => (l.id === lineId ? (data.voiceLine as VoiceLineDTO) : l)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "approve failed");
      } finally {
        setBusyLineId(null);
      }
    },
    [accessToken],
  );

  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>
        <Volume2 size={14} /> {copy.title}
      </h2>

      {error ? (
        <div style={{ marginBottom: 12, padding: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, fontSize: 12, color: "#fca5a5", display: "flex", gap: 6, alignItems: "center" }}>
          <AlertCircle size={12} /> {error}
        </div>
      ) : null}

      {!profile ? (
        <CreateProfileCard copy={copy} onCreate={handleSaveProfile} saving={saving} />
      ) : (
        <>
          <ProfileCard
            profile={profile}
            copy={copy}
            editing={editing}
            saving={saving}
            onEdit={() => setEditing(true)}
            onCancel={() => setEditing(false)}
            onSave={handleSaveProfile}
          />

          <div style={{ marginTop: 16 }}>
            <h3 style={{ ...SECTION_TITLE, fontSize: 12, opacity: 0.7 }}>{copy.voiceLines}</h3>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={lineText}
                onChange={(e) => setLineText(e.target.value)}
                placeholder={copy.textPlaceholder}
                style={INPUT}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleCreateLine();
                  }
                }}
              />
              <button
                onClick={handleCreateLine}
                disabled={creatingLine || !lineText.trim()}
                style={BUTTON_PRIMARY}
              >
                {creatingLine ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {copy.newLine}
              </button>
            </div>

            {loadingLines ? (
              <div style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                <Loader2 size={14} className="animate-spin" style={{ display: "inline-block", marginRight: 6 }} />
                {isZh ? "加载中…" : "Loading…"}
              </div>
            ) : voiceLines.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                {copy.noAudio}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {voiceLines.map((line) => (
                  <VoiceLineRow
                    key={line.id}
                    line={line}
                    copy={copy}
                    busy={busyLineId === line.id}
                    onGenerate={() => handleGenerate(line.id)}
                    onApprove={() => handleApprove(line.id, false)}
                    onUnapprove={() => handleApprove(line.id, true)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
});

// ============================================================
// 子组件：创建 Profile 卡片
// ============================================================

function CreateProfileCard({
  copy,
  onCreate,
  saving,
}: {
  copy: Copy;
  onCreate: (input: Partial<CreateVoiceProfileInput>) => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState("");
  const [language, setLanguage] = useState("zh");

  return (
    <div>
      <div style={{ padding: 12, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
        {copy.empty}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, marginTop: 8 }}>
        <div>
          <div style={LABEL}>{copy.voiceLabel}</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Default"
            style={INPUT}
          />
        </div>
        <div>
          <div style={LABEL}>{copy.language}</div>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={INPUT}>
            <option value="zh">zh</option>
            <option value="en">en</option>
            <option value="ja">ja</option>
            <option value="ko">ko</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => onCreate({ voiceLabel: label, language })}
          disabled={saving}
          style={BUTTON_PRIMARY}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {copy.createProfile}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 子组件：Profile 卡片
// ============================================================

function ProfileCard({
  profile,
  copy,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: {
  profile: VoiceProfileDTO;
  copy: Copy;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: Partial<CreateVoiceProfileInput>) => void;
}) {
  const [form, setForm] = useState<Partial<CreateVoiceProfileInput>>({
    voiceLabel: profile.voiceLabel,
    voiceProvider: profile.voiceProvider,
    voiceProviderVoiceId: profile.voiceProviderVoiceId ?? "",
    language: profile.language,
    speed: profile.speed,
    pitch: profile.pitch,
    stability: profile.stability,
    stylePrompt: profile.stylePrompt,
  });

  if (!editing) {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
          <Info label={copy.voiceLabel} value={profile.voiceLabel || "—"} />
          <Info label={copy.language} value={profile.language} />
          <Info label={copy.voiceProvider} value={profile.voiceProvider} />
          <Info label={copy.voiceProviderVoiceId} value={profile.voiceProviderVoiceId ?? "—"} />
          <Info label={copy.speed} value={profile.speed.toFixed(2)} />
          <Info label={copy.pitch} value={profile.pitch.toFixed(2)} />
          <Info label={copy.stability} value={profile.stability.toFixed(2)} />
          <Info label={copy.status} value={profile.status} />
        </div>
        {profile.stylePrompt ? (
          <div style={{ marginTop: 8 }}>
            <div style={LABEL}>{copy.stylePrompt}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>
              {profile.stylePrompt}
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <button onClick={onEdit} style={BUTTON_GHOST}>{copy.editProfile}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <LabeledInput label={copy.voiceLabel} value={(form.voiceLabel as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, voiceLabel: v }))} />
        <LabeledSelect
          label={copy.language}
          value={(form.language as string) ?? "zh"}
          onChange={(v) => setForm((f) => ({ ...f, language: v }))}
          options={[
            { value: "zh", label: "zh" },
            { value: "en", label: "en" },
            { value: "ja", label: "ja" },
            { value: "ko", label: "ko" },
          ]}
        />
        <LabeledSelect
          label={copy.voiceProvider}
          value={(form.voiceProvider as string) ?? "placeholder"}
          onChange={(v) => setForm((f) => ({ ...f, voiceProvider: v as VoiceProfileDTO["voiceProvider"] }))}
          options={[
            { value: "placeholder", label: "placeholder" },
            { value: "openai", label: "openai" },
          ]}
        />
        <LabeledInput label={copy.voiceProviderVoiceId} value={(form.voiceProviderVoiceId as string) ?? ""} onChange={(v) => setForm((f) => ({ ...f, voiceProviderVoiceId: v }))} />
        <LabeledNumber label={copy.speed} value={form.speed as number ?? 1.0} step={0.1} min={0.5} max={2.0} onChange={(v) => setForm((f) => ({ ...f, speed: v }))} />
        <LabeledNumber label={copy.pitch} value={form.pitch as number ?? 0} step={1} min={-12} max={12} onChange={(v) => setForm((f) => ({ ...f, pitch: v }))} />
        <LabeledNumber label={copy.stability} value={form.stability as number ?? 0.5} step={0.1} min={0} max={1} onChange={(v) => setForm((f) => ({ ...f, stability: v }))} />
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={LABEL}>{copy.stylePrompt}</div>
        <textarea
          value={(form.stylePrompt as string) ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, stylePrompt: e.target.value }))}
          style={{ ...INPUT, minHeight: 60, resize: "vertical" }}
        />
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={() => onSave(form)} disabled={saving} style={BUTTON_PRIMARY}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {copy.save}
        </button>
        <button onClick={onCancel} disabled={saving} style={BUTTON_GHOST}>
          <X size={12} /> {copy.cancel}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 子组件：Voice Line 行
// ============================================================

function VoiceLineRow({
  line,
  copy,
  busy,
  onGenerate,
  onApprove,
  onUnapprove,
}: {
  line: VoiceLineDTO;
  copy: Copy;
  busy: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
}) {
  const statusLabel = (() => {
    switch (line.status) {
      case "draft": return copy.statusDraft;
      case "ready": return copy.statusReady;
      case "queued": return copy.statusQueued;
      case "generating": return copy.statusGenerating;
      case "result_ingesting": return copy.statusGenerating;
      case "generated": return copy.statusGenerated;
      case "approved": return copy.approved;
      case "failed": return copy.statusFailed;
      case "provider_timeout": return copy.statusProviderTimeout;
      case "moderation_blocked": return copy.statusModerationBlocked;
      default: return line.status;
    }
  })();

  const isGenerating = line.status === "queued" || line.status === "generating" || line.status === "result_ingesting";
  const isFailed = line.status === "failed" || line.status === "provider_timeout" || line.status === "moderation_blocked";
  const canGenerate = !isGenerating && !busy;
  const canApprove = line.status === "generated" && line.assetId;
  const canUnapprove = line.isApproved;

  return (
    <div style={{ padding: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, background: "rgba(255,255,255,0.015)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.9)", whiteSpace: "pre-wrap" }}>
          {line.text}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, flexShrink: 0 }}>
          {line.isApproved ? (
            <span style={{ padding: "2px 6px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 3, color: "#86efac", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <CheckCircle2 size={10} /> {copy.approvedBadge}
            </span>
          ) : null}
          <span style={{ color: STATUS_COLORS[line.status] ?? "rgba(255,255,255,0.5)" }}>
            {statusLabel}
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>{copy.revision} {line.revision}</span>
        </div>
      </div>

      {line.error ? (
        <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 6 }}>
          {line.error}
        </div>
      ) : null}

      {line.audioUrl ? (
        <div style={{ marginBottom: 8 }}>
          <audio controls src={line.audioUrl} style={{ width: "100%", height: 28 }} />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          style={isFailed ? BUTTON_SUCCESS : BUTTON_PRIMARY}
        >
          {busy || isGenerating ? (
            <Loader2 size={11} className="animate-spin" />
          ) : isFailed ? (
            <RefreshCw size={11} />
          ) : (
            <Sparkles size={11} />
          )}
          {isFailed ? copy.retry : isGenerating ? copy.generating : copy.generate}
        </button>

        {canApprove ? (
          <button onClick={onApprove} disabled={busy} style={BUTTON_SUCCESS}>
            <CheckCircle2 size={11} /> {copy.approve}
          </button>
        ) : null}

        {canUnapprove ? (
          <button onClick={onUnapprove} disabled={busy} style={BUTTON_GHOST}>
            <X size={11} /> {copy.unapprove}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// 通用小工具
// ============================================================

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{value}</div>
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

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={INPUT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function LabeledNumber({ label, value, onChange, step, min, max }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={INPUT}
      />
    </div>
  );
}
