# 京东云 OpenResty 配置

将 `aivplayer-translation-upstream.conf` 和 `translate.quniv.cn.conf` 复制到服务器的 `/opt/1panel/www/conf.d/`，再创建 `/opt/1panel/www/sites/translate.quniv.cn/{index,log}`。现有证书是 `*.quniv.cn`，因此新域名可以复用它；不要把证书或私钥复制到仓库。

配置加载后使用 OpenResty 的配置检查和 reload。`translate.quniv.cn` 需要在火山云 DNS 中解析到 `111.228.41.233`。
