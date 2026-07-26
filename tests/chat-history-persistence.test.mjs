import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);
const projectsPath = new URL("../lib/projects.ts", import.meta.url);

test("creation workbench persists and restores a structured chat history", async () => {
  const [component, projects] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(projectsPath, "utf8"),
  ]);

  assert.match(projects, /export type CreationChatMessage/);
  assert.match(projects, /creationChatHistory\?: CreationChatMessage\[\]/);
  assert.match(component, /parseLegacyChatHistory/);
  assert.match(component, /readChatHistory/);
  assert.match(component, /chatProjectId/);
  assert.match(component, /creationChatHistory: messages/);
});
