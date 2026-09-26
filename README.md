# 奶奶的故事

一个在微信里打开的网页，用大字、大按钮引导奶奶讲自己的人生故事：
先用**语音 + 文字**问她一个问题（比如「您和您的丈夫是怎么认识的？」），然后录音，
录音传回你这台 Mac，用**支持四川话的识别引擎**整理成文字，录音和文字一起存在电脑上。

- 每个按键按下去都有语音反馈（「开始录音了，请讲」「已经保存好了」……）
- 手机上录的是 16kHz 单声道 WAV，安卓、苹果一样，识别引擎直接能用
- 手机端先存一份（IndexedDB），传到电脑后再取回整理好的文字

## 线上地址（GitHub Pages）

- 正式：<https://guiliangz.github.io/grandma-stories/>
- 演示版（不用麦克风）：<https://guiliangz.github.io/grandma-stories/?demo>
- 仓库：<https://github.com/GuiliangZ/grandma-stories>

是 HTTPS，所以手机浏览器会正常弹出麦克风权限（`http://` 的局域网地址拿不到麦克风）。
奶奶在国内时 github.io 不一定打得开，正式用 Mac 的 Funnel 地址（见下），这里当备份和源码展示。

## 目录

```
grandma-stories/
├── web/                     # 手机上打开的页面（纯 HTML/CSS/JS，没有外部依赖）
│   ├── index.html           # 六个页面：首页 / 问题 / 录音中 / 录好了 / 保存好了 / 讲过的故事(列表+详情)
│   ├── config.js            # 称呼、电脑服务器地址等设置 ←改这里
│   ├── questions.js         # 问题库 ←想加问题改这里
│   ├── ui-phrases.js        # 每个按键的语音反馈文案 ←改这里
│   ├── app.js               # 流程逻辑、上传、取回文字
│   ├── speaker.js           # 语音播报（按键反馈 + 读问题）
│   ├── recorder.js          # Web Audio 录音，边录边降到 16kHz，输出 WAV
│   ├── storage.js           # 手机本地存储（IndexedDB）
│   └── audio/q/, audio/ui/  # 问题语音、按键语音（Mac「婷婷」朗读，AAC）
├── server/                  # 电脑端：接收录音 + 四川话转文字（只用 Python 标准库）
│   ├── server.py            # HTTP 服务：POST /api/stories，GET /api/stories/<id>
│   ├── run.sh               # 一键启动：服务 + Tailscale Funnel，打印给奶奶的固定 HTTPS 地址
│   ├── install-service.sh   # 装成开机自启的常驻服务
│   ├── manage.py            # 后台用户管理：users / rename-user / delete-user / index
│   ├── config.example.json  # 抄一份成 config.json，填识别引擎和密钥（config.json 不会被发布）
│   ├── transcribe.py        # 按 provider 分发
│   ├── providers/           # dashscope_asr / baidu_asr / whisper_local
│   └── audio_tools.py       # 转 16k wav、按静音切段
├── stories/                 # 收到的录音和文字（不发布），按用户分文件夹
│   ├── 总览.md              # 每个用户几条、最近一次
│   ├── users.json           # 用户名单（手机上「选人/新建名字」维护）
│   ├── 奶奶/
│   │   ├── 目录.md          # 这个人的每一条：时间、问题、时长、文字开头、文件夹
│   │   └── 2026-09-25_1541_您小时候住在哪里？家里是什么样子的？/  audio.wav  meta.json  transcript.txt
│   └── _deleted/            # 手机上删掉的录音移到这里，可找回
├── make_question_audio.py   # 改了 questions.js / ui-phrases.js 后重新生成语音
├── publish.sh               # 把 web/ + server/ 推到 GitHub Pages（deploy/ 是推上去的那份拷贝）
└── README.md
```

## 它是怎么听懂四川话的

```
奶奶的手机（微信里的网页）                      你的 Mac
 按「开始讲」→ 录 16kHz WAV ──HTTPS 隧道──→ server.py 存到 stories/
 保存后每 5 秒问一次「整理好了吗」 ←────────  识别引擎（四川话模型）写回 transcript.txt
 取回文字，显示在「讲过的故事」里
```

手机浏览器自带的实时识别只认普通话，屏幕上会标注「初步识别，四川话可能不准」；
**最终文字以电脑用方言引擎整理的为准**，整理好后会自动替换。

## 电脑端：怎么跑起来

奶奶在国内，github.io 时常打不开，所以**正式使用时页面和上传都走 Mac 上的服务**，
用 Tailscale Funnel 给这台 Mac 一个固定的 HTTPS 公网地址（免费、不用买域名）。

1. **装 Tailscale 并登录**（只做一次，要输 Mac 密码）
   ```bash
   brew install --cask tailscale-app
   ```
   然后打开 Tailscale.app 登录。
