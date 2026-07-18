# KIIKIS Strategic Whitepaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a polished Chinese KIIKIS strategic whitepaper PDF that explains the IP asset system clearly, includes the homepage slogan, and withholds proprietary implementation details.

**Architecture:** Store all approved copy in one structured JSON manuscript, render it through a focused ReportLab generator, and enforce required/forbidden language with a Node test. Render the resulting PDF to PNG for page-by-page visual verification before delivery.

**Tech Stack:** JSON, Python 3, ReportLab, Node.js test runner, Poppler (`pdfinfo`, `pdftoppm`)

## Global Constraints

- Final output: `output/pdf/kiikis-whitepaper-v2-zh.pdf`.
- The cover must contain the exact slogan `每一个宇宙，都始于一个念头。`.
- Do not use `投资人`, `融资`, `路演`, `回报`, or `Investor Edition` in manuscript or PDF.
- Do not disclose database tables, API paths, prompts, providers, fallback rules, hashes, manifests, idempotency, RLS, storage paths, infrastructure topology, source code, internal IDs, or unpublished user IP.
- Describe current capability, work in progress, and long-term direction as separate states.
- Do not invent market size, revenue, user count, growth, conversion, cost advantage, launch dates, prices, or revenue-share percentages.
- Use `KIIKIS Strategic Whitepaper`, `Confidential · Limited Distribution`, and `本版本已省略专有技术与实施细节` as the distribution notice.
- Evidence packages are production records that support verification; they are not automatic copyright confirmation or legal rulings.

---

### Task 1: Lock the manuscript and content-safety checks

**Files:**
- Create: `docs/whitepaper/kiikis-whitepaper-v2-zh.json`
- Create: `tests/whitepaper-content.test.mjs`

**Interfaces:**
- Produces: JSON object `{ metadata, palette, pages }` consumed by the PDF generator.
- `pages` contains 18-22 ordered page objects with `layout`, `kicker`, `title`, `subtitle`, `body`, `bullets`, and optional `diagram` fields.

- [ ] **Step 1: Write the content gate test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manuscript = JSON.parse(
  fs.readFileSync(new URL("../docs/whitepaper/kiikis-whitepaper-v2-zh.json", import.meta.url), "utf8"),
);
const text = JSON.stringify(manuscript);

test("whitepaper includes its brand and IP asset thesis", () => {
  assert.match(text, /每一个宇宙，都始于一个念头。/);
  for (const phrase of ["IP 本体层", "身份与演绎层", "内容生产层", "来源与权利层", "价值流通层"]) {
    assert.ok(text.includes(phrase), `missing ${phrase}`);
  }
  assert.match(text, /Actor/);
  assert.match(text, /Character/);
  assert.match(text, /Portrayal/);
  assert.match(text, /制作证据包/);
});

test("whitepaper contains no audience label or proprietary implementation terms", () => {
  assert.doesNotMatch(text, /投资人|融资|路演|回报|Investor Edition/i);
  assert.doesNotMatch(
    text,
    /storyflow_|\/api\/|\bRLS\b|Supabase|DeepSeek|Atlas Cloud|SHA-256|manifest\.json|idempoten|数据库表|存储路径/i,
  );
});

