type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type EvidenceDownloadRequest = {
  fetcher?: Fetcher;
  accessToken: string;
  projectId: string;
  sourceUnitId: string;
};

type EvidenceDownloadResult = {
  packageId: string;
  downloadUrl: string;
  expiresIn: number;
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function responseError(response: Response, body: Record<string, unknown>): Error {
  if (body.code === "EVIDENCE_EMPTY_CASE") {
    return new Error("当前单集还没有可打包的制作记录，请先保存一次分镜或完成一次生成。");
  }
  const message = typeof body.error === "string" && body.error.trim()
    ? body.error
    : `证据包请求失败（HTTP ${response.status}）。`;
  return new Error(message);
}

export async function requestEvidencePackageDownload(input: EvidenceDownloadRequest): Promise<EvidenceDownloadResult> {
  if (!input.accessToken) throw new Error("请先登录后再下载制作证据包。");
  if (!input.projectId || !input.sourceUnitId) throw new Error("当前作品或单集信息不完整，无法生成制作证据包。");
  const fetcher = input.fetcher ?? fetch;
  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
  };

  const createResponse = await fetcher("/api/evidence/packages", {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId: input.projectId, sourceUnitId: input.sourceUnitId }),
  });
  const created = await readJson(createResponse);
  if (!createResponse.ok || created.success !== true || typeof created.packageId !== "string") {
    throw responseError(createResponse, created);
  }

  const downloadResponse = await fetcher(`/api/evidence/packages/${encodeURIComponent(created.packageId)}/download`, {
    headers: { Authorization: headers.Authorization },
  });
  const download = await readJson(downloadResponse);
  if (!downloadResponse.ok || download.success !== true || typeof download.downloadUrl !== "string") {
    throw responseError(downloadResponse, download);
  }

  return {
    packageId: created.packageId,
    downloadUrl: download.downloadUrl,
    expiresIn: typeof download.expiresIn === "number" ? download.expiresIn : 300,
  };
}
