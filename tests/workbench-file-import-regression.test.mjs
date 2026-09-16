import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("统一分镜工作台上传剧本必须走服务端解析并携带当前登录态", async () => {
  const source = await read("components/production/ProductionWorkbench.tsx");
  assert.match(source, /async function handleFileUpload\(file: File\)/);
  assert.match(source, /fetchWithAuthRetry\("\/api\/production\/source-file"/);
  assert.match(source, /<ScriptInputPanel[\s\S]*onUploadFile=\{\(file\) => void handleFileUpload\(file\)\}[\s\S]*onAnalyze=\{\(\) => void analyzeScript\("full"\)\}/);
});

test("美术工作台资料上传必须使用带鉴权重试的解析请求", async () => {
  const source = await read("components/art/ArtWorkbench.tsx");
  assert.match(source, /fetchWithAuthRetry\("\/api\/files\/parse"/);
});

test("分镜和美术上传入口允许常用文本与办公文件格式", async () => {
  const storyboard = await read("components/production/StoryboardPanels.tsx");
  const art = await read("components/art/ArtWorkbench.tsx");
  for (const source of [storyboard, art]) {
    assert.match(source, /\.txt/);
    assert.match(source, /\.docx/);
    assert.match(source, /\.pdf/);
    assert.match(source, /\.xlsx/);
  }
});
