import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("Universe 作品页接入真实继承状态、差异查看与采用操作", () => {
  const source = read("components/v2/universe/WorksPanel.tsx");
  assert.match(source, /fetchWorkInheritanceState/);
  assert.match(source, /fetchInheritanceDiff/);
  assert.match(source, /adoptInheritanceDiffs/);
  assert.match(source, /继承状态|Inheritance status/);
  assert.match(source, /查看变更|View changes/);
  assert.match(source, /采用变更|Adopt changes/);
});

test("V2.2 客户端兼容实际路由根级响应，并让 Context Packet 使用认证重试", async () => {
  const apiSource = read("lib/client/v2/universe/api.ts");
  const contextSource = apiSource.slice(apiSource.indexOf("export async function fetchContextPacket"));
  assert.match(apiSource, /body\.data !== undefined/);
  assert.match(contextSource, /const fetcher = authedFetchImpl/);

  const {
    fetchWorkInheritanceState,
    fetchInheritanceDiff,
    adoptInheritanceDiffs,
    fetchContextPacket,
  } = await import("../lib/client/v2/universe/api.ts");

  const manifest = {
    id: "manifest-1",
    work_id: "work-1",
    universe_id: "universe-1",
    universe_version_id: "version-1",
    universe_version_no: 1,
    relation: "canon_continuation",
    canon_policy: "strict",
    timeline_anchor_id: null,
    included_entity_version_ids: [],
    included_fact_version_ids: [],
    included_relationship_version_ids: [],
    included_timeline_event_version_ids: [],
    included_asset_version_ids: [],
    is_active: true,
    superseded_by: null,
    created_at: "2026-08-28T00:00:00Z",
  };
  const version = {
    id: "version-1",
    universe_id: "universe-1",
    version_no: 1,
    content_hash: "hash-1",
    created_at: "2026-08-28T00:00:00Z",
  };
  const fetchImpl = async (url) => {
    const pathname = new URL(url, "http://localhost").pathname;
    if (pathname.endsWith("/inheritance")) {
      return new Response(JSON.stringify({
        success: true,
        contractVersion: "2.2.0-alpha.1",
        manifest,
        universeVersion: version,
        latestUniverseVersion: version,
        isStale: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (pathname.endsWith("/inheritance/diff")) {
      return new Response(JSON.stringify({
        success: true,
        contractVersion: "2.2.0-alpha.1",
        workId: "work-1",
        currentManifestId: "manifest-1",
        currentUniverseVersionId: "version-1",
        latestUniverseVersionId: "version-1",
        isStale: false,
        diffs: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (pathname.endsWith("/inheritance/adopt")) {
      return new Response(JSON.stringify({
        success: true,
        contractVersion: "2.2.0-alpha.1",
        manifest,
        idempotent: true,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      packet: {
        workId: "work-1",
        workVersionId: "work-version-1",
        universeVersionId: "version-1",
        references: [],
        totalBytes: 0,
        budgetBytes: 8192,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const state = await fetchWorkInheritanceState("work-1", { fetchImpl });
  assert.equal(state.manifest?.id, "manifest-1");
  const diff = await fetchInheritanceDiff("work-1", { fetchImpl });
  assert.equal(diff.workId, "work-1");
  const adopted = await adoptInheritanceDiffs("work-1", { diffIds: [] }, { fetchImpl });
  assert.equal(adopted.manifest.id, "manifest-1");
  const packet = await fetchContextPacket("work-1", { fetchImpl, workVersionId: "work-version-1" });
  assert.equal(packet.workVersionId, "work-version-1");
});
