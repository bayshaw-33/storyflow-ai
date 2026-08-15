"use client";

/**
 * 导入向导 — Phase 4 Task 4.4 Step 1/2.
 * 三入口之一"上传站外原作"的具体流程：选模式 → 按角色上传 → 权利声明
 * （必填事实快照）→ 开始提取。三件套缺一明确提示并禁止开始。
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { universeImportApi, UniverseImportApiError } from "@/lib/client/v2/universe-import/api";
import {
  tripletRequirementStatus,
  canStartExtraction,
  type WizardFileLike,
} from "@/lib/client/v2/universe-import/types";
import type { ImportMode, SourceRole } from "@/lib/contracts/v2/universe-import";
import styles from "./universe-import.module.css";

const ROLE_LABELS: Record<string, string> = {
  screenplay: "完整剧本（单文件）",
  world_bible: "世界观设定",
  character_bible: "角色圣经",
  plot_outline: "剧情大纲",
  supplement: "补充材料（可选）",
};

const ROLE_HINTS: Record<string, string> = {
  screenplay: "PDF / DOCX / DOC / MD / TXT，≤100MB",
  world_bible: "三件套之一 · PDF/DOCX/DOC/MD/TXT",
  character_bible: "三件套之一 · PDF/DOCX/DOC/MD/TXT",
  plot_outline: "三件套之一 · PDF/DOCX/DOC/MD/TXT",
  supplement: "JSON / HTML / CSV / XLSX 或文本格式",
};

export function UniverseImportWizard({ onSessionCreated }: { onSessionCreated?: (sessionId: string) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode | null>(null);
  const [files, setFiles] = useState<Array<WizardFileLike & { id?: string }>>([]);
  const [rights, setRights] = useState({ holder: "", basis: "own_work", notes: "" });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triplet = useMemo(() => tripletRequirementStatus(files.filter((f) => f.persisted)), [files]);
  const canStart = sessionId && mode
    ? canStartExtraction({
        state: files.length && triplet.complete || mode === "complete_screenplay" ? "uploaded" : "upload_draft",
        mode,
        files,
      }) && Boolean(rights.holder)
    : false;

  const pickMode = async (next: ImportMode) => {
    setMode(next);
    setFiles([]);
    setError(null);
    try {
      setBusy(true);
      const result = await universeImportApi.createSession(next, {
        holder: rights.holder,
        basis: rights.basis,
        notes: rights.notes,
      });
      setSessionId(result.session.id);
      onSessionCreated?.(result.session.id);
    } catch (e) {
      setError(e instanceof UniverseImportApiError ? e.message : "创建导入会话失败");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (role: SourceRole, file: File) => {
    if (!sessionId) return;
    setError(null);
    try {
      setBusy(true);
      const { file: attached } = await universeImportApi.attachFile(sessionId, {
        filename: file.name,
        declaredRole: role,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      await universeImportApi.confirmUpload(sessionId, attached.id);
      setFiles((prev) => [...prev.filter((f) => f.role !== role || !f.persisted), { ...attached, role, persisted: true }]);
    } catch (e) {
      setError(e instanceof UniverseImportApiError ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const startExtraction = async () => {
    if (!sessionId) return;
    try {
      setBusy(true);
      await universeImportApi.startExtraction(sessionId);
      router.push(`/universes/import/${sessionId}`);
    } catch (e) {
      setError(e instanceof UniverseImportApiError ? e.message : "无法开始提取");
    } finally {
      setBusy(false);
    }
  };

  const roles: Array<{ role: SourceRole; optional?: boolean }> =
    mode === "complete_screenplay"
      ? [{ role: "screenplay" }, { role: "supplement", optional: true }]
      : mode === "bible_triplet"
        ? [{ role: "world_bible" }, { role: "character_bible" }, { role: "plot_outline" }, { role: "supplement", optional: true }]
        : [];

  return (
    <div className={styles.wizard} data-testid="universe-import-wizard">
      <h2>上传站外原作建立 Universe</h2>
      {!mode ? (
        <>
          <div className={styles.modeGrid}>
            <button type="button" className={styles.modeCard} onClick={() => void pickMode("complete_screenplay")}>
              <div className={styles.modeCardTitle}>完整剧本</div>
              <div className={styles.modeCardDesc}>一部完整剧本单文件，导入后建立只读 Source Work 和 Universe U1。</div>
            </button>
            <button type="button" className={styles.modeCard} onClick={() => void pickMode("bible_triplet")}>
              <div className={styles.modeCardTitle}>三件套</div>
              <div className={styles.modeCardDesc}>世界观、角色圣经、剧情大纲三份文件同时上传，缺一不可开始提取。</div>
            </button>
          </div>
        </>
      ) : (
        <>
          {roles.map(({ role, optional }) => {
            const uploaded = files.find((f) => f.role === role && f.persisted);
            const missingTriplet = role !== "supplement" && mode === "bible_triplet" && !uploaded;
            return (
              <div key={role} className={styles.dropZone} data-testid={`drop-${role}`}>
                <div>
                  <div className={styles.dropRole}>{ROLE_LABELS[role]}{optional ? "（可选）" : ""}</div>
                  <div className={styles.dropHint}>{ROLE_HINTS[role]}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {uploaded ? (
                    <span className={styles.dropStatusOk} data-testid={`ok-${role}`}>已上传</span>
                  ) : missingTriplet ? (
                    <span className={styles.dropStatusMissing}>待上传（必需）</span>
                  ) : null}
                  <label className={styles.ghostBtn}>
                    选择文件
                    <input
                      type="file"
                      hidden
                      accept={role === "supplement" ? ".json,.html,.csv,.xlsx,.pdf,.docx,.doc,.md,.txt" : ".pdf,.docx,.doc,.md,.txt"}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(role, file);
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          {mode === "bible_triplet" && !triplet.complete ? (
            <div className={styles.attention} data-testid="triplet-missing">
              还缺：{triplet.missing.map((r) => ROLE_LABELS[r]).join("、")}。补齐后才能开始提取。
            </div>
          ) : null}
          <details className={styles.rightsBox} open={!rights.holder}>
            <summary>权利声明（必填事实快照）</summary>
            <label>权利人 / 声明人</label>
            <input
              type="text"
              value={rights.holder}
              onChange={(e) => setRights((r) => ({ ...r, holder: e.target.value }))}
              placeholder="我是原作权利人或已获授权"
              data-testid="rights-holder"
            />
            <label>权利基础</label>
            <select value={rights.basis} onChange={(e) => setRights((r) => ({ ...r, basis: e.target.value }))}>
              <option value="own_work">本人原创</option>
              <option value="authorized">已获授权</option>
              <option value="public_domain">公共领域</option>
              <option value="unclear">权利不明确</option>
            </select>
            <label>备注</label>
            <input
              type="text"
              value={rights.notes}
              onChange={(e) => setRights((r) => ({ ...r, notes: e.target.value }))}
              placeholder="补充说明（可选）"
            />
            <div className={styles.dropHint} style={{ marginTop: 10 }}>
              声明只记录事实，不构成法律裁定；权利不明确或受限的内容保持私有，不能公开、商业授权或供他人二创。
            </div>
          </details>
          {error ? <div className={styles.errorBar} role="alert">{error}</div> : null}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="button" className={styles.ghostBtn} onClick={() => { setMode(null); setFiles([]); setSessionId(null); }}>
              返回重选
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!canStart || busy}
              onClick={() => void startExtraction()}
              data-testid="start-extraction"
            >
              {busy ? "处理中…" : "开始提取"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
