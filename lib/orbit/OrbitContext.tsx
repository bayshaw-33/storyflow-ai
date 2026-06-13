"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DramaProject } from "@/lib/projects";
import {
  mapProjectToOrbitNode,
  mapWorkflowStepsToOrbitPath,
  type OrbitNode,
  type OrbitPathStep,
  type OrbitVisualState,
} from "@/lib/orbit/orbitModel";

export type OrbitState = {
  nodes: OrbitNode[];
  pathsByProjectId: Record<string, OrbitPathStep[]>;
  focusedProjectId: string | null;
  focusedStepKey: string | null;
  updatedAt: string;
};

export type OrbitContextValue = {
  state: OrbitState;
  registerProjects: (projects: DramaProject[]) => void;
  focusProjectOrbit: (projectId: string | null) => void;
  focusWorkflowStep: (stepKey: string | null) => void;
  setNodeVisualState: (projectId: string, visualState: OrbitVisualState) => void;
};

const initialOrbitState: OrbitState = {
  nodes: [],
  pathsByProjectId: {},
  focusedProjectId: null,
  focusedStepKey: null,
  updatedAt: new Date(0).toISOString(),
};

const OrbitContext = createContext<OrbitContextValue | null>(null);

export function OrbitProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrbitState>(initialOrbitState);

  const registerProjects = useCallback((projects: DramaProject[]) => {
    setState((current) => {
      const pathsByProjectId = projects.reduce<Record<string, OrbitPathStep[]>>((acc, project) => {
        acc[project.id] = mapWorkflowStepsToOrbitPath(
          project,
          current.focusedProjectId === project.id ? current.focusedStepKey : null,
        );
        return acc;
      }, {});

      return {
        ...current,
        nodes: projects.map((project) => mapProjectToOrbitNode(project, current.focusedProjectId)),
        pathsByProjectId,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const focusProjectOrbit = useCallback((projectId: string | null) => {
    setState((current) => ({
      ...current,
      focusedProjectId: projectId,
      nodes: current.nodes.map((node) => ({
        ...node,
        visualState: node.projectId === projectId ? "focused" : node.visualState === "focused" ? "dormant" : node.visualState,
      })),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const focusWorkflowStep = useCallback((stepKey: string | null) => {
    setState((current) => {
      const focusedProjectId = current.focusedProjectId;

      return {
        ...current,
        focusedStepKey: stepKey,
        pathsByProjectId: Object.fromEntries(
          Object.entries(current.pathsByProjectId).map(([projectId, steps]) => [
            projectId,
            steps.map((step) => ({
              ...step,
              visualState:
                projectId === focusedProjectId && step.stepKey === stepKey
                  ? "focused"
                  : step.visualState === "focused"
                    ? "dormant"
                    : step.visualState,
            })),
          ]),
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const setNodeVisualState = useCallback((projectId: string, visualState: OrbitVisualState) => {
    setState((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.projectId === projectId ? { ...node, visualState } : node)),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      registerProjects,
      focusProjectOrbit,
      focusWorkflowStep,
      setNodeVisualState,
    }),
    [focusProjectOrbit, focusWorkflowStep, registerProjects, setNodeVisualState, state],
  );

  return <OrbitContext.Provider value={value}>{children}</OrbitContext.Provider>;
}

export function useOrbit() {
  const value = useContext(OrbitContext);
  if (!value) {
    throw new Error("useOrbit must be used inside OrbitProvider");
  }
  return value;
}
