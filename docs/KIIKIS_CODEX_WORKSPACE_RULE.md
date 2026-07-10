# Kiikis Codex 工作区规则

从 2026-07-10 起，所有 `kiikis.com` 项目相关开发、文档、handoff、临时交接记录，统一以 NAS / SMB 工作区为准：

```txt
smb://192.168.1.176/Kiikis2026/storyflow-ai
```

在本机挂载后的路径通常为：

```txt
/Volumes/Kiikis2026/storyflow-ai
```

## 执行规则

- 所有代码读取、修改、构建、提交、推送，优先在 `/Volumes/Kiikis2026/storyflow-ai` 执行。
- 不再把 `/Users/kiikis000/Documents/Codex/.../storyflow-ai-git-push` 作为 Kiikis 的主工作区。
- 每次完成 Kiikis 工作后，必须在 SMB 项目目录内更新 handoff。
- handoff 优先写入：

```txt
/Volumes/Kiikis2026/storyflow-ai/docs/DEV_HANDOFF_LOG.md
```

- 如果未来需要额外临时交接文件，也必须生成在：

```txt
/Volumes/Kiikis2026/storyflow-ai
```

或其 `docs/` 子目录内。

## 每次开工前

```bash
cd /Volumes/Kiikis2026/storyflow-ai
git pull origin main
git status
```

然后阅读：

```txt
docs/DEV_HANDOFF_LOG.md
docs/CODEX_HANDOFF_SOP.md
docs/CODEX_TEAMMATE_ONBOARDING.md
```

## 每次收工前

1. 完成验证。
2. 更新 `docs/DEV_HANDOFF_LOG.md`。
3. 提交并推送。

```bash
git status
git add <changed-files>
git commit -m "<clear commit message>"
git push origin main
```

## 注意

本文件是给 Codex 的工作区提醒。真正的团队进度同步仍以 GitHub、`docs/DEV_HANDOFF_LOG.md` 和实际提交记录为准。
