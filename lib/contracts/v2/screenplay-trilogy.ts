export type TrilogyStage = "world" | "character" | "outline";

export interface TrilogyUnitLike {
  id: string;
  type: string;
  title?: string;
  readiness: string;
  currentVersionId: string | null;
  finalizedVersionId: string | null;
  legacyId?: string | null;
}

export type TrilogyState =
  | { status: "ready"; stage: TrilogyStage; label: string; unitId?: string }
  | { status: "waiting_confirmation"; stage: TrilogyStage; unitId: string; label: string }
  | { status: "complete"; stage: null; label: string };

export const TRILOGY_STAGES: Array<{ stage: TrilogyStage; title: string; legacyId: string; generateLabel: string; reviewLabel: string }> = [
  { stage: "world", title: "背景及世界观", legacyId: "kk-trilogy:world", generateLabel: "生成背景及世界观", reviewLabel: "查看并确认背景及世界观" },
  { stage: "character", title: "角色圣经", legacyId: "kk-trilogy:character", generateLabel: "生成角色圣经", reviewLabel: "查看并确认角色圣经" },
  { stage: "outline", title: "剧情及大纲", legacyId: "kk-trilogy:outline", generateLabel: "生成剧情及大纲", reviewLabel: "查看并确认剧情及大纲" },
];

export function resolveTrilogyState(units: TrilogyUnitLike[]): TrilogyState {
  for (const item of TRILOGY_STAGES) {
    const unit = findTrilogyUnit(units, item.stage);
    if (!unit?.currentVersionId) {
      return {
        status: "ready",
        stage: item.stage,
        label: item.generateLabel,
        ...(unit ? { unitId: unit.id } : {}),
      };
    }
    if (!isConfirmed(unit)) {
      return {
        status: "waiting_confirmation",
        stage: item.stage,
        unitId: unit.id,
        label: item.reviewLabel,
      };
    }
  }
  return { status: "complete", stage: null, label: "项目背景三件套已完成" };
}

export function findTrilogyUnit(units: TrilogyUnitLike[], stage: TrilogyStage): TrilogyUnitLike | undefined {
  const definition = TRILOGY_STAGES.find((item) => item.stage === stage);
  return units.find((candidate) => candidate.type === stage && (
    candidate.legacyId === definition?.legacyId
    || candidate.title === definition?.title
    || (stage !== "character" && !candidate.legacyId)
  ));
}

function isConfirmed(unit: TrilogyUnitLike): boolean {
  return (unit.readiness === "checkpoint" || unit.readiness === "finalized")
    && Boolean(unit.finalizedVersionId);
}
