/**
 * KIIKIS 2.1 Phase 4 — Task 4.3 E2E 测试规格
 *
 * 端到端流程: 创建资源 → 邀请 → 接受 → 协作 → 审阅 → 撤销
 *
 * Gate 3 验收:
 *   - 资源创建后即可邀请/分享/使用/授权
 *   - grant/RLS 权限矩阵通过
 *   - 撤销保留历史事实
 */
import { test, expect } from "@playwright/test";

const API_BASE = "/api/v2";

test.describe("KIIKIS 2.1 Phase 4 — Grants & Collab E2E", () => {
  test.beforeEach(async ({ page }) => {
    // 登录流程 (mock 或真实)
    await page.goto("/");
  });

  test("Gate 3: 资源创建后即可邀请、分享、使用或授权 (RG-001~006 + CO-001~008)", async ({ request }) => {
    // 1. 创建 grant (RG-001: grantorId 服务端注入)
    const grantResponse = await request.post(`${API_BASE}/grants`, {
      data: {
        resourceType: "project",
        resourceId: "test-project-1",
        granteeId: "test-user-2",
        scope: "collaboration",
        role: "editor",
        idempotencyKey: `e2e-grant-${Date.now()}`,
      },
    });
    expect(grantResponse.ok()).toBeTruthy();
    const grantData = await grantResponse.json();
    expect(grantData.success).toBe(true);
    expect(grantData.grant.scope).toBe("collaboration");
    expect(grantData.grant.role).toBe("editor");

    // 2. 创建邀请 token (RG-002: 哈希存储)
    const inviteResponse = await request.post(`${API_BASE}/grants/invite`, {
      data: {
        resourceType: "project",
        resourceId: "test-project-1",
        scope: "collaboration",
        role: "viewer",
        expiresInSeconds: 3600,
      },
    });
    expect(inviteResponse.ok()).toBeTruthy();
    const inviteData = await inviteResponse.json();
    expect(inviteData.token).toBeTruthy();
    expect(inviteData.token.startsWith("k4s_")).toBe(true);
    expect(inviteData.invite.status).toBe("pending");

    // 3. 接受邀请 (RG-002: 单次使用, 绑定)
    const acceptResponse = await request.post(`${API_BASE}/grants/invite/accept`, {
      data: { token: inviteData.token },
    });
    expect(acceptResponse.ok()).toBeTruthy();
    const acceptData = await acceptResponse.json();
    expect(acceptData.grant.scope).toBe("collaboration");

    // 4. 重复接受失败 (RG-002: 单次使用)
    const reacceptResponse = await request.post(`${API_BASE}/grants/invite/accept`, {
      data: { token: inviteData.token },
    });
    expect(reacceptResponse.ok()).toBeFalsy();

    // 5. 列出 grants (RG-003: RLS 过滤)
    const listResponse = await request.get(`${API_BASE}/grants`);
    expect(listResponse.ok()).toBeTruthy();
    const listData = await listResponse.json();
    expect(Array.isArray(listData.grants)).toBe(true);

    // 6. 创建评论 (CO-003: 锚定稳定 ID)
    const commentResponse = await request.post(`${API_BASE}/projects/test-project-1/comments`, {
      data: {
        resourceType: "project",
        resourceId: "test-project-1",
        body: "E2E test comment",
        anchorType: "paragraph",
        anchorId: "para-stable-id-1",
      },
    });
    expect(commentResponse.ok()).toBeTruthy();
    const commentData = await commentResponse.json();
    expect(commentData.comment.body).toBe("E2E test comment");

    // 7. 提交审阅 (CO-004: pending → in_review)
    const reviewResponse = await request.post(`${API_BASE}/projects/test-project-1/reviews`, {
      data: {
        action: "submit",
        resourceType: "project",
        resourceId: "test-project-1",
      },
    });
    expect(reviewResponse.ok()).toBeTruthy();
    const reviewData = await reviewResponse.json();
    expect(reviewData.review.status).toBe("in_review");

    // 8. 批准审阅 (CO-005)
    const decideResponse = await request.post(`${API_BASE}/projects/test-project-1/reviews`, {
      data: {
        action: "decide",
        reviewId: reviewData.review.id,
        decision: "approved",
        reason: "E2E approved",
      },
    });
    expect(decideResponse.ok()).toBeTruthy();
    const decideData = await decideResponse.json();
    expect(decideData.review.status).toBe("approved");

    // 9. 查询活动流 (CO-006)
    const activityResponse = await request.get(`${API_BASE}/projects/test-project-1/activity`);
    expect(activityResponse.ok()).toBeTruthy();
    const activityData = await activityResponse.json();
    expect(Array.isArray(activityData.activity)).toBe(true);

    // 10. 撤销 grant (RG-004: 不删除历史)
    const revokeResponse = await request.patch(`${API_BASE}/grants/${grantData.grant.id}`, {
      data: { action: "revoke", reason: "E2E test revoke" },
    });
    expect(revokeResponse.ok()).toBeTruthy();
    const revokeData = await revokeResponse.json();
    expect(revokeData.grant.status).toBe("revoked");
    expect(revokeData.grant.revokedAt).toBeTruthy();

    // 11. 查询已撤销的 grant 仍可获取 (RG-004: 历史保留)
    const getRevokedResponse = await request.get(`${API_BASE}/grants/${grantData.grant.id}`);
    expect(getRevokedResponse.ok()).toBeTruthy();
    const getRevokedData = await getRevokedResponse.json();
    expect(getRevokedData.grant.status).toBe("revoked");
  });

  test("RG-006: 所有权转移双方确认", async ({ request }) => {
    // 1. 发起转移
    const transferResponse = await request.post(`${API_BASE}/grants/transfer`, {
      data: {
        resourceType: "project",
        resourceId: "test-project-2",
        toOwnerId: "test-user-3",
      },
    });
    expect(transferResponse.ok()).toBeTruthy();
    const transferData = await transferResponse.json();
    expect(transferData.transfer.status).toBe("pending");

    // 2. 接收方确认 (RG-006: 双方确认)
    const confirmResponse = await request.patch(`${API_BASE}/grants/transfer`, {
      data: {
        transferId: transferData.transfer.id,
        action: "confirm",
      },
    });
    expect(confirmResponse.ok()).toBeTruthy();
    const confirmData = await confirmResponse.json();
    expect(confirmData.transfer.status).toBe("confirmed");
    expect(confirmData.transfer.confirmedAt).toBeTruthy();
  });

  test("CO-007: 通知可读和已读", async ({ request }) => {
    // 1. 列出通知
    const listResponse = await request.get(`${API_BASE}/notifications`);
    expect(listResponse.ok()).toBeTruthy();
    const listData = await listResponse.json();
    expect(Array.isArray(listData.notifications)).toBe(true);

    // 2. 标记全部已读 (CO-007: 去重)
    const markAllResponse = await request.patch(`${API_BASE}/notifications`, {
      data: { action: "mark_all_read" },
    });
    expect(markAllResponse.ok()).toBeTruthy();
  });
});
