# AIVPlayer 智谱翻译 Worker

这个 Worker 是 AIVPlayer 的服务端翻译代理：客户端只发送字幕翻译请求，智谱 API Key 只保存在 Cloudflare Worker Secret 中，不进入客户端安装包、Git 仓库或 Worker 源码。

## 部署

在项目根目录执行：

```bash
cd cloudflare/translation-worker
wrangler secret put BIGMODEL_API_KEY
wrangler deploy
```

`wrangler secret put` 会交互式读取 Key。不要把 Key 写进 `.env`、`wrangler.jsonc`、源码或命令历史。

也可以在 Cloudflare 控制台配置：

1. 打开 [aivplayer-translation Worker 的 Variables and Secrets 页面](https://dash.cloudflare.com/c57c83028780abdf346c0ae895b7c4dc/workers/services/view/aivplayer-translation/production/settings/variables)。
2. 选择 `Add` / `添加`，类型选择 `Secret` / `加密变量`。
3. 名称填写 `BIGMODEL_API_KEY`，值填写 BigModel 的完整 API Key，然后保存。

这个 Secret 只会注入 Worker 服务端，不会进入客户端、Git 仓库或响应内容。

部署后检查：

```bash
curl https://aivplayer-translation.<你的账户>.workers.dev/health
```

预期返回：

```json
{"status":"ok","model":"glm-4-flash"}
```

## 接口

翻译接口保持 OpenAI Chat Completions 形状：

```bash
curl https://aivplayer-translation.<你的账户>.workers.dev/v1/chat/completions \
  -H 'Authorization: Bearer public' \
  -H 'Content-Type: application/json' \
  -H 'X-AIVPlayer-Device: local-test-device' \
  -d '{
    "model": "glm-4-flash",
    "messages": [{"role": "user", "content": "把 hello 翻译成中文"}]
  }'
```

客户端传入的模型会被 Worker 固定改写为 `glm-4-flash`，避免公开代理被拿去调用其他模型。客户端的 `Bearer public` 只是兼容现有 OpenAI-compatible 请求格式的公开标记，不是安全凭证；真正的保护依赖 Worker 端的限流、每日配额和请求大小限制。

## 防刷边界

- 短时限流：默认设备和 IP 两个维度都各自每 60 秒最多 20 次，必须同时通过。
- 每日配额：默认设备和 IP 两个维度都各自每个 UTC 日最多 200 次，必须同时通过。
- 输入体积：默认最多 256 KiB。
- 消息字符数：默认最多 120,000 个字符。
- 输出 Token：默认最多 4,096，客户端更大的值会被截断。
- 没有设备标识时回退到 Cloudflare 提供的客户端 IP；同一 NAT 下的用户会共享回退配额。

这些限制是成本保护，不是“防止客户端被逆向”的绝对安全边界。桌面客户端可以被修改，所以公开免费服务仍然需要后续增加登录、订阅或更严格的用户配额。IP 和设备配额按请求开始时扣除，即使上游失败也会消耗一次额度，避免攻击者用失败请求反复撞击上游。

## 本地测试

```bash
npm test
```

本地测试只使用假的上游响应和假的 Key，不访问智谱，也不会读取用户 Key。
