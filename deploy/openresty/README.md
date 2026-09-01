# 京东云 OpenResty 配置

将 `aivplayer-translation-upstream.conf` 和 `translate.quniv.cn.conf` 复制到服务器的 `/opt/1panel/www/conf.d/`，再创建 `/opt/1panel/www/sites/translate.quniv.cn/{index,log}`。现有证书是 `*.quniv.cn`，因此新域名可以复用它；不要把证书或私钥复制到仓库。

配置加载后使用 OpenResty 的配置检查和 reload。当前 `quniv.cn` 的权威 DNS 在 Cloudflare，因此需要在 Cloudflare DNS 中将 `translate.quniv.cn` 解析到 `111.228.41.233`；大陆入口建议使用“仅 DNS（灰云）”，由京东云源站直接提供 HTTPS。
