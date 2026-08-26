# Kiikis 2.2 GMI 音乐与配音生产验收 PRD

版本：v1.0  
验收对象：`https://www.kiikis.com` 生产环境  
验收执行：Coze  
实现与部署：Codex  
验收性质：一次性生产验收，不派发开发任务，不修改代码，不修改生产配置

## 1. 验收目标

验证 Kiikis 生产环境已经完成以下切换，并形成可使用的音频生产闭环：

1. 歌曲创作使用 GMI Cloud 的 MiniMax Music 3.0。
2. 配音使用 GMI Cloud 的 MiniMax TTS 2.8 HD。
3. GMI API Key 只在服务端使用，前端、响应、数据库和日志不可见。
4. 音频任务支持异步生成、状态轮询、失败处理和结果播放。
5. 生成结果转存到私有 Storage，不直接依赖 GMI 临时 URL。
6. 重复提交相同任务不会重复创建任务或重复扣费。
7. 歌曲工作台、配音工作台、KK 进度播报和 Universe 资产绑定不被本次切换破坏。

## 2. 执行边界

Coze 只负责验证和出具报告：

- 使用生产环境登录账号执行测试。
- 记录接口状态、任务状态、播放结果、页面截图和错误信息。
- 测试完成后直接输出验收报告。
- 不读取、复制、打印或上传任何 API Key。
- 不执行 `vercel env pull`，不查看生产密钥值。
- 不修改代码、数据库、环境变量、域名或部署。
- 不因单次 Provider 延迟而重复派发开发任务；如失败，按本文的失败分类报告。

## 3. 验收账号与测试数据

### 3.1 前提

- 必须已登录 Kiikis 生产环境。
- 测试账号只能访问自己创建的任务、资产和 Voice Line。
- 使用全新的测试项目或测试 Universe，避免污染真实作品。
- 测试结束后保留任务记录，便于 Codex 根据 job id 追踪；不要删除测试证据。

### 3.2 测试输入

音乐测试：

- 风格提示词：`cinematic synth-pop, hopeful, emotional, 90 BPM, subtle electronic pulse, female vocal`
- 歌词：

```text
[Verse]
穿过黑夜，听见远方的回声
把未完成的梦，写进下一束光

[Chorus]
我们向着天际出发
让每一次心跳回答
```

配音测试：

```text
这是 Kiikis 二点二音频链路验收，请用自然、清晰、略带电影感的中文旁白读出这句话。
```

## 4. P0 验收项：生产配置与安全

### GMI-001：能力接口返回正确

登录后访问：

```http
GET https://www.kiikis.com/api/audio/capabilities
```

通过标准：

- HTTP 状态为 `200`。
- `success` 为 `true`。
- `selected.music` 为 `gmi`。
- `selected.tts` 为 `gmi`。
- providers 中 `gmi.music=true`。
- providers 中 `gmi.tts=true`。
- GMI 模型列表包含 `minimax-music-3.0` 和 `minimax-tts-speech-2.8-hd`。
- 响应中没有 API Key、Authorization 值或其他密钥片段。

### GMI-002：未登录权限保护

退出登录或使用无登录态请求同一接口。

通过标准：

- HTTP 状态为 `401`。
- 返回“请先登录”或等价错误。
- 不泄露 Provider 配置中的敏感信息。

### GMI-003：前端与网络安全检查

在浏览器页面源代码、静态资源搜索、Network 响应和 Console 日志中搜索：

- `GMI_API_KEY`
- `MINIMAX_API_KEY`
- `Authorization: Bearer`
- API Key 的任意连续片段

通过标准：

- 以上内容均不出现在前端、网络响应或 Console 日志中。
- 浏览器只看到业务请求和任务结果，不直接调用 GMI。

## 5. P0 验收项：歌曲创作

### GMI-MUSIC-001：创建音乐任务

可以通过歌曲工作台操作；如需接口级验证，登录后发送：

```http
POST https://www.kiikis.com/api/audio/jobs
Content-Type: application/json
```

请求体：

```json
{
  "kind": "music",
  "prompt": "cinematic synth-pop, hopeful, emotional, 90 BPM, subtle electronic pulse, female vocal",
  "lyrics": "[Verse]\n穿过黑夜，听见远方的回声\n把未完成的梦，写进下一束光\n\n[Chorus]\n我们向着天际出发\n让每一次心跳回答",
  "targetId": "coze-gmi-music-test-唯一后缀",
  "targetType": "song_version",
  "inputParams": {
    "universeEntityId": "测试用实体 ID"
  }
}
```

