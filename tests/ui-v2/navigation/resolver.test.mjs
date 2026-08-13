/**
 * KIIKIS 2.1 Phase 0 — 统一目标解析器测试
 *
 * 覆盖 PRD K21-P0-NAV-001~006 所有分支。
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// 导入 resolver
// ============================================================

const {
  resolveProjectTarget,
  resolveResultTarget,
  hasProjectTarget,
  hasResultTarget,
  isResultExternal,
  isSameOriginRoute,
  isExternalUrl,
  workflowToWorkbench,
  fromDashboardJob,
  fromUnifiedJob,
  fromRecentProject,
} = await import("../../../lib/client/v2/navigation/resolver.ts");

// ============================================================
// 加载 fixture 数据
// ============================================================

const dashboardFixture = JSON.parse(
  readFileSync(join(__dirname, "../../../tests/fixtures/kiikis-v2/dashboard.json"), "utf-8")
);
const jobsFixture = JSON.parse(
  readFileSync(join(__dirname, "../../../tests/fixtures/kiikis-v2/jobs.json"), "utf-8")
);

// ============================================================
// 测试
// ============================================================

describe("isSameOriginRoute", () => {
  it("以 / 开头且非 // → true", () => {
    assert.equal(isSameOriginRoute("/projects/p-101"), true);
    assert.equal(isSameOriginRoute("/job-center"), true);
  });

  it("以 // 开头 → false（协议相对 URL）", () => {
    assert.equal(isSameOriginRoute("//evil.com/path"), false);
  });

  it("http/https → false", () => {
    assert.equal(isSameOriginRoute("https://example.com"), false);
    assert.equal(isSameOriginRoute("http://localhost:3000"), false);
  });

  it("空字符串 → false", () => {
    assert.equal(isSameOriginRoute(""), false);
  });
});

describe("isExternalUrl", () => {
  it("http/https → true", () => {
    assert.equal(isExternalUrl("https://cdn.example.com/video.mp4"), true);
    assert.equal(isExternalUrl("http://localhost:3000"), true);
  });

  it("// → true", () => {
    assert.equal(isExternalUrl("//cdn.example.com/video.mp4"), true);
  });

  it("同源路由 → false", () => {
    assert.equal(isExternalUrl("/projects/p-101"), false);
  });
});

describe("resolveProjectTarget", () => {
  it("有 projectId + workbenchType → 映射到工作台", () => {
    const target = { projectId: "p-101", workbenchType: "script" };
    const route = resolveProjectTarget(target);
    assert.equal(route, "/script-workbench?projectId=p-101");
  });

  it("未知 workbenchType → 回退到项目详情页", () => {
    const target = { projectId: "p-101", workbenchType: "unknown_type" };
    const route = resolveProjectTarget(target);
    assert.equal(route, "/projects/p-101");
  });

  it("只有 projectId → 项目详情页", () => {
    const target = { projectId: "p-101" };
    const route = resolveProjectTarget(target);
    assert.equal(route, "/projects/p-101");
  });

  it("无 projectId → null（不伪造目标）", () => {
    assert.equal(resolveProjectTarget({}), null);
    assert.equal(resolveProjectTarget({ projectId: null }), null);
    assert.equal(resolveProjectTarget({ projectId: "" }), null);
    assert.equal(resolveProjectTarget({ projectId: "   " }), null);
  });

  it("projectId 含特殊字符 → null（防 URL 注入）", () => {
    assert.equal(resolveProjectTarget({ projectId: "../etc/passwd" }), null);
    assert.equal(resolveProjectTarget({ projectId: "p-101;rm -rf" }), null);
    assert.equal(resolveProjectTarget({ projectId: "p 101" }), null);
  });

  it("projectId 含合法字符（字母数字连字符下划线）→ 正常路由", () => {
    assert.equal(
      resolveProjectTarget({ projectId: "proj-umbral_ep06" }),
      "/projects/proj-umbral_ep06"
    );
  });

  it("workbenchType=video → video-workbench", () => {
    const route = resolveProjectTarget({ projectId: "p-103", workbenchType: "video" });
    assert.equal(route, "/video-workbench?projectId=p-103");
  });

  it("workbenchType=art → art-workbench", () => {
    const route = resolveProjectTarget({ projectId: "p-102", workbenchType: "art" });
    assert.equal(route, "/art-workbench?projectId=p-102");
  });

  it("workbenchType=song → song-workbench", () => {
    const route = resolveProjectTarget({ projectId: "p-104", workbenchType: "song" });
    assert.equal(route, "/song-workbench?projectId=p-104");
  });

  it("workbenchType=production → production-workbench", () => {
    const route = resolveProjectTarget({ projectId: "p-101", workbenchType: "production" });
    assert.equal(route, "/production-workbench?projectId=p-101");
  });

  it("workbenchType=analysis → projects/{id}/analysis", () => {
    const route = resolveProjectTarget({ projectId: "p-105", workbenchType: "analysis" });
    assert.equal(route, "/projects/p-105/analysis");
  });

  it("workbenchType=novel → novel-workbench with mode=screenplay", () => {
    const route = resolveProjectTarget({ projectId: "p-106", workbenchType: "novel" });
    assert.equal(route, "/novel-workbench?projectId=p-106&mode=screenplay");
  });

  it("workbenchType=creation → novel-workbench with mode=screenplay", () => {
    const route = resolveProjectTarget({ projectId: "p-101", workbenchType: "creation" });
    assert.equal(route, "/novel-workbench?projectId=p-101&mode=screenplay");
  });

  it("workbenchType=short_drama → projects/{id}", () => {
    const route = resolveProjectTarget({ projectId: "p-107", workbenchType: "short_drama" });
    assert.equal(route, "/projects/p-107");
  });
});

describe("resolveResultTarget", () => {
  it("同源 resultUrl → 直接使用", () => {
    const target = { resultUrl: "/projects/p-101/production?shot=opening" };
    assert.equal(resolveResultTarget(target), "/projects/p-101/production?shot=opening");
  });

  it("外部 resultUrl → 返回（用于查看结果）", () => {
    const target = { resultUrl: "https://cdn.example.com/video.mp4" };
    assert.equal(resolveResultTarget(target), "https://cdn.example.com/video.mp4");
  });

  it("无 resultUrl + 有 projectId + workbenchType → 回退到工作台", () => {
    const target = { projectId: "p-101", workbenchType: "script" };
    assert.equal(resolveResultTarget(target), "/script-workbench?projectId=p-101");
  });

  it("无 resultUrl + 只有 projectId → 回退到项目详情页", () => {
    const target = { projectId: "p-101" };
    assert.equal(resolveResultTarget(target), "/projects/p-101");
  });

  it("无任何信息 → null（不伪造目标）", () => {
    assert.equal(resolveResultTarget({}), null);
    assert.equal(resolveResultTarget({ resultUrl: null }), null);
    assert.equal(resolveResultTarget({ resultUrl: "" }), null);
    assert.equal(resolveResultTarget({ resultUrl: "   " }), null);
  });

  it("空格 resultUrl → null", () => {
    assert.equal(resolveResultTarget({ resultUrl: "  " }), null);
  });

  it("同源 resultUrl 优先于 projectId 回退", () => {
    const target = {
      resultUrl: "/exports/ex-001",
      projectId: "p-101",
      workbenchType: "script",
    };
    assert.equal(resolveResultTarget(target), "/exports/ex-001");
  });
});

describe("hasProjectTarget", () => {
  it("有 projectId → true", () => {
    assert.equal(hasProjectTarget({ projectId: "p-101" }), true);
  });

  it("无 projectId → false", () => {
    assert.equal(hasProjectTarget({}), false);
  });
});

describe("hasResultTarget", () => {
  it("有 resultUrl → true", () => {
    assert.equal(hasResultTarget({ resultUrl: "/projects/p-101" }), true);
  });

  it("有 projectId → true（回退到项目详情）", () => {
    assert.equal(hasResultTarget({ projectId: "p-101" }), true);
  });

  it("无任何信息 → false", () => {
    assert.equal(hasResultTarget({}), false);
  });
});

describe("isResultExternal", () => {
  it("外部 resultUrl → true", () => {
    assert.equal(isResultExternal({ resultUrl: "https://cdn.example.com/video.mp4" }), true);
  });

  it("同源 resultUrl → false", () => {
    assert.equal(isResultExternal({ resultUrl: "/projects/p-101" }), false);
  });

  it("无 resultUrl → false", () => {
    assert.equal(isResultExternal({}), false);
  });
});

describe("workflowToWorkbench", () => {
  it("novel → novel", () => {
    assert.equal(workflowToWorkbench("novel"), "novel");
  });

  it("creation → creation", () => {
    assert.equal(workflowToWorkbench("creation"), "creation");
  });

  it("drama → short_drama", () => {
    assert.equal(workflowToWorkbench("drama"), "short_drama");
  });

  it("未知 workflowType → null", () => {
    assert.equal(workflowToWorkbench("unknown"), null);
  });
});

describe("fromDashboardJob", () => {
  it("从 RunningJob 构建目标", () => {
    const job = {
      id: "job-001",
      projectId: "p-101",
      workbenchType: "video",
      resultUrl: "/projects/p-101/video",
    };
    const target = fromDashboardJob(job);
    assert.equal(target.projectId, "p-101");
    assert.equal(target.workbenchType, "video");
    assert.equal(target.resultUrl, "/projects/p-101/video");
  });

  it("缺少 projectId → null", () => {
    const job = { id: "job-001", name: "test" };
    const target = fromDashboardJob(job);
    assert.equal(target.projectId, null);
  });
});

describe("fromUnifiedJob", () => {
  it("从 UnifiedJob 构建目标", () => {
    const job = {
      id: "job-001",
      projectId: "p-101",
      workbenchType: "art",
      resultUrl: "/projects/p-101/art",
    };
    const target = fromUnifiedJob(job);
    assert.equal(target.projectId, "p-101");
    assert.equal(target.workbenchType, "art");
    assert.equal(target.resultUrl, "/projects/p-101/art");
  });

  it("无 resultUrl → null", () => {
    const job = {
      id: "job-001",
      projectId: "p-101",
      workbenchType: "art",
    };
    const target = fromUnifiedJob(job);
    assert.equal(target.resultUrl, null);
  });
});

describe("fromRecentProject", () => {
  it("从 RecentProject 构建目标", () => {
    const project = { id: "p-101", workflowType: "novel" };
    const target = fromRecentProject(project);
    assert.equal(target.projectId, "p-101");
    assert.equal(target.workbenchType, "novel");
  });

  it("drama workflowType → short_drama", () => {
    const project = { id: "p-107", workflowType: "drama" };
    const target = fromRecentProject(project);
    assert.equal(target.workbenchType, "short_drama");
  });
});

describe("K21-P0-NAV-006: fixture 路由验证", () => {
  it("所有 dashboard fixture runningJobs 可导航", () => {
    for (const job of dashboardFixture.runningJobs) {
      const target = fromDashboardJob(job);
      const route = resolveProjectTarget(target);
      assert.ok(
        route !== null,
        `Job ${job.id} (${job.name}) should have a navigable route`
      );
    }
  });

  it("所有 dashboard fixture recentProjects 可导航", () => {
    for (const project of dashboardFixture.recentProjects) {
      const target = fromRecentProject(project);
      const route = resolveProjectTarget(target);
      assert.ok(
        route !== null,
        `Project ${project.id} (${project.title}) should have a navigable route`
      );
    }
  });

  it("所有 jobs fixture resultUrl 为同源路由", () => {
    for (const job of jobsFixture.jobs) {
      if (job.resultUrl) {
        assert.ok(
          isSameOriginRoute(job.resultUrl),
          `Job ${job.id} resultUrl "${job.resultUrl}" should be same-origin`
        );
      }
    }
  });
});
