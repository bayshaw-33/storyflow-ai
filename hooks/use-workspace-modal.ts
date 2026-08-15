"use client";

import { createContext, useContext } from "react";

export const POST_LOGIN_ACTION_KEY = "postLoginAction";
export const OPEN_WORKSPACE_MODAL_ACTION = "openModal";
export const OPEN_PROJECT_START_ACTION = "openProjectStart";

export type WorkspaceModalApi = {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  setOpen: (open: boolean) => void;
};

export const WorkspaceModalContext = createContext<WorkspaceModalApi | null>(null);

export function requestWorkspaceModalAfterLogin() {
  try {
    window.sessionStorage.setItem(POST_LOGIN_ACTION_KEY, OPEN_WORKSPACE_MODAL_ACTION);
  } catch {
    // sessionStorage is a convenience bridge only; auth must continue without it.
  }
}

export function requestProjectStartAfterLogin() {
  try {
    window.sessionStorage.setItem(POST_LOGIN_ACTION_KEY, OPEN_PROJECT_START_ACTION);
  } catch {
    // sessionStorage is a convenience bridge only; auth must continue without it.
  }
}

export function clearProjectStartPostLoginAction() {
  try {
    if (window.sessionStorage.getItem(POST_LOGIN_ACTION_KEY) === OPEN_PROJECT_START_ACTION) {
      window.sessionStorage.removeItem(POST_LOGIN_ACTION_KEY);
    }
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function hasProjectStartPostLoginAction() {
  try {
    return window.sessionStorage.getItem(POST_LOGIN_ACTION_KEY) === OPEN_PROJECT_START_ACTION;
  } catch {
    return false;
  }
}

export function clearWorkspaceModalPostLoginAction() {
  try {
    if (window.sessionStorage.getItem(POST_LOGIN_ACTION_KEY) === OPEN_WORKSPACE_MODAL_ACTION) {
      window.sessionStorage.removeItem(POST_LOGIN_ACTION_KEY);
    }
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function hasWorkspaceModalPostLoginAction() {
  try {
    return window.sessionStorage.getItem(POST_LOGIN_ACTION_KEY) === OPEN_WORKSPACE_MODAL_ACTION;
  } catch {
    return false;
  }
}

export function useWorkspaceModal() {
  const context = useContext(WorkspaceModalContext);
  if (!context) throw new Error("useWorkspaceModal must be used within <WorkspaceModalProvider>");
  return context;
}
