"use client";

import { ArrowUpRight, Check, LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { CommunityReuseCapability, PublicationSourceType } from "@/lib/contracts/v2/community";
import { getPublicationReturnActions } from "@/lib/client/v2/community/view-model";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/app/community/community.module.css";

export function CommunityReturnActions(props: {
  allowedActions: readonly string[];
  sourceType: PublicationSourceType;
  sourceHref: string | null;
  publicationId: string;
  reuseCapability: CommunityReuseCapability;
}) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const actions = getPublicationReturnActions(props);
  const [targets, setTargets] = useState<Array<{ workId: string; title: string; workType: string }>>([]);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [reuseOpen, setReuseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function openReuse() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetchWithAuthRetry(`/api/v2/community/publications/${encodeURIComponent(props.publicationId)}/reuse`);
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; targets?: Array<{ workId: string; title: string; workType: string }>; error?: string };
      if (!response.ok || !json.success) throw new Error(json.error || (isZh ? "读取可复用 Work 失败。" : "Unable to load reusable Works."));
      const nextTargets = json.targets ?? [];
      setTargets(nextTargets);
      setSelectedWorkId(nextTargets[0]?.workId ?? "");
      setReuseOpen(true);
      if (!nextTargets.length) setMessage(isZh ? "还没有可作为目标的 Work，请先创建一个 Work。" : "There is no target Work yet. Create one first.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isZh ? "读取复用入口失败。" : "Unable to load the reuse action.");
    } finally {
      setBusy(false);
    }
  }

  async function reuseIntoWork() {
    if (!selectedWorkId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetchWithAuthRetry(`/api/v2/community/publications/${encodeURIComponent(props.publicationId)}/reuse`, { method: "POST", body: JSON.stringify({ targetWorkId: selectedWorkId }) });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; link?: { id?: string }; error?: string };
      if (!response.ok || !json.success) throw new Error(json.error || (isZh ? "复用失败。" : "Reuse failed."));
      setMessage(isZh ? `已建立真实复用关系。Usage ${json.link?.id ?? ""}` : `A verified usage link was created. Usage ${json.link?.id ?? ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isZh ? "复用失败。" : "Reuse failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.returnActions} aria-label="继续创作">
      <div className={styles.returnActionsHeading}>
        <div>
          <span className={styles.panelKicker}>RETURN TO CREATION</span>
          <h2>继续创作</h2>
        </div>
        <span className={styles.returnActionsHint}>真实入口</span>
      </div>
      <div className={styles.returnActionList}>
        {actions.map((action) => {
          const label = action.id === "apply_use" ? (isZh ? "复用到我的 Work" : "Reuse in my Work") : action.id === "remix" ? (isZh ? "改编" : "Remix") : (isZh ? "进入真实授权" : "Open licensing");
          if (action.id === "apply_use" && action.enabled) {
            return <button key={action.id} type="button" className={styles.returnActionEnabled} onClick={() => void openReuse()} disabled={busy}><Check size={13} />{label}<ArrowUpRight size={13} /></button>;
          }
          if (action.enabled && action.href) {
            return (
              <a key={action.id} className={styles.returnActionEnabled} href={action.href} data-action-id={action.id}>
                <Check size={13} />{label}<ArrowUpRight size={13} />
              </a>
            );
          }
          return (
            <button key={action.id} type="button" className={styles.returnActionDisabled} disabled title={action.reason} data-action-id={action.id}>
              <LockKeyhole size={13} />{label}<span>{isZh ? "暂不可用" : "Unavailable"} · {action.reason}</span>
            </button>
          );
        })}
      </div>
      {reuseOpen ? <div className={styles.returnActionList}><label className={styles.createField}><span>{isZh ? "目标 Work" : "Target Work"}</span><select value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)} disabled={busy || !targets.length}>{targets.map((target) => <option key={target.workId} value={target.workId}>{target.title} · {target.workType}</option>)}</select></label><button type="button" className={styles.returnActionEnabled} onClick={() => void reuseIntoWork()} disabled={busy || !selectedWorkId}><Check size={13} />{busy ? (isZh ? "处理中…" : "Working…") : (isZh ? "确认建立复用关系" : "Create usage link")}</button></div> : null}
      {message ? <p className={styles.universeActionError} role="status">{message}</p> : null}
    </section>
  );
}

export default CommunityReturnActions;
