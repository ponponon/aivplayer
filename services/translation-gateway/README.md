# AIVPlayer 国内翻译入口

这是 AIVPlayer 内置托管翻译服务的大陆入口。它保持与 Cloudflare Worker 相同的 OpenAI-compatible 协议，但智谱 API Key 只放在京东云服务器的 Secret 文件中。

## 接口

- 健康检查：`GET /health`
- 翻译接口：`POST /v1/chat/completions`
- 公开兼容标记：`Authorization: Bearer public`
- 固定模型：`glm-4-flash-250414`

服务默认启动两个同机实例，分别监听 `127.0.0.1:18787` 和 `127.0.0.1:18788`，由 OpenResty 通过 HTTPS 域名负载均衡。两个实例都使用 `restart: unless-stopped`、容器健康检查和资源上限。

这提供的是进程级高可用；单台京东云主机、磁盘、地域或公网线路故障时仍需要海外 Cloudflare Worker 或另一台国内节点接管。

客户端会对 `https://aivplayer-translation.ponponon-universe.workers.dev/health` 和 `https://translate.quniv.cn/health` 做无正文探测，并记录短期延迟样本：不通过 IP 地理库判断用户位置；大陆网络通常会因大陆入口更快而选择大陆入口，海外网络通常会因 Worker 更快而选择全球入口，延迟接近时固定优先大陆入口。质量变化需要连续两轮确认，真实请求网络错误或 5xx 则立即降级到另一入口。VPN 开关、网络切换或跨国移动会在后续探测 / 请求失败时自动重新选择。

## 部署

在服务器部署目录创建只允许当前用户读取的 Secret 文件，不要把 Key 写进 Git、Compose 文件或 shell 命令历史：

```bash
umask 077
mkdir -p secrets
read -r -s key
printf '%s' "$key" > secrets/bigmodel_api_key
unset key
sudo chown 1000:1000 secrets/bigmodel_api_key
sudo chmod 440 secrets/bigmodel_api_key
docker compose up -d --build
```

Compose 会把该文件以只读 Secret 挂载到两个实例，不通过容器环境变量传递 Key。Docker Compose 在普通 Linux Engine 上可能不会应用文件 Secret 的 `uid/gid/mode` 字段，因此部署时要让文件属主匹配容器内的 Node UID `1000`；后续轮换 Key 也必须保留这个属主和 `0440` 权限。

部署后先用 `curl http://127.0.0.1:18787/health` 和 `curl http://127.0.0.1:18788/health` 检查两个实例，再 reload OpenResty。

服务只记录请求 ID、状态、耗时和上游状态，不记录字幕正文、IP、设备标识或 API Key。
