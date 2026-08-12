import type {
  Asset,
  AssetVersion,
  Actor,
  ChangeProposal,
  Character,
  EvidenceEvent,
  GenerationJob,
  InheritanceSnapshot,
  LicenseOffer,
  ModelDecision,
  Portrayal,
  Project,
  Universe,
  UniverseEntity,
  CanonFact,
  Relationship,
  TimelineEvent,
  UsageGrant,
} from "@/lib/contracts/v2";

export const contractTypeExamples: {
  universe: Universe;
  universeEntity: UniverseEntity;
  canonFact: CanonFact;
  relationship: Relationship;
  timelineEvent: TimelineEvent;
  project: Project;
  inheritanceSnapshot: InheritanceSnapshot;
  changeProposal: ChangeProposal;
  asset: Asset;
  assetVersion: AssetVersion;
  generationJob: GenerationJob;
  modelDecision: ModelDecision;
  actor: Actor;
  character: Character;
  portrayal: Portrayal;
  licenseOffer: LicenseOffer;
  usageGrant: UsageGrant;
  evidenceEvent: EvidenceEvent;
} | null = null;