test("whitepaper separates delivery states", () => {
  assert.match(text, /当前能力/);
  assert.match(text, /正在建设/);
  assert.match(text, /中长期方向/);
});
```

- [ ] **Step 2: Run the test and confirm the missing manuscript failure**

Run: `node --test tests/whitepaper-content.test.mjs`

Expected: FAIL with `ENOENT` for `docs/whitepaper/kiikis-whitepaper-v2-zh.json`.

- [ ] **Step 3: Write the structured manuscript**

The ordered page titles must be:

```json
[
  "每一个宇宙，都始于一个念头。",
  "生成变得容易，IP 仍然没有留下",
  "长期壁垒不是一次生成，而是资产网络",
  "KIIKIS 的五层 IP 资产体系",
  "Universe 是所有作品的长期母体",
  "一条真正进入生产的创作链",
  "每一次制作，都在积累下一次制作",
  "AI 演员不是图片，而是可复用的表演身份",
  "演员、角色与项目形象，各自独立又可追溯",
  "从共享使用，到未来的价值回流",
  "创作留痕应该无感，证据应该随时可取",
  "资产飞轮：作品越多，Universe 越强",
  "模型会变化，IP 资产必须留下",
  "我们正在交付什么",
  "从内部制作团队开始",
  "商业化来自持续复用，而不是一次生成",
  "真正难复制的是时间积累出的关系",
  "三阶段路线",
  "开放能力，也守住权利边界",
  "都在一个宇宙里，由你来建造。"
]
```

Each page must carry one argument only. The five-layer page defines the approved five layers. The actor pages distinguish Actor, Character, and Portrayal without exposing data relationships. The evidence page states that the package supports verification and does not replace legal registration. The delivery-state page uses three labeled columns: `当前能力`, `正在建设`, `中长期方向`.

- [ ] **Step 4: Run the content gate**

Run: `node --test tests/whitepaper-content.test.mjs`

Expected: `3` tests pass and `0` fail.

### Task 2: Build the PDF renderer

**Files:**
- Create: `scripts/generate_kiikis_whitepaper.py`
- Create: `output/pdf/kiikis-whitepaper-v2-zh.pdf`

**Interfaces:**
- Consumes: `docs/whitepaper/kiikis-whitepaper-v2-zh.json`.
- Produces: A4 PDF with 20 pages, vector diagrams, embedded Chinese fonts, page numbers, and distribution notice.

- [ ] **Step 1: Implement deterministic font registration**

Use the installed embeddable CJK font so every PDF reader receives the glyphs with the document:

```python
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

def register_fonts() -> tuple[str, str]:
    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    if not font_path.exists():
        raise FileNotFoundError(f"Missing embeddable CJK font: {font_path}")
    pdfmetrics.registerFont(TTFont("KiikisCJK", str(font_path)))
    return "KiikisCJK", "KiikisCJK"
```

- [ ] **Step 2: Implement the reusable page system**

Create focused functions with these signatures:

```python
def draw_background(canvas, palette: dict, page_number: int) -> None: ...
def draw_header(canvas, page: dict, fonts: tuple[str, str], palette: dict) -> float: ...
def draw_paragraphs(canvas, page: dict, y: float, fonts: tuple[str, str], palette: dict) -> float: ...
def draw_layer_stack(canvas, page: dict, palette: dict, fonts: tuple[str, str]) -> None: ...
def draw_pipeline(canvas, page: dict, palette: dict, fonts: tuple[str, str]) -> None: ...
def draw_three_identity_model(canvas, page: dict, palette: dict, fonts: tuple[str, str]) -> None: ...
def draw_flywheel(canvas, page: dict, palette: dict, fonts: tuple[str, str]) -> None: ...
def draw_three_stage_roadmap(canvas, page: dict, palette: dict, fonts: tuple[str, str]) -> None: ...
def draw_footer(canvas, page_number: int, total_pages: int, fonts: tuple[str, str], palette: dict) -> None: ...
```

Use vector circles, lines, cards, gradients approximated with translucent shapes, and film-frame accents. Do not use screenshots, third-party logos, external images, or diagrams that reveal implementation structure.

- [ ] **Step 3: Add copy-fit safeguards**

```python
def ensure_page_fits(cursor_y: float, minimum_y: float = 62) -> None:
    if cursor_y < minimum_y:
        raise ValueError(f"Page content overflow: cursor_y={cursor_y:.1f}")

