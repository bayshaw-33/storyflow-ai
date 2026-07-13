# 创作工作台升级设计

## 目标

将 `/novel-workbench` 内部升级为小说与剧本共用的“创作工作台”：左侧 38% 为 AI 对话与资料上传，右侧 62% 为可直接编辑 Markdown 的创作成果。旧剧本工作台保留，现有 AI、项目存储与 Universe 逻辑继续复用。

## 工作流

右侧阶段依次为：项目背景、世界观与大纲、角色 Bible、正文创作、翻译、本土化/查重/质检、导出。前三项为小说和剧本共用的前期创作三件套；进入正文创作时选择小说或剧本，选择只影响正文格式和叙述方式。

左侧对话负责讨论、反馈和生成当前阶段。用户可上传 txt、md、doc、docx、pdf、csv、html、xlsx，解析文本会进入 AI 上下文。右侧阶段标签承担导航，删除原左侧流程栏、重复生成面板、完整 AI 生成序列、按指令修改章节和小说转剧本。

## 跨工作台交接

创作工作台生成统一 `CreativeHandoffPackage`，包含来源项目 ID、标题、内容类型、前三件套、正文、翻译/本土化、Universe ID 和时间戳。

- “进入美术工作台”将交接包写入本地暂存并跳转 `/art-workbench?handoff=creative&sourceProjectId=...`。美术工作台自动载入背景、世界观、角色 Bible 与正文。
- “进入分镜/视频工作台”写入同一交接包并跳转 `/production-workbench?handoff=creative&sourceProjectId=...&mode=planning`。制片工作台自动载入正文、Universe 与视觉一致性资料。
- 第一版使用 localStorage，不新增数据库 migration；交接包结构独立，后续可原样迁移到 Supabase。

## 数据与失败处理

上传失败时保留已有对话和文档并显示错误。交接前自动保存当前项目；目标工作台只有在交接包来源 ID 与 URL 一致时才消费，避免误载其他项目。导出使用安全文件名，并在触发下载后延迟释放 Blob URL。

## 验证

交接包构建和读取采用单元测试；执行 TypeScript 检查与 Next.js production build；使用浏览器验证桌面双栏、移动标签、上传控件、阶段切换、Markdown 编辑和两个跨工作台入口。
