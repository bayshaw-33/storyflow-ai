"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type IPCharacter = {
  id: string;
  name: string;
  role: string;
  universeId?: string | null;
  sourceProjectId?: string | null;
};

export type CanonFact = {
  id: string;
  subject: string;
  fact: string;
  confidence: "draft" | "confirmed" | "locked";
  universeId?: string | null;
  sourceProjectId?: string | null;
};

export type TimelineEvent = {
  id: string;
  title: string;
  order: number;
  description: string;
  universeId?: string | null;
  sourceProjectId?: string | null;
};

export type IPUniverseState = {
  characters: IPCharacter[];
  canon: CanonFact[];
  timeline: TimelineEvent[];
  activeUniverseId: string | null;
  updatedAt: string;
};

export type IPUniverseContextValue = {
  state: IPUniverseState;
  setActiveUniverse: (universeId: string | null) => void;
  upsertCharacter: (character: IPCharacter) => void;
  upsertCanonFact: (fact: CanonFact) => void;
  upsertTimelineEvent: (event: TimelineEvent) => void;
  resetIPUniverse: () => void;
};

const initialIPUniverseState: IPUniverseState = {
  characters: [],
  canon: [],
  timeline: [],
  activeUniverseId: null,
  updatedAt: new Date(0).toISOString(),
};

const IPUniverseContext = createContext<IPUniverseContextValue | null>(null);

export function IPUniverseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IPUniverseState>(initialIPUniverseState);

  const setActiveUniverse = useCallback((activeUniverseId: string | null) => {
    setState((current) => ({
      ...current,
      activeUniverseId,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const upsertCharacter = useCallback((character: IPCharacter) => {
    setState((current) => ({
      ...current,
      characters: [...current.characters.filter((item) => item.id !== character.id), character],
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const upsertCanonFact = useCallback((fact: CanonFact) => {
    setState((current) => ({
      ...current,
      canon: [...current.canon.filter((item) => item.id !== fact.id), fact],
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const upsertTimelineEvent = useCallback((event: TimelineEvent) => {
    setState((current) => ({
      ...current,
      timeline: [...current.timeline.filter((item) => item.id !== event.id), event].sort((a, b) => a.order - b.order),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const resetIPUniverse = useCallback(() => setState(initialIPUniverseState), []);

  const value = useMemo(
    () => ({
      state,
      setActiveUniverse,
      upsertCharacter,
      upsertCanonFact,
      upsertTimelineEvent,
      resetIPUniverse,
    }),
    [resetIPUniverse, setActiveUniverse, state, upsertCanonFact, upsertCharacter, upsertTimelineEvent],
  );

  return <IPUniverseContext.Provider value={value}>{children}</IPUniverseContext.Provider>;
}

export function useIPUniverse() {
  const value = useContext(IPUniverseContext);
  if (!value) {
    throw new Error("useIPUniverse must be used inside IPUniverseProvider");
  }
  return value;
}
