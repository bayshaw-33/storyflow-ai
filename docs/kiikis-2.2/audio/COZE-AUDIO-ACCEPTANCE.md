# Coze 最终验收：Kiikis 2.2 音频升级

执行方式：Codex 完成实现与推送；Coze 只执行本清单的一次性终端验收，不重复派发开发任务。

## 1. 能力与配置

- [ ] 登录后 GET `/api/audio/capabilities`，服务端音频能力检查返回 `music` 与 `tts` 的 provider、模型、`available` 状态。
- [ ] API Key 只存在服务端 secret，前端源码、网络响应和日志中不可见。
- [ ] MiniMax 与 GMI 均能被服务端 provider registry 解析；未配置时返回明确的 `PROVIDER_UNAVAILABLE`。

## 2. 音乐生成

- [ ] 登录用户提交一条带风格提示词与歌词的 music job，接口返回 `202`（异步）或 `201`（同步）。
- [ ] 轮询 `/api/audio/jobs/:jobId` 能看到 `queued → generating → result_ingesting → completed`，失败时只能进入 `failed` / `provider_timeout`。
- [ ] 完成后可播放私有 Storage 签名 URL；`storyflow_assets.public_url` 为空，音频文件位于 `audio-assets` 私有 bucket。
- [ ] 相同 owner、kind、target、prompt、provider、model 重复提交命中同一幂等任务，不重复扣费。
- [ ] Song Workbench 能展示多个候选音频，并保留 provider / model / 状态 / 错误信息。

## 3. 配音与 Voice Line

- [ ] Dubbing Workbench 可批量导入一行一句的台词，创建 Voice Profile / Voice Line。
- [ ] MiniMax 或 GMI 异步 TTS 能返回 job id；轮询完成后 Voice Line 进入 `generated` 并可播放。
- [ ] Character Passport 的 Voice Line 生成不再因异步 Provider 返回 `ASYNC_PROVIDER_NOT_SUPPORTED_IN_V1`。
- [ ] 未完成克隆声音授权时，带 `metadata.voiceKind=cloned` 的 Profile 生成必须返回 `VOICE_CLONE_CONSENT_REQUIRED`。
- [ ] 任务失败不会伪造音频 URL 或 `generated` 状态。

## 4. KK 与 Universe

- [ ] 音频任务写入 KK 任务事件：至少覆盖 `task_queued`、`task_running`、`task_ingesting`、`task_completed` / `task_failed`。
- [ ] 事件 payload 只含 stage、provider、model、kind 等安全字段，不含 prompt、API Key、私有路径或 Provider 临时 URL。
- [ ] 音频 asset metadata 绑定 `universeEntityId` / `projectId` 时使用真实 asset id，不出现 `pending`。
- [ ] Universe 绑定只保存可追踪元数据，播放仍通过私有 Storage 签名 URL 获取。

## 5. 权限与回归

- [ ] 未登录请求返回 `401`。
- [ ] 任务、asset、Voice Line 不能被其他 owner 读取或修改。
- [ ] 运行：

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

- [ ] 运行 `git diff --check` 无输出。
- [ ] 真实账号各生成一条 music 与 TTS 后，再由产品负责人确认费用、音质、延迟和权益策略。
