// 短剧流 fixture 数据（TS 内联，K2-T-08）。
// 不用 dynamic import JSON，避免 Next.js webpack 不打包 tests/ 导致浏览器端加载失败。
// JSON 文件 tests/fixtures/kiikis-v2/short-drama.json 作为集成校验依据，须与此处内联数据一致。
// 防漂移：tests/ui-v2/short-drama-flow/short-drama-flow.test.mjs 会断言两者一致。
//
// 样板项目：样板短剧 EP01，处于美术阶段（art=current）。
// 剧本阶段已完成（角色/场景/道具候选已确认），美术阶段进行中（部分母版已锁定主版本，部分待生成）。
// 分镜/视频/导出阶段锁定，含预览内容（帧/镜头未确认，因阶段未解锁）。

import type { ShortDramaData } from "./types.ts";
import { CONTRACT_VERSION } from "./types.ts";

/**
 * 默认短剧流 fixture：样板短剧 EP01。
 *
 * 覆盖：
 * - 5 阶段状态机（completed/current/locked）
 * - 剧本分析候选 + 用户确认（角色/场景/道具）
 * - 美术资产多版本 + 主版本锁定
 * - 跨阶段资产传递（assetFlow 记录候选流经阶段）
 * - 回流候选（proposals，剧本完成生成的 pending_review 候选）
 * - 中断恢复点（recoveryPoint）
 */
