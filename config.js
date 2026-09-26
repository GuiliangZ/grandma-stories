// ====== 这里是可以改的设置 ======
window.APP_CONFIG = {
  name: '奶奶',            // 称呼
  // 电脑上转写服务的 HTTPS 地址，例如 'https://xxxx.trycloudflare.com'（运行 server/run.sh 会打印）。
  // 也可以不改这里，直接在网址后面加 ?server=https://...&token=... 一次性设置，手机会记住。
  serverUrl: 'https://guiliangs-macbook-air.tail0b8d76.ts.net',   // 你 Mac 的 Tailscale Funnel 地址（页面放在 github.io 上时靠它找到数据）
  serverToken: '',                                                  // 口令不要写在这里（这个文件是公开的），放在链接的 ?token= 里
  questionAudioDir: 'audio/q/',   // 问题语音
  uiAudioDir: 'audio/ui/',        // 按键语音反馈
  liveCaptions: true,             // 手机支持时显示初步文字（普通话引擎，四川话不准；最终以电脑整理的为准）
};
