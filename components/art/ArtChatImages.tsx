"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ImagePlus, X } from "lucide-react";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import type { ArtChatImage, ArtReference } from "@/lib/art/chat-workflow";
import styles from "./ArtChat.module.css";

export async function downloadArtImage(storagePath: string, name = "Kiikis-art") {
  const response = await fetchWithAuthRetry("/api/art/download", { method: "POST", body: JSON.stringify({ storagePath, name }) });
  if (!response.ok) throw new Error("原图下载失败，请稍后重试。");
  const blob = await response.blob();
  const extension = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `${name.replace(/[\\/:*?"<>|]/g, "-")}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ArtChatImages({ images, assetHref, onReference, onError }: { images: ArtChatImage[]; assetHref?: string; onReference: (ref: ArtReference) => void; onError: (message: string) => void }) {
  const [preview, setPreview] = useState<ArtChatImage | null>(null);
  const [downloading, setDownloading] = useState("");
  return <>
    <div className={styles.imageGrid}>{images.map((image, index) => <figure key={image.storagePath} className={styles.imageCard}>
      <button type="button" className={styles.imagePreview} aria-label={`预览图片 ${index + 1}`} onClick={() => setPreview(image)}><img src={image.previewUrl} alt={`美术图片 ${index + 1}`} /></button>
      <figcaption><span>{image.model || "参考图"}</span><div>{assetHref && <Link href={assetHref}>编辑资产</Link>}<button type="button" title="作为参考继续修改" aria-label={`将图片 ${index + 1} 作为参考`} onClick={() => onReference({ id: crypto.randomUUID(), name: `参考图 ${index + 1}`, url: image.previewUrl, storagePath: image.storagePath })}><ImagePlus size={15} /></button><button type="button" aria-label={`下载原图 ${index + 1}`} disabled={downloading === image.storagePath} onClick={async () => { setDownloading(image.storagePath); try { await downloadArtImage(image.storagePath); } catch (error) { onError((error as Error).message); } finally { setDownloading(""); } }}><Download size={15} /></button></div></figcaption>
    </figure>)}</div>
    {preview && <div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label="原图预览" onClick={() => setPreview(null)} onKeyDown={event => { if (event.key === "Escape") setPreview(null); }}><button autoFocus type="button" aria-label="关闭预览" onClick={() => setPreview(null)}><X /></button><img src={preview.previewUrl} alt="原图预览" onClick={event => event.stopPropagation()} /></div>}
  </>;
}
