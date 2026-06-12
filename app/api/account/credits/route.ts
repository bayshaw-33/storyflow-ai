import { NextResponse } from "next/server";
import { authenticateRequest, getCreditAccount } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const credits = await getCreditAccount(user.id);

    if (!credits) {
      return NextResponse.json(
        {
          success: false,
          error: "额度系统尚未完成服务端配置，请在 Vercel 添加 SUPABASE_SERVICE_ROLE_KEY。",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      credits: {
        balance: credits.balance,
        monthlyLimit: credits.monthly_limit,
        periodStart: credits.period_start,
        periodEnd: credits.period_end,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const authError = message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";

    return NextResponse.json(
      {
        success: false,
        error: authError ? "请先登录。" : "读取额度失败，请检查 Supabase 配置。",
      },
      { status: authError ? 401 : 500 },
    );
  }
}

