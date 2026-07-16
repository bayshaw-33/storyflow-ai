"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserCircle, Link2, Unlink } from "lucide-react";

type Character = {
  id: string;
  name: string;
  role: string;
  age: string;
  goal: string;
  voice_style: string;
  visual_prompt: string;
};

type Actor = {
  id: string;
  name: string;
  bio: string;
  age_range: string;
  gender_expression: string;
  ethnicity_style: string;
  face_description: string;
  hair_description: string;
  body_description: string;
  temperament: string[];
  playable_roles: string[];
  avatar_url: string | null;
};

type Props = {
  projectId: string;
  casting: Record<string, string>;
  onCastingChange: (characterId: string, actorId: string | null) => void;
};

export function CastingPanel({ projectId, casting, onCastingChange }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/production/casting?projectId=${encodeURIComponent(projectId)}`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "加载失败");
      }
      setCharacters((payload.characters || []).map(parseCharacter));
      setActors((payload.actors || []).map(parseActor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载选角数据失败。");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function parseCharacter(raw: Record<string, unknown>): Character {
    return {
      id: String(raw.id || ""),
      name: String(raw.name || "未命名角色"),
      role: String(raw.role || ""),
      age: String(raw.age || ""),
      goal: String(raw.goal || ""),
      voice_style: String(raw.voice_style || ""),
      visual_prompt: String(raw.visual_prompt || ""),
    };
  }

  function parseActor(raw: Record<string, unknown>): Actor {
    return {
      id: String(raw.id || ""),
      name: String(raw.name || "未命名演员"),
      bio: String(raw.bio || ""),
      age_range: String(raw.age_range || ""),
      gender_expression: String(raw.gender_expression || ""),
      ethnicity_style: String(raw.ethnicity_style || ""),
      face_description: String(raw.face_description || ""),
      hair_description: String(raw.hair_description || ""),
      body_description: String(raw.body_description || ""),
      temperament: Array.isArray(raw.temperament) ? raw.temperament.map(String) : [],
      playable_roles: Array.isArray(raw.playable_roles) ? raw.playable_roles.map(String) : [],
      avatar_url: raw.avatar_url ? String(raw.avatar_url) : null,
    };
  }

  if (loading) {
    return <div style={emptyStyle}>加载选角数据中...</div>;
  }

  if (error) {
    return (
      <div style={emptyStyle}>
        <p style={{ color: "#ff6b6b", marginBottom: "8px" }}>{error}</p>
        <button style={retryBtnStyle} onClick={() => void loadData()}>重试</button>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div style={emptyStyle}>
        <Users size={48} color="#333" />
        <p style={{ color: "#666", fontSize: "13px", marginTop: "8px" }}>
          暂无角色数据。请在角色卡工作台创建角色后返回此页面配置选角。
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <Users size={18} color="#75dbc6" />
        <span style={{ fontSize: "15px", fontWeight: 600, color: "#e0e0e0" }}>选角配置</span>
        <span style={{ fontSize: "12px", color: "#888" }}>
          {Object.keys(casting).filter((k) => casting[k]).length} / {characters.length} 已分配
        </span>
      </div>

      <div style={listStyle}>
        {characters.map((char) => {
          const assignedActorId = casting[char.id] || "";
          const assignedActor = actors.find((a) => a.id === assignedActorId);
          return (
            <div key={char.id} style={cardStyle}>
              <div style={charHeaderStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={charNameStyle}>{char.name}</span>
                  {char.role ? <span style={tagStyle}>{char.role}</span> : null}
                  {char.age ? <span style={tagStyle}>{char.age}</span> : null}
                </div>
                {assignedActorId ? (
                  <button
                    style={unlinkBtnStyle}
                    onClick={() => onCastingChange(char.id, null)}
                    title="取消分配"
                  >
                    <Unlink size={12} /> 取消
                  </button>
                ) : null}
              </div>

              {(char.goal || char.voice_style) && (
                <div style={charDetailStyle}>
                  {char.goal ? <span style={detailItemStyle}><strong>目标：</strong>{char.goal}</span> : null}
                  {char.voice_style ? <span style={detailItemStyle}><strong>声线：</strong>{char.voice_style}</span> : null}
                </div>
              )}

              <div style={assignmentStyle}>
                {assignedActor ? (
                  <div style={actorCardStyle}>
                    {assignedActor.avatar_url ? (
                      <img src={assignedActor.avatar_url} alt="" style={avatarStyle} />
                    ) : (
                      <div style={avatarPlaceholderStyle}><UserCircle size={24} color="#666" /></div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0" }}>
                        {assignedActor.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#888" }}>
                        {assignedActor.age_range} · {assignedActor.gender_expression}
                        {assignedActor.ethnicity_style ? ` · ${assignedActor.ethnicity_style}` : ""}
                      </div>
                      {assignedActor.face_description ? (
                        <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                          {assignedActor.face_description.slice(0, 100)}
                        </div>
                      ) : null}
                    </div>
                    <Link2 size={14} color="#75dbc6" />
                  </div>
                ) : (
                  <select
                    style={selectStyle}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onCastingChange(char.id, e.target.value);
                    }}
                  >
                    <option value="">— 选择演员 —</option>
                    {actors.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.name}{actor.age_range ? ` (${actor.age_range})` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {assignedActor && (
                  <select
                    style={{ ...selectStyle, marginTop: "6px", fontSize: "11px" }}
                    value={assignedActorId}
                    onChange={(e) => {
                      if (e.target.value) onCastingChange(char.id, e.target.value);
                    }}
                  >
                    {actors.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.name}{actor.age_range ? ` (${actor.age_range})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {actors.length === 0 && (
        <div style={noticeStyle}>
          暂无演员档案。请先在演员管理中创建演员档案。
        </div>
      )}
    </div>
  );
}

/* ---- inline styles (dark theme) ---- */
const containerStyle: React.CSSProperties = {
  padding: "16px 24px",
  maxWidth: "720px",
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "16px",
  paddingBottom: "12px",
  borderBottom: "1px solid #2a2d30",
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #2a2d30",
  borderRadius: "10px",
  padding: "14px 16px",
  background: "#0d0f10",
};

const charHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "6px",
};

const charNameStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#e0e0e0",
};

const tagStyle: React.CSSProperties = {
  fontSize: "11px",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "#1a1d1f",
  color: "#aaa",
};

const charDetailStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "10px",
};

const detailItemStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#888",
};

const assignmentStyle: React.CSSProperties = {
  marginTop: "4px",
};

const actorCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px",
  border: "1px solid #75dbc6",
  borderRadius: "8px",
  background: "rgba(117,219,198,0.04)",
};

const avatarStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
};

const avatarPlaceholderStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "#1a1d1f",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #2a2d30",
  background: "#141618",
  color: "#e0e0e0",
  fontSize: "13px",
};

const unlinkBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "11px",
  padding: "3px 8px",
  border: "1px solid #5a2222",
  borderRadius: "5px",
  background: "transparent",
  color: "#ff6b6b",
  cursor: "pointer",
};

const noticeStyle: React.CSSProperties = {
  marginTop: "16px",
  padding: "10px 14px",
  borderRadius: "8px",
  background: "rgba(255,193,7,0.08)",
  border: "1px solid rgba(255,193,7,0.2)",
  color: "#ffc107",
  fontSize: "12px",
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 24px",
  textAlign: "center",
  color: "#888",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: "6px",
  border: "1px solid #2a2d30",
  background: "#141618",
  color: "#ccc",
  cursor: "pointer",
  fontSize: "13px",
};
