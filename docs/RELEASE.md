# 安装包发布

正式发布使用 GitHub Release 作为当前下载入口。

发布工作流会按 tag 构建 macOS、Windows x64 / arm64、Linux x64 / arm64 安装包，汇总并校验全部产物后创建 GitHub Release。

当前不向 MinIO、Cloudflare R2 或其他对象存储上传额外副本。若未来需要为 Microsoft Store 提供不带重定向的直链，应单独设计并验证对象存储上传方案，不要把它混入普通 Release 创建步骤。

## 版本不可变

对象存储未启用时，GitHub Release 使用完整 Git tag 作为版本标识。已发布版本不替换安装包；如果产物变化，应递增应用版本并创建新的 tag。
