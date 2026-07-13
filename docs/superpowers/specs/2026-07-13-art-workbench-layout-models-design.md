# 美术工作台布局与 Atlas 模型目录修复设计

## 目标

修复美术工作台全局导航覆盖、折叠栏冲突和资产卡过度拉伸，同时将 Atlas Cloud 图片目录替换为六个已确认模型，并确保文生图与图生图请求使用正确参数。

## 范围

### 布局

- 保留全局左侧导航，并为美术工作台预留固定空间。
- 使用新的页面标记类，避免与旧版 `.art-workbench-page` 样式冲突。
- KK 助理折叠后保留清晰的顶部展开按钮，不与全局导航或“演员库”标签重叠。
- 美术资产卡使用有限宽度的自动填充网格；少量资产不再拉伸成半屏大卡。
- 浏览器级验证覆盖展开和折叠状态，以及桌面和移动视口。

### Atlas Cloud 模型

Atlas Cloud 菜单仅保留以下六个模型：

| 模型 ID | 显示名称 | 能力 | 定位 |
| --- | --- | --- | --- |
| `black-forest-labs/flux-dev` | FLUX Dev | 文生图 | Atlas 默认文生图 |
| `openai/gpt-image-2/text-to-image` | GPT Image 2 Text-to-Image | 文生图 | 高质量提示词执行 |
| `bytedance/seedream-v5.0-lite` | Seedream v5.0 Lite | 文生图 | 影视概念图 |
| `xai/grok-imagine-image/edit` | Grok Imagine Image Edit | 图生图、多参考图 | 角色与场景修改 |
| `openai/gpt-image-2/edit` | GPT Image 2 Edit | 图生图、多参考图 | Atlas 默认图生图 |
| `google/nano-banana-pro/edit-ultra` | Nano Banana Pro Edit Ultra | 图生图、多参考图 | 最高质量 Banana |

Qwen Image 和 Imagen 4 不再出现在菜单中。GPT Image 2 通过 Atlas Cloud 接入，不新增独立 Provider 或密钥。

## 交互与路由

- 供应商仍保留“智能选择 / Atlas Cloud / FLUX”。
- 选择 Atlas Cloud 且当前任务没有参考图时，模型默认为 FLUX Dev。
- 选择 Atlas Cloud 且当前任务有参考图时，模型默认为 GPT Image 2 Edit。
- 模型菜单只显示与当前任务匹配的模型：文生图不显示 Edit 模型，图生图不显示纯文生图模型。
- 手动选择与任务能力不匹配的模型时，服务端拒绝请求，不静默换成其他模型。
- 智能选择保持现有 Provider 回退能力，但 Atlas 内部默认模型遵循上述规则。

## Atlas 请求适配

- FLUX Dev：发送 `model`、`prompt`、`size`、`num_images`、`seed`。
- GPT Image 2 Text-to-Image：发送 `prompt`、`size`、`quality`、`output_format` 和 Atlas 默认低级别审核参数。
- Seedream 文生图：发送 `size`、`output_format`，候选数仍由 Kiikis 的 1/2/4 规则控制。
- Grok Edit：发送 `image_urls`、`prompt`、`aspect_ratio`、`resolution`、`num_images`。
- GPT Image 2 Edit：发送 `images`、`prompt`、`size`、`quality`、`output_format`。
- Nano Banana Pro Edit Ultra：发送 `images`、`prompt`、`aspect_ratio`、`resolution: "4k"`、`output_format`。
- 不发送模型 schema 未声明的通用字段。

## 验证标准

- Atlas 模型目录恰好包含六个确认模型，FLUX Dev 为文生图默认，GPT Image 2 Edit 为图生图默认。
- 选择模型时按任务能力过滤。
- 每类 Atlas 请求体通过单元测试验证关键字段。
- 全局导航不覆盖 KK 对话区、输入框或折叠按钮。
- 资产卡在宽屏上保持合理宽度；少于一行时不拉伸填满。
- TypeScript、现有 Node 测试和资源校验全部通过。
- Vercel Production 构建为 `READY`，线上静态资源包含新布局与模型目录。

## 非目标

- 不新增独立 GPT Image Provider。
- 不新增图片供应商密钥。
- 不重写美术工作台数据库状态层。
- 不关闭或绕过供应商安全策略。