通过标准：

- HTTP 状态为 `202`；如果 Provider 返回同步结果，允许为 `201`。
- 返回 `success=true`。
- 返回有效 `job.id`。
- provider 为 `gmi`。
- 初始任务状态为 `generating` 或先出现 `queued` 后进入 `generating`。
- 不把 GMI 临时音频 URL直接作为最终公共地址返回或保存。

### GMI-MUSIC-002：轮询与完成

使用上一步的 job id 轮询：

```http
GET https://www.kiikis.com/api/audio/jobs/{jobId}
```

建议间隔 5–10 秒，最多轮询 30 次。记录每次返回的状态。

允许的正常路径：

```text
queued → generating → result_ingesting → completed
```

通过标准：

- 最终状态为 `completed`。
- 返回可播放的签名 URL。
- 音频能够正常播放或下载。
- 任务中存在 provider、model、asset id 等安全元数据。
- `public_url` 为空或不存在，结果由私有 Storage 签名 URL 提供。
- 生成结果能在歌曲工作台显示为候选音频。

### GMI-MUSIC-003：幂等性

使用完全相同的 owner、kind、targetId、prompt、lyrics、provider 和 model 重复提交一次。

通过标准：

- 返回已有 job，而不是创建新的 job。
- `created=false` 或返回等价的幂等命中标识。
- 不产生第二条重复任务。
- 不重复触发 GMI 生成。

然后只修改 `targetId` 或测试后缀，再提交一次，确认它可以创建新的独立任务。

## 6. P0 验收项：配音与 Voice Line

### GMI-TTS-001：创建配音任务

优先通过 Dubbing Workbench 创建一条 Voice Line；如需接口级验证，登录后发送：

```http
POST https://www.kiikis.com/api/audio/jobs
Content-Type: application/json
```

请求体：

```json
{
  "kind": "tts",
  "text": "这是 Kiikis 二点二音频链路验收，请用自然、清晰、略带电影感的中文旁白读出这句话。",
  "targetId": "coze-gmi-tts-test-唯一后缀",
  "targetType": "voice_line",
  "language": "zh",
  "inputParams": {
    "voiceLineId": "测试用 Voice Line ID",
    "universeEntityId": "测试用实体 ID"
  }
}
```

如果配音工作台中已有可用的中文音色，应优先选择该音色，并将其 provider voice id 作为 `voiceProviderVoiceId` 传入。不要自行猜测音色 ID。

通过标准：

- HTTP 状态为 `202` 或同步成功时为 `201`。
- provider 为 `gmi`。
- 返回有效 job id。
- 任务进入 `generating`，可继续轮询。

### GMI-TTS-002：配音完成与播放

轮询同一 job id，直到 `completed`、`failed` 或 `provider_timeout`。

通过标准：

- 成功时 Voice Line 状态进入 `generated`。
- 生成音频可播放，中文内容可识别。
- Voice Line 绑定生成的 asset id。
- 任务中不存在伪造音频 URL。
- Dubbing Workbench 能显示逐行状态、播放按钮和错误信息。

如果 Provider 因默认音色不支持中文而失败，必须单独记录为“音色配置问题”，不要直接判定异步任务链路失败；应使用工作台中已配置的可用中文音色再次测试一次。

### GMI-TTS-003：克隆音色授权保护

创建或选择 `metadata.voiceKind=cloned` 的 Voice Profile，在没有完成授权确认的情况下生成。

通过标准：

- 请求被拒绝。
- 错误码为 `VOICE_CLONE_CONSENT_REQUIRED` 或等价明确提示。
- 不向 GMI 发起实际生成请求。

## 7. P1 验收项：工作台、KK 与 Universe

### GMI-UI-001：歌曲工作台

访问：

```text
https://www.kiikis.com/song-workbench
```

确认：

- 可以看到歌曲创作相关输入区域。
- 可以发起音乐生成。
- 页面不显示“尚未支持音频生成”之类的旧提示。
- 生成中有明确状态，不是无限期的“任务生成中”。
- 完成后可以播放、重试、比较候选结果或选择主版本（若当前账号具备对应工作台权限）。

### GMI-UI-002：配音工作台

访问：

```text
https://www.kiikis.com/dubbing-workbench
```

确认：

