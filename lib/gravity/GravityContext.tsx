"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { WRITERS_ROOM_ROLES, type WriterActivityState, type WriterRoomRoleId } from "@/lib/universe/writersRoom";

export type GravityProjectFocus = {
  projectId: string;
  title: string;
  workflowType?: "creation" | "continuation";
} | null;

export type GravityWorkflowProgress = {
  currentStepKey: string | null;
  completedSteps: number;
  totalSteps: number;
};

export type GravityWriterState = {
  roleId: WriterRoomRoleId;
  state: WriterActivityState;
  currentTask: string | null;
};

export type GravityState = {
  companion: {
    id: "kk";
    name: "KK";
    role: "gravity-core";
    state: "resting" | "focused" | "supporting";
  };
  projectFocus: GravityProjectFocus;
  workflowProgress: GravityWorkflowProgress;
  writers: GravityWriterState[];
  updatedAt: string;
};

export type GravityContextValue = {
  state: GravityState;
  setProjectFocus: (focus: GravityProjectFocus) => void;
  setWorkflowProgress: (progress: Partial<GravityWorkflowProgress>) => void;
  setWriterState: (roleId: WriterRoomRoleId, nextState: Partial<Omit<GravityWriterState, "roleId">>) => void;
  resetGravity: () => void;
};

function createInitialGravityState(): GravityState {
  return {
    companion: {
      id: "kk",
      name: "KK",
      role: "gravity-core",
      state: "resting",
    },
    projectFocus: null,
    workflowProgress: {
      currentStepKey: null,
      completedSteps: 0,
      totalSteps: 0,
    },
    writers: WRITERS_ROOM_ROLES.map((role) => ({
      roleId: role.id,
      state: "idle",
      currentTask: null,
    })),
    updatedAt: new Date(0).toISOString(),
  };
}

const GravityContext = createContext<GravityContextValue | null>(null);

export function GravityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GravityState>(() => createInitialGravityState());

  const touch = useCallback((next: Omit<GravityState, "updatedAt">): GravityState => {
    return { ...next, updatedAt: new Date().toISOString() };
  }, []);

  const setProjectFocus = useCallback(
    (projectFocus: GravityProjectFocus) => {
      setState((current) =>
        touch({
          ...current,
          companion: {
            ...current.companion,
            state: projectFocus ? "focused" : "resting",
          },
          projectFocus,
        }),
      );
    },
    [touch],
  );

  const setWorkflowProgress = useCallback(
    (progress: Partial<GravityWorkflowProgress>) => {
      setState((current) =>
        touch({
          ...current,
          workflowProgress: {
            ...current.workflowProgress,
            ...progress,
          },
        }),
      );
    },
    [touch],
  );

  const setWriterState = useCallback(
    (roleId: WriterRoomRoleId, nextState: Partial<Omit<GravityWriterState, "roleId">>) => {
      setState((current) =>
        touch({
          ...current,
          companion: {
            ...current.companion,
            state: nextState.state && nextState.state !== "idle" ? "supporting" : current.companion.state,
          },
          writers: current.writers.map((writer) =>
            writer.roleId === roleId ? { ...writer, ...nextState } : writer,
          ),
        }),
      );
    },
    [touch],
  );

  const resetGravity = useCallback(() => setState(createInitialGravityState()), []);

  const value = useMemo(
    () => ({
      state,
      setProjectFocus,
      setWorkflowProgress,
      setWriterState,
      resetGravity,
    }),
    [resetGravity, setProjectFocus, setWorkflowProgress, setWriterState, state],
  );

  return <GravityContext.Provider value={value}>{children}</GravityContext.Provider>;
}

export function useGravity() {
  const value = useContext(GravityContext);
  if (!value) {
    throw new Error("useGravity must be used inside GravityProvider");
  }
  return value;
}
