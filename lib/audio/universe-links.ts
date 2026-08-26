export type AudioUniverseBinding = {
  assetId: string;
  universeEntityId: string | null;
  projectId: string | null;
  role: "song" | "voice";
};

/** Public-safe binding metadata. Private Storage URLs stay in the asset table. */
export function buildAudioUniverseBinding(input: {
  assetId: string;
  universeEntityId?: string | null;
  projectId?: string | null;
  role: "song" | "voice";
}): AudioUniverseBinding {
  return {
    assetId: input.assetId,
    universeEntityId: input.universeEntityId || null,
    projectId: input.projectId || null,
    role: input.role,
  };
}
