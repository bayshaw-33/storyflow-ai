"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Check, ChevronDown, Download, ImagePlus, LoaderCircle, LockKeyhole, Pencil, Plus, Send, Sparkles, Upload, Users, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getArtWorkbenchStorageKey, type ArtAsset, ArtAssetVersion, ArtAssetVariant, ArtWorkbenchState } from "@/lib/art-workbench";
import type { ActorProfile } from "@/lib/actors";
import { ART_MODEL_CATALOG, findDefaultArtModel } from "@/lib/art/providers/catalog";
import styles from "./ArtAssetDetail.module.css";

const REFERENCE_SHEET_PROMPT = "为选定的角色母版图生成专业完整角色参考表。纯白色无缝背景上干净整洁的网格布局。包含主全身体态转面图（正面、3/4 视角、侧面、背面）；主体身份与比例尺；右上角 6-8 色调色板；8 帧情绪进阶；5 帧微表情；多角度头部细节表；中性站姿与姿态变化；1 张特写；底部一排服装和配饰细节，包括头发质地、外套面料、鞋子和配饰；多种手势参考；角色轮廓指南。所有画面保持人物脸部和身体比例一致。4:3 横版，布局完美对齐。";

export default function ArtAssetDetail() {
  const params = useParams<{ assetId: string }>();
  const assetId = decodeURIComponent(String(params.assetId || ""));
  // 任务 4：保留上下文，避免返回时弹回工作台入口
  const searchParams = useSearchParams();
  const ctxProjectId = searchParams.get("projectId") || "";
  const ctxSourceUnitId = searchParams.get("sourceUnitId") || "";
  const ctxSetup = searchParams.get("setup") === "1";
  // PRD §7.2：详情页必须使用与嵌入工作台完全相同的 scoped storage key（projectId + sourceUnitId）
  const storageKey = getArtWorkbenchStorageKey(ctxProjectId || undefined, ctxSourceUnitId || undefined);
  const backToArtHref = ctxProjectId && ctxSourceUnitId
    ? `/production?projectId=${encodeURIComponent(ctxProjectId)}&sourceUnitId=${encodeURIComponent(ctxSourceUnitId)}&mode=art`
    : `/production?mode=art${ctxSetup ? "&setup=1" : ""}`;
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<ArtWorkbenchState | null>(null);
  const [asset, setAsset] = useState<ArtAsset | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selection, setSelection] = useState<"smart" | "atlas" | "flux">("smart");
  const [modelId, setModelId] = useState("");
  const [count, setCount] = useState<1 | 2 | 4>(1);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "4:3" | "3:4" | "16:9" | "9:16">("16:9");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);
  // 提示词 @mention：在 prompt textarea 中输入 @ 触发对象浮层
  const [mention, setMention] = useState<{ open: boolean; query: string; start: number; rect: DOMRect | null }>({ open: false, query: "", start: -1, rect: null });
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // 演员库导入（Casting Assignment：把 Actor 关联到 Character）
  const [actorModalOpen, setActorModalOpen] = useState(false);
  const [actorList, setActorList] = useState<ActorProfile[]>([]);
  const [actorLoading, setActorLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next)) || {};
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null") as ArtWorkbenchState | null;
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
  const hasReference = Boolean(selectedVersion?.imageUrl?.startsWith("http"));
  const masterVariant = asset?.variants?.find((item) => item.type === "master");
  const masterVersion = masterVariant?.versions.find((item) => item.id === masterVariant?.approvedVersionId) || masterVariant?.versions[0];
  const masterImageUrl = masterVersion?.imageUrl?.startsWith("http") ? masterVersion.imageUrl : "";
  const fallbackReferenceUrl = selectedVariant?.type === "master" ? "" : (asset?.referenceSheetUrl || asset?.conceptUrl || asset?.threeViewUrl || masterImageUrl);
  const effectiveReferenceUrl = hasReference ? (selectedVersion?.imageUrl || "") : fallbackReferenceUrl;
  const requiredCapability = effectiveReferenceUrl ? "image-edit" : "text-to-image";
  const availableModels = useMemo(() => ART_MODEL_CATALOG.filter((model) =>
    (selection === "smart" || model.provider === selection) && model.capabilities.includes(requiredCapability),
  ), [selection, requiredCapability]);

  useEffect(() => {
    if (selection === "smart") return setModelId("");
    const currentIsValid = availableModels.some((model) => model.id === modelId);
    if (!currentIsValid) setModelId(findDefaultArtModel(selection, requiredCapability)?.id || availableModels[0]?.id || "");
  }, [availableModels, modelId, requiredCapability, selection]);

  // 画幅默认值：角色母版 4:3，其他 16:9（与原硬编码逻辑一致，用户可手动改）
  useEffect(() => {
    if (!asset) return;
    const isCharacterMaster = asset.kind === "character" && selectedVariant?.type === "master";
    setAspectRatio(isCharacterMaster ? "4:3" : "16:9");
  }, [asset?.id, selectedVariantId]); // 仅在 asset/variant 切换时重置，用户手动改不被覆盖

  function persist(next: ArtAsset) {
    setAsset(next);
    if (!state) return;
    const nextState = { ...state, assets: state.assets.map((item) => item.id === next.id ? next : item), updatedAt: new Date().toISOString() };
    setState(nextState);
    try { localStorage.setItem(storageKey, JSON.stringify(nextState)); } catch { setNotice("本地保存空间不足，请删除大型本地图片或立即导出项目。"); }
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

  function deleteVariant(variantId: string) {
    if (!asset?.variants?.length) return;
    const target = asset.variants.find((item) => item.id === variantId);
    if (!target) return;
    if (target.type === "master") return setNotice("角色母版不可删除，如需重置请直接生成新版本。");
    if (!window.confirm(`确定删除变体「${target.name}」及其所有版本吗？`)) return;
    const remaining = asset.variants.filter((item) => item.id !== variantId);
    persist({ ...asset, variants: remaining });
    if (selectedVariantId === variantId) {
      const next = remaining[0];
      setSelectedVariantId(next?.id || "");
      setSelectedVersionId(next?.approvedVersionId || next?.versions[0]?.id || "");
    }
  }

  async function uploadVersion(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    const fileList = files ? Array.from(files) : [];
    if (!fileList.length || !asset || !selectedVariant) return;
    if (!session?.access_token) return setNotice("请先登录后再上传图片版本。");
    setBusy("upload");
    setNotice("");
    try {
      // 支持一次选择多张：逐个上传，全部成功后一次性合并到 versions 前面（保持选择顺序）
      const uploaded: ArtAssetVersion[] = [];
      const errors: string[] = [];
      for (const file of fileList) {
        try {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch("/api/art/upload-reference", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
          const payload = await response.json() as { success?: boolean; previewUrl?: string; storagePath?: string; error?: string };
          if (!response.ok || !payload.previewUrl || !payload.storagePath) throw new Error(payload.error || "图片版本上传失败");
          // 默认显示名用文件名（去扩展名），用户可后续重命名
          const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "上传图片";
          uploaded.push({ id: crypto.randomUUID(), imageUrl: payload.previewUrl, storagePath: payload.storagePath, source: "uploaded", prompt: selectedVariant.prompt, createdAt: new Date().toISOString(), name: baseName });
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : "上传失败"}`);
        }
      }
      if (uploaded.length) {
        patchVariant({ versions: [...uploaded, ...selectedVariant.versions] });
        setSelectedVersionId(uploaded[0].id);
      }
      if (errors.length) {
        setNotice(`部分图片上传失败：\n${errors.join("\n")}`);
      } else if (uploaded.length > 1) {
        setNotice(`已上传 ${uploaded.length} 张图片。`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片版本上传失败");
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  // 重命名版本显示名
  function renameVersion(versionId: string) {
    if (!asset || !selectedVariant) return;
    const version = selectedVariant.versions.find((v) => v.id === versionId);
    if (!version) return;
    const current = version.name || (version.source === "uploaded" ? "上传图片" : version.model || "AI");
    const next = window.prompt("给这个版本起个名字：", current);
    if (next === null) return; // 用户取消
    const trimmed = next.trim();
    const newVersions = selectedVariant.versions.map((v) => v.id === versionId ? { ...v, name: trimmed || undefined } : v);
    patchVariant({ versions: newVersions });
  }

  async function generate(taskOverride?: string) {
    if (!asset || !selectedVariant) return;
    if (!session?.access_token) return setNotice("请先登录后再生成图片。");
    setBusy("generate");
    setNotice("");
    try {
      // Use the effective reference (current version, or fall back to the master variant's latest image)
      const referenceUrls = effectiveReferenceUrl ? [effectiveReferenceUrl] : [];
      const task = taskOverride || (asset.kind === "character" && selectedVariant.type === "master" ? "reference_sheet" : referenceUrls.length ? "edit" : "concept");
      const response = await fetch("/api/art/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          projectId: state?.id,
          assetId: asset.id,
          task,
          prompt: selectedVariant.prompt,
          negativePrompt: asset.negativePrompt,
          referenceUrls,
          aspectRatio,
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

  // 提示词 @mention 候选：同项目的其他角色 / 关联演员 / 场景 / 道具
  const mentionCandidates = useMemo(() => {
    if (!state || !asset) return [];
    const items: Array<{ label: string; kind: string }> = [];
    for (const a of state.assets) {
      if (a.id === asset.id) continue;
      const kindLabel = a.kind === "character" ? "角色" : a.kind === "scene" ? "场景" : "道具";
      items.push({ label: a.name, kind: kindLabel });
    }
    if (asset.actorName) items.push({ label: asset.actorName, kind: "演员" });
    // 去重（同名只保留一个）
    const seen = new Set<string>();
    return items.filter((item) => { const k = `${item.kind}:${item.label}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [state, asset]);

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const textarea = event.target;
    const value = textarea.value;
    const caret = textarea.selectionStart ?? value.length;
    patchVariant({ prompt: value });
    // 检测 @ 触发：从光标向前找最近的 @，且 @ 后没有空格
    const before = value.slice(0, caret);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) { setMention({ open: false, query: "", start: -1, rect: null }); return; }
    // @ 必须在行首或前面是空白
    const charBefore = atIdx > 0 ? before[atIdx - 1] : " ";
    if (!/\s/.test(charBefore)) { setMention({ open: false, query: "", start: -1, rect: null }); return; }
    const query = before.slice(atIdx + 1);
    // 如果 @ 后已经有空格或换行，关闭浮层
    if (/\s/.test(query)) { setMention({ open: false, query: "", start: -1, rect: null }); return; }
    // 计算浮层位置（textarea 光标附近的视口坐标）
    const rect = textarea.getBoundingClientRect();
    setMention({ open: true, query, start: atIdx, rect });
  }

  function insertMention(label: string) {
    if (!selectedVariant || mention.start < 0 || !promptRef.current) { setMention({ open: false, query: "", start: -1, rect: null }); return; }
    const prompt = selectedVariant.prompt || "";
    const before = prompt.slice(0, mention.start);
    const after = prompt.slice(promptRef.current.selectionStart ?? mention.start + 1);
    const next = `${before}@${label} ${after}`;
    patchVariant({ prompt: next });
    setMention({ open: false, query: "", start: -1, rect: null });
    // 光标移到插入的 @label 后面
    requestAnimationFrame(() => {
      if (!promptRef.current) return;
      const pos = (before + `@${label} `).length;
      promptRef.current.focus();
      promptRef.current.setSelectionRange(pos, pos);
    });
  }

  const filteredMentions = mention.open
    ? mentionCandidates.filter((item) => !mention.query || item.label.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8)
    : [];

  async function openActorModal() {
    if (!session?.access_token) {
      setNotice("请先登录后再从演员库导入。");
      return;
    }
    setActorModalOpen(true);
    if (actorList.length) return;
    setActorLoading(true);
    try {
      const response = await fetch("/api/actors", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json() as { actors?: ActorProfile[]; error?: string };
      if (!response.ok || !payload.actors) throw new Error(payload.error || "读取演员库失败");
      setActorList(payload.actors);
      if (!payload.actors.length) setNotice("演员库还没有任何演员，先到「演员库」页面创建。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "读取演员库失败");
      setActorModalOpen(false);
    } finally {
      setActorLoading(false);
    }
  }

  async function importFromActor(actor: ActorProfile) {
    if (!asset) return;
    if (!session?.access_token) {
      setNotice("请先登录后再从演员库导入。");
      return;
    }
    setBusy("import");
    setActorModalOpen(false);
    try {
      // 1. 优先从演员图组获取白T+牛仔裤三视图（pack = "three-view-casual"）
      let threeViewUrl = "";
      let usedSource = "";
      try {
        const viewsResp = await fetch(
          `/api/actors/generate-views?actorId=${encodeURIComponent(actor.id)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (viewsResp.ok) {
          const viewsPayload = await viewsResp.json() as {
            versions?: Array<{ pack?: string; previewUrl?: string; isPrimary?: boolean }>;
          };
          const casual = (viewsPayload.versions || [])
            .filter((v) => v.pack === "three-view-casual" && v.previewUrl)
            .sort((a, b) => Number(b.isPrimary || false) - Number(a.isPrimary || false));
          if (casual[0]?.previewUrl) {
            threeViewUrl = casual[0].previewUrl;
            usedSource = "白T牛仔三视图";
          }
        }
      } catch { /* 图组获取失败，降级到 reference_sheet / avatar */ }

      // 2. 回退顺序：白T三视图 → reference_sheet_url → avatar_url
      const imageUrl = threeViewUrl || actor.reference_sheet_url || actor.avatar_url || "";
      if (!imageUrl) {
        setNotice(`演员「${actor.name}」还没有白T三视图、参考表或头像，请先在演员库生成。`);
        return;
      }
      if (!usedSource) {
        usedSource = actor.reference_sheet_url ? "角色参考表" : "头像";
      }

      // 3. 构造身份锚点：identity_core_prompt + face_description + 关键体征
      const identityParts: string[] = [];
      if (actor.metadata?.identity_passport?.identity_core_prompt) {
        identityParts.push(`【身份核心】\n${actor.metadata.identity_passport.identity_core_prompt}`);
      }
      if (actor.face_description) identityParts.push(`【面部特征】${actor.face_description}`);
      if (actor.hair_description) identityParts.push(`【发型发色】${actor.hair_description}`);
      if (actor.body_description) identityParts.push(`【身形比例】${actor.body_description}`);
      if (actor.age_range) identityParts.push(`【年龄区间】${actor.age_range}`);
      if (actor.gender_expression) identityParts.push(`【性别气质】${actor.gender_expression}`);
      if (actor.ethnicity_style) identityParts.push(`【族群风格】${actor.ethnicity_style}`);
      const identityAnchor = identityParts.join("\n");

      // 4. 把演员图片作为新版本加到 master variant
      const newVersion: ArtAssetVersion = {
        id: crypto.randomUUID(),
        imageUrl,
        source: "uploaded",
        prompt: actor.base_prompt || selectedVariant?.prompt || asset.prompt,
        createdAt: new Date().toISOString(),
      };

      const variants = (asset.variants || []).map((v) => v.type === "master"
        ? { ...v, prompt: actor.base_prompt || v.prompt, versions: [newVersion, ...v.versions] }
        : v);

      const nextAsset: ArtAsset = {
        ...asset,
        actorId: actor.id,
        actorName: actor.name,
        identityAnchor,
        negativePrompt: actor.negative_prompt || asset.negativePrompt,
        prompt: actor.base_prompt || asset.prompt,
        variants,
        status: "ready",
        approvedVersionId: newVersion.id,
        referenceSheetUrl: asset.kind === "character" ? imageUrl : asset.referenceSheetUrl,
        updatedAt: new Date().toISOString(),
      };
      persist(nextAsset);
      setSelectedVersionId(newVersion.id);
      setNotice(`已从演员库导入「${actor.name}」的${usedSource}作为角色母版。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "从演员库导入失败");
    } finally {
      setBusy("");
    }
  }

  if (!asset) return <main className={styles.missing}><p>{notice || "没有找到这个美术资产。"}</p><Link href={backToArtHref}>返回美术仓库</Link></main>;

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href={backToArtHref}><ArrowLeft size={17} />返回美术仓库</Link><strong>{asset.name}</strong><span>{asset.kind === "character" ? "角色详情" : asset.kind === "scene" ? "场景详情" : "道具详情"}</span></div><div>{asset.publishedVersionId ? <span className={styles.published}><Check size={14} />已发布</span> : asset.status === "ready" ? <span className={styles.approved}><LockKeyhole size={14} />已锁定</span> : <span>草稿</span>}<button type="button" onClick={() => persist(asset)}>保存</button></div></header>
    {notice ? <button className={styles.notice} onClick={() => setNotice("")} type="button">{notice}</button> : null}
    <div className={styles.layout}>
      <section className={styles.mediaPanel}>
        <div className={styles.variantTabs}>{asset.variants?.map((variant) => <div key={variant.id} className={selectedVariant?.id === variant.id ? `${styles.variantTab} ${styles.active}` : styles.variantTab}><button type="button" onClick={() => { setSelectedVariantId(variant.id); setSelectedVersionId(variant.approvedVersionId || variant.versions[0]?.id || ""); }}>{variant.name}</button>{variant.type !== "master" ? <button type="button" className={styles.variantDelete} title="删除变体" onClick={() => deleteVariant(variant.id)}><X size={11} /></button> : null}</div>)}<button type="button" onClick={addVariant}><Plus size={14} />新增变体</button></div>
        <div className={styles.stage}>{selectedVersion ? <img src={selectedVersion.imageUrl} alt={asset.name} /> : <div><ImagePlus size={42} /><strong>暂无图片版本</strong><span>上传外部版本，或使用右侧设置生成</span></div>}</div>
        <div className={styles.versionStrip}>{selectedVariant?.versions.map((version, index) => <div key={version.id} className={selectedVersion?.id === version.id ? `${styles.versionTile} ${styles.selectedVersion}` : styles.versionTile}><button type="button" className={styles.versionTileBtn} onClick={() => setSelectedVersionId(version.id)}><img src={version.imageUrl} alt={`版本 ${index + 1}`} /><span>{version.name || (version.source === "uploaded" ? "上传" : version.model || "AI")}</span></button>{selectedVariant.approvedVersionId === version.id ? <i><Check size={11} /></i> : null}<button type="button" className={styles.versionRename} title="重命名" onClick={() => renameVersion(version.id)}><Pencil size={11} /></button></div>)}<button className={styles.uploadTile} type="button" onClick={() => uploadInput.current?.click()}><Upload size={18} />上传版本</button><input ref={uploadInput} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={uploadVersion} /></div>
      </section>
      <aside className={styles.editor}>
        <div className={styles.editorTitle}><div><small>资产编辑器</small><h1>{asset.name}</h1></div>{selectedVersion?.imageUrl ? <a href={selectedVersion.imageUrl} download><Download size={16} /></a> : null}</div>
        <label><span>名称</span><input value={asset.name} onChange={(event) => patchAsset({ name: event.target.value })} /></label>
        <label><span>{asset.kind === "character" ? "身份锚点" : "母版锚点"}</span><textarea value={asset.identityAnchor || ""} onChange={(event) => patchAsset({ identityAnchor: event.target.value })} placeholder="固定身份、结构、比例、材质和不可变化的识别特征" /></label>
        <label className={styles.prompt}><span>生成提示词</span><textarea ref={promptRef} value={selectedVariant?.prompt || ""} onChange={handlePromptChange} placeholder="输入提示词，@ 可提及同项目其他角色/场景/道具/演员" />{mention.open && filteredMentions.length ? <div className={styles.mentionList} style={mention.rect ? { top: mention.rect.bottom + 4, left: mention.rect.left } : undefined}>{filteredMentions.map((item) => <button key={`${item.kind}:${item.label}`} type="button" className={styles.mentionItem} onClick={() => insertMention(item.label)}><strong>{item.label}</strong><span>{item.kind}</span></button>)}</div> : null}</label>
        <div className={styles.settings}><label><span>供应商</span><div className={styles.select}><select value={selection} onChange={(event) => { setSelection(event.target.value as typeof selection); setModelId(""); }}><option value="smart">智能选择</option><option value="atlas">Atlas Cloud</option><option value="flux">FLUX</option></select><ChevronDown size={14} /></div></label><label><span>模型</span><div className={styles.select}><select value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">自动模型</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select><ChevronDown size={14} /></div></label><label><span>候选数量</span><div className={styles.select}><select value={count} onChange={(event) => setCount(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1 张</option><option value={2}>2 张</option><option value={4}>4 张</option></select><ChevronDown size={14} /></div></label><label><span>画幅</span><div className={styles.select}><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}><option value="1:1">1:1 · 方形</option><option value="4:3">4:3 · 横版</option><option value="3:4">3:4 · 竖版</option><option value="16:9">16:9 · 宽屏</option><option value="9:16">9:16 · 竖屏</option></select><ChevronDown size={14} /></div></label></div>
        <div className={styles.generateActions}><button className={styles.generate} type="button" onClick={() => generate()} disabled={busy === "generate"}>{busy === "generate" ? <LoaderCircle className={styles.spin} size={17} /> : <Sparkles size={17} />}生成新版本</button>{asset.kind === "character" ? <button className={styles.threeViewBtn} type="button" onClick={() => generate("three_view")} disabled={busy === "generate"} title="基于角色母版生成三视图">三视图</button> : null}</div>
        {asset.kind === "character" ? (
          <div className={styles.actorImportActions}>
            {asset.actorId ? (
              <div className={styles.actorLinked}>
                <Users size={14} />
                <span>已关联演员：<strong>{asset.actorName}</strong></span>
                <button type="button" onClick={openActorModal}>更换演员</button>
              </div>
            ) : (
              <button type="button" className={styles.actorImportBtn} onClick={openActorModal} disabled={busy === "import"}>
                {busy === "import" ? <LoaderCircle className={styles.spin} size={16} /> : <Users size={16} />}{busy === "import" ? "导入中…" : "从演员库导入"}
              </button>
            )}
          </div>
        ) : null}
        <div className={styles.finalActions}><button type="button" onClick={approve} disabled={!selectedVersion}><LockKeyhole size={16} />设为终稿</button><button type="button" onClick={publish} disabled={!asset.approvedVersionId}><Send size={16} />发布到 Universe</button></div>
      </aside>
    </div>
    {actorModalOpen ? (
      <div className={styles.actorModalOverlay} onClick={() => setActorModalOpen(false)}>
        <div className={styles.actorModal} onClick={(event) => event.stopPropagation()}>
          <header>
            <strong>从演员库导入角色母版</strong>
            <button type="button" onClick={() => setActorModalOpen(false)}><X size={16} /></button>
          </header>
          <div className={styles.actorModalBody}>
            {actorLoading ? (
              <div className={styles.actorLoading}><LoaderCircle className={styles.spin} size={28} /><span>正在加载演员库…</span></div>
            ) : actorList.length === 0 ? (
              <div className={styles.actorEmpty}>
                <strong>演员库还没有演员</strong>
                <span>请先到「演员库」页面创建虚拟演员，并上传头像或参考表。</span>
              </div>
            ) : (
              <div className={styles.actorGrid}>
                {actorList.map((actor) => (
                  <button key={actor.id} type="button" className={styles.actorCard} disabled={busy === "import"} onClick={() => void importFromActor(actor)}>
                    <div className={styles.actorCardImage}>
                      {actor.reference_sheet_url || actor.avatar_url
                        ? <img src={actor.reference_sheet_url || actor.avatar_url || ""} alt={actor.name} />
                        : <ImagePlus size={28} />}
                    </div>
                    <div className={styles.actorCardInfo}>
                      <strong>{actor.name}</strong>
                      <span>{[actor.age_range, actor.gender_expression, actor.ethnicity_style].filter(Boolean).join(" · ") || actor.bio || "暂无描述"}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null}
  </main>;
}

function legacyVersions(asset: ArtAsset): ArtAssetVersion[] {
  const url = asset.referenceSheetUrl || asset.conceptUrl || asset.threeViewUrl;
  return url ? [{ id: crypto.randomUUID(), imageUrl: url, source: "generated", provider: asset.provider, model: asset.model, prompt: asset.prompt, createdAt: asset.updatedAt }] : [];
}
