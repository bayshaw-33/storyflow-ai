import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerSource = readFileSync(
  new URL("../../../components/v2/kk/KkRuntimeProvider.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(new URL("../../../app/layout.tsx", import.meta.url), "utf8");

test("root KK provider resolves the browser session when no explicit token is supplied", () => {
  assert.match(layoutSource, /<KkRuntimeProvider\s+allowFixtureFallback>/);
  assert.match(providerSource, /import \{ getSupabaseBrowserClient \} from "@\/lib\/supabase\/client"/);
  assert.match(providerSource, /getSupabaseBrowserClient\(\)/);
  assert.match(providerSource, /client\.auth\s*\.getSession\(\)/);
  assert.match(providerSource, /client\.auth\.onAuthStateChange\(/);
  assert.match(providerSource, /const runtimeAccessToken = accessToken === undefined \? browserSession\.accessToken : accessToken/);
  assert.match(providerSource, /const sessionResolved = accessToken !== undefined \|\| browserSession\.resolved/);
});

test("all root KK live requests use the resolved runtime token", () => {
  assert.match(providerSource, /fetchKkRuntime\(runtimeAccessToken\)/);
  assert.match(providerSource, /fetchKkEvents\(runtimeAccessToken,/);
  assert.match(providerSource, /fetchKkMessages\(runtimeAccessToken\)/);
  assert.match(providerSource, /fetchKkJobMessages\(runtimeAccessToken\)/);
  assert.match(providerSource, /if \(!sessionResolved\) return;/);
});
