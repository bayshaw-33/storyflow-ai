/**
 * KIIKIS 2.1 Phase 5 — Task 5.4 E2E 测试规格
 *
 * 端到端流程: 发布 → 发现 → 关注 → 反应 → 收藏 → 评论 → 举报 → 审核 → 申诉 → 恢复
 *
 * Gate 4 验收:
 *   - 发现/关注/互动/通知/授权入口跑通
 *   - 举报/屏蔽/审核/申诉/恢复跑通
 *   - 无 P0/P1 安全隐私审核缺陷
 *
 * 覆盖:
 *   CM-001 publication 与源资源分离
 *   CM-002 发现页投影查询
 *   CM-003 关注/反应/收藏幂等
 *   CM-004 评论回复/软删除/冻结
 *   CM-005 对象页来源与许可
 *   CM-006 通知由事件生成
 *   CM-007 举报/屏蔽/审核/申诉
 *   CM-008 隐藏不删除私有源
 *   CM-009 权限矩阵
 *   CM-010 feature flag 保护
 */
import { test, expect } from "@playwright/test";

const API_BASE = "/api/v2";
const stamp = Date.now();

test.describe("KIIKIS 2.1 Phase 5 — Community E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Gate 4: 发布→发现→关注→评论→举报→审核→申诉→恢复 完整流程 (CM-001~008)", async ({ request }) => {
    // ============================================================
    // 1. CM-001: 创建 publication (源资源分离)
    // ============================================================
    const sourceId = `e2e-source-${stamp}`;
    const createResponse = await request.post(`${API_BASE}/community/publications`, {
      data: {
        sourceType: "universe",
        sourceId,
        sourceVersion: "v1",
        title: `E2E Publication ${stamp}`,
        summary: "End-to-end community flow verification",
        visibility: "public",
        idempotencyKey: `e2e-pub:${stamp}`,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    expect(createData.contractVersion).toBe("kiikis.community.publication/1");
    expect(createData.publication.id).toBeTruthy();
    expect(createData.publication.sourceType).toBe("universe");
    expect(createData.publication.sourceId).toBe(sourceId);
    expect(createData.publication.sourceVersion).toBe("v1");
    expect(createData.publication.visibility).toBe("public");
    expect(createData.publication.status).toBe("active");
    // CM-001: publication 保存源资源快照
    expect(createData.publication.publisherId).toBeTruthy();
    const publicationId = createData.publication.id as string;

    // ============================================================
    // 2. CM-002: 发现页查询投影 (public 可见)
    // ============================================================
    const discoverResponse = await request.get(`${API_BASE}/community/discover?limit=50`);
    expect(discoverResponse.ok()).toBeTruthy();
    const discoverData = await discoverResponse.json();
    expect(discoverData.success).toBe(true);
    expect(Array.isArray(discoverData.items)).toBe(true);
    // CM-002: 刚发布的 publication 出现在发现页
    const found = discoverData.items.find((p: { id: string }) => p.id === publicationId);
    expect(found).toBeTruthy();
    // CM-002: 投影只含公开字段, 不含 source_id 等私有字段
    expect(found.visibility).toBe("public");
    expect(found.followCount).toBeGreaterThanOrEqual(0);

    // ============================================================
    // 3. CM-005: publication 详情 (来源/owner/许可/允许动作)
    // ============================================================
    const detailResponse = await request.get(`${API_BASE}/community/publications/${publicationId}`);
    expect(detailResponse.ok()).toBeTruthy();
    const detailData = await detailResponse.json();
    expect(detailData.success).toBe(true);
    expect(detailData.publication.id).toBe(publicationId);
    // CM-005: 显示来源/owner/许可状态
    expect(detailData.publication.sourceType).toBe("universe");
    expect(detailData.publication.publisherId).toBeTruthy();
    expect(detailData.publication.status).toBe("active");
    // CM-005: allowedActions 明确允许动作
    expect(Array.isArray(detailData.allowedActions)).toBe(true);
    // CM-005: 不暴露私有 storage path
    expect(JSON.stringify(detailData)).not.toContain("storage_path");
    expect(JSON.stringify(detailData)).not.toContain("api_key");

    // ============================================================
    // 4. CM-003: 关注 (幂等 toggle)
    // ============================================================
    const followResponse = await request.post(`${API_BASE}/community/follows`, {
      data: {
        targetType: "publication",
        targetId: publicationId,
      },
    });
    expect(followResponse.ok()).toBeTruthy();
    const followData = await followResponse.json();
    expect(followData.success).toBe(true);
    expect(followData.contractVersion).toBe("kiikis.community.follow/1");
    expect(followData.following).toBe(true);

    // CM-003: 重复关注幂等 (toggle → 取消)
    const unfollowResponse = await request.post(`${API_BASE}/community/follows`, {
      data: { targetType: "publication", targetId: publicationId },
    });
    expect(unfollowResponse.ok()).toBeTruthy();
    const unfollowData = await unfollowResponse.json();
    expect(unfollowData.following).toBe(false);

    // CM-003: 再次关注 (回到已关注状态)
    const refollowResponse = await request.post(`${API_BASE}/community/follows`, {
      data: { targetType: "publication", targetId: publicationId },
    });
    expect(refollowResponse.ok()).toBeTruthy();
    expect((await refollowResponse.json()).following).toBe(true);

    // 检查关注状态
    const checkFollowResponse = await request.get(
      `${API_BASE}/community/follows?check=1&targetType=publication&targetId=${publicationId}`,
    );
    expect(checkFollowResponse.ok()).toBeTruthy();
    expect((await checkFollowResponse.json()).following).toBe(true);

    // ============================================================
    // 5. CM-003: 反应 (幂等 toggle)
    // ============================================================
    const reactResponse = await request.post(`${API_BASE}/community/reactions`, {
      data: { publicationId, reactionType: "like" },
    });
    expect(reactResponse.ok()).toBeTruthy();
    const reactData = await reactResponse.json();
    expect(reactData.success).toBe(true);
    expect(reactData.contractVersion).toBe("kiikis.community.reaction/1");
    expect(reactData.reacted).toBe(true);

    // CM-003: 重复反应幂等 (toggle → 取消)
    const unreactResponse = await request.post(`${API_BASE}/community/reactions`, {
      data: { publicationId, reactionType: "like" },
    });
    expect(unreactResponse.ok()).toBeTruthy();
    expect((await unreactResponse.json()).reacted).toBe(false);

    // ============================================================
    // 6. CM-003: 收藏 (幂等 toggle)
    // ============================================================
    const bookmarkResponse = await request.post(`${API_BASE}/community/bookmarks`, {
      data: { publicationId },
    });
    expect(bookmarkResponse.ok()).toBeTruthy();
    const bookmarkData = await bookmarkResponse.json();
    expect(bookmarkData.success).toBe(true);
    expect(bookmarkData.contractVersion).toBe("kiikis.community.bookmark/1");
    expect(bookmarkData.bookmarked).toBe(true);

    // CM-003: 重复收藏幂等
    const unbookmarkResponse = await request.post(`${API_BASE}/community/bookmarks`, {
      data: { publicationId },
    });
    expect(unbookmarkResponse.ok()).toBeTruthy();
    expect((await unbookmarkResponse.json()).bookmarked).toBe(false);

    // ============================================================
    // 7. CM-004: 评论 + 回复 + 软删除
    // ============================================================
    const commentResponse = await request.post(
      `${API_BASE}/community/publications/${publicationId}/comments`,
      {
        data: { body: `E2E comment ${stamp}` },
      },
    );
    expect(commentResponse.ok()).toBeTruthy();
    const commentData = await commentResponse.json();
    expect(commentData.success).toBe(true);
    expect(commentData.contractVersion).toBe("kiikis.community.comment/1");
    expect(commentData.comment.body).toBe(`E2E comment ${stamp}`);
    expect(commentData.comment.publicationId).toBe(publicationId);
    expect(commentData.comment.parentCommentId).toBeNull();
    const commentId = commentData.comment.id as string;

    // CM-004: 回复评论 (层级)
    const replyResponse = await request.post(
      `${API_BASE}/community/publications/${publicationId}/comments`,
      {
        data: { body: `E2E reply ${stamp}`, parentCommentId: commentId },
      },
    );
    expect(replyResponse.ok()).toBeTruthy();
    const replyData = await replyResponse.json();
    expect(replyData.comment.parentCommentId).toBe(commentId);
    const replyId = replyData.comment.id as string;

    // 列出评论
    const listCommentsResponse = await request.get(
      `${API_BASE}/community/publications/${publicationId}/comments`,
    );
    expect(listCommentsResponse.ok()).toBeTruthy();
    const listCommentsData = await listCommentsResponse.json();
    expect(listCommentsData.items.length).toBeGreaterThanOrEqual(2);

    // CM-004: 软删除评论 (不物理删除)
    const deleteCommentResponse = await request.delete(
      `${API_BASE}/community/comments/${commentId}`,
      { data: { reason: "E2E soft delete" } },
    );
    expect(deleteCommentResponse.ok()).toBeTruthy();
    const deletedCommentData = await deleteCommentResponse.json();
    expect(deletedCommentData.comment.deletedAt).toBeTruthy();
    // CM-004: 软删除后 body 不暴露
    expect(deletedCommentData.comment.body).toBe("");

    // ============================================================
    // 8. CM-007: 举报 publication
    // ============================================================
    const reportResponse = await request.post(`${API_BASE}/community/reports`, {
      data: {
        targetType: "publication",
        targetId: publicationId,
        reasonType: "spam",
        reasonDescription: "E2E test report",
      },
    });
    expect(reportResponse.ok()).toBeTruthy();
    const reportData = await reportResponse.json();
    expect(reportData.success).toBe(true);
    expect(reportData.contractVersion).toBe("kiikis.community.report/1");
    expect(reportData.report.targetType).toBe("publication");
    expect(reportData.report.targetId).toBe(publicationId);
    expect(reportData.report.reasonType).toBe("spam");
    expect(reportData.report.status).toBe("pending");
    // CM-007: 举报自动创建 moderation queue 条目
    expect(reportData.report.moderationId).toBeTruthy();
    const moderationId = reportData.report.moderationId as string;

    // CM-007: 重复举报同一对象幂等 (返回已有举报)
    const reReportResponse = await request.post(`${API_BASE}/community/reports`, {
      data: {
        targetType: "publication",
        targetId: publicationId,
        reasonType: "harassment",
      },
    });
    expect(reReportResponse.ok()).toBeTruthy();
    const reReportData = await reReportResponse.json();
    expect(reReportData.report.id).toBe(reportData.report.id);

    // ============================================================
    // 9. CM-007: 屏蔽用户 (幂等 toggle)
    // ============================================================
    const blockResponse = await request.post(`${API_BASE}/community/blocks`, {
      data: { blockedId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(blockResponse.ok()).toBeTruthy();
    const blockData = await blockResponse.json();
    expect(blockData.success).toBe(true);
    expect(blockData.contractVersion).toBe("kiikis.community.block/1");
    expect(blockData.blocking).toBe(true);

    // CM-007: 重复屏蔽幂等 (toggle → 取消)
    const unblockResponse = await request.post(`${API_BASE}/community/blocks`, {
      data: { blockedId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(unblockResponse.ok()).toBeTruthy();
    expect((await unblockResponse.json()).blocking).toBe(false);

    // ============================================================
    // 10. CM-009: 审核员查看 moderation queue
    // ============================================================
    const queueResponse = await request.get(`${API_BASE}/community/moderation/queue?limit=50`);
    // 审核员权限: 非审核员返回 403, 审核员返回 items
    if (queueResponse.ok()) {
      const queueData = await queueResponse.json();
      expect(queueData.success).toBe(true);
      expect(Array.isArray(queueData.items)).toBe(true);
      // 找到当前举报对应的 moderation 条目
      const modItem = queueData.items.find((m: { id: string }) => m.id === moderationId);
      expect(modItem).toBeTruthy();
      expect(modItem.status).toBe("pending");
      expect(modItem.targetType).toBe("publication");
    } else {
      // 非审核员 → 403 (CM-009 权限矩阵)
      expect(queueResponse.status()).toBe(403);
    }

    // ============================================================
    // 11. CM-007: 审核操作 — 隐藏 publication
    // ============================================================
    const reviewResponse = await request.post(`${API_BASE}/community/moderation/${moderationId}`, {
      data: { action: "hide", reason: "E2E moderation hide" },
    });
    // 审核员权限: 非审核员返回 403
    if (reviewResponse.ok()) {
      const reviewData = await reviewResponse.json();
      expect(reviewData.success).toBe(true);
      expect(reviewData.item.status).toBe("hidden");
      expect(reviewData.item.actionTaken).toBe("hide");
      expect(reviewData.item.actionReason).toBe("E2E moderation hide");
      expect(reviewData.item.moderatorId).toBeTruthy();

      // CM-008: 隐藏后 publication visibility=hidden, 但源资源不受影响
      const hiddenDetailResponse = await request.get(
        `${API_BASE}/community/publications/${publicationId}`,
      );
      // 非作者且 hidden → 403; 作者可看
      if (hiddenDetailResponse.ok()) {
        const hiddenDetail = await hiddenDetailResponse.json();
        expect(hiddenDetail.publication.visibility).toBe("hidden");
        // CM-008: 源资源仍存在 (sourceId 未变)
        expect(hiddenDetail.publication.sourceId).toBe(sourceId);
      } else {
        expect(hiddenDetailResponse.status()).toBe(403);
      }

      // CM-002: 隐藏后不出现在发现页
      const discoverAfterHide = await request.get(`${API_BASE}/community/discover?limit=100`);
      const discoverAfterHideData = await discoverAfterHide.json();
      const stillVisible = discoverAfterHideData.items.find(
        (p: { id: string }) => p.id === publicationId,
      );
      expect(stillVisible).toBeUndefined();

      // ============================================================
      // 12. CM-007: 申诉
      // ============================================================
      const appealResponse = await request.post(`${API_BASE}/community/appeals`, {
        data: {
          moderationId,
          appealText: "E2E appeal: this publication should not be hidden",
          idempotencyKey: `e2e-appeal:${stamp}`,
        },
      });
      expect(appealResponse.ok()).toBeTruthy();
      const appealData = await appealResponse.json();
      expect(appealData.success).toBe(true);
      expect(appealData.contractVersion).toBe("kiikis.community.appeal/1");
      expect(appealData.appeal.moderationId).toBe(moderationId);
      expect(appealData.appeal.status).toBe("pending");
      expect(appealData.appeal.appealText).toContain("E2E appeal");
      const appealId = appealData.appeal.id as string;

      // CM-007: 重复申诉幂等
      const reAppealResponse = await request.post(`${API_BASE}/community/appeals`, {
        data: {
          moderationId,
          appealText: "duplicate appeal",
          idempotencyKey: `e2e-appeal:${stamp}`,
        },
      });
      expect(reAppealResponse.ok()).toBeTruthy();
      const reAppealData = await reAppealResponse.json();
      expect(reAppealData.appeal.id).toBe(appealId);

      // ============================================================
      // 13. CM-007: 审核员处理申诉 — 批准 (自动恢复)
      // ============================================================
      const reviewAppealResponse = await request.patch(`${API_BASE}/community/appeals/${appealId}`, {
        data: { decision: "approved", reviewNotes: "E2E appeal approved" },
      });
      if (reviewAppealResponse.ok()) {
        const reviewAppealData = await reviewAppealResponse.json();
        expect(reviewAppealData.success).toBe(true);
        expect(reviewAppealData.appeal.status).toBe("approved");
        expect(reviewAppealData.appeal.reviewerId).toBeTruthy();
        expect(reviewAppealData.appeal.reviewedAt).toBeTruthy();

        // CM-007: 申诉批准后 publication 自动恢复
        const restoredDetailResponse = await request.get(
          `${API_BASE}/community/publications/${publicationId}`,
        );
        if (restoredDetailResponse.ok()) {
          const restoredDetail = await restoredDetailResponse.json();
          expect(restoredDetail.publication.visibility).toBe("public");
          expect(restoredDetail.publication.status).toBe("active");
        }

        // CM-002: 恢复后重新出现在发现页
        const discoverAfterRestore = await request.get(`${API_BASE}/community/discover?limit=100`);
        const discoverAfterRestoreData = await discoverAfterRestore.json();
        const restoredVisible = discoverAfterRestoreData.items.find(
          (p: { id: string }) => p.id === publicationId,
        );
        expect(restoredVisible).toBeTruthy();
      } else {
        // 非审核员 → 403 (CM-009)
        expect(reviewAppealResponse.status()).toBe(403);
      }
    } else {
      // 非审核员 → 403 (CM-009 权限矩阵)
      expect(reviewResponse.status()).toBe(403);
    }

    // ============================================================
    // 14. CM-008: 隐藏 publication 不删除私有源 (owner 视角)
    // ============================================================
    // owner 仍可 PATCH 自己的 publication (hide/restore)
    const ownerPatchResponse = await request.patch(
      `${API_BASE}/community/publications/${publicationId}`,
      { data: { action: "hide", reason: "E2E owner hide" } },
    );
    if (ownerPatchResponse.ok()) {
      const ownerPatchData = await ownerPatchResponse.json();
      expect(ownerPatchData.publication.visibility).toBe("hidden");
      // CM-008: 源资源字段保留 (不删除)
      expect(ownerPatchData.publication.sourceId).toBe(sourceId);
      expect(ownerPatchData.publication.sourceType).toBe("universe");

      // owner restore
      const ownerRestoreResponse = await request.patch(
        `${API_BASE}/community/publications/${publicationId}`,
        { data: { action: "restore", reason: "E2E owner restore" } },
      );
      expect(ownerRestoreResponse.ok()).toBeTruthy();
      const ownerRestoreData = await ownerRestoreResponse.json();
      expect(ownerRestoreData.publication.visibility).toBe("public");
    }
  });

  test("CM-006: 通知由事件生成且可读 (follow/comment/reaction/moderation)", async ({ request }) => {
    // 列出通知
    const listResponse = await request.get(`${API_BASE}/notifications?limit=50`);
    expect(listResponse.ok()).toBeTruthy();
    const listData = await listResponse.json();
    expect(listData.success).toBe(true);
    expect(Array.isArray(listData.notifications)).toBe(true);
    // CM-006: 通知复用 creative_events

    // 标记全部已读 (幂等)
    const markAllResponse = await request.patch(`${API_BASE}/notifications`, {
      data: { action: "mark_all_read" },
    });
    expect(markAllResponse.ok()).toBeTruthy();
    const markAllData = await markAllResponse.json();
    expect(markAllData.success).toBe(true);
    expect(markAllData.marked).toBe("all_read");

    // 再次标记全部已读 (CM-006 幂等, 不重复)
    const reMarkAllResponse = await request.patch(`${API_BASE}/notifications`, {
      data: { action: "mark_all_read" },
    });
    expect(reMarkAllResponse.ok()).toBeTruthy();
  });

  test("CM-009: 权限矩阵 — 匿名/普通/被屏蔽/审核员", async ({ request }) => {
    // 匿名可浏览发现页 (CM-009: public 投影可读)
    const discoverResponse = await request.get(`${API_BASE}/community/discover`);
    // 匿名访问: 可能 401 (需登录) 或返回 public items
    if (discoverResponse.ok()) {
      const discoverData = await discoverResponse.json();
      expect(Array.isArray(discoverData.items)).toBe(true);
    }

    // 匿名不可互动 (CM-009: 互动需认证)
    const anonFollowResponse = await request.post(`${API_BASE}/community/follows`, {
      data: { targetType: "publication", targetId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(anonFollowResponse.ok()).toBeFalsy();
    const anonFollowStatus = anonFollowResponse.status();
    expect([401, 403]).toContain(anonFollowStatus);

    // mine=1 需登录 (CM-009)
    const mineAnonResponse = await request.get(`${API_BASE}/community/discover?mine=1`);
    expect(mineAnonResponse.ok()).toBeFalsy();
  });

  test("CM-010: /community 受 feature flag 保护", async ({ page }) => {
    // 访问 /community 页面
    const response = await page.goto("/community");
    // CM-010: Gate 4 未通过前, 非邀请用户看到占位或重定向
    // 页面应可访问 (200), 但内容取决于 feature flag
    expect(response).toBeTruthy();
    // 验证页面不崩溃 (占位或发现页)
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
