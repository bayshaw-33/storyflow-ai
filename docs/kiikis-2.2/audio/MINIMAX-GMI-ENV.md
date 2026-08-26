# Kiikis 2.2 音频 Provider 配置

本文件只定义服务端配置项，不记录任何 API Key。密钥必须写入部署平台的 server-side environment secrets，不能进入浏览器、日志、数据库或仓库。

## Provider 路由

```env
MUSIC_PROVIDER=minimax
TTS_PROVIDER=minimax
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

可选值：`minimax`、`gmi`、`openai`、`placeholder`。生产环境优先使用官方 MiniMax；GMI 用作促销权益或故障切换路径。路由切换由服务端环境控制，用户端不显示或填写 API Key。

## MiniMax

```env
MINIMAX_API_KEY=
MINIMAX_API_KEY_PRIMARY=
MINIMAX_API_KEY_SECONDARY=
MINIMAX_ACCOUNT=primary
MINIMAX_MUSIC_MODEL=
MINIMAX_TTS_MODEL=
MINIMAX_MUSIC_API_URL=https://api.minimax.io/v1/music_generation
MINIMAX_TTS_API_URL=https://api.minimax.io/v1/t2a_async_v2
MINIMAX_TTS_QUERY_URL=https://api.minimax.io/v1/query/t2a_async_query_v2
MINIMAX_FILE_RETRIEVE_URL=https://api.minimax.io/v1/files/retrieve_content
```

`MINIMAX_API_KEY` 是单账号兼容项；配置了 `PRIMARY` / `SECONDARY` 后，服务端可通过 provider account 选择对应账号。账号切换用于权益与可靠性管理，不用于规避平台限制。

## GMI Cloud

```env
GMI_API_KEY=
GMI_AUDIO_BASE_URL=https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey
GMI_MUSIC_MODEL=minimax-music-3.0
GMI_TTS_MODEL=minimax-tts-speech-2.8-hd
```

## 部署检查

1. 只在服务端运行时注入密钥，不使用 `NEXT_PUBLIC_` 前缀。
2. 部署后访问音频能力检查接口，确认目标 kind 的 `available=true`。
3. 使用最小测试文本生成一条音乐和一条 TTS，确认结果转存到私有 `audio-assets` bucket。
4. 轮换密钥后重启服务；旧的 Provider 临时 URL 不应出现在 `storyflow_generation_jobs`、`storyflow_assets` 或日志中。

相关官方接口文档：

- MiniMax Music Generation：<https://platform.minimax.io/docs/api-reference/music-generation>
- MiniMax Async TTS Create：<https://platform.minimax.io/docs/api-reference/speech-t2a-async-create>
- MiniMax Async TTS Query：<https://platform.minimax.io/docs/api-reference/speech-t2a-async-query>
- GMI Cloud MiniMax TTS：<https://console.gmicloud.ai/model/audio/minimax-tts-speech-2.6-hd>
