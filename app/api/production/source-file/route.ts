import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { readSheet } from "read-excel-file/node";
import { authenticateRequest } from "@/lib/supabase/server";
import { createProductionId } from "@/lib/production/state";
import type { ProductionSourceFile } from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 12 * 1024 * 1024;

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "请上传文件。" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "文件过大，请控制在 12MB 以内。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    const text = await parseFile(fileName, buffer);

    if (!text.trim()) {
      return NextResponse.json({ success: false, error: "没有解析到可用文本。" }, { status: 422 });
    }

    const sourceFile: ProductionSourceFile = {
      id: createProductionId("source"),
      name: file.name,
      mimeType: file.type || "text/plain",
      size: file.size,
      textPreview: text.slice(0, 500),
      extractedText: text,
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, sourceFile });
  } catch {
    return NextResponse.json(
      { success: false, error: "文件解析失败，请换一个 txt、md、pdf、doc、docx、xlsx、csv 或 html 文件重试。" },
      { status: 500 },
    );
  }
}

async function parseFile(fileName: string, buffer: Buffer): Promise<string> {
  if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv")) {
    return buffer.toString("utf8");
  }

  if (fileName.endsWith(".html") || fileName.endsWith(".htm")) {
    return buffer
      .toString("utf8")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  if (fileName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || "";
  }

  if (fileName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (fileName.endsWith(".doc")) {
    return buffer
      .toString("utf16le")
      .replace(/\u0000/g, "")
      .replace(/[^\S\r\n]+/g, " ")
      .trim();
  }

  if (fileName.endsWith(".xlsx")) {
    const rows = await readSheet(buffer);
    return rows
      .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | "))
      .filter(Boolean)
      .join("\n");
  }

  throw new Error("UNSUPPORTED_FILE_TYPE");
}
