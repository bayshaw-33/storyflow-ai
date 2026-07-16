"use client";

import { useCallback, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  ProductionProjectState,
  ProductionShot,
  ProductionSourceFile,
} from "./types";

const AUTH_REQUIRED_MESSAGE = "请先登录后再使用此功能。";

type ProductionSession = Session | null;

function getAccessToken(session: ProductionSession): string {
  const token = session?.access_token;
  if (!token) {
    throw new Error(AUTH_REQUIRED_MESSAGE);
  }
  return token;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

type TimedController = {
  controller: AbortController;
  cancel: () => void;
};

function createTimeoutController(timeoutMs: number): TimedController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Allow the timer to be unref'd in Node-like environments without breaking browsers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (timer as any)?.unref?.();
  return {
    controller,
    cancel: () => clearTimeout(timer),
  };
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function friendlyNetworkError(error: unknown, fallback: string): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error("请求超时，请稍后再试。");
  }
  if (error instanceof Error) {
    return new Error(fallback || error.message);
  }
  return new Error(fallback);
}

/* ------------------------------------------------------------------ */
/* useProductionSync                                                   */
/* ------------------------------------------------------------------ */

type SaveStateResponse = {
  success: boolean;
  state?: ProductionProjectState;
  error?: string;
};

export function useProductionSync(
  session: ProductionSession,
  projectId: string,
): {
  saveToCloud: (state: ProductionProjectState) => Promise<ProductionProjectState>;
  loadFromCloud: () => Promise<ProductionProjectState | null>;
  saving: boolean;
  loading: boolean;
  error: string | null;
} {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveToCloud = useCallback(
    async (state: ProductionProjectState): Promise<ProductionProjectState> => {
      const token = getAccessToken(session);
      setSaving(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(30_000);
      try {
        const response = await fetch("/api/production/save-state", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, mode: "save", state }),
        });
        const payload = (await parseJsonSafely(response)) as SaveStateResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "保存失败，请稍后再试。";
          throw new Error(message);
        }
        return payload.state ?? state;
      } catch (err) {
        const friendly = friendlyNetworkError(err, "保存失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setSaving(false);
      }
    },
    [session, projectId],
  );

  const loadFromCloud = useCallback(async (): Promise<ProductionProjectState | null> => {
    const token = getAccessToken(session);
    setLoading(true);
    setError(null);
    const { controller, cancel } = createTimeoutController(30_000);
    try {
      const response = await fetch("/api/production/save-state", {
        method: "POST",
        headers: buildHeaders(token),
        signal: controller.signal,
        body: JSON.stringify({ projectId, mode: "load" }),
      });
      const payload = (await parseJsonSafely(response)) as SaveStateResponse | null;
      if (!response.ok || !payload?.success) {
        const message = payload?.error || "加载失败，请稍后再试。";
        throw new Error(message);
      }
      return payload.state ?? null;
    } catch (err) {
      const friendly = friendlyNetworkError(err, "加载失败，请稍后再试。");
      setError(friendly.message);
      throw friendly;
    } finally {
      cancel();
      setLoading(false);
    }
  }, [session, projectId]);

  return { saveToCloud, loadFromCloud, saving, loading, error };
}

/* ------------------------------------------------------------------ */
/* useProductionChat                                                   */
/* ------------------------------------------------------------------ */

type StoryboardChatResponse = {
  success: boolean;
  reply: string;
  shots: ProductionShot[];
  error?: string;
};

export function useProductionChat(
  session: ProductionSession,
  projectId: string,
): {
  send: (
    message: string,
    currentState: ProductionProjectState,
  ) => Promise<{ reply: string; shots: ProductionShot[] }>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (
      message: string,
      currentState: ProductionProjectState,
    ): Promise<{ reply: string; shots: ProductionShot[] }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const response = await fetch("/api/production/storyboard-chat", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, message, state: currentState }),
        });
        const payload = (await parseJsonSafely(response)) as StoryboardChatResponse | null;
        if (!response.ok || !payload?.success) {
          const errorMessage = payload?.error || "对话失败，请稍后再试。";
          throw new Error(errorMessage);
        }
        return {
          reply: payload.reply ?? "",
          shots: payload.shots ?? [],
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "对话失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { send, loading, error };
}

/* ------------------------------------------------------------------ */
/* useShotImage                                                        */
/* ------------------------------------------------------------------ */

type GenerateShotImageResponse = {
  success: boolean;
  imageUrl: string;
  status: string;
  provider: string;
  model: string;
  error?: string;
};

