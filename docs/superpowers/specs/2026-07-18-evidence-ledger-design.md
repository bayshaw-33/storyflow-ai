# Evidence Ledger 与证据包设计

## 目标

为制作工作台提供无感的、可验证的制作留痕，并在需要时生成可下载的证据包。首版覆盖 `Project + Episode + Export Artifact`，不对权属或登记作法律结论。

## 范围

自动记录的白名单事件仅限：

- 分镜快照成功保存；
- 图像或视频生成成功；
- 主参考版本选定；
- 正式导出 artifact 发布；
- 证据包生成。

不记录点击、预览、草稿编辑、拖拽、失败生成或聊天内容。证据包包含事件时间线、规范化 manifest、各对象 hash、正式导出文件、已选分镜图/视频、提示词版本和权属文件副本；不包含原始人脸/声音样本、未选素材、内部路径或密钥。

## 数据模型

### Evidence Case

`storyflow_evidence_cases` 以 `(owner_id, project_id, episode_id)` 唯一标识一个证据范围，并维护当前序号与最后一条事件 hash。不同项目或集不能共享事件。

### Evidence Event

`storyflow_evidence_events` 为 append-only 事实记录。每行保存 case、序号、事件类型、发生者、关联对象类型/ID/版本、规范化 JSON payload、对象 SHA-256、`previous_event_hash` 与 `event_hash`。同一 case 的 `(case_id, sequence_number)` 唯一。

服务端通过单个 RPC 在事务中锁定 case、分配递增序号并计算/写入 hash，避免并发记录分叉。普通 authenticated 角色只可按 owner 读取，不具备插入、更新或删除权限；服务端受控路径是唯一写入方。

### Evidence Document

`storyflow_evidence_documents` 记录授权或权属文件的私有对象引用、SHA-256、文件类别与上传人。文件本身不公开，历史记录不因业务对象删除而被覆盖。

### Evidence Package

`storyflow_evidence_packages` 保存一次包生成所固定的 case 高水位事件序号、manifest SHA-256、私有 storage path、关联 export artifact 与状态。包使用内容哈希并由短期签名 URL 下载。

## 状态与表述

系统仅表达事实状态：`evidence_ready`、`rights_declared`、`registration_prepared`、`registration_submitted`、`registered`、`rejected`。任何状态均不自动推断 `rights_cleared`；`registered` 只能由受权人员在提交证据后写入，且需记录外部登记编号与文件 hash。

界面和导出文案不得声称“自动确权”“保证无争议”或“AI 作品必然享有著作权”。

## 数据流

1. 既有服务端主链在白名单成功事件后调用 `recordEvidenceEvent`。
2. RPC 追加不可变事件，并更新 case 的最新序号/hash。
3. 用户请求证据包时，服务端按 case 高水位读取事件和允许的私有对象，生成 canonical manifest 与 ZIP。
4. ZIP 经现有私有 artifact 发布链保存；成功后追加 `package_generated` 事件。
5. 下载只发放短期签名 URL，并校验 owner、project 与 episode 的作用域。

## 安全与隐私

- hash 必须由服务器计算；客户端可提交的 hash 仅作比对信息。
- package manifest 仅含 allowlist 字段，不含 prompt 正文以外的内部路径、邮箱、供应商响应或密钥。
- 原始生物特征材料被显式排除；其授权文件仅以受控私有文档和 hash 关联。
- Event payload 不接受客户端任意对象；事件类型和每类 payload 由服务端组装与验证。
- 证据链用于可验证留痕，不是法律意见，也不是权属裁定。

## 验收

- 同项目不同 episode 的证据事件与包完全隔离。
- 并发追加不会重复序号、分叉或改变既有 hash。
- authenticated 用户不能修改/删除/伪造事件或文档关联。
- 证据包的 manifest 与每个包含对象 hash 可重新校验。
- 不在白名单内的事件不能写入主证据链。
- 包中不出现原始生物特征材料、内部路径、邮箱或密钥。
- 现有 Export Artifact 的 owner 与短期签名下载限制持续有效。

## 非目标

- 不实现法律登记提交、政府接口或法律意见；仅为后续登记辅助提供事实材料与状态模型。
- 不重构现有 storyboard、generation job、compliance 或 export 模块。
- 不改动当前 TRAE 未提交的 `ProductionWorkbench` 文件。
