#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MediaCrawler 输出 -> 工作台 videos.json 合并工具

用法（在你自己的电脑上，MediaCrawler 跑完后）：
  python build_videos.py --src D:/MediaCrawler/data --out workbench/data/videos.json

说明：
  - 自动扫描 MediaCrawler 的 data 目录，按平台子目录归类
  - 给每条记录打上 platform 标记（app 端会再转换为标准结构）
  - 输出为「原始 MC 格式」合并文件，前端加载时自动转换，无需手动映射字段
  - 支持的平台目录：xhs / douyin / kuaishou / bilibili / weixin(视频号)
"""
import json, os, argparse

PLATFORM_DIR_MAP = {
    'xhs': 'xiaohongshu',
    'xiaohongshu': 'xiaohongshu',
    'douyin': 'douyin',
    'kuaishou': 'kuaishou',
    'bilibili': 'bilibili',
    'weixin': 'shipinhao',
    'shipinhao': 'shipinhao',
}


def collect(src):
    items = []
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        parts = rel.split(os.sep)
        plat_dir = parts[0] if rel and rel != '.' else None
        plat = PLATFORM_DIR_MAP.get(plat_dir)
        if not plat:
            continue
        for f in files:
            if not f.endswith('.json'):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, encoding='utf-8') as fh:
                    data = json.load(fh)
            except Exception:
                continue
            arr = data if isinstance(data, list) else (data.get('data') or data.get('videos') or [])
            for it in arr:
                if isinstance(it, dict):
                    it['platform'] = plat
                    items.append(it)
    return items


def main():
    ap = argparse.ArgumentParser(description='MediaCrawler -> videos.json 合并工具')
    ap.add_argument('--src', required=True, help='MediaCrawler 的 data 目录，如 D:/MediaCrawler/data')
    ap.add_argument('--out', required=True, help='输出 videos.json 路径，如 workbench/data/videos.json')
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        print('❌ 源目录不存在:', args.src)
        return

    items = collect(args.src)
    if not items:
        print('⚠️ 未扫描到任何 JSON 记录，请检查 --src 路径（应为 MediaCrawler 的 data 目录）')
        return

    # 去重
    seen, uniq = set(), []
    for it in items:
        pid = (it.get('note_id') or it.get('aweme_id') or it.get('photo_id')
               or it.get('bvid') or json.dumps(it, sort_keys=True)[:60])
        if pid in seen:
            continue
        seen.add(pid)
        uniq.append(it)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(uniq, fh, ensure_ascii=False, indent=2)

    # 平台统计
    from collections import Counter
    stat = Counter(it.get('platform') for it in uniq)
    print(f'✅ 合并 {len(uniq)} 条真实爆款 -> {args.out}')
    print('   平台分布:', dict(stat))


if __name__ == '__main__':
    main()