export function useShotImage(
  session: ProductionSession,
  projectId: string,
): {
  generate: (
    shotId: string,
  ) => Promise<{ imageUrl: string; status: string; provider: string; model: string }>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (
      shotId: string,
    ): Promise<{ imageUrl: string; status: string; provider: string; model: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const response = await fetch("/api/production/generate-shot-image", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId }),
        });
        const payload = (await parseJsonSafely(response)) as GenerateShotImageResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "图片生成失败，请稍后再试。";
          throw new Error(message);
        }
        return {
          imageUrl: payload.imageUrl,
          status: payload.status,
          provider: payload.provider,
          model: payload.model,
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "图片生成失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { generate, loading, error };
}

/* ------------------------------------------------------------------ */
/* useShotVideo                                                        */
/* ------------------------------------------------------------------ */

type GenerateShotVideoResponse = {
  success: boolean;
  taskId: string;
  status: string;
  error?: string;
};

type VideoStatusResponse = {
  success: boolean;
  status: string;
  videoUrl?: string;
  error?: string;
};

export function useShotVideo(
  session: ProductionSession,
  projectId: string,
): {
  generate: (shotId: string) => Promise<{ taskId: string; status: string }>;
  pollStatus: (shotId: string) => Promise<{ status: string; videoUrl?: string }>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (shotId: string): Promise<{ taskId: string; status: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const response = await fetch("/api/production/generate-shot-video", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId }),
        });
        const payload = (await parseJsonSafely(response)) as GenerateShotVideoResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "视频生成请求失败，请稍后再试。";
          throw new Error(message);
        }
        return { taskId: payload.taskId, status: payload.status };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "视频生成请求失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  const pollStatus = useCallback(
    async (shotId: string): Promise<{ status: string; videoUrl?: string }> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(30_000);
      try {
        const response = await fetch("/api/production/video-status", {
          method: "POST",
          headers: buildHeaders(token),
          signal: controller.signal,
          body: JSON.stringify({ projectId, shotId }),
        });
        const payload = (await parseJsonSafely(response)) as VideoStatusResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "视频状态查询失败，请稍后再试。";
          throw new Error(message);
        }
        return {
          status: payload.status,
          videoUrl: payload.videoUrl,
        };
      } catch (err) {
        const friendly = friendlyNetworkError(err, "视频状态查询失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { generate, pollStatus, loading, error };
}

/* ------------------------------------------------------------------ */
/* useSourceFileUpload                                                 */
/* ------------------------------------------------------------------ */

type SourceFileResponse = {
  success: boolean;
  sourceFile: ProductionSourceFile;
  error?: string;
};

export function useSourceFileUpload(
  session: ProductionSession,
  projectId: string,
): {
  upload: (file: File) => Promise<ProductionSourceFile>;
  loading: boolean;
  error: string | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<ProductionSourceFile> => {
      const token = getAccessToken(session);
      setLoading(true);
      setError(null);
      const { controller, cancel } = createTimeoutController(75_000);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const url = `/api/production/source-file?projectId=${encodeURIComponent(projectId)}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          body: formData,
        });
        const payload = (await parseJsonSafely(response)) as SourceFileResponse | null;
        if (!response.ok || !payload?.success) {
          const message = payload?.error || "文件上传失败，请稍后再试。";
          throw new Error(message);
        }
        return payload.sourceFile;
      } catch (err) {
        const friendly = friendlyNetworkError(err, "文件上传失败，请稍后再试。");
        setError(friendly.message);
        throw friendly;
      } finally {
        cancel();
        setLoading(false);
      }
    },
    [session, projectId],
  );

  return { upload, loading, error };
}

/* ------------------------------------------------------------------ */
/* useProductionApi (combined)                                         */
/* ------------------------------------------------------------------ */

export function useProductionApi(
  session: ProductionSession,
  projectId: string,
): {
  sync: ReturnType<typeof useProductionSync>;
  chat: ReturnType<typeof useProductionChat>;
  image: ReturnType<typeof useShotImage>;
  video: ReturnType<typeof useShotVideo>;
  upload: ReturnType<typeof useSourceFileUpload>;
} {
  const sync = useProductionSync(session, projectId);
  const chat = useProductionChat(session, projectId);
  const image = useShotImage(session, projectId);
  const video = useShotVideo(session, projectId);
  const upload = useSourceFileUpload(session, projectId);

  return { sync, chat, image, video, upload };
}
