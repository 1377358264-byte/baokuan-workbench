#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键部署：MediaCrawler 真实数据 -> GitHub Pages 工作台

用法（在你自己的电脑上）：
  1) 先跑 MediaCrawler，得到 data/平台名/日期/*.json
  2) 执行下面命令（token 用你自己的 GitHub Personal Access Token，需 repo 权限）：
     python deploy.py --src D:/MediaCrawler/data --token ghp_xxxx
  脚本会：
     a. 扫描 MediaCrawler 输出，合并为 data/videos.json（原始格式，前端自动转换）
     b. 通过 GitHub API 上传到仓库，站点自动更新

仅更新数据时用 --src；若你也改了代码想全量同步，加 --full。
"""
import json, os, argparse, urllib.request, urllib.error, base64

PLATFORM_DIR_MAP = {
    'xhs': 'xiaohongshu', 'xiaohongshu': 'xiaohongshu',
    'douyin': 'douyin', 'kuaishou': 'kuaishou',
    'bilibili': 'bilibili', 'weixin': 'shipinhao', 'shipinhao': 'shipinhao',
}

DEFAULT_OWNER = '1377358264-byte'
DEFAULT_REPO = 'baokuan-workbench'


def collect(src):
    items = []
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        parts = rel.split(os.sep)
        plat = PLATFORM_DIR_MAP.get(parts[0] if rel and rel != '.' else None)
        if not plat:
            continue
        for f in files:
            if not f.endswith('.json'):
                continue
            try:
                with open(os.path.join(root, f), encoding='utf-8') as fh:
                    data = json.load(fh)
            except Exception:
                continue
            arr = data if isinstance(data, list) else (data.get('data') or data.get('videos') or [])
            for it in arr:
                if isinstance(it, dict):
                    it['platform'] = plat
                    items.append(it)
    return items


def api_get(token, owner, repo, path):
    req = urllib.request.Request(f"https://api.github.com/repos/{owner}/{repo}/contents/{path}")
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github+json')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return None if e.code == 404 else (_ for _ in ()).throw(e)


def put(token, owner, repo, path, full):
    with open(full, 'rb') as fh:
        content = base64.b64encode(fh.read()).decode()
    body = {"message": f"update {path}", "content": content}
    ex = api_get(token, owner, repo, path)
    if ex and 'sha' in ex:
        body['sha'] = ex['sha']
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(f"https://api.github.com/repos/{owner}/{repo}/contents/{path}", data=data, method='PUT')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/vnd.github+json')
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser(description='MediaCrawler 真实数据一键部署到 GitHub Pages')
    ap.add_argument('--src', help='MediaCrawler 的 data 目录')
    ap.add_argument('--out', default='data/videos.json', help='输出的 videos.json（默认 data/videos.json）')
    ap.add_argument('--token', required=True, help='GitHub Personal Access Token（repo 权限）')
    ap.add_argument('--owner', default=DEFAULT_OWNER)
    ap.add_argument('--repo', default=DEFAULT_REPO)
    ap.add_argument('--full', action='store_true', help='全量同步所有文件（不仅是 videos.json）')
    args = ap.parse_args()

    if args.src:
        items = collect(args.src)
        if not items:
            print('❌ 未扫描到任何 JSON，请检查 --src 路径')
            return
        seen, uniq = set(), []
        for it in items:
            pid = (it.get('note_id') or it.get('aweme_id') or it.get('photo_id')
                   or it.get('bvid') or json.dumps(it, sort_keys=True)[:60])
            if pid in seen:
                continue
            seen.add(pid)
            uniq.append(it)
        with open(args.out, 'w', encoding='utf-8') as fh:
            json.dump(uniq, fh, ensure_ascii=False, indent=2)
        from collections import Counter
        print(f'✅ 合并 {len(uniq)} 条真实爆款 -> {args.out}（平台: {dict(Counter(i.get("platform") for i in uniq))}）')

    project = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if args.full:
        targets = []
        for root, dirs, files in os.walk(project):
            if '.git' in root.split(os.sep):
                continue
            for f in files:
                if f in ('deploy.py', 'build_videos.py', 'generate_sample.py', '.DS_Store'):
                    continue
                targets.append(os.path.relpath(os.path.join(root, f), project).replace('\\', '/'))
    else:
        targets = [args.out.replace('\\', '/')]

    print(f'🚀 上传 {len(targets)} 个文件到 GitHub...')
    for rel in targets:
        full = os.path.join(project, rel.replace('/', os.sep))
        try:
            print(f'  {rel} -> {put(args.token, args.owner, args.repo, rel, full)}')
        except Exception as e:
            print(f'  {rel} -> ERR {e}')
    print(f'🌐 站点：https://{args.owner}.github.io/{args.repo}/')


if __name__ == '__main__':
    main()
