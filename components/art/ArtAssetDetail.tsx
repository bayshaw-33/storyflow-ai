"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Check, ChevronDown, Download, ImagePlus, LoaderCircle, LockKeyhole, Plus, Send, Sparkles, Upload } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ArtAsset, ArtAssetVersion, ArtAssetVariant, ArtWorkbenchState } from "@/lib/art-workbench";
import { ART_MODEL_CATALOG } from "@/lib/art/providers/catalog";
import styles from "./ArtAssetDetail.module.css";

const STORAGE_KEY = "kiikis_art_workbench_state";
const REFERENCE_SHEET_PROMPT = "为选定的角色母版图生成专业完整角色参考表。纯白色无缝背景上干净整洁的网格布局。包含主全身体态转面图（正面、3/4 视角、侧面、背面）；主体身份与比例尺；右上角 6-8 色调色板；8 帧情绪进阶；5 帧微表情；多角度头部细节表；中性站姿与姿态变化；1 张特写；底部一排服装和配饰细节，包括头发质地、外套面料、鞋子和配饰；多种手势参考；角色轮廓指南。所有画面保持人物脸部和身体比例一致。4:3 横版，布局完美对齐。";

export default function ArtAssetDetail() {
  const params = useParams<{ assetId: string }>();
  const assetId = decodeURIComponent(String(params.assetId || ""));
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<ArtWorkbenchState | null>(null);
  const [asset, setAsset] = useState<ArtAsset | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selection, setSelection] = useState<"smart" | "atlas" | "flux">("smart");
  const [modelId, setModelId] = useState("");
  const [count, setCount] = useState<1 | 2 | 4>(1);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next)) || {};
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as ArtWorkbenchState | null;
      const found = stored?.assets.find((item) => item.id === assetId) || null;
      if (stored && found) {
        const variants = found.variants?.length ? found.variants : [{ id: crypto.randomUUID(), name: found.kind === "character" ? "角色母版" : found.kind === "scene" ? "场景母版" : "道具母版", type: "master" as const, prompt: found.kind === "character" ? REFERENCE_SHEET_PROMPT : found.prompt, versions: legacyVersions(found) }];
        const hydrated = { ...found, identityAnchor: found.identityAnchor || "", variants };
        setState(stored);
        setAsset(hydrated);
        setSelectedVariantId(variants[0].id);
        setSelectedVersionId(variants[0].approvedVersionId || variants[0].versions[0]?.id || "");
      }
    } catch { setNotice("无法读取美术资产。"); }
    return () => listener?.subscription.unsubscribe();
  }, [assetId]);

  const selectedVariant = asset?.variants?.find((item) => item.id === selectedVariantId) || asset?.variants?.[0];
  const selectedVersion = selectedVariant?.versions.find((item) => item.id === selectedVersionId) || selectedVariant?.versions[0];
  const availableModels = useMemo(() => ART_MODEL_CATALOG.filter((model) => selection === "smart" || model.provider === selection), [selection]);

  function persist(next: ArtAsset) {
    setAsset(next);
    if (!state) return;
    const nextState = { ...state, assets: state.assets.map((item) => item.id === next.id ? next : item), updatedAt: new Date().toISOString() };
    setState(nextState);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)); } catch { setNotice("本地保存空间不足，请删除大型本地图片或立即导出项目。"); }
  }

  function patchAsset(patch: Partial<ArtAsset>) {
    if (asset) persist({ ...asset, ...patch, updatedAt: new Date().toISOString() });
  }

  function patchVariant(patch: Partial<ArtAssetVariant>) {
    if (!asset || !selectedVariant) return;
    persist({ ...asset, variants: asset.variants?.map((item) => item.id === selectedVariant.id ? { ...item, ...patch } : item), updatedAt: new Date().toISOString() });
  }

  function addVariant() {
    if (!asset) return;
    const name = window.prompt(asset.kind === "character" ? "剧中造型名称" : "状态变体名称");
    if (!name?.trim()) return;
    const variant: ArtAssetVariant = { id: crypto.randomUUID(), name: name.trim(), type: asset.kind === "character" ? "appearance" : "state", prompt: asset.prompt, versions: [] };
    persist({ ...asset, variants: [...(asset.variants || []), variant] });
    setSelectedVariantId(variant.id);
    setSelectedVersionId("");
  }

  async function uploadVersion(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !asset || !selectedVariant) return;
    if (!session?.access_token) return setNotice("请先登录后再上传图片版本。");
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/art/upload-reference", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const payload = await response.json() as { success?: boolean; previewUrl?: string; storagePath?: string; error?: string };
      if (!response.ok || !payload.previewUrl || !payload.storagePath) throw new Error(payload.error || "图片版本上传失败");
      const version: ArtAssetVersion = { id: crypto.randomUUID(), imageUrl: payload.previewUrl, storagePath: payload.storagePath, source: "uploaded", prompt: selectedVariant.prompt, createdAt: new Date().toISOString() };
      patchVariant({ versions: [version, ...selectedVariant.versions] });
      setSelectedVersionId(version.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片版本上传失败");
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function generate() {
    if (!asset || !selectedVariant) return;
    if (!session?.access_token) return setNotice("请先登录后再生成图片。");
    setBusy("generate");
    setNotice("");
    try {
      const response = await fetch("/api/art/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          projectId: state?.id,
          assetId: asset.id,
          task: asset.kind === "character" && selectedVariant.type === "master" ? "reference_sheet" : selectedVersion ? "edit" : "concept",
          prompt: selectedVariant.prompt,
          negativePrompt: asset.negativePrompt,
          referenceUrls: selectedVersion?.imageUrl?.startsWith("http") ? [selectedVersion.imageUrl] : [],
          aspectRatio: asset.kind === "character" && selectedVariant.type === "master" ? "4:3" : "16:9",
          count,
          selection,
          modelId: modelId || undefined,
        }),
      });
      const payload = await response.json() as { success?: boolean; images?: Array<{ previewUrl: string; storagePath?: string; provider?: string; model?: string }>; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "图片生成失败");
      const versions: ArtAssetVersion[] = (payload.images || []).map((item) => ({ id: crypto.randomUUID(), imageUrl: item.previewUrl, storagePath: item.storagePath, source: "generated", provider: item.provider, model: item.model, prompt: selectedVariant.prompt, createdAt: new Date().toISOString() }));
      patchVariant({ versions: [...versions, ...selectedVariant.versions] });
      setSelectedVersionId(versions[0]?.id || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "图片生成失败"); } finally { setBusy(""); }
  }

  function approve() {
    if (!asset || !selectedVariant || !selectedVersion) return;
    patchVariant({ approvedVersionId: selectedVersion.id });
    patchAsset({ approvedVersionId: selectedVersion.id, status: "ready", referenceSheetUrl: asset.kind === "character" ? selectedVersion.imageUrl : asset.referenceSheetUrl, conceptUrl: asset.kind !== "character" ? selectedVersion.imageUrl : asset.conceptUrl });
    setNotice("当前版本已设为终稿，尚未发布到 Universe。");
  }

  function publish() {
    if (!asset?.approvedVersionId) return setNotice("请先选择并锁定终稿。");
    patchAsset({ publishedVersionId: asset.approvedVersionId });
    setNotice("已生成 Universe 发布记录。正式同步将在 Supabase migration 执行后写入云端。 ");
  }

  if (!asset) return <main className={styles.missing}><p>{notice || "没有找到这个美术资产。"}</p><Link href="/art-workbench">返回美术仓库</Link></main>;

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/art-workbench"><ArrowLeft size={17} />返回美术仓库</Link><strong>{asset.name}</strong><span>{asset.kind === "character" ? "角色详情" : asset.kind === "scene" ? "场景详情" : "道具详情"}</span></div><div>{asset.publishedVersionId ? <span className={styles.published}><Check size={14} />已发布</span> : asset.status === "ready" ? <span className={styles.approved}><LockKeyhole size={14} />已锁定</span> : <span>草稿</span>}<button type="button" onClick={() => persist(asset)}>保存</button></div></header>
    {notice ? <button className={styles.notice} onClick={() => setNotice("")} type="button">{notice}</button> : null}
    <div className={styles.layout}>
      <section className={styles.mediaPanel}>
        <div className={styles.variantTabs}>{asset.variants?.map((variant) => <button key={variant.id} type="button" className={selectedVariant?.id === variant.id ? styles.active : ""} onClick={() => { setSelectedVariantId(variant.id); setSelectedVersionId(variant.approvedVersionId || variant.versions[0]?.id || ""); }}>{variant.name}</button>)}<button type="button" onClick={addVariant}><Plus size={14} />新增变体</button></div>
        <div className={styles.stage}>{selectedVersion ? <img src={selectedVersion.imageUrl} alt={asset.name} /> : <div><ImagePlus size={42} /><strong>暂无图片版本</strong><span>上传外部版本，或使用右侧设置生成</span></div>}</div>
        <div className={styles.versionStrip}>{selectedVariant?.versions.map((version, index) => <button key={version.id} type="button" className={selectedVersion?.id === version.id ? styles.selectedVersion : ""} onClick={() => setSelectedVersionId(version.id)}><img src={version.imageUrl} alt={`版本 ${index + 1}`} /><span>{version.source === "uploaded" ? "上传" : version.model || "AI"}</span>{selectedVariant.approvedVersionId === version.id ? <i><Check size={11} /></i> : null}</button>)}<button className={styles.uploadTile} type="button" onClick={() => uploadInput.current?.click()}><Upload size={18} />上传版本</button><input ref={uploadInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadVersion} /></div>
      </section>
      <aside className={styles.editor}>
        <div className={styles.editorTitle}><div><small>资产编辑器</small><h1>{asset.name}</h1></div>{selectedVersion?.imageUrl ? <a href={selectedVersion.imageUrl} download><Download size={16} /></a> : null}</div>
        <label><span>名称</span><input value={asset.name} onChange={(event) => patchAsset({ name: event.target.value })} /></label>
        <label><span>叙事功能</span><input value={asset.role} onChange={(event) => patchAsset({ role: event.target.value })} /></label>
        <label><span>{asset.kind === "character" ? "身份锚点" : "母版锚点"}</span><textarea value={asset.identityAnchor || ""} onChange={(event) => patchAsset({ identityAnchor: event.target.value })} placeholder="固定身份、结构、比例、材质和不可变化的识别特征" /></label>
        <label className={styles.prompt}><span>生成提示词</span><textarea value={selectedVariant?.prompt || ""} onChange={(event) => patchVariant({ prompt: event.target.value })} /></label>
        <div className={styles.settings}><label><span>供应商</span><div className={styles.select}><select value={selection} onChange={(event) => { setSelection(event.target.value as typeof selection); setModelId(""); }}><option value="smart">智能选择</option><option value="atlas">Atlas Cloud</option><option value="flux">FLUX</option></select><ChevronDown size={14} /></div></label><label><span>模型</span><div className={styles.select}><select value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">自动模型</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select><ChevronDown size={14} /></div></label><label><span>候选数量</span><div className={styles.select}><select value={count} onChange={(event) => setCount(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1 张</option><option value={2}>2 张</option><option value={4}>4 张</option></select><ChevronDown size={14} /></div></label><label><span>画幅</span><input value={asset.kind === "character" && selectedVariant?.type === "master" ? "4:3 · 横版" : "16:9"} readOnly /></label></div>
        <button className={styles.generate} type="button" onClick={generate} disabled={busy === "generate"}>{busy === "generate" ? <LoaderCircle className={styles.spin} size={17} /> : <Sparkles size={17} />}生成新版本</button>
        <div className={styles.finalActions}><button type="button" onClick={approve} disabled={!selectedVersion}><LockKeyhole size={16} />设为终稿</button><button type="button" onClick={publish} disabled={!asset.approvedVersionId}><Send size={16} />发布到 Universe</button></div>
      </aside>
    </div>
  </main>;
}

function legacyVersions(asset: ArtAsset): ArtAssetVersion[] {
  const url = asset.referenceSheetUrl || asset.conceptUrl || asset.threeViewUrl;
  return url ? [{ id: crypto.randomUUID(), imageUrl: url, source: "generated", provider: asset.provider, model: asset.model, prompt: asset.prompt, createdAt: asset.updatedAt }] : [];
}
