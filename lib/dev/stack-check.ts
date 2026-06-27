import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readJson(filePath: string): PackageJson {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function exists(relativePath: string): boolean {
  return existsSync(path.join(root, relativePath));
}

function list(relativePath: string) {
  const absolutePath = path.join(root, relativePath);
  return existsSync(absolutePath) ? readdirSync(absolutePath, { withFileTypes: true }) : [];
}

function hasDependency(pkg: PackageJson, names: string[]) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return names.find((name) => Boolean(deps[name])) || null;
}

const pkg = readJson(path.join(root, "package.json"));
const appRoutes = list("app")
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/${entry.name}`)
  .sort();

const framework = hasDependency(pkg, ["next"])
  ? "Next.js"
  : hasDependency(pkg, ["vite"])
    ? "Vite"
    : hasDependency(pkg, ["react-scripts"])
      ? "CRA"
      : "Other";

const routing = exists("app/layout.tsx") && exists("app/page.tsx")
  ? "Next.js App Router"
  : exists("pages")
    ? "Next.js Pages Router"
    : "Custom / Unknown";

const componentLibrary = [
  hasDependency(pkg, ["@radix-ui/react-dialog", "@radix-ui/react-toast"]) ? "Radix partial" : null,
  exists("components/ui") ? "shadcn/ui-style components directory" : null,
  exists("components/layout/AuthModal.tsx") ? "Custom internal components" : null,
].filter(Boolean).join(" + ") || "None detected";

const authSystem = hasDependency(pkg, ["@supabase/supabase-js"])
  ? "Supabase"
  : hasDependency(pkg, ["next-auth"])
    ? "NextAuth"
    : hasDependency(pkg, ["@clerk/nextjs"])
      ? "Clerk"
      : "Custom / Unknown";

const stateManagement = hasDependency(pkg, ["zustand"])
  ? "Zustand"
  : hasDependency(pkg, ["redux", "@reduxjs/toolkit"])
    ? "Redux"
    : hasDependency(pkg, ["jotai"])
      ? "Jotai"
      : "React Context + local component state";

const styling = hasDependency(pkg, ["tailwindcss"]) || exists("tailwind.config.js") || exists("tailwind.config.ts")
  ? "Tailwind CSS"
  : exists("app/globals.css")
    ? "Custom CSS in app/globals.css"
    : "Unknown";

const testRunner = hasDependency(pkg, ["vitest"])
  ? "Vitest"
  : hasDependency(pkg, ["jest"])
    ? "Jest"
    : "None detected";

const browserTestRunner = hasDependency(pkg, ["puppeteer"])
  ? "Puppeteer"
  : hasDependency(pkg, ["@playwright/test", "playwright"])
    ? "Playwright"
    : "None detected";

const report = {
  generatedAt: new Date().toISOString(),
  specMode: "PRD-001 Spec Patch v1.2 Adaptive Mode",
  framework,
  componentLibrary,
  authSystem,
  stateManagement,
  routing,
  styling,
  testRunner,
  browserTestRunner,
  appRoutes,
  conflicts: [
    styling !== "Tailwind CSS" ? "Spec assumes Tailwind CSS, but this repo uses custom CSS in app/globals.css." : null,
    testRunner !== "Vitest" ? "Spec requires Vitest tests, but no Vitest dependency or script is present." : null,
    browserTestRunner !== "Puppeteer" ? "Spec requires Puppeteer E2E, but no Puppeteer dependency or script is present." : null,
    !componentLibrary.includes("Radix") ? "Spec names Radix Dialog as fallback, but Radix packages are not installed." : null,
    !appRoutes.includes("/projects-demo") ? "Spec routes script entry to /projects-demo, but that route is absent." : null,
    !appRoutes.includes("/storyboard") ? "Spec routes storyboard entry to /storyboard, but that route is absent." : null,
    !appRoutes.includes("/video") ? "Spec routes video entry to /video, but that route is absent." : null,
    !appRoutes.includes("/song-creation") ? "Spec routes OST entry to /song-creation, but current song route appears to be /song-workbench." : null,
  ].filter(Boolean),
};

const markdown = `# STACK_REPORT

Generated: ${report.generatedAt}

## Detected Stack

- specMode: ${report.specMode}

- framework: ${report.framework}
- componentLibrary: ${report.componentLibrary}
- authSystem: ${report.authSystem}
- stateManagement: ${report.stateManagement}
- routing: ${report.routing}
- styling: ${report.styling}
- testRunner: ${report.testRunner}
- browserTestRunner: ${report.browserTestRunner}

## App Routes

${report.appRoutes.map((route) => `- ${route}`).join("\n")}

## Conflicts

${report.conflicts.length > 0 ? report.conflicts.map((item) => `- ${item}`).join("\n") : "- None"}

## Decision

${report.conflicts.length > 0
  ? "Initial v1.1 conflicts are present, but Director supplied PRD-001 Spec Patch v1.2 Adaptive Mode. Implementation may proceed using custom CSS, internal React components, disabled tooltips, and manual UAT."
  : "No blocking stack conflicts detected. PRD-001 implementation may proceed."}
`;

writeFileSync(path.join(root, "STACK_REPORT.md"), markdown, "utf8");
console.log(JSON.stringify(report, null, 2));
