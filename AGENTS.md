每次新增加功能，都要加到 FEATURE.md 里面，为什么要这样做？为了以后可以换一个 AI 的时候，可以从 0 到 1 重新创建

每次我指正出来的错误，得到的经验都要加到 FailureExperience.md 文件里面，避免再次犯错

且记得阅读 FEATURE.md 和 FailureExperience.md，方便了解项目的上下文

---

执行 git commit 之前，一定要检查一下是否有敏感内容泄露，比如 api key、账号密码密钥等等，如果有，就停止提交，没有你自己自己写 commit 的 message 然后 commit 就行

如果一次任务修改的文件等太多，你可以自己分阶段多次 commit，避免出现一个 commit 修改了几十个、几百个文件导致都无法 review 的问题

对了，git 的 commit message 要用中文写

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

测试用的普通图片可以用：~/Pictures/loopy.jpg

测试用的小米 live 图可以用：~/Pictures/xiaomi-live-photo.jpg

测试用的iphone live 图可以用：~/Pictures/iphone-live-photo/IMG_1390

测试用的短视频可以用（1分钟）: ~/Music/aivplayer_test_video_1min.mp4

测试用的长视频可以用(1小时24分): ~/Pictures/百万英镑.mp4

----

因为引入 lancedb ，我把 lancedb 的源码 clone 到 ~/Desktop/code/me/github/lancedb 了，你需要你可以查看

----

注意维护 Cloudflare pages ，如果更新的某些功能，你觉得需要让用户知道，记得更新 Cloudflare pages

现在已经配置 GitHub Actions 发布到 Cloudflare pages 了

-----

对于新功能，你依据情况，可以加到 README.md 和 cloudflare pages （https://aivplayer.pages.dev/） 里面

但不要什么细枝末节都加，要克制，有必要展示的才加

----

涉及以下操作时，禁止仅在默认沙盒中执行，必须使用宿主权限：
- test-proxy.sh、代理端口检测
- gh auth/status/api/run/release
- git push、git tag、GitHub/Gitee Release
- 访问 macOS Keychain、npm/GitHub/Gitee/Cloudflare
- npm install 或其他需要下载外部资源的命令

## Git Worktree 规范

- worktree 统一放在项目内 `.worktrees/`，不要放到 `~/.codex/worktrees`。
- 创建：`git worktree add .worktrees/feature-a -b feature/a`。
- `.worktrees/` 已加入 `.gitignore`，不要提交其中内容。
- 完成后执行：`git worktree remove .worktrees/feature-a && git worktree prune`。
