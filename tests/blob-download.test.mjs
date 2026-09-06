import assert from "node:assert/strict";
import test from "node:test";

import { downloadBlob } from "../lib/client/download.ts";

test("downloadBlob: attaches the link and does not revoke the object URL synchronously", async () => {
  const originalDocument = globalThis.document;
  const originalURL = globalThis.URL;
  const originalSetTimeout = globalThis.setTimeout;
  const links = [];
  const revoked = [];
  const scheduled = [];

  globalThis.document = {
    body: {
      appendChild(link) { links.push(link); },
    },
    createElement() {
      return {
        click() { this.clicked = true; },
        remove() { this.removed = true; },
      };
    },
  };
  globalThis.URL = {
    createObjectURL() { return "blob:test"; },
    revokeObjectURL(url) { revoked.push(url); },
  };
  globalThis.setTimeout = (callback, delay) => {
    scheduled.push({ callback, delay });
    return 1;
  };

  try {
    downloadBlob(new Blob(["hello"], { type: "text/plain" }), "draft.txt");
    assert.equal(links.length, 1);
    assert.equal(links[0].href, "blob:test");
    assert.equal(links[0].download, "draft.txt");
    assert.equal(links[0].clicked, true);
    assert.equal(links[0].removed, true);
    assert.deepEqual(revoked, []);
    assert.equal(scheduled.length, 1);
    assert.ok(scheduled[0].delay >= 1000);

    scheduled[0].callback();
    assert.deepEqual(revoked, ["blob:test"]);
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalURL;
    globalThis.setTimeout = originalSetTimeout;
  }
});
