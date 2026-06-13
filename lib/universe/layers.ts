export type CreativeUniverseLayerId =
  | "universe-background"
  | "gravity-system"
  | "creative-field"
  | "ip-universe"
  | "control-layer"
  | "future-layer";

export type CreativeUniverseLayer = {
  id: CreativeUniverseLayerId;
  responsibility: string;
};

export const CREATIVE_UNIVERSE_LAYERS: CreativeUniverseLayer[] = [
  {
    id: "universe-background",
    responsibility: "Owns atmosphere and future visual background primitives.",
  },
  {
    id: "gravity-system",
    responsibility: "Owns KK companion center state and orbit system presence.",
  },
  {
    id: "creative-field",
    responsibility: "Hosts workflows, editors, outputs, and AI writers room surfaces.",
  },
  {
    id: "ip-universe",
    responsibility: "Hosts characters, canon, timeline, and other IP asset surfaces.",
  },
  {
    id: "control-layer",
    responsibility: "Hosts navigation, top-level controls, settings, and command surfaces.",
  },
  {
    id: "future-layer",
    responsibility: "Reserves architecture space for marketplace and expansion surfaces.",
  },
];
