"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Check, Cpu, Edit2, Plus, Star, Trash2, X } from "lucide-react";

type ModelRow = {
  id: string;
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
};

type Props = {
  onClose: () => void;
};

const modalityConfig: Record<string, { label: string; color: string }> = {
  image: { label: "图像生成", color: "#88ccff" },
  video: { label: "视频生成", color: "#c9a7ff" },
  text: { label: "文本生成", color: "#75dbc6" },
};

const knownProviders = [
  "minimax", "seedream", "openai", "seedance", "runway", "kling", "local",
];

export function ModelRegistryPanel({ onClose }: Props) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("kiikis_auth_token") || "";
      const response = await fetch("/api/models", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      setModels(payload?.models || []);
    } catch {
      setError("加载模型列表失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadModels(); }, [loadModels]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4_000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function setDefault(model: ModelRow) {
    const token = localStorage.getItem("kiikis_auth_token") || "";
    await fetch("/api/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ modelId: model.id, isDefault: true, modality: model.modality }),
    });
    setNotice(`已将 ${model.name} 设为 ${modalityConfig[model.modality]?.label || model.modality} 默认模型。`);
    void loadModels();
  }

  async function toggleStatus(model: ModelRow) {
    const next = model.status === "active" ? "disabled" : "active";
    const token = localStorage.getItem("kiikis_auth_token") || "";
    await fetch("/api/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ modelId: model.id, status: next }),
    });
    void loadModels();
  }

  async function removeModel(model: ModelRow) {
    if (!confirm(`确定删除模型 ${model.name}？`)) return;
    const token = localStorage.getItem("kiikis_auth_token") || "";
    await fetch(`/api/models?modelId=${encodeURIComponent(model.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotice(`模型 ${model.name} 已删除。`);
    void loadModels();
  }

  function startEdit(model: ModelRow) {
    setEditing(model);
    setShowForm(true);
  }

  function startCreate() {
    setEditing(null);
    setShowForm(true);
  }

  const grouped: Record<string, ModelRow[]> = { image: [], video: [], text: [] };
  for (const model of models) {
    if (!grouped[model.modality]) grouped[model.modality] = [];
    grouped[model.modality].push(model);
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Cpu size={18} color="#75dbc6" />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e0" }}>模型注册与能力配置</span>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={16} /></button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        {notice && <div style={noticeStyle}>{notice}</div>}

        <div style={bodyStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontSize: "12px", color: "#888" }}>共 {models.length} 个模型</span>
            <button style={addBtnStyle} onClick={startCreate}><Plus size={14} /> 新增模型</button>
          </div>

          {showForm ? (
            <ModelForm
              initial={editing}
              onClose={() => { setShowForm(false); setEditing(null); }}
              onSaved={() => { setShowForm(false); setEditing(null); void loadModels(); }}
            />
          ) : null}

          {!showForm && (["image", "video", "text"] as const).map((modality) => {
            const list = grouped[modality] || [];
            if (list.length === 0) return null;
            const cfg = modalityConfig[modality];
            return (
              <div key={modality} style={sectionStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <Box size={14} color={cfg.color} />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontSize: "11px", color: "#666" }}>({list.length})</span>
                </div>
                <div style={listStyle}>
                  {list.map((model) => {
                    const caps = model.capabilities || {};
                    const resolutions = Array.isArray(caps.resolutions) ? (caps.resolutions as string[]).join(", ") : "";
                    const aspectRatios = Array.isArray(caps.aspectRatios) ? (caps.aspectRatios as string[]).join(", ") : "";
                    return (
                      <div key={model.id} style={{
                        ...cardStyle,
                        opacity: model.status === "disabled" ? 0.5 : 1,
                        borderColor: model.is_default ? cfg.color + "66" : "#2a2d30",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e0" }}>{model.name}</span>
                              {model.is_default ? (
                                <span style={defaultBadgeStyle(cfg.color)}><Star size={10} fill={cfg.color} color={cfg.color} /> 默认</span>
                              ) : null}
                              <span style={providerBadgeStyle}>{model.provider}</span>
                              {model.status === "disabled" ? <span style={disabledBadgeStyle}>已禁用</span> : null}
                            </div>
                            <div style={{ fontSize: "11px", color: "#888", marginTop: "4px", fontFamily: "monospace" }}>
                              {model.model_id}
                            </div>
                            {(resolutions || aspectRatios) && (
                              <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                                {resolutions ? `分辨率: ${resolutions}` : ""}
                                {resolutions && aspectRatios ? " · " : ""}
                                {aspectRatios ? `比例: ${aspectRatios}` : ""}
                              </div>
                            )}
                            {model.notes ? (
                              <div style={{ fontSize: "11px", color: "#777", marginTop: "4px", fontStyle: "italic" }}>{model.notes}</div>
                            ) : null}
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            {!model.is_default && model.status === "active" ? (
                              <button style={iconBtnStyle(cfg.color)} onClick={() => setDefault(model)} title="设为默认">
                                <Star size={13} />
                              </button>
                            ) : null}
                            <button style={iconBtnStyle("#88ccff")} onClick={() => startEdit(model)} title="编辑">
                              <Edit2 size={13} />
                            </button>
                            <button style={iconBtnStyle("#888")} onClick={() => toggleStatus(model)} title={model.status === "active" ? "禁用" : "启用"}>
                              {model.status === "active" ? <Box size={13} /> : <Check size={13} />}
                            </button>
                            <button style={iconBtnStyle("#ff6b6b")} onClick={() => removeModel(model)} title="删除">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!showForm && models.length === 0 ? (
            <div style={emptyStyle}>
              <Cpu size={32} color="#444" />
              <div style={{ marginTop: "8px", color: "#666", fontSize: "13px" }}>暂无注册模型，点击右上角"新增模型"开始配置。</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModelForm({ initial, onClose, onSaved }: { initial: ModelRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [provider, setProvider] = useState(initial?.provider || "minimax");
  const [modality, setModality] = useState(initial?.modality || "image");
  const [modelId, setModelId] = useState(initial?.model_id || "");
  const [resolutions, setResolutions] = useState(Array.isArray((initial?.capabilities as Record<string, unknown>)?.resolutions) ? ((initial?.capabilities as Record<string, unknown>).resolutions as string[]).join(", ") : "");
  const [aspectRatios, setAspectRatios] = useState(Array.isArray((initial?.capabilities as Record<string, unknown>)?.aspectRatios) ? ((initial?.capabilities as Record<string, unknown>).aspectRatios as string[]).join(", ") : "");
  const [maxDuration, setMaxDuration] = useState(String((initial?.capabilities as Record<string, unknown>)?.maxDurationSeconds || ""));
  const [features, setFeatures] = useState(Array.isArray((initial?.capabilities as Record<string, unknown>)?.features) ? ((initial?.capabilities as Record<string, unknown>).features as string[]).join(", ") : "");
  const [qualityTier, setQualityTier] = useState(String((initial?.capabilities as Record<string, unknown>)?.qualityTier || "standard"));
  const [isDefault, setIsDefault] = useState(initial?.is_default || false);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [status, setStatus] = useState(initial?.status || "active");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function buildCapabilities() {
    const caps: Record<string, unknown> = {};
    if (resolutions.trim()) caps.resolutions = resolutions.split(",").map((s) => s.trim()).filter(Boolean);
    if (aspectRatios.trim()) caps.aspectRatios = aspectRatios.split(",").map((s) => s.trim()).filter(Boolean);
    if (maxDuration.trim()) {
      const n = Number(maxDuration);
      if (Number.isFinite(n) && n > 0) caps.maxDurationSeconds = n;
    }
    if (features.trim()) caps.features = features.split(",").map((s) => s.trim()).filter(Boolean);
    caps.qualityTier = qualityTier || "standard";
    return caps;
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const token = localStorage.getItem("kiikis_auth_token") || "";
      const body = {
        name: name.trim(),
        provider: provider.trim(),
        modality,
        modelId: modelId.trim(),
        capabilities: buildCapabilities(),
        isDefault,
        status,
        notes: notes.trim(),
      };
      const url = initial ? "/api/models" : "/api/models";
      const method = initial ? "PATCH" : "POST";
      const payload = initial ? { ...body, recordId: initial.id } : body;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || "保存失败。");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={formStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e0" }}>{initial ? "编辑模型" : "新增模型"}</span>
        <button onClick={onClose} style={closeBtnStyle}><X size={14} /></button>
      </div>
      {err && <div style={errorStyle}>{err}</div>}
      <div style={formGridStyle}>
        <label style={formLabelStyle}>
          <span>名称 *</span>
          <input style={formInputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：MiniMax Hailuo 02" />
        </label>
        <label style={formLabelStyle}>
          <span>Modality *</span>
          <select style={formInputStyle} value={modality} onChange={(e) => setModality(e.target.value)}>
            <option value="image">image (图像)</option>
            <option value="video">video (视频)</option>
            <option value="text">text (文本)</option>
          </select>
        </label>
        <label style={formLabelStyle}>
          <span>Provider *</span>
          <select style={formInputStyle} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {knownProviders.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={formLabelStyle}>
          <span>Model ID *</span>
          <input style={formInputStyle} value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="例如：MiniMax-Hailuo-02" />
        </label>
        <label style={formLabelStyle}>
          <span>分辨率 (逗号分隔)</span>
          <input style={formInputStyle} value={resolutions} onChange={(e) => setResolutions(e.target.value)} placeholder="1080P, 768P" />
        </label>
        <label style={formLabelStyle}>
          <span>宽高比 (逗号分隔)</span>
          <input style={formInputStyle} value={aspectRatios} onChange={(e) => setAspectRatios(e.target.value)} placeholder="9:16, 16:9, 1:1" />
        </label>
        <label style={formLabelStyle}>
          <span>最大时长(秒)</span>
          <input style={formInputStyle} type="number" value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="6" />
        </label>
        <label style={formLabelStyle}>
          <span>质量等级</span>
          <select style={formInputStyle} value={qualityTier} onChange={(e) => setQualityTier(e.target.value)}>
            <option value="standard">standard</option>
            <option value="high">high</option>
            <option value="ultra">ultra</option>
          </select>
        </label>
        <label style={formLabelStyle}>
          <span>特性 (逗号分隔)</span>
          <input style={formInputStyle} value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="text-to-video, image-to-video" />
        </label>
        <label style={formLabelStyle}>
          <span>状态</span>
          <select style={formInputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
      </div>
      <label style={formLabelStyle}>
        <span>备注</span>
        <input style={formInputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选说明" />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#ccc", cursor: "pointer" }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          设为该 modality 的默认模型
        </label>
        <div style={{ flex: 1 }} />
        <button style={cancelBtnStyle} onClick={onClose} disabled={saving}>取消</button>
        <button style={saveBtnStyle} onClick={save} disabled={saving || !name.trim() || !modelId.trim()}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

/* ---- inline styles ---- */
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const panelStyle: React.CSSProperties = {
  width: "min(720px, 94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column",
  background: "#0d0f10", border: "1px solid #2a2d30", borderRadius: "12px", overflow: "hidden",
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 16px", borderBottom: "1px solid #2a2d30",
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#aaa", cursor: "pointer", display: "flex", padding: "4px",
};
const bodyStyle: React.CSSProperties = { flex: 1, overflowY: "auto", padding: "16px" };
const sectionStyle: React.CSSProperties = { marginBottom: "20px" };
const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const cardStyle: React.CSSProperties = {
  padding: "12px 14px", border: "1px solid #2a2d30", borderRadius: "8px",
  background: "#141618",
};
const addBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 12px",
  borderRadius: "6px", border: "1px solid #75dbc6", background: "rgba(117,219,198,0.12)",
  color: "#75dbc6", fontSize: "12px", cursor: "pointer",
};
const providerBadgeStyle: React.CSSProperties = {
  fontSize: "10px", padding: "1px 6px", borderRadius: "4px",
  background: "rgba(136,204,255,0.1)", color: "#88ccff", border: "1px solid rgba(136,204,255,0.2)",
};
const disabledBadgeStyle: React.CSSProperties = {
  fontSize: "10px", padding: "1px 6px", borderRadius: "4px",
  background: "rgba(255,107,107,0.1)", color: "#ff6b6b", border: "1px solid rgba(255,107,107,0.2)",
};
const defaultBadgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "10px", padding: "1px 6px", borderRadius: "4px",
  background: color + "1a", color, border: `1px solid ${color}44`,
});
const iconBtnStyle = (color: string): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: "26px", height: "26px", borderRadius: "5px", border: "1px solid #2a2d30",
  background: "transparent", color, cursor: "pointer",
});
const emptyStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  padding: "40px 16px", textAlign: "center",
};
const errorStyle: React.CSSProperties = {
  margin: "12px 16px 0", padding: "10px 14px", borderRadius: "8px",
  background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)",
  color: "#ff6b6b", fontSize: "13px",
};
const noticeStyle: React.CSSProperties = {
  margin: "12px 16px 0", padding: "10px 14px", borderRadius: "8px",
  background: "rgba(117,219,198,0.08)", border: "1px solid rgba(117,219,198,0.2)",
  color: "#75dbc6", fontSize: "13px",
};
const formStyle: React.CSSProperties = {
  marginBottom: "16px", padding: "14px", border: "1px solid #2a2d30", borderRadius: "8px",
  background: "#0f1112",
};
const formGridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px",
};
const formLabelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "4px",
  fontSize: "11px", color: "#888",
};
const formInputStyle: React.CSSProperties = {
  padding: "6px 8px", borderRadius: "5px", border: "1px solid #2a2d30",
  background: "#141618", color: "#e0e0e0", fontSize: "12px",
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: "6px", border: "1px solid #2a2d30",
  background: "transparent", color: "#aaa", fontSize: "12px", cursor: "pointer",
};
const saveBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: "6px", border: "1px solid #75dbc6",
  background: "rgba(117,219,198,0.15)", color: "#75dbc6", fontSize: "12px", cursor: "pointer",
};
