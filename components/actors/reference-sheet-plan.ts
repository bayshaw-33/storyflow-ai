// 「合并导出参考表」纯逻辑：从演员图片资产挑选参考表槽位、计算画布布局。
// 可擦除 TS；不依赖 React / DOM，node:test 可直接 import。

import type { ViewVersion } from "./actor-view-model.ts";

export const REFERENCE_SHEET_WIDTH = 1920;
export const REFERENCE_SHEET_HEIGHT = 1440;
const MARGIN = 48;
const GAP = 24;
const HEADER_HEIGHT = 96;
const MAIN_COLUMN_WIDTH = 560;
const DETAIL_SLOTS = 2;
const THREE_VIEW_SLOTS = 3;
const EXPRESSION_SLOTS = 9;

export type SheetSelection = {
  mainVisualUrl: string | null;
  threeViewUrls: Array<string | null>;
  expressionUrls: Array<string | null>;
  detailUrls: Array<string | null>;
};

export type SheetCell = {
  slotId: string;
  label: string;
  url: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SheetPlan = {
  width: number;
  height: number;
  margin: number;
  gap: number;
  header: { x: number; y: number; w: number; h: number };
  cells: SheetCell[];
};

function firstUrls(versions: ViewVersion[] | undefined, count: number): Array<string | null> {
  const urls = (versions || []).map((version) => version.previewUrl).filter(Boolean);
  const picked: Array<string | null> = urls.slice(0, count);
  while (picked.length < count) picked.push(null);
  return picked;
}

// 挑图规则：
// - 主视觉：演员头像优先，缺失时回退到白T三视图第一张。
// - 三视图：白T牛仔 pack 最新三张；缺位用泳装 pack 补齐。
// - 表情：表情组 pack 最新九张（九宫格）。
// - 细节：身体细节 pack 最新两张。
export function selectReferenceSheetImages(input: {
  avatarUrl?: string | null;
  versionsByPack: Record<string, ViewVersion[]>;
}): SheetSelection {
  const packs = input.versionsByPack || {};
  const casual = firstUrls(packs.three_view_casual, THREE_VIEW_SLOTS);
  const swim = firstUrls(packs.three_view_swim, THREE_VIEW_SLOTS);
  const threeViewUrls = casual.map((url, index) => url || swim[index] || null);
  const avatar = typeof input.avatarUrl === "string" && input.avatarUrl.trim() ? input.avatarUrl.trim() : null;
  return {
    mainVisualUrl: avatar || threeViewUrls[0] || null,
    threeViewUrls,
    expressionUrls: firstUrls(packs.expressions, EXPRESSION_SLOTS),
    detailUrls: firstUrls(packs.body_details, DETAIL_SLOTS),
  };
}

export function hasAnySheetImage(selection: SheetSelection): boolean {
  return Boolean(
    selection.mainVisualUrl ||
      selection.threeViewUrls.some(Boolean) ||
      selection.expressionUrls.some(Boolean) ||
      selection.detailUrls.some(Boolean),
  );
}

// 标准角色参考表布局：左侧主视觉 + 细节，右侧三视图横排 + 表情九宫格。
// 空槽位也保留格子（客户端绘制占位），保证导出排版稳定。
export function buildReferenceSheetPlan(selection: SheetSelection, labels: {
  main: string;
  threeViews: string[];
  expressions: string[];
  details: string[];
}): SheetPlan {
  const width = REFERENCE_SHEET_WIDTH;
  const height = REFERENCE_SHEET_HEIGHT;
  const header = { x: MARGIN, y: MARGIN, w: width - MARGIN * 2, h: HEADER_HEIGHT };
  const bodyY = MARGIN + HEADER_HEIGHT + GAP;
  const bodyH = height - bodyY - MARGIN;
  const cells: SheetCell[] = [];

  // 左列：主视觉 + 细节行。
  const detailH = Math.floor((bodyH - GAP) / 3);
  const mainH = bodyH - detailH - GAP;
  cells.push({ slotId: "main", label: labels.main, url: selection.mainVisualUrl, x: MARGIN, y: bodyY, w: MAIN_COLUMN_WIDTH, h: mainH });
  const detailW = Math.floor((MAIN_COLUMN_WIDTH - GAP) / DETAIL_SLOTS);
  selection.detailUrls.forEach((url, index) => {
    cells.push({
      slotId: `detail-${index}`,
      label: labels.details[index] || `细节 ${index + 1}`,
      url,
      x: MARGIN + index * (detailW + GAP),
      y: bodyY + mainH + GAP,
      w: index === DETAIL_SLOTS - 1 ? MAIN_COLUMN_WIDTH - index * (detailW + GAP) : detailW,
      h: detailH,
    });
  });

  // 右列：三视图 + 表情九宫格。
  const rightX = MARGIN + MAIN_COLUMN_WIDTH + GAP;
  const rightW = width - MARGIN - rightX;
  const threeViewH = Math.floor((bodyH - GAP) * 0.46);
  const threeViewW = Math.floor((rightW - GAP * (THREE_VIEW_SLOTS - 1)) / THREE_VIEW_SLOTS);
  selection.threeViewUrls.forEach((url, index) => {
    cells.push({
      slotId: `view-${index}`,
      label: labels.threeViews[index] || `视角 ${index + 1}`,
      url,
      x: rightX + index * (threeViewW + GAP),
      y: bodyY,
      w: index === THREE_VIEW_SLOTS - 1 ? rightX + rightW - (rightX + index * (threeViewW + GAP)) : threeViewW,
      h: threeViewH,
    });
  });

  const exprY = bodyY + threeViewH + GAP;
  const exprH = height - MARGIN - exprY;
  const exprCols = 3;
  const exprRows = Math.ceil(EXPRESSION_SLOTS / exprCols);
  const exprW = Math.floor((rightW - GAP * (exprCols - 1)) / exprCols);
  const exprCellH = Math.floor((exprH - GAP * (exprRows - 1)) / exprRows);
  selection.expressionUrls.forEach((url, index) => {
    const col = index % exprCols;
    const row = Math.floor(index / exprCols);
    cells.push({
      slotId: `expr-${index}`,
      label: labels.expressions[index] || `表情 ${index + 1}`,
      url,
      x: rightX + col * (exprW + GAP),
      y: exprY + row * (exprCellH + GAP),
      w: col === exprCols - 1 ? rightX + rightW - (rightX + col * (exprW + GAP)) : exprW,
      h: row === exprRows - 1 ? exprY + exprH - (exprY + row * (exprCellH + GAP)) : exprCellH,
    });
  });

  return { width, height, margin: MARGIN, gap: GAP, header, cells };
}

// cover 裁切：把图片等比缩放填满格子，返回源图裁切矩形。
export function coverFitRect(imgW: number, imgH: number, cellW: number, cellH: number) {
  if (imgW <= 0 || imgH <= 0 || cellW <= 0 || cellH <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const scale = Math.max(cellW / imgW, cellH / imgH);
  const sw = cellW / scale;
  const sh = cellH / scale;
  return {
    sx: (imgW - sw) / 2,
    sy: (imgH - sh) / 2,
    sw,
    sh,
  };
}
