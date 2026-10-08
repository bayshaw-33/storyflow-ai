"use client";

import { useEffect, useRef } from "react";
import { ChevronUp, ImagePlus, LoaderCircle, Send, Upload, X } from "lucide-react";
import type { ArtReference } from "@/lib/art/chat-workflow";
import type { ArtModelDescriptor } from "@/lib/art/providers/types";
import styles from "./ArtChat.module.css";

type Props = {
  message: string; onMessage: (value: string) => void; onSend: () => void;
  references: ArtReference[]; onRemove: (id: string) => void;
  onSource: () => void; onImage: () => void; busy: string; ready: boolean;
  models: ArtModelDescriptor[]; modelId: string; onModel: (id: string) => void;
  aspectRatio: string; onAspectRatio: (value: "9:16" | "16:9" | "1:1" | "4:3" | "3:4") => void;
  count: 1 | 2 | 4; onCount: (count: 1 | 2 | 4) => void;
};

export default function ArtChatComposer(props: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const available = props.models.filter(model => model.capabilities.includes(props.references.length ? "image-edit" : "text-to-image") && model.maxReferences >= props.references.length);
  const selected = available.find(model => model.id === props.modelId);
  useEffect(() => { if (props.modelId && !available.some(model => model.id === props.modelId)) props.onModel(""); }, [props.modelId, props.references.length, props.models]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected && !selected.aspectRatios.includes(props.aspectRatio)) props.onAspectRatio(selected.aspectRatios[0] as "9:16" | "16:9" | "1:1" | "4:3" | "3:4");
  }, [selected, props.aspectRatio]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={styles.composer}>
    {!!props.references.length && <div className={styles.references}>{props.references.map(ref => <div key={ref.id} className={styles.reference}><img src={ref.url} alt={ref.name} /><span>{ref.name}</span><button type="button" aria-label={`移除参考图 ${ref.name}`} disabled={!!props.busy} onClick={() => props.onRemove(ref.id)}><X size={13} /></button></div>)}</div>}
    <textarea aria-label="美术创作要求" value={props.message} disabled={!props.ready || !!props.busy} onChange={event => props.onMessage(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") props.onSend(); }} placeholder="例如：参考这张人物图，生成雨夜街头的全身照，保持脸部一致…" />
    <div className={styles.toolbar}>
      <div className={styles.attachments}><button type="button" disabled={!props.ready || !!props.busy} onClick={props.onSource} aria-label="上传剧本资料" title="上传剧本资料"><Upload size={17} /></button><button type="button" disabled={!props.ready || !!props.busy || props.references.length >= 8} onClick={props.onImage} aria-label="上传参考图" title="上传参考图（最多 8 张）"><ImagePlus size={17} /></button></div>
      <details ref={menu} className={styles.modelMenu} onKeyDown={event => { if (event.key === "Escape" && menu.current) menu.current.open = false; }}>
        <summary aria-label="选择生图模型">{selected?.label || "智能选择"}<ChevronUp size={14} /></summary>
        <div className={styles.modelPopover}><strong>生图模型</strong><small>{props.references.length ? "已筛选支持参考图的模型" : "已筛选已配置的图片模型"}</small><button type="button" aria-pressed={!props.modelId} onClick={() => { props.onModel(""); if (menu.current) menu.current.open = false; }}>智能选择<span>按当前任务匹配</span></button>{available.map(model => <button key={model.id} type="button" aria-pressed={model.id === props.modelId} onClick={() => { props.onModel(model.id); if (menu.current) menu.current.open = false; }}>{model.label}<span>{model.provider === "flux" ? "FLUX" : "Atlas Cloud"} · {props.references.length ? `参考图 ≤ ${model.maxReferences}` : "文生图"}</span></button>)}{!available.length && <p>暂无已配置的图片模型，请登录或检查平台服务配置。</p>}</div>
      </details>
      <select aria-label="图片画幅" value={props.aspectRatio} disabled={!!props.busy} onChange={event => props.onAspectRatio(event.target.value as Props["aspectRatio"] & ("9:16" | "16:9" | "1:1" | "4:3" | "3:4"))}>{["9:16", "16:9", "1:1", "4:3", "3:4"].filter(ratio => !selected || selected.aspectRatios.includes(ratio)).map(ratio => <option key={ratio}>{ratio}</option>)}</select>
      <select aria-label="图片候选数量" value={props.count} disabled={!!props.busy} onChange={event => props.onCount(Number(event.target.value) as 1 | 2 | 4)}>{[1, 2, 4].map(count => <option key={count} value={count}>{count} 张</option>)}</select>
      <button className={styles.send} type="button" aria-label="发送美术要求" disabled={!props.ready || !!props.busy || (!props.message.trim() && !props.references.length)} onClick={props.onSend}>{props.busy ? <LoaderCircle className={styles.spin} size={18} /> : <Send size={18} />}</button>
    </div>
    <small className={styles.hint}>{props.busy === "generate" ? "正在生成并保存图片，完成后自动显示候选" : "描述要生成的画面即可 · ⌘ / Ctrl + Enter 发送 · 候选不会覆盖终稿"}</small>
  </div>;
}