def assert_public_copy(text: str) -> None:
    forbidden = (
        "投资人", "融资", "路演", "回报", "Investor Edition",
        "storyflow_", "/api/", "RLS", "Supabase", "DeepSeek",
        "Atlas Cloud", "SHA-256", "manifest.json",
    )
    hits = [term for term in forbidden if term.lower() in text.lower()]
    if hits:
        raise ValueError(f"Forbidden whitepaper terms: {', '.join(hits)}")
```

- [ ] **Step 4: Generate the PDF**

Run:

```bash
/Users/kiikis000/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/generate_kiikis_whitepaper.py
```

Expected: `output/pdf/kiikis-whitepaper-v2-zh.pdf` exists and the generator reports `20 pages generated`.

### Task 3: Verify text, rendering, and confidentiality

**Files:**
- Create: `tmp/pdfs/kiikis-whitepaper-v2/page-*.png`
- Create: `tmp/pdfs/kiikis-whitepaper-v2/extracted.txt`

**Interfaces:**
- Consumes: final PDF.
- Produces: visual and text verification evidence; temporary files are not committed.

- [ ] **Step 1: Inspect PDF metadata and page count**

Run: `pdfinfo output/pdf/kiikis-whitepaper-v2-zh.pdf`

Expected: A4 page size, `Pages: 20`, no encryption, no JavaScript.

- [ ] **Step 2: Extract and scan visible text**

Use `pdfplumber` to write extracted text, then run:

```bash
rg -n -i "投资|融资|路演|回报|investor|storyflow_|/api/|RLS|Supabase|DeepSeek|Atlas Cloud|SHA-256|manifest.json" tmp/pdfs/kiikis-whitepaper-v2/extracted.txt
```

Expected: no matches.

- [ ] **Step 3: Render all pages**

Run:

```bash
pdftoppm -png -r 140 output/pdf/kiikis-whitepaper-v2-zh.pdf tmp/pdfs/kiikis-whitepaper-v2/page
```

Expected: 20 PNG files.

- [ ] **Step 4: Build and inspect contact sheets**

Create contact sheets in groups of four pages and visually inspect every page for clipped text, overlap, unreadable labels, weak contrast, incorrect page numbering, malformed Chinese glyphs, and missing distribution notices. Regenerate the PDF after every correction and repeat Steps 1-4.

- [ ] **Step 5: Run content tests again**

Run: `node --test tests/whitepaper-content.test.mjs`

Expected: `3` tests pass and `0` fail.

### Task 4: Commit and hand off the final artifact

**Files:**
- Modify: `docs/DEV_HANDOFF_LOG.md`
- Commit: manuscript, generator, content test, final PDF, design, and plan.

**Interfaces:**
- Produces: reviewable source and final PDF with recorded verification evidence.

- [ ] **Step 1: Record actual verification results**

Add a handoff entry containing the PDF page count, content-test result, text-scan result, rendered-page count, visual-review result, commit hash, and any known limitations. Do not include temporary paths beyond the repository-relative verification directory.

- [ ] **Step 2: Check the final diff boundary**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated actor and Universe work remains untouched.

- [ ] **Step 3: Commit only whitepaper files**

Use explicit paths so pre-existing staged work is not included:

```bash
git commit --only docs/whitepaper/kiikis-whitepaper-v2-zh.json scripts/generate_kiikis_whitepaper.py tests/whitepaper-content.test.mjs output/pdf/kiikis-whitepaper-v2-zh.pdf docs/superpowers/specs/2026-07-18-kiikis-strategic-whitepaper-design.md docs/superpowers/plans/2026-07-18-kiikis-strategic-whitepaper.md docs/DEV_HANDOFF_LOG.md -m "docs: publish KIIKIS strategic whitepaper"
```

- [ ] **Step 4: Deliver the clickable PDF path**

Return a direct link to `/Users/kiikis000/Documents/kimi/workspace/storyflow-ai/output/pdf/kiikis-whitepaper-v2-zh.pdf` together with the exact page count and verification summary.
