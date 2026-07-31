import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/novel-workbench/page.tsx", import.meta.url);
const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);
const cssPath = new URL("../app/globals.css", import.meta.url);

test("uses the exact seven-stage creation workflow", async () => {
  const page = await readFile(pagePath, "utf8");
  const component = await readFile(componentPath, "utf8");
  const stageBlock = component.match(/const STAGES:[\s\S]*?\];/)?.[0] || component;
  const labels = ["背景及世界观", "角色圣经", "剧情及大纲", "正文", "翻译", "本土化及雷同查验", "导出"];
  let last = -1;
  for (const label of labels) {
    const index = stageBlock.indexOf(label);
    assert.ok(index > last, `${label} should follow the previous stage`);
    last = index;
  }
  assert.doesNotMatch(stageBlock, /7 阶段小说流程|完整 AI 生成序列|按指令修改章节|小说转剧本/);
});

test("provides localized chat, uploads, mode languages, and per-unit controls", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /creation_development_chat/);
  assert.match(source, /interfaceLanguage/);
  assert.match(source, /上传资料|Upload/);
  assert.match(source, /\.docx/);
  assert.match(source, /activeMode.*novel|novel.*activeMode/s);
  assert.match(source, /screenplayLanguage/);
  assert.match(source, /dialogueLanguage/);
  assert.match(source, /translationLanguage/);
  assert.match(source, /generationScope/);
  assert.match(source, /current-unit|当前章\/集/);
  assert.match(source, /current-arc|当前大章/);
  assert.match(source, /draft.*finalized.*locked/s);
  assert.match(source, /lastUnitId/);
  assert.match(source, /latestManuscriptPosition/);
  assert.match(source, /取消定稿并修改/);
  assert.doesNotMatch(source, /创作流程入口/);
  assert.doesNotMatch(source, /<Sparkles size=\{15\} \/>\{isZh \? "AI 生成"/);
});

test("restores the latest manuscript and keeps screenplay labels episode-based", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /restoreProjectPosition/);
  assert.match(source, /setView\("unit"\)/);
  assert.match(source, /第 \$\{unit\.number\} 集/);
  assert.doesNotMatch(source, /mode === "screenplay"[^\n]*第 \$\{unit\.number\} 卷/);
});

test("exposes three screenplay formats, localization views, and MD DOCX ZIP export", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /international_production/);
  assert.match(source, /hollywood_spec/);
  assert.match(source, /asian_production/);
  assert.match(source, /localizedContent/);
  assert.match(source, /localizationChanges/);
  assert.match(source, /similarityReport/);
  assert.match(source, /downloadMarkdown/);
  assert.match(source, /downloadDocx/);
  assert.match(source, /downloadDeliveryZip/);
  assert.doesNotMatch(source, /downloadPdf|\.pdf["'`]/i);
});

test("keeps Universe, art, and storyboard-video handoffs in a responsive 38/62 shell", async () => {
  const source = await readFile(componentPath, "utf8");
  const css = await readFile(cssPath, "utf8");
  assert.match(source, /Universe/);
  // KIIKIS-任务2: art-workbench 合并入 /production?mode=art&projectId=
  assert.match(source, /\/production\?mode=art/);
  // KIIKIS-P1-TRAE-002: 现在跳转到 /production?projectId=&sourceUnit=
  assert.match(source, /\/production\?projectId=/);
  assert.match(css, /grid-template-columns:\s*minmax\([^;]+38fr\)\s+minmax\([^;]+62fr\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
