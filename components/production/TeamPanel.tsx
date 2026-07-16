"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Users, Trash2, Crown, Shield, Edit, Eye } from "lucide-react";

type Team = {
  id: string;
  name: string;
  role: string;
};

type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

type Props = {
  onClose: () => void;
};

const roleConfig: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: "所有者", icon: Crown, color: "#ffc107" },
  admin: { label: "管理员", icon: Shield, color: "#75dbc6" },
  editor: { label: "编辑", icon: Edit, color: "#88ccff" },
  viewer: { label: "查看", icon: Eye, color: "#888" },
};

export function TeamPanel({ onClose }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("kiikis_auth_token") || "";
      const response = await fetch("/api/teams", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (payload?.teams) {
        setTeams(payload.teams);
        if (payload.teams[0] && !selectedTeamId) {
          setSelectedTeamId(payload.teams[0].id);
        }
      }
    } catch (err) {
      setError("加载团队失败。");
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  const loadMembers = useCallback(async (teamId: string) => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("kiikis_auth_token") || "";
      const response = await fetch(`/api/teams?teamId=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      setMembers(payload?.members || []);
    } catch (err) {
      setError("加载成员失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeamId) void loadMembers(selectedTeamId);
  }, [selectedTeamId, loadMembers]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4_000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function handleInvite() {
    if (!inviteEmail.trim() || !selectedTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("kiikis_auth_token") || "";
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "invite",
          email: inviteEmail.trim(),
          teamId: selectedTeamId,
          role: inviteRole,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "邀请失败。");
      }
      setNotice(`已邀请 ${inviteEmail} 加入团队。`);
      setInviteEmail("");
      void loadMembers(selectedTeamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "邀请失败。");
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(memberId: string, role: string) {
    const token = localStorage.getItem("kiikis_auth_token") || "";
    await fetch("/api/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ memberId, role }),
    });
    if (selectedTeamId) void loadMembers(selectedTeamId);
  }

  async function removeMember(memberId: string) {
    if (!confirm("确定移除该成员？")) return;
    const token = localStorage.getItem("kiikis_auth_token") || "";
    await fetch(`/api/teams?memberId=${encodeURIComponent(memberId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (selectedTeamId) void loadMembers(selectedTeamId);
    setNotice("成员已移除。");
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} color="#75dbc6" />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e0" }}>团队与权限</span>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        {notice && <div style={noticeStyle}>{notice}</div>}

        <div style={bodyStyle}>
          <div style={sectionStyle}>
            <label style={labelStyle}>选择团队</label>
            <select
              style={selectStyle}
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              <option value="">— 选择 —</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.role})
                </option>
              ))}
            </select>
          </div>

          {selectedTeamId && (
            <div style={sectionStyle}>
              <label style={labelStyle}>邀请新成员</label>
              <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
                <input
                  type="email"
                  placeholder="输入邮箱地址"
                  style={{ ...inputStyle, flex: 1 }}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <select
                  style={{ ...selectStyle, width: "auto" }}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="viewer">查看</option>
                  <option value="editor">编辑</option>
                  <option value="admin">管理员</option>
                </select>
                <button
                  style={inviteBtnStyle}
                  onClick={handleInvite}
                  disabled={loading || !inviteEmail.trim()}
                >
                  <UserPlus size={14} /> 邀请
                </button>
              </div>
            </div>
          )}

          {selectedTeamId && (
            <div style={sectionStyle}>
              <label style={labelStyle}>成员列表 ({members.length})</label>
              <div style={memberListStyle}>
                {members.length === 0 ? (
                  <div style={emptyStyle}>暂无成员</div>
                ) : (
                  members.map((member) => {
                    const config = roleConfig[member.role] || roleConfig.viewer;
                    const RoleIcon = config.icon;
                    return (
                      <div key={member.id} style={memberItemStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                          <RoleIcon size={16} color={config.color} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "13px", color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {member.user_id.slice(0, 8)}...
                            </div>
                            <div style={{ fontSize: "11px", color: config.color }}>{config.label}</div>
                          </div>
                        </div>
                        {member.role !== "owner" && (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <select
                              style={{ ...roleSelectStyle, color: config.color, borderColor: config.color + "44" }}
                              value={member.role}
                              onChange={(e) => updateRole(member.id, e.target.value)}
                            >
                              <option value="viewer">查看</option>
                              <option value="editor">编辑</option>
                              <option value="admin">管理员</option>
                            </select>
                            <button style={removeBtnStyle} onClick={() => removeMember(member.id)} title="移除">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
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
  width: "min(560px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column",
  background: "#0d0f10", border: "1px solid #2a2d30", borderRadius: "12px", overflow: "hidden",
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 16px", borderBottom: "1px solid #2a2d30",
};
const closeBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "16px",
};
const bodyStyle: React.CSSProperties = { flex: 1, overflowY: "auto", padding: "16px" };
const sectionStyle: React.CSSProperties = { marginBottom: "16px" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "12px", color: "#888", marginBottom: "6px" };
const selectStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #2a2d30",
  background: "#141618", color: "#e0e0e0", fontSize: "13px",
};
const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: "6px", border: "1px solid #2a2d30",
  background: "#141618", color: "#e0e0e0", fontSize: "13px",
};
const inviteBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "4px", padding: "8px 14px",
  borderRadius: "6px", border: "1px solid #75dbc6", background: "rgba(117,219,198,0.12)",
  color: "#75dbc6", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap",
};
const memberListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px" };
const memberItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px", border: "1px solid #2a2d30", borderRadius: "8px",
};
const roleSelectStyle: React.CSSProperties = {
  padding: "3px 6px", borderRadius: "4px", border: "1px solid #333",
  background: "#141618", fontSize: "11px", cursor: "pointer",
};
const removeBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: "26px", height: "26px", borderRadius: "5px", border: "1px solid #5a2222",
  background: "transparent", color: "#ff6b6b", cursor: "pointer",
};
const emptyStyle: React.CSSProperties = { padding: "16px", textAlign: "center", color: "#666", fontSize: "13px" };
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
