"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import type { ActorLibraryCopy } from "./actor-copy";
import { buildExportFileName } from "./actor-view-model";
import { buildReferenceSheetPlan, coverFitRect, hasAnySheetImage, type SheetSelection } from "./reference-sheet-plan";
import styles from "./actors.module.css";

type Props = {
  actorName: string;
  tags: string[];
  selection: SheetSelection;
  copy: ActorLibraryCopy;
};

// 「合并导出参考表」：客户端 canvas 把主视觉 + 三视图 + 表情九宫格拼成一张 PNG 下载。
export function ReferenceSheetExport({ actorName, tags, selection, copy }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const exportable = hasAnySheetImage(selection);

  async function handleExport() {
    if (busy || !exportable) {
      if (!exportable) {
        setFailed(true);
        setMessage(copy.exportEmpty);
      }
      return;
    }
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const plan = buildReferenceSheetPlan(selection, {
        main: copy.sheetMainLabel,
        threeViews: [...copy.sheetViewLabels],
        expressions: [...copy.sheetExpressionLabels],
        details: [...copy.sheetDetailLabels],
      });
      const canvas = document.createElement("canvas");
      canvas.width = plan.width;
      canvas.height = plan.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("CANVAS_UNAVAILABLE");

      // 白底标准参考表。
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, plan.width, plan.height);

      // 头部：演员名 + 标签。
      ctx.fillStyle = "#101314";
      ctx.font = "800 44px 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(actorName || "Virtual Actor", plan.header.x, plan.header.y + 34, plan.header.w);
      ctx.font = "500 22px 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillStyle = "#5c6668";
      ctx.fillText(tags.join("  ·  "), plan.header.x, plan.header.y + 74, plan.header.w);
      ctx.textAlign = "right";
      ctx.fillStyle = "#9aa5a6";
      ctx.font = "500 18px 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillText(copy.sheetFooter, plan.header.x + plan.header.w, plan.header.y + plan.header.h - 14);
      ctx.textAlign = "left";

      // 格子：图片 cover 填充；空槽位画占位。
      for (const cell of plan.cells) {
        ctx.save();
        ctx.fillStyle = "#f4f4f2";
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        if (cell.url) {
          try {
            const image = await loadImage(cell.url);
            const fit = coverFitRect(image.naturalWidth, image.naturalHeight, cell.w, cell.h);
            if (fit.sw > 0 && fit.sh > 0) {
              ctx.drawImage(image, fit.sx, fit.sy, fit.sw, fit.sh, cell.x, cell.y, cell.w, cell.h);
            }
          } catch {
            drawPlaceholder(ctx, cell.x, cell.y, cell.w, cell.h);
          }
        } else {
          drawPlaceholder(ctx, cell.x, cell.y, cell.w, cell.h);
        }
        ctx.restore();
        // 标签条。
        ctx.fillStyle = "rgba(16, 19, 20, 0.78)";
        ctx.fillRect(cell.x, cell.y + cell.h - 30, cell.w, 30);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 17px 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.label, cell.x + 12, cell.y + cell.h - 15, cell.w - 24);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("CANVAS_EXPORT_FAILED");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildExportFileName(actorName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(copy.exportDone);
    } catch {
      setFailed(true);
      setMessage(copy.exportFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button className={styles.primaryBtn} type="button" onClick={handleExport} disabled={busy} title={exportable ? copy.exportSheet : copy.exportEmpty}>
        {busy ? <LoaderCircle className={styles.spin} size={15} /> : <Download size={15} />}
        {busy ? copy.exporting : copy.exportSheet}
      </button>
      {message ? (
        <span style={{ fontSize: 12, color: failed ? "#ffb1b3" : "#8fd8c9" }} role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = "rgba(16, 19, 20, 0.14)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(x + 8, y + 8, Math.max(0, w - 16), Math.max(0, h - 16));
  ctx.setLineDash([]);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = url;
  });
}