2. **配置识别引擎**
   ```bash
   cd server && cp config.example.json config.json
   ```
   打开 `config.json`：`provider` 选下面表里的一个，填对应的密钥；`token` 填一串随便的字母数字（防止别人往你电脑传东西）。
   按选的引擎装包：`pip install dashscope`（百度不用装）。
3. **启动**
   ```bash
   ./server/run.sh
   ```
   第一次会提示在 Tailscale 后台启用 HTTPS 证书和 Funnel（输出里有链接），启用后再跑一次，就会打印：
   ```
   ✓ 奶奶用这个地址：https://你的电脑名.你的tailnet.ts.net/
   ```
   **把这个地址发到奶奶的微信**，点开就能用。地址固定不变，电脑重启也一样。
4. **想让它开机自动跑**（可选）
   ```bash
   ./server/install-service.sh
   ```
   装成 LaunchAgent，崩了自动拉起；Funnel 的转发规则 run.sh 开过一次后会一直保留。

电脑要开着、别合盖（系统设置 → 电池 → 关掉「合盖睡眠」，或接电源时不睡眠）。

## 识别引擎对比（四川话）

以下都核对过官方文档（2026-09-25）。四川话在各家的语言列表里都是明写的。

| provider | 模型 | 四川话 | 长录音 | 需要什么 | 说明 |
|---|---|---|---|---|---|
| `dashscope` | `paraformer-realtime-v2` | ✅ 官方列出 | ✅ 时长不限 | 阿里云百炼 **北京地域** API Key | 本地文件直接识别，首选。中国站账号；免费额度每月 10 小时，用免费额度不需要实名，超出按量付费才要实名。 |
| `dashscope` | `qwen3-asr-flash` | ✅ 官方列出 | 单次 ≤5 分钟，程序自动按静音切段 | 百炼 API Key，北京 / 新加坡 / 美国地域都有 | **海外账号（alibabacloud.com）可用**，`region` 填 `singapore`。key 是 `sk-ws-` 开头的（业务空间里建的）必须同时填 `workspace_id`（控制台接入地址 `https://ws-xxxx.ap-southeast-1.maas.aliyuncs.com` 里的 `ws-xxxx`），否则会报 `AccessDenied.Unpurchased`。目前实际在用的就是这个。 |
| `baidu` | 短语音识别 `dev_pid=1837` | ✅ 四川话专用模型 | 单次 ≤60 秒，程序切成 55 秒段 | 百度智能云 API Key + Secret Key | 个人认证只认大陆身份证 / 外国人永久居留证 / 定居国外的中国公民护照 / 港澳台通行证。四川话免费 3 万次（10 分钟录音约 12 次）。 |
| `whisper` | faster-whisper | ❌ 只认普通话 | ✅ | `pip install faster-whisper`，离线 | 没网时兜底，四川话会错很多。 |
| `none` | – | – | – | – | 只存录音不转文字（默认）。 |

还没写进代码、但也支持四川话的（需要的话可以加）：
- **科大讯飞 录音文件转写大模型**（`language=autodialect`，202 种方言自动识别，单文件 ≤5 小时，异步；个人免费 5 小时/年）。文档 <https://www.xfyun.cn/doc/spark/asr_llm/Ifasr_llm.html>
- **腾讯云 录音文件识别** 引擎 `16k_zh_en_2.0`（大模型 2.0，31 种方言含四川；base64 上传单段 ≤5MB，要切成 ≤2 分钟；无免费额度，0.8 元/小时）。文档 <https://cloud.tencent.com/document/product/1093/37823>

密钥怎么拿、参数细节见 `server/providers/` 里每个文件开头的注释。**准确率没有实测过**：填上密钥后录一段真实的四川话试一下，不满意就换一家。

## 用户与后台管理

手机上第一次打开会先「选人 / 新建名字」，之后所有录音归到这个人名下，首页右上角「换人」可切换。
**任何手机**打开同一个链接，选同一个名字，都能看到这个人之前的录音和文字（都从 Mac 取）。

**密码**：新建名字时要设一个密码（至少 4 位，数字最好记）；以后任何手机选这个人都要输对密码才能进她的故事页、听她的录音。
输对后这部手机会记住一年，不用每次输。老用户（之前没设过密码的）第一次进时会被要求设一个。
忘了密码在 Mac 上重设：`python3 server/manage.py set-password 奶奶 1234`。家人页的口令仍然能看到所有人（管理员用）。

**退出后接着讲**：首页有「🔁 接着讲上次的问题」，故事详情页有「🎙️ 接着讲这个问题」；追问的进度按人按问题记在 Mac 上，
关掉再打开也接得上，追问问完了就是开放地接着讲，都归到同一个问题下（文件夹名带 `_追问` / `_续`）。
给奶奶的链接可以直接指定她，跳过选人：`https://…ts.net/?token=口令&user=用户ID&name=奶奶`（用户 ID 在 stories/users.json）。

Mac 上：

