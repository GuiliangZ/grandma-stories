#!/bin/bash
# 把 stories/ 同步到 iCloud Drive（没有就同步到 ~/grandma-stories-backup），只增不删：备份里永远不会因为误删而丢。
cd "$(dirname "$0")/.."
SRC="$(pwd)/stories/"
DST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/grandma-stories/"
[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ] || DST="$HOME/grandma-stories-backup/"
mkdir -p "$DST" server/logs
cat > "$DST/README.txt" <<'TXT'
奶奶的故事 · 备份说明
每个用户一个文件夹（如 奶奶/），里面每条录音一个文件夹：日期_问题/
  audio.wav        录音（16kHz 单声道 WAV，任何播放器都能放）
  transcript.txt   识别出来的文字
  meta.json        问题、时间、时长、用户等信息
各用户文件夹里的 目录.md 是清单；总览.md 是全部用户的汇总。_deleted/ 是手机上删掉的。
这个备份只增不删：原目录里删掉的，这里仍然保留。
TXT
rsync -a --ignore-existing --exclude '.DS_Store' "$SRC" "$DST" && date '+%Y-%m-%d %H:%M:%S' > server/logs/last-backup && echo "已备份到 $DST（$(date '+%H:%M')）"
