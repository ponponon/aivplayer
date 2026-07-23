每次新增加功能，都要加到 FEATURE.md 里面，为什么要这样做？为了以后可以换一个 AI 的时候，可以从 0 到 1 重新创建

每次我指正出来的错误，得到的经验都要加到 FailureExperience.md 文件里面，避免再次犯错

且记得阅读 FEATURE.md 和 FailureExperience.md，方便了解项目的上下文

---

执行 git commit 之前，一定要检查一下是否有敏感内容泄露，比如 api key、账号密码密钥等等，如果有，就停止提交，没有你自己自己写 commit 的 message 然后 commit 就行

---

对于 electron 的细节有不清楚的地方，可以直接去查看其源代码：~/Desktop/code/me/github/electron

---

这个项目的页面已经部署到了 cloudflare pages，对应的代码是 docs/index.html ，对应的网页是 https://aivplayer.pages.dev/
后面如果有一些更新是希望用户可以知道的，则可以加到 cloudflare pages 页面，方便用户可以知道

---

注意，后面打包的软件发布都要协同

github 发版要注意打上 tag，github releases 页面的东西也不要忘了

对了 gitee 也要，因为还要走 gitee 的 releases 让国内用户有良好的下载速度

打包出来的 windows、macos、linux 的，要上传可被用户下载

要保证流程的一致性，别出现纰漏


---

测试用的图片可以用：~/Pictures/loopy.jpg

测试用的视频可以用: ~/Music/aivplayer_test_video_1min.mp4

----

因为引入 lancedb ，我把 lancedb 的源码 clone 到 /Users/ponponon/Desktop/code/me/github/lancedb 了，你需要你可以查看