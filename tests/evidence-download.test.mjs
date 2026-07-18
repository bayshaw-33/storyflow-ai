import assert from "node:assert/strict";
import test from "node:test";

test("one-click evidence download creates a package then requests its signed URL", async () => {
  const { requestEvidencePackageDownload } = await import("../lib/evidence/download.ts");
  const requests = [];
  const fetcher = async (url, init = {}) => {
    requests.push({ url, init });
    if (url === "/api/evidence/packages") {
      return Response.json({ success: true, packageId: "package-1", status: "ready" });
    }
    return Response.json({ success: true, downloadUrl: "https://storage.test/signed.zip", expiresIn: 300 });
  };

  const result = await requestEvidencePackageDownload({
    fetcher,
    accessToken: "session-token",
    projectId: "project-1",
    sourceUnitId: "episode-1",
  });

  assert.deepEqual(result, {
    packageId: "package-1",
    downloadUrl: "https://storage.test/signed.zip",
    expiresIn: 300,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "/api/evidence/packages");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.Authorization, "Bearer session-token");
  assert.deepEqual(JSON.parse(requests[0].init.body), { projectId: "project-1", sourceUnitId: "episode-1" });
  assert.equal(requests[1].url, "/api/evidence/packages/package-1/download");
  assert.equal(requests[1].init.headers.Authorization, "Bearer session-token");
});

test("one-click evidence download surfaces the server error instead of failing silently", async () => {
  const { requestEvidencePackageDownload } = await import("../lib/evidence/download.ts");
  await assert.rejects(
    () => requestEvidencePackageDownload({
      fetcher: async () => Response.json({ success: false, error: "证据包生成失败。", code: "EVIDENCE_EMPTY_CASE" }, { status: 422 }),
      accessToken: "session-token",
      projectId: "project-1",
      sourceUnitId: "episode-1",
    }),
    /当前单集还没有可打包的制作记录，请先保存一次分镜或完成一次生成/,
  );
});

test("evidence ledger is enabled by default after the schema rollout and can be explicitly disabled", async () => {
  const { isEvidenceLedgerEnabled } = await import("../lib/evidence/feature-flags.ts");
  assert.equal(isEvidenceLedgerEnabled({}), true);
  assert.equal(isEvidenceLedgerEnabled({ EVIDENCE_LEDGER_ENABLED: "false" }), false);
  assert.equal(isEvidenceLedgerEnabled({ EVIDENCE_LEDGER_ENABLED: "0" }), false);
  assert.equal(isEvidenceLedgerEnabled({ EVIDENCE_LEDGER_ENABLED: "true" }), true);
});