export const shortDramaFixture: ShortDramaData = {
  contractVersion: CONTRACT_VERSION,
  project: {
    id: "proj-drama-ep01",
    title: "样板短剧 EP01",
    workflowType: "drama",
    currentStage: "art",
    lastSavedAt: "2026-08-12T16:20:00+08:00",
  },
  universeBinding: {
    bound: true,
    universeId: "uni-demo",
    universeName: "样板宇宙",
  },
  stages: {
    // 剧本阶段：已完成。剧本原文 + AI 结构分析候选 + 用户确认。
    script: {
      status: "completed",
      script:
        "EP01 海边咖啡馆\n\n林晚坐在窗边，手指摩挲着银色怀表的边缘。苏河推门进来，带进一阵雨气。\n\n林晚：你又迟到了。\n苏河：路上买了点东西。（递过旧信件）这个，我觉得你该看看。\n\n林晚接过信件，怀表在桌上轻轻震动。咖啡馆外，雨夜街角的灯忽明忽暗。",
      analysis: {
        characters: [
          { id: "char-linwan", name: "林晚", kind: "character", summary: "女主角，海边咖啡馆常客，随身携带银色怀表" },
          { id: "char-suhe", name: "苏河", kind: "character", summary: "男主角，雨夜到访，带来旧信件" },
        ],
        scenes: [
          { id: "scene-cafe", name: "海边咖啡馆", kind: "scene", summary: "窗边位置，雨夜，窗外可见街角灯光" },
          { id: "scene-street", name: "雨夜街角", kind: "scene", summary: "咖啡馆外，灯光忽明忽暗" },
        ],
        props: [
          { id: "prop-watch", name: "银色怀表", kind: "prop", summary: "林晚随身物品，会轻微震动" },
          { id: "prop-letter", name: "旧信件", kind: "prop", summary: "苏河带来的信件" },
        ],
      },
      confirmed: {
        characterIds: ["char-linwan", "char-suhe"],
        sceneIds: ["scene-cafe", "scene-street"],
        propIds: ["prop-watch", "prop-letter"],
      },
    },
    // 美术阶段：当前。部分资产已锁定主版本，部分待生成。
    art: {
      status: "current",
      assets: [
        {
          id: "art-linwan",
          name: "林晚 角色立绘",
          type: "character",
          sourceCandidateId: "char-linwan",
          versions: [
            { id: "art-linwan-v1", url: "/assets/art/linwan-v1.png", locked: false },
            { id: "art-linwan-v2", url: "/assets/art/linwan-v2.png", locked: true },
          ],
          mainVersionId: "art-linwan-v2",
        },
        {
          id: "art-cafe",
          name: "海边咖啡馆 场景",
          type: "scene",
          sourceCandidateId: "scene-cafe",
          versions: [
            { id: "art-cafe-v1", url: "/assets/art/cafe-v1.png", locked: true },
          ],
          mainVersionId: "art-cafe-v1",
        },
        {
          id: "art-suhe",
          name: "苏河 角色立绘",
          type: "character",
          sourceCandidateId: "char-suhe",
          versions: [
            { id: "art-suhe-v1", url: "/assets/art/suhe-v1.png", locked: false },
          ],
          mainVersionId: null,
        },
      ],
      // 银色怀表、旧信件、雨夜街角尚未生成美术母版，待确认。
      pendingConfirm: [
        { id: "prop-watch", name: "银色怀表", kind: "prop", summary: "林晚随身物品，会轻微震动" },
        { id: "prop-letter", name: "旧信件", kind: "prop", summary: "苏河带来的信件" },
        { id: "scene-street", name: "雨夜街角", kind: "scene", summary: "咖啡馆外，灯光忽明忽暗" },
      ],
    },
    // 分镜阶段：锁定。含预览帧（未确认，因阶段未解锁）。
    storyboard: {
      status: "locked",
      frames: [
        { id: "frame-001", sceneRef: "scene-cafe", shotDescription: "林晚窗边摩挲怀表，窗外雨夜", confirmed: false },
        { id: "frame-002", sceneRef: "scene-cafe", shotDescription: "苏河推门进入，带进雨气", confirmed: false },
      ],
    },
    // 视频阶段：锁定。含 pending 镜头（未渲染，因阶段未解锁）。
    video: {
      status: "locked",
      shots: [
        { id: "shot-frame-001", frameRef: "frame-001", status: "pending" },
        { id: "shot-frame-002", frameRef: "frame-002", status: "pending" },
      ],
    },
    // 导出阶段：锁定。无导出包。
    export: {
      status: "locked",
      packages: [],
    },
  },
  // 资产流动记录：确认候选流经的阶段。
  assetFlow: [
    { candidateId: "char-linwan", name: "林晚", kind: "character", flow: ["script", "art"] },
    { candidateId: "char-suhe", name: "苏河", kind: "character", flow: ["script", "art"] },
    { candidateId: "scene-cafe", name: "海边咖啡馆", kind: "scene", flow: ["script", "art"] },
    { candidateId: "scene-street", name: "雨夜街角", kind: "scene", flow: ["script"] },
    { candidateId: "prop-watch", name: "银色怀表", kind: "prop", flow: ["script"] },
    { candidateId: "prop-letter", name: "旧信件", kind: "prop", flow: ["script"] },
  ],
  // 回流候选：剧本阶段完成后生成的 Universe Change Proposal（pending_review，不自动改写 Canon）。
  proposals: [
    {
      id: "prop-proj-drama-ep01-char-linwan",
      universeId: "uni-demo",
      sourceProjectId: "proj-drama-ep01",
      sourceStage: "script",
      status: "pending_review",
      confidence: 0.8,
      fieldDiffs: [
        { path: "entities.character.林晚", before: null, after: "女主角，海边咖啡馆常客，随身携带银色怀表" },
      ],
      createdAt: "2026-08-12T16:20:00+08:00",
    },
    {
      id: "prop-proj-drama-ep01-char-suhe",
      universeId: "uni-demo",
      sourceProjectId: "proj-drama-ep01",
      sourceStage: "script",
      status: "pending_review",
      confidence: 0.8,
      fieldDiffs: [
        { path: "entities.character.苏河", before: null, after: "男主角，雨夜到访，带来旧信件" },
      ],
      createdAt: "2026-08-12T16:20:00+08:00",
    },
  ],
  // 中断恢复点：当前在美术阶段，已确认资产集合。
  recoveryPoint: {
    stage: "art",
    confirmedAssets: {
      characterIds: ["char-linwan", "char-suhe"],
      sceneIds: ["scene-cafe", "scene-street"],
      propIds: ["prop-watch", "prop-letter"],
    },
    lastSavedAt: "2026-08-12T16:20:00+08:00",
  },
};
