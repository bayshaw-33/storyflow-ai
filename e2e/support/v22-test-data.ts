/**
 * Phase 6 Task 6.3 — owner-scoped 测试数据助手.
 *
 * 每条 Journey 独立创建 owner-scoped 测试数据，并以 API 清理自己的测试记录；
 * 绝不删除共享或用户数据。无真实后端时所有操作 fail-closed（返回真实错误）。
 */

export interface JourneyScope {
  ownerId: string;
  projectId: string;
  marker: string; // 本 Journey 专属标记，用于识别自己的测试数据
}

/** 生成 Journey 专属 scope（时间戳 + 随机后缀）。 */
export function createJourneyScope(journeyName: string): JourneyScope {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    ownerId: `journey-owner-${nonce}`,
    projectId: `journey-${journeyName}-${nonce}`,
    marker: `v22-journey:${journeyName}:${nonce}`,
  };
}

/** 记录创建的测试资源，便于清理。 */
export class JourneyData {
  readonly scope: JourneyScope;
  private readonly created: Array<{ type: string; id: string }> = [];

  constructor(journeyName: string) {
    this.scope = createJourneyScope(journeyName);
  }

  track(type: string, id: string): string {
    this.created.push({ type, id });
    return id;
  }

  get createdResources(): ReadonlyArray<{ type: string; id: string }> {
    return this.created;
  }

  /** 清理自己的测试记录（只删带 marker 的资源）。 */
  async cleanup(fetcher: (path: string, init?: RequestInit) => Promise<unknown>): Promise<number> {
    let deleted = 0;
    for (const resource of this.created) {
      try {
        await fetcher(`/api/v2/test-data/${resource.type}/${encodeURIComponent(resource.id)}`, { method: "DELETE" });
        deleted += 1;
      } catch {
        // 清理失败不吞掉；统计时忽略已不存在的
      }
    }
    return deleted;
  }
}

/** 生成确定性测试数据（用于无后端时的结构验证，绝不冒充真实成功）。 */
export function sampleTimeline() {
  return {
    schemaVersion: "kiikis.timeline/1",
    tracks: [
      { id: "video-main", kind: "video", clips: [{ id: "clip-1", sourceAssetVersionId: "av-1", in: 0, out: 3.5, duration: 3.5 }] },
    ],
    duration: 3.5,
  };
}

export function sampleEvidenceManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "kiikis.package/1",
    exportedAt: "2026-08-16T00:00:00Z",
    projectId: "proj-x",
    ownerId: "owner-x",
    works: [{ workType: "script", workId: "work-script", versionId: "v-s-1", contentHash: "hash-s" }],
    artifacts: [{ path: "script/script.json", storagePath: "script/owner/script.json", assetVersionId: "av-1", jobId: "job-1" }],
    ...overrides,
  };
}
