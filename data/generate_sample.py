#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成批量演示爆款视频数据（模拟 MediaCrawler 输出格式）"""
import json, random, time

random.seed(20260727)

PLATFORMS = ["douyin", "kuaishou", "xiaohongshu", "bilibili", "shipinhao"]
PLATFORM_WEIGHT = [40, 18, 22, 12, 8]  # 抖音最多

LEVELS = ["low_fan", "low_burst", "mid", "head", "super"]
LEVEL_WEIGHT = [22, 26, 24, 20, 8]

TITLES = {
    "couple_funny": [
        "和男朋友互换身份一天，他彻底崩了", "当女朋友突然变严格，男友的求生欲看笑我",
        "情侣版密室逃脱，他吓到抱头痛哭", "把男友的购物车全删了，他什么反应",
        "和男朋友吵架后谁先低头实验", "假装不认识男友，他急眼的样子太好笑",
        "让男友独自带娃2小时，结局翻车", "和男朋友拍情侣写真，摄影师笑场三次",
        "男友第一次做饭，厨房变成战场", "睡前和男友互怼日常，邻居来敲门",
    ],
    "daily_prank": [
        "把男朋友的闹钟调早两小时，后果很严重", "假装快递员敲门，前男友的反应绝了",
        "在男友背后贴纸条出门，回头率200%", "把男友的鞋带系一起，他摔了个四脚朝天",
        "用冰块偷放男友衣领，他跳起来三丈高", "假装WiFi坏了，男友的戒断反应真实",
        "把男友的洗发水换成胶水，险些翻车", "让男友蒙眼猜食物，他尝出芥末那刻",
        "偷偷把男友游戏存档删了，他怀疑人生", "在男友饮料里加盐，他表情管理失败",
    ],
    "brainless": [
        "用拖把煮泡面，居然真的成功了", "把西瓜放进微波炉前先这样做",
        "一根筷子撬动整个西瓜，物理白学了", "用洗衣机洗土豆，出来居然干净",
        "胶带粘门缝防蚊子，亲测有效", "用衣架自制手机支架，省钱又好用",
        "把鸡蛋放进大米里保存，一个月不坏", "用吹风机热融胶DIY手机壳",
        "一卷保鲜膜搞定全屋收纳", "用橡皮筋套砧板，切菜不再滑",
    ],
    "reverse_plot": [
        "以为是渣男，结局反转我哭了", "假装分手测试真心，结果出乎意料",
        "看起来很穷的男友，最后亮出底牌", "前女友突然出现，剧情神反转",
        "以为是恶作剧，其实是惊喜现场", "表面冷漠的男友，背地里做了这件事",
        "假装失忆，男友的反应让人破防", "我以为他不爱我，直到看见那条短信",
        "摆摊被欺负，男友默默出手反转", "假装出轨测试，结局全员泪目",
    ],
}

AUTHORS = [
    "废柴兄弟", "甜心小剧场", "新人创作者", "程序媛的日常", "搞笑CP日记",
    "科技情侣档", "情感实验室", "复盘小王子", "阿强与小芳", "今天也很甜",
    "戏精夫妇", "整蛊小天才", "恋爱观察室", "暴躁情侣", "慢生活情侣",
    "旅行CP", "萌新夫妇", "老夫老妻日常", "二次元情侣", "乡村爱情故事",
    "都市男女", "深夜放毒夫妇", "宿舍情侣档", "食堂常客", "打工人CP",
]

FACTORS = {
    "couple_funny": ["情侣互动", "情绪递进", "生活共鸣", "角色反差"],
    "daily_prank": ["反转设计", "恶搞元素", "社交传播", "意外反应"],
    "brainless": ["实用干货", "低门槛操作", "可复制性", "生活技巧"],
    "reverse_plot": ["强反转", "情感冲击", "悬念铺垫", "神结局"],
}

HOOKS = {
    "couple_funny": "以日常情侣矛盾开场，引发「我对象也这样」的强共鸣",
    "daily_prank": "用「整蛊前奏」制造期待，观众好奇对方反应",
    "brainless": "「你绝对想不到还能这样」的反常识开场钩住停留",
    "reverse_plot": "强冲突/强悬念抛出，观众急切想知道结局",
}

STRUCTURES = {
    "couple_funny": "铺垫→小摩擦→和好→甜蜜收尾",
    "daily_prank": "设局→实施→对方反应→揭晓真相",
    "brainless": "痛点引入→方法展示→效果验证→行动号召",
    "reverse_plot": "冲突抛出→情绪酝酿→意外反转→情感升华",
}

COMMENTS = [
    "笑死我了", "这也太真实了", "我男朋友也这样", "马上去试试", "收藏了",
    "看哭了", "演技炸裂", "全程憋笑", "学到了", "感谢分享", "哈哈哈",
    "我也想玩", "太上头了", "膝盖中箭", "一模一样", "艾特我对象来看",
]

def gen_videos(n=50):
    videos = []
    now = int(time.time() * 1000)
    topics = list(TITLES.keys())
    for i in range(n):
        topic = random.choice(topics)
        title = random.choice(TITLES[topic])
        author = random.choice(AUTHORS)
        platform = random.choices(PLATFORMS, PLATFORM_WEIGHT)[0]
        level = random.choices(LEVELS, LEVEL_WEIGHT)[0]

        fans_base = {
            "low_fan": random.randint(1000, 8000),
            "low_burst": random.randint(8000, 50000),
            "mid": random.randint(50000, 300000),
            "head": random.randint(300000, 1500000),
            "super": random.randint(1500000, 5000000),
        }[level]

        like_mult = {"low_fan": 8, "low_burst": 6, "mid": 4, "head": 2.5, "super": 1.8}[level]
        likes = int(fans_base * like_mult * random.uniform(0.6, 1.6))
        plays = int(likes * random.uniform(12, 40))
        comments = int(likes * random.uniform(0.03, 0.08))
        shares = int(likes * random.uniform(0.05, 0.12))

        # 时间分散在最近7天
        age_ms = random.randint(0, 7 * 24 * 3600 * 1000)
        publish_time = now - age_ms

        factors = random.sample(FACTORS[topic], k=random.randint(2, 3))
        top_comments = random.sample(COMMENTS, k=random.randint(2, 4))

        videos.append({
            "id": f"v{i+1:03d}",
            "title": title,
            "author": author,
            "fans": fans_base,
            "likes": likes,
            "plays": plays,
            "comments": comments,
            "shares": shares,
            "platform": platform,
            "level": level,
            "topic": topic,
            "coverUrl": "",
            "publishTime": publish_time,
            "factors": factors,
            "hook3s": HOOKS[topic],
            "structure": STRUCTURES[topic],
            "topComments": top_comments,
            "difficulty": random.randint(2, 8),
            "potential": random.randint(65, 95),
        })

    # 按发布时间倒序
    videos.sort(key=lambda v: v["publishTime"], reverse=True)
    return videos

if __name__ == "__main__":
    data = gen_videos(50)
    with open("C:/Users/chenjunfeng/WorkBuddy/2026-07-27-16-04-03/workbench/data/videos.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"已生成 {len(data)} 条视频数据")
    # 统计
    from collections import Counter
    print("平台分布:", dict(Counter(v['platform'] for v in data)))
    print("等级分布:", dict(Counter(v['level'] for v in data)))
    print("题材分布:", dict(Counter(v['topic'] for v in data)))
