/**
 * 客户端头像图片处理：自动旋转、压缩、去 EXIF。
 *
 * 流程：
 * 1. createImageBitmap(file, { imageOrientation: "from-image" }) 自动按 EXIF 旋转
 * 2. canvas 缩放到最长边 <= 2048px
 * 3. toBlob("image/jpeg", quality) 渐进降质量直到 < 1.4MB
 * 4. 若仍超 1.4MB，降维到 512px 再试
 *
 * 输出：Blob（image/jpeg，无 EXIF，已旋转，已压缩）
 *
 * 运行环境：浏览器（需要 createImageBitmap + canvas 支持）。
 * 不依赖任何 npm 包，避免 bundle 膨胀。
 */

const MAX_RAW_SIZE = 20 * 1024 * 1024; // 原文件上限 20MB
const MAX_DIMENSION = 2048; // 最长边
// KIIKIS-TR-ACTOR-P0-008: 客户端压缩目标降到 1.4MB（< 1.5MB）
// 原因：Vercel/Edge 平台层对 multipart/form-data 请求体大小有不确定限制
// （用户实测 1.5MB 以上会失败），把压缩目标降到 1.4MB 确保任何平台层都不会触发
const TARGET_MAX_SIZE = 1400 * 1024; // 目标文件 < 1.4MB
const MIN_DIMENSION = 512; // 降维下限
const MIN_QUALITY = 0.3; // 最低质量

export type ProcessedAvatar = {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function processAvatarImage(file: File): Promise<ProcessedAvatar> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("AVATAR_TYPE_UNSUPPORTED");
  }
  if (file.size > MAX_RAW_SIZE) {
    throw new Error("AVATAR_RAW_SIZE_EXCEEDS_20MB");
  }

  // createImageBitmap 自动按 EXIF orientation 旋转（Chrome 81+, Firefox 77+, Safari 13+）
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("AVATAR_BITMAP_DECODE_FAILED");
  }

  try {
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const originalRatio = originalWidth / originalHeight;

    // 初始目标尺寸：最长边 <= 2048
    let width = originalWidth;
    let height = originalHeight;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    // 渐进降质量
    let quality = 0.85;
    let blob = await renderAndExport(bitmap, width, height, quality);

    while (blob.size > TARGET_MAX_SIZE && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
      blob = await renderAndExport(bitmap, width, height, quality);
    }

    // 若仍超 6MB，降维再试
    while (blob.size > TARGET_MAX_SIZE && width > MIN_DIMENSION) {
      width = Math.max(MIN_DIMENSION, Math.round(width * 0.85));
      height = Math.round(width / originalRatio);
      blob = await renderAndExport(bitmap, width, height, Math.max(quality, 0.5));
    }

    if (blob.size > TARGET_MAX_SIZE) {
      // 最后兜底：仍超限则警告但接受（极端情况）
      console.warn(`AVATAR_COMPRESS_FALLBACK: blob=${blob.size} > ${TARGET_MAX_SIZE}`);
    }

    return {
      blob,
      contentType: "image/jpeg",
      width,
      height,
      originalSize: file.size,
      compressedSize: blob.size,
    };
  } finally {
    bitmap.close();
  }
}

async function renderAndExport(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("AVATAR_CANVAS_CONTEXT_FAILED");
  // 白底（PNG 透明区域在 JPEG 中会变黑）
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("AVATAR_CANVAS_TO_BLOB_FAILED"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * 上传已处理的头像 Blob 到服务端。
 * 返回 { assetId, storagePath, previewUrl }。
 */
export async function uploadProcessedAvatar(
  blob: Blob,
  token: string,
  onProgress?: (phase: "uploading" | "done", loaded?: number, total?: number) => void,
): Promise<{ assetId: string; storagePath: string; previewUrl: string }> {
  const formData = new FormData();
  formData.append("file", blob, "avatar.jpg");

  onProgress?.("uploading", 0, blob.size);

  const response = await fetch("/api/actors/upload-avatar", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "AVATAR_UPLOAD_FAILED" }));
    throw new Error(body.error || `AVATAR_UPLOAD_FAILED:${response.status}`);
  }

  const result = (await response.json()) as {
    assetId: string;
    storagePath: string;
    previewUrl: string;
  };

  onProgress?.("done", blob.size, blob.size);
  return result;
}
