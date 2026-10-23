"use client";

import { useEffect, useRef, useState } from "react";
import { screenplayStudioApi, type ScreenplayUnitClientDto } from "@/lib/client/v2/screenplay-studio/api";
import { useI18n } from "@/lib/i18n/useI18n";
import { withTimeout } from "@/lib/client/with-timeout";

export function SourceEpisodePicker({ workId, unitId, onSelect, disabled = false }: {
  workId: string; unitId: string; disabled?: boolean;
  onSelect: (unitId: string, manuscript: string) => void;
}) {
  const { locale } = useI18n(); const isZh = locale === "zh-CN";
  const [units, setUnits] = useState<ScreenplayUnitClientDto[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const selectionRequest = useRef(0);
  useEffect(() => {
    let cancelled = false; setLoading(true); setUnits([]); setError(""); setBusy(false);
    void withTimeout(screenplayStudioApi.listUnits(workId), 10000).then(result => {
      if (!cancelled) setUnits(result.units.filter(unit => unit.type === "episode" && Boolean(unit.finalizedVersionId)));
    }).catch(() => { if (!cancelled) setError(isZh ? "来源集加载失败，请重试。" : "Could not load source episodes. Retry."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; selectionRequest.current += 1; };
  }, [workId, attempt, isZh]);

  async function choose(id: string) {
    if (!id || id === unitId || busy) return;
    setBusy(true); setError("");
    const request = ++selectionRequest.current;
    try {
      const result = await withTimeout(screenplayStudioApi.getUnit(workId, id, "finalized"), 10000);
      if (request !== selectionRequest.current) return;
      const body = result.content && typeof result.content === "object" && "body" in result.content ? result.content.body : null;
      if (typeof body !== "string" || !body.trim()) throw new Error("SOURCE_EMPTY");
      onSelect(id, body);
    } catch { if (request === selectionRequest.current) setError(isZh ? "无法读取该集的定稿正文，当前内容已保留。" : "Could not read the finalized episode. Current content is preserved."); }
    finally { if (request === selectionRequest.current) setBusy(false); }
  }
  return <div>
    <label>{isZh ? "来源集（定稿） " : "Source episode (finalized) "}<select aria-label={isZh ? "来源集（定稿）" : "Source episode (finalized)"} value={unitId} disabled={disabled || loading || busy} onChange={event => void choose(event.target.value)}>
      <option value="">{loading ? isZh ? "加载中…" : "Loading…" : isZh ? "请选择来源集" : "Select an episode"}</option>
      {unitId && !units.some(unit => unit.id === unitId) ? <option value={unitId}>{isZh ? "当前来源 " : "Current source "}{unitId.slice(-8)}</option> : null}
      {units.map(unit => <option key={unit.id} value={unit.id}>{unit.title || (isZh ? `第 ${unit.order} 集` : `Episode ${unit.order}`)}</option>)}
    </select></label>
    {!loading && !error && units.length === 0 ? <p>{isZh ? "暂无定稿集，请先在剧本工作台完成定稿。" : "No finalized episodes yet. Finalize an episode in the screenplay workspace first."}</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>{isZh ? "重试" : "Retry"}</button></p> : null}
  </div>;
}