- 可以按角色、场景或台词批量处理。
- 每条台词有独立状态。
- 生成中、成功、失败和重试状态可区分。
- 成功后可播放并进入审核/确认流程。

### GMI-KK-001：关键节点进度播报

在音乐和配音任务过程中观察 KK 任务区域或事件流。

至少应出现以下关键节点中的实际节点：

- 任务已排队
- 正在生成
- 正在写入结果
- 已完成
- 生成失败或 Provider 超时

通过标准：

- 用户不会只看到无尽的“任务生成中”。
- 未获得 Provider 真实百分比时，不得伪造百分比。
- 事件只包含 stage、provider、model、kind 等安全字段。
- 不包含 prompt、API Key、私有路径或 Provider 临时 URL。

### GMI-UNIVERSE-001：Universe 资产绑定

将音乐或配音任务绑定到测试 Universe 实体或项目，再检查对应资产。

通过标准：

- 资产绑定使用真实 asset id，不出现 `pending`。
- metadata 能追踪 project、Universe entity、role、provider 和 model。
- 播放仍通过私有 Storage 签名 URL。
- Universe 页面或相关资产视图能找到该音频结果，若当前页面尚未展示入口，则记录为 P1 UI 缺口，不判定底层资产链路失败。

## 8. P0 权限与隔离回归

使用第二个普通账号或无权账号验证：

- 不能读取第一个账号的 audio job。
- 不能读取第一个账号的 Voice Line。
- 不能修改第一个账号的任务状态或资产。
- 未登录请求返回 `401`。
- 已过期签名 URL不能长期公开访问。

## 9. 自动化回归

在项目 checkout 中执行一次：

```bash
node --test tests/audio-provider-contract.test.mjs \
  tests/audio-provider-adapters.test.mjs \
  tests/audio-jobs.test.mjs \
  tests/audio-route-contract.test.mjs \
  tests/audio-kk-universe.test.mjs \
  tests/song-audio-contract.test.mjs \
  tests/dubbing-workbench-contract.test.mjs \
  tests/v2-voice.test.mjs
```

并执行：

```bash
git diff --check
```

通过标准：

- 所有列出的自动化测试通过。
- `git diff --check` 无输出。
- 若 Coze 当前环境无法访问 checkout，标记为“环境限制”，不要伪造测试结果。

## 10. 失败分级

### P0：阻断上线

- GMI 音乐和配音均不可用。
- API Key 出现在前端、响应或日志。
- 任务完成但没有可播放结果。
- 私有音频被公开暴露。
- 用户可以读取或修改其他用户的任务/资产。
- 重复点击产生重复 Provider 任务。

### P1：功能缺口，需要记录但不阻断本次 GMI 接入

- 某个特定音色 ID不可用，但异步 TTS 链路正常。
- Universe 已完成底层绑定，但当前页面没有展示入口。
- KK 关键节点可用，但文案或跳转细节不完整。
- 候选 A/B 操作或主版本锁定尚未完全接入。

### P2：体验问题

- 播报文案不够清晰。
- 状态刷新间隔过长但最终能完成。
- 播放器样式、按钮文案或移动端布局问题。

## 11. Coze 最终报告格式

请只提交一份最终报告，包含：

1. 验收时间、测试账号标识（不要写密码和密钥）。
2. 生产域名和部署版本/时间。
3. 每项测试的 `PASS / FAIL / BLOCKED`。
4. 音乐 job id、TTS job id、asset id（可记录，禁止记录密钥）。
5. 实际状态流转和耗时。
6. 音频是否可播放、中文配音是否可识别。
7. 能力接口和安全检查结果。
8. 页面截图或接口响应截图，敏感字段必须打码。
9. 失败项的错误码、复现步骤和分级。
10. 最终结论：

```text
P0 全部通过：建议通过本次 GMI 生产验收
存在 P0：不通过，退回 Codex 处理
仅存在 P1/P2：有条件通过，列出后续修复清单
```

## 12. 验收完成定义

满足以下条件，Coze 才可以提交“通过”：

- GMI capability 显示音乐和 TTS 均可用。
- 至少成功生成一条音乐和一条配音。
- 两类任务都经历异步状态轮询并最终可播放。
- 结果已进入私有 Storage，未保存 Provider 临时 URL 为公共地址。
- 重复提交验证通过。
- 密钥未泄露。
- 权限隔离验证通过。
- 没有 P0 阻断问题。

