export type AudioUniverseBinding = {
  assetId: string;
  universeEntityId: string | null;
  projectId: string | null;
  role: "song" | "voice" | "sound_effect";
};

/** Public-safe binding metadata. Private Storage URLs stay in the asset table. */
export function buildAudioUniverseBinding(input: {
  assetId: string;
  universeEntityId?: string | null;
  projectId?: string | null;
  role: "song" | "voice" | "sound_effect";
}): AudioUniverseBinding {
  return {
    assetId: input.assetId,
    universeEntityId: input.universeEntityId || null,
    projectId: input.projectId || null,
    role: input.role,
  };
}
