export type WriterRoomRoleId =
  | "story-architect"
  | "character-designer"
  | "script-doctor"
  | "market-analyst"
  | "visual-director";

export type WriterRoomRole = {
  id: WriterRoomRoleId;
  name: string;
  responsibility: string;
};

export type WriterActivityState = "idle" | "reading" | "thinking" | "writing" | "blocked";

export const WRITERS_ROOM_ROLES: WriterRoomRole[] = [
  {
    id: "story-architect",
    name: "Story Architect",
    responsibility: "Owns structure, premise, theme, and story system coherence.",
  },
  {
    id: "character-designer",
    name: "Character Designer",
    responsibility: "Owns character motivation, relationships, arcs, and emotional contrast.",
  },
  {
    id: "script-doctor",
    name: "Script Doctor",
    responsibility: "Owns scene pressure, dialogue clarity, pacing, and rewrite diagnosis.",
  },
  {
    id: "market-analyst",
    name: "Market Analyst",
    responsibility: "Owns market fit, audience expectation, trope leverage, and positioning.",
  },
  {
    id: "visual-director",
    name: "Visual Director",
    responsibility: "Owns cinematic image, shot logic, mood, and production-facing visual intent.",
  },
];
