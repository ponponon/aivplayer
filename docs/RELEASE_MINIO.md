# Windows 安装包 MinIO 发布

GitHub Release 和 Gitee Release 继续作为普通下载入口；微软商店的 Windows 包地址使用个人服务器 MinIO 的版本化直链。

## 存储规划

使用独立的 MinIO 桶：

```text
aivplayer-releases/
└── aivplayer/
    └── <tag>/
        ├── AIVPlayer-Setup-<version>-x64.exe
        └── AIVPlayer-Setup-<version>-arm64.exe
```

发布地址形如：

```text
https://file.quniv.cn/aivplayer-releases/aivplayer/v<version>/AIVPlayer-Setup-<version>-x64.exe
https://file.quniv.cn/aivplayer-releases/aivplayer/v<version>/AIVPlayer-Setup-<version>-arm64.exe
```

`aivplayer-releases` 与现有业务桶隔离。桶只开放匿名下载，GitHub Actions 使用独立的最小权限上传凭据，不使用 MinIO 根账号。

## GitHub Secrets

在仓库的 `Settings → Secrets and variables → Actions` 中配置：

```text
MINIO_ENDPOINT          # https://file.quniv.cn
MINIO_BUCKET            # aivplayer-releases
MINIO_PUBLIC_BASE_URL   # https://file.quniv.cn/aivplayer-releases
MINIO_ACCESS_KEY        # GitHub Actions 专用访问密钥
MINIO_SECRET_KEY        # GitHub Actions 专用密钥
```

工作流使用 AWS CLI 的 S3 兼容接口上传，并强制采用 path-style 地址，避免把桶名解析成 `aivplayer-releases.file.quniv.cn`。

## 版本不可变

对象路径包含完整 Git tag。提交微软商店后，不得替换同一版本 URL 对应的二进制；如果安装包内容变化，应递增应用版本并生成新的 tag 与 URL。

## 验证

发布工作流上传后会自动检查两个 URL 是否在不跟随重定向的情况下返回 `HTTP 200`。手动检查时使用：

```bash
curl -I --max-redirs 0 https://file.quniv.cn/aivplayer-releases/aivplayer/v<version>/AIVPlayer-Setup-<version>-x64.exe
```

如果出现 `301`、`302`、`307` 或 `308`，不要把该 URL 填入 Microsoft Partner Center。
