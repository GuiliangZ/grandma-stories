# 奶奶的故事

一个在微信里打开的网页，用大字、大按钮引导奶奶讲自己的人生故事：
先用**语音 + 文字**问她一个问题（比如「您和您的丈夫是怎么认识的？」），
然后录音、转文字，把录音和文字一起保存下来。

目前完成的是 **UI 和手机端的完整流程**（问题 → 录音 → 听一听 → 保存 → 下一个问题 → 回看讲过的故事），
数据先存在手机浏览器里（IndexedDB）；同步到这台电脑的服务器是下一步。

## 目录

```
grandma-stories/
├── web/                     # 手机上打开的页面（纯 HTML/CSS/JS，没有任何外部依赖）
│   ├── index.html           # 六个页面：首页 / 问题 / 录音中 / 录好了 / 保存好了 / 讲过的故事(列表+详情)
│   ├── style.css            # 大字、大按钮、暖色，锁定浅色模式
│   ├── app.js               # 流程逻辑、录音、实时转文字、读问题、保存/上传接口
│   ├── questions.js         # 问题库（想加问题改这里）
│   ├── storage.js           # 手机本地存储（IndexedDB）
│   └── audio/q/*.m4a        # 每个问题的语音（Mac「婷婷」朗读，AAC）
├── make_question_audio.py   # 改了 questions.js 后重新生成语音
└── README.md
```

## 本地预览

```bash
python3 -m http.server 8767 --directory grandma-stories/web
```

浏览器打开 <http://localhost:8767/?demo>。`?demo` 是演示模式：不用麦克风，模拟录音和转文字，方便在电脑上看界面。
去掉 `?demo` 就是真实模式（会请求麦克风权限）。

Claude Code 里已经配好了 `.claude/launch.json` 的 `grandma-stories` 预览项。

## 在奶奶的微信里打开

1. 手机和 Mac 连同一个 WiFi，查 Mac 的局域网 IP（系统设置 → WiFi → 详细信息），比如 `192.168.1.10`。
2. 服务器改成对局域网开放：`python3 -m http.server 8767 --bind 0.0.0.0 --directory grandma-stories/web`
3. 把 `http://192.168.1.10:8767/` 发到奶奶的微信里（或者做成二维码），点开就是这个页面。
   微信对 http 链接可能弹「非官方网页」提示，点「继续访问」即可；也可以「在浏览器打开」。
4. 建议把链接「收藏」或置顶到聊天，奶奶下次直接点。

## 改问题、改称呼

- 问题：编辑 `web/questions.js`（保持 JSON 格式），然后 `python3 grandma-stories/make_question_audio.py` 重新生成语音。
- 称呼（默认「奶奶」）、以后的服务器地址：在 `web/app.js` 顶部的 `CONFIG` 里。

## 手机上怎么工作的

| 功能 | 现在的做法 | 备注 |
|---|---|---|
| 读问题 | 优先播放 `audio/q/<id>.m4a`，播不了就用手机自带朗读 | 预生成的语音在微信里最可靠 |
| 录音 | `MediaRecorder`（iOS 出 m4a，安卓出 webm） | 见下面「已知风险」 |
| 实时转文字 | 手机支持 `SpeechRecognition` 就实时显示；不支持就先存录音，等电脑转 | 微信内置浏览器基本不支持实时识别，所以电脑端转写是主路径 |
| 保存 | 录音 + 文字 + 问题 + 时间存进手机 IndexedDB；`CONFIG.serverUrl` 有值时同时 POST 到电脑 | 上传格式见下 |

上传接口（前端已经写好，等服务器实现）：`POST {serverUrl}/api/stories`，multipart 表单，
`meta` 字段是 JSON（id / questionId / question / stage / text / createdAt / duration / mimeType / filename），
`audio` 字段是录音文件。

## 下一步（还没做）

1. **电脑端服务器**（`server.py`）：接收上面的 POST，把文件存到 `stories/2026-09-25_meet-husband.m4a` + 同名 `.json`/`.txt`。
2. **电脑端转文字**：服务器收到录音后用本地 whisper（推荐 `faster-whisper`，中文效果好、离线）转写，回写 `.txt`，页面下次打开时拉取更新。
3. **同步**：页面启动时把手机里没上传成功的故事补传。
4. 可选：把所有故事导出成一本带音频的 HTML / PDF「回忆录」。

## 已知风险

- **微信 iOS 内置浏览器的录音**：苹果手机上的微信对网页麦克风（`getUserMedia`）支持不稳定，安卓微信一般没问题。
  如果奶奶用 iPhone 且微信里录不了，备选方案：让她用 Safari 打开同一个链接（可以「添加到主屏幕」当 App 用），
  或者把这套 UI 移植成真正的微信小程序（小程序的录音 API 很稳，但需要注册 AppID 和开发者工具）。
- 微信的「字体大小」设置会放大网页，代码里已经调用 `setFontSizeCallback` 锁定，避免排版错乱。