```bash
python3 server/manage.py users              # 列出用户和录音数
python3 server/manage.py rename-user 奶奶 外婆
python3 server/manage.py delete-user 爷爷    # 录音移到 stories/_deleted/
python3 server/manage.py index              # 重建 总览.md 和各用户的 目录.md
python3 server/manage.py set-password 奶奶 1234  # 重设密码
python3 server/manage.py backup             # 立刻备份到 iCloud Drive
```

改完用户请重启服务（`launchctl kickstart -k gui/$(id -u)/com.grandma-stories.server`）。
手机上删掉的录音在 `stories/_deleted/`；在手机网址后加 `?reset` 可清空那部手机上的本地记录。

## 家人页：听、搜、改错字、重新转写

`https://…ts.net/family.html?token=家人口令`（`server/config.json` 里的 `family_token`，只能读和改文字，不能删、不能上传）。
按人和阶段分组，能搜文字，每条可以播放、修改识别错的字（原识别结果保留在 meta.json 的 asrText 里）、重新转写。
奶奶手机上会自动拿到改过的文字。

## 讲故事的流程（为了不丢故事）

- 按「讲完了」立刻存进手机并进入「存好了」页，上传在后台进行，不用等。
- 录音时每 10 秒存一份草稿；来电话、锁屏、切到别的 App、被抢走麦克风，都会自动把讲到的存下来；页面被杀，下次打开会问「上次讲到一半的故事还在，要存下来吗」。
- 存好后接着问一句追问（每个问题有 2 条，在 questions.js 的 `followups`），「接着讲」继续同一个问题；一次打开讲满 3 段会提示「今天讲得够多了，歇一歇」。
- 「换一个问题」跳过的问题会排到最后，不会每次一打开就先弹它。

## 通知与备份

- 转写完成后 5 分钟内的故事合并成一条，推到你的微信（OpenClaw，带 m4a 录音），推不了就走 Server酱，再不行 iMessage（`server/config.json` 的 `notify`）。
- `server/install-service.sh` 把服务装成常驻任务（崩了自动拉起、防休眠）。服务自己每天 03:00 备份到 `~/grandma-stories-backup/`（只增不删）。想同步到 iCloud Drive，在终端跑 `python3 server/manage.py backup`（常驻服务里访问 iCloud Drive 会被 macOS 权限卡住）。日志在 `server/logs/`。
- 电源：建议 系统设置 → 电池 → 关掉「合盖睡眠」或接电源时「防止自动进入睡眠」，并关掉自动安装 macOS 更新。

## 语音

问题、追问和按键提示现在用阿里云 Qwen-TTS 的四川话女声「Sunny」生成（`python3 make_question_audio.py`，默认 `qwen:Sunny`）。
想换回普通话：`python3 make_question_audio.py Tingting`。

## 改问题、改称呼、改按键语音

- 问题：编辑 `web/questions.js`（保持 JSON 格式）
- 按键语音：编辑 `web/ui-phrases.js`
- 改完运行 `python3 make_question_audio.py` 重新生成语音（只重做改过的）
- 称呼（默认「奶奶」）、服务器地址：`web/config.js`

## 本地预览

```bash
python3 server/server.py          # http://localhost:8790/?demo  （server.py 顺便托管 web/）
```

`?demo` 是演示模式：不用麦克风，模拟录音和转文字。加 `&server=http://localhost:8790` 可以连本机服务试上传。
Claude Code 里有 `grandma-stories`（静态页 8767）和 `grandma-server`（8790）两个预览项。

## 发布到线上

改完 `web/` 或 `server/` 后：

```bash
./publish.sh
```

会同步到 `deploy/` 并推到 GitHub，约 1 分钟生效。`deploy/` 不要直接改。`server/config.json` 和 `stories/` 不会被推上去。

## 已知风险（奶奶在国内）

- **微信内置浏览器录音**（已按官方/社区资料核实）：iOS 14.3 以上和安卓微信都支持网页录音，前提是 HTTPS 链接、微信 App 本身在手机系统里有麦克风权限。老 iPhone（iOS 14.2 及以下）微信里录不了。录不了时页面会自动提示「点右上角 ··· → 在浏览器打开」，Safari / 系统浏览器里一定可以。
- **Tailscale Funnel 从国内访问**要经 Tailscale 的中转节点，速度没有实测。第一次先让家里人在国内点开链接试一下；打不开的话备选是 Cloudflare 隧道或国内云主机中转。
- **上传体积**：录音是 16kHz WAV，每分钟约 2MB，跨境上传慢的话可以再加一步压成 mp3 再传（Mac 用自带的 afconvert 就能解）。上传失败会自动重试，故事先存在手机里不会丢。
- 手机上的「初步文字」是普通话引擎（微信 iOS 里基本不可用，安卓要谷歌服务），仅作即时反馈；最终文字以电脑用四川话引擎整理的为准。
