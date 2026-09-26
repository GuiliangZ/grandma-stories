#!/usr/bin/env python3
"""后台用户管理（在 Mac 上跑）。用法：
    python3 server/manage.py users                     列出用户和录音数
    python3 server/manage.py rename-user 旧名 新名      改名（文件夹一起改）
    python3 server/manage.py delete-user 名字           删除用户（它的录音移到 stories/_deleted/）
    python3 server/manage.py migrate                   把早期结构（用户ID文件夹、英文问题名）改成 用户名/日期_问题
    python3 server/manage.py index                     重建每个用户的 目录.md 和 总览.md
    python3 server/manage.py backup                    立刻备份一次到 iCloud Drive
    python3 server/manage.py set-password 名字 新密码   忘了密码时重设（至少 4 位）
改完请重启服务（服务启动时会重新扫描）。"""
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import server as S  # noqa: E402  复用服务里的路径和命名规则


def stories_of(udir):
    return [d for d in sorted(udir.iterdir()) if d.is_dir() and (d / "meta.json").exists()] if udir.exists() else []


def cmd_users():
    users = S.load_users()
    print(f"{'ID':12s} {'名字':8s} 录音数  密码  文件夹")
    for u in users:
        d = S.STORIES / S.fs_name(u["name"], 20)
        print(f"{u['id']:12s} {u['name']:8s} {len(stories_of(d)):5d}   {'有' if u.get('pw') else '无'}    {d.name}/")
    extra = S.STORIES / "未分组"
    if extra.exists():
        print(f"{'-':12s} {'未分组':8s} {len(stories_of(extra)):5d}   未分组/（用户功能之前的录音）")


def find_user(key):
    for u in S.load_users():
        if key in (u["id"], u["name"]):
            return u
    sys.exit(f"没有这个用户：{key}")


def cmd_rename(old, new):
    u = find_user(old)
    new = " ".join(new.split())[:12]
    users = S.load_users()
    if any(x["name"] == new for x in users):
        sys.exit(f"已经有叫 {new} 的用户了")
    src, dst = S.STORIES / S.fs_name(u["name"], 20), S.STORIES / S.fs_name(new, 20)
    if src.exists():
        src.rename(dst)
        for d in stories_of(dst):
            m = S.read_meta(d); m["userName"] = new; S.write_meta(d, m)
    for x in users:
        if x["id"] == u["id"]:
            x["name"] = new
    S.save_users(users)
    print(f"已改名：{u['name']} → {new}（{dst.name}/）")


def cmd_delete(key):
    u = find_user(key)
    src = S.STORIES / S.fs_name(u["name"], 20)
    if src.exists():
        trash = S.STORIES / "_deleted"; trash.mkdir(exist_ok=True)
        dst = trash / f"用户_{src.name}_{time.strftime('%Y%m%d-%H%M%S')}"
        src.rename(dst)
        print(f"录音已移到 {dst}")
    S.save_users([x for x in S.load_users() if x["id"] != u["id"]])
    print(f"已删除用户：{u['name']}（{u['id']}）")


def cmd_migrate():
    users = {u["id"]: u for u in S.load_users()}
    moved = 0
    for d in list(S.STORIES.iterdir()):
        if not d.is_dir() or d.name in ("_deleted",):
            continue
        if (d / "meta.json").exists():                       # 早期：直接放在根目录的录音 → 未分组/
            m = S.read_meta(d)
            target_dir = S.STORIES / "未分组"; target_dir.mkdir(exist_ok=True)
            t = target_dir / S.story_dirname(m); i = 2
            while t.exists(): t = target_dir / f"{S.story_dirname(m)}_{i}"; i += 1
            d.rename(t); moved += 1; print(f"  {d.name} → 未分组/{t.name}")
            continue
        if d.name in users:                                  # 用户ID命名的文件夹 → 用户名
            t = S.STORIES / S.fs_name(users[d.name]["name"], 20)
            if t.exists():
                for s in stories_of(d): s.rename(t / s.name)
                d.rmdir()
            else:
                d.rename(t)
            print(f"  {d.name}/ → {t.name}/"); d = t
        for s in stories_of(d):                              # 录音文件夹：日期_英文id → 日期_问题原文
            m = S.read_meta(s); want = S.story_dirname(m)
            if s.name != want:
                t = s.parent / want; i = 2
                while t.exists(): t = s.parent / f"{want}_{i}"; i += 1
                s.rename(t); moved += 1; print(f"  {d.name}/{s.name} → {t.name}")
    print(f"迁移完成，改动 {moved} 处。请重启服务。")
    cmd_index()


def cmd_set_password(key, pw):
    if len(pw) < 4:
        sys.exit("密码至少 4 位")
    u = find_user(key)
    users = S.load_users()
    for x in users:
        if x["id"] == u["id"]:
            x["pw"] = S.hash_password(pw)
    S.save_users(users)
    print(f"已重设 {u['name']} 的密码")


def cmd_index():
    S.load_index(); S.write_indexes(); print("目录已重建：stories/总览.md 和各用户的 目录.md")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in ("users", "rename-user", "delete-user", "migrate", "index", "backup", "set-password"):
        print(__doc__); sys.exit(1)
    {"users": lambda: cmd_users(), "rename-user": lambda: cmd_rename(a[1], a[2]), "delete-user": lambda: cmd_delete(a[1]),
     "migrate": cmd_migrate, "index": cmd_index, "set-password": lambda: cmd_set_password(a[1], a[2]), "backup": lambda: (S.backup_now(S.ICLOUD_DST if S.ICLOUD_DST.parent.exists() else None), print("备份到", S.ICLOUD_DST if S.ICLOUD_DST.parent.exists() else S.BACKUP_DST))}[a[0]]()
