/**
 * MediaCrawler 数据适配器
 * 将 MediaCrawler 各平台原始输出映射为工作台所需的标准视频结构
 * 支持：抖音 / 小红书 / 快手 / B站 / 视频号
 */

// 把 "1.2万" / "1.2w" / "12000" / "12.3万" 转为数字
function parseCount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const s = String(val).trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/([\d.]+)\s*(万|w|亿|e)/);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2];
    if (unit === '亿' || unit === 'e') return Math.round(n * 1e8);
    return Math.round(n * 1e4); // 万 / w
  }
  const plain = parseFloat(s.replace(/[^\d.]/g, ''));
  return isNaN(plain) ? 0 : Math.round(plain);
}

// 各平台字段映射（取第一个命中的字段名）
const PLATFORM_MAPS = {
  xiaohongshu: {
    id: ['note_id', 'id'],
    title: ['title', 'display_title', 'nickname'],
    desc: ['desc', 'description'],
    author: ['nickname', 'author'],
    fans: ['fans_count', 'follower_count', 'fans'],
    likes: ['liked_count', 'like_count', 'likes'],
    plays: ['view_count', 'play_count', 'views'],
    comments: ['comment_count', 'comments'],
    shares: ['share_count', 'shares'],
    time: ['time', 'add_ts', 'add_time', 'last_update_time', 'create_time'],
    tags: ['tag_list', 'tags'],
  },
  douyin: {
    id: ['aweme_id', 'awemeId', 'id'],
    title: ['desc', 'title'],
    desc: ['desc', 'title'],
    author: ['nickname', 'author', 'author__nickname'],
    fans: ['fans_count', 'follower_count'],
    likes: ['liked_count', 'like_count', 'likes'],
    plays: ['view_count', 'play_count', 'statistics.view_count'],
    comments: ['comment_count', 'comments'],
    shares: ['share_count', 'shares', 'statistics.share_count'],
    time: ['create_time', 'add_ts', 'publish_time'],
    tags: ['tags', 'text_extra'],
  },
  kuaishou: {
    id: ['photo_id', 'id'],
    title: ['caption', 'desc', 'title'],
    desc: ['caption', 'desc'],
    author: ['author_name', 'nickname', 'author'],
    fans: ['fans_count', 'follower_count'],
    likes: ['liked_count', 'like_count', 'likes'],
    plays: ['view_count', 'play_count', 'views'],
    comments: ['comment_count', 'comments'],
    shares: ['share_count', 'shares'],
    time: ['timestamp', 'create_time', 'add_ts'],
    tags: ['tags', 'label'],
  },
  bilibili: {
    id: ['bvid', 'aid', 'video_id', 'id'],
    title: ['title'],
    desc: ['desc', 'description'],
    author: ['author', 'nickname', 'owner.name'],
    fans: ['fans', 'follower_count'],
    likes: ['liked_count', 'like_count', 'likes'],
    plays: ['view_count', 'click_count', 'plays', 'video_play_count'],
    comments: ['comment_count', 'comments', 'reply_count'],
    shares: ['share_count', 'shares', 'dynamic_count'],
    time: ['pubdate', 'create_time', 'add_ts'],
    tags: ['tag', 'tags', 'dynamic'],
  },
  shipinhao: {
    id: ['id', 'item_id', 'finder_id'],
    title: ['title', 'description'],
    desc: ['description', 'desc'],
    author: ['nickname', 'author', 'finder_name'],
    fans: ['fans_count', 'follower_count'],
    likes: ['liked_count', 'like_count', 'likes'],
    plays: ['play_count', 'view_count', 'plays'],
    comments: ['comment_count', 'comments'],
    shares: ['share_count', 'shares'],
    time: ['create_time', 'publish_time', 'add_ts'],
    tags: ['tags', 'tag_list'],
  },
};

const PLATFORM_LABEL = {
  xiaohongshu: '小红书', douyin: '抖音', kuaishou: '快手',
  bilibili: 'B站', shipinhao: '视频号',
};

// 爆款门槛：点赞 >= 1万 或 播放 >= 10万（低于此视为非爆款，前端默认隐藏）
const BURST_MIN_LIKES = 10000;
const BURST_MIN_PLAYS = 100000;

// 解析各平台"观看原视频"链接
function resolveUrl(raw, platform, rawId) {
  const direct = getField(raw, ['aweme_url', 'note_url', 'share_url', 'web_url', 'url', 'video_url']);
  if (direct && /^https?:\/\//.test(String(direct))) return String(direct);
  if (platform === 'douyin' && rawId) return 'https://www.douyin.com/video/' + rawId;
  if (platform === 'xiaohongshu' && rawId) return 'https://www.xiaohongshu.com/explore/' + rawId;
  if (platform === 'kuaishou' && rawId) return 'https://www.kuaishou.com/short-video/' + rawId;
  if (platform === 'bilibili' && rawId) return 'https://www.bilibili.com/video/' + rawId;
  return '';
}

// 根据标题/互动生成"爆款原因"文案（离线启发式，保证每个爆款都有可看的拆解）
function genBurstReason(v) {
  const likes = v.likes || 0;
  const plays = v.plays || 0;
  const topicName = {
    couple_funny: '情侣搞笑', daily_prank: '日常整蛊',
    brainless: '无脑操作', reverse_plot: '反转剧情',
  }[v.topic] || '情侣搞笑';
  const likeText = likes >= 1000000 ? '百万级点赞' : likes >= 100000 ? '十万级点赞' : likes >= 10000 ? '万级点赞' : '较高互动';
  const reasons = {
    couple_funny: `「${topicName}」精准命中年轻情侣群体的日常共鸣点，${likeText}验证情绪价值到位；前3秒用生活化冲突锁停留，评论区易引发"我对象也这样"的模仿式互动，自带传播杠杆。`,
    daily_prank: `「${topicName}」靠强反转+意外反应制造惊喜感，${likeText}说明钩子有效；这类内容成本低、可复制，非常适合翻拍二创。`,
    brainless: `「${topicName}」提供低门槛实用干货，${likeText}反映用户"看完想试试"的冲动，收藏/转发意愿高，长尾流量好。`,
    reverse_plot: `「${topicName}」依赖强反转与悬念铺垫，${likeText}证明情绪冲击到位，完播率与讨论度通常更高，容易进入推荐池。`,
  };
  return reasons[v.topic] || reasons.couple_funny;
}

// 从嵌套字段取值，支持 "a.b" 路径
function getField(obj, keys) {
  for (const k of keys) {
    if (!k) continue;
    let cur = obj;
    let ok = true;
    for (const part of k.split('.')) {
      if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

// 根据点赞数估算爆款等级（真实粉丝数未知时的代理规则）
function computeLevel(likes) {
  if (likes >= 5000000) return 'super';
  if (likes >= 1000000) return 'head';
  if (likes >= 200000) return 'mid';
  if (likes >= 50000) return 'low_burst';
  return 'low_fan';
}

// 根据标题/描述关键词推断题材赛道
function inferTopic(text) {
  const t = (text || '').toLowerCase();
  if (/(反转|反杀|没想到|结局|亮底牌|破防)/.test(t)) return 'reverse_plot';
  if (/(整蛊|恶搞|骗|套路|整人)/.test(t)) return 'daily_prank';
  if (/(教程|怎么|如何|技巧|方法|无脑|实操)/.test(t)) return 'brainless';
  return 'couple_funny'; // 默认情侣搞笑（本工作台主赛道）
}

const TOPIC_FACTORS = {
  couple_funny: ['情侣互动', '情绪共鸣', '生活化'],
  daily_prank: ['反转设计', '整蛊元素', '意外反应'],
  brainless: ['实用干货', '低门槛', '可复制'],
  reverse_plot: ['强反转', '悬念铺垫', '情感冲击'],
};

// 确保分析类字段存在（真实数据常缺这些，用启发式补全，保证详情弹窗可用）
function ensureAnalysisFields(v) {
  const topic = v.topic || 'couple_funny';
  if (!v.factors || !v.factors.length) {
    v.factors = (TOPIC_FACTORS[topic] || TOPIC_FACTORS.couple_funny).slice();
  }
  if (!v.hook3s) {
    v.hook3s = '基于真实爆款数据：前3秒用强冲突/悬念开场锁定停留，具体钩子需结合画面判断';
  }
  if (!v.structure) {
    v.structure = '铺垫→冲突→反转→收尾（基于同类爆款通用结构）';
  }
  if (!v.topComments || !v.topComments.length) {
    v.topComments = ['真实爆款', '数据来源 MediaCrawler', '可参考翻拍'];
  }
  if (!v.difficulty) v.difficulty = 4;
  if (!v.potential) v.potential = 75;
  // 爆款原因（每个爆款都给出可看的拆解）
  if (!v.reason) v.reason = genBurstReason(v);
  return v;
}

// 单条转换
function transformRawItem(raw, platform) {
  const map = PLATFORM_MAPS[platform] || PLATFORM_MAPS.douyin;
  const title = getField(raw, map.title) || getField(raw, map.desc) || '未命名视频';
  const desc = getField(raw, map.desc) || '';
  const author = getField(raw, map.author) || '未知作者';
  const likes = parseCount(getField(raw, map.likes));
  const plays = parseCount(getField(raw, map.plays)) || Math.round(likes * 15);
  const comments = parseCount(getField(raw, map.comments));
  const shares = parseCount(getField(raw, map.shares));
  const fans = parseCount(getField(raw, map.fans));

  let ts = getField(raw, map.time);
  if (typeof ts === 'string' && /^\d{10,13}$/.test(ts)) ts = parseInt(ts);
  if (typeof ts === 'number') {
    if (ts < 1e12) ts = ts * 1000; // 秒级转毫秒
  } else {
    ts = Date.now() - Math.floor(Math.random() * 7 * 86400000);
  }

  const tags = getField(raw, map.tags);
  const tagText = Array.isArray(tags)
    ? tags.map(t => (typeof t === 'string' ? t : (t.name || t.tag || ''))).join(' ')
    : (typeof tags === 'string' ? tags : '');

  const topic = inferTopic(title + ' ' + desc + ' ' + tagText);
  const level = computeLevel(likes);

  const rawId = getField(raw, map.id) || (Date.now() + Math.random().toString(36).slice(2, 7));
  const url = resolveUrl(raw, platform, rawId);
  const isBurst = (likes >= BURST_MIN_LIKES) || (plays >= BURST_MIN_PLAYS);

  const v = {
    id: 'mc_' + rawId,
    title: String(title).slice(0, 80),
    author: String(author),
    fans: fans || 0,
    likes, plays, comments, shares,
    platform,
    level,
    topic,
    url,
    isBurst,
    coverUrl: getField(raw, ['cover', 'cover_url', 'avatar', 'note_cover']) || '',
    publishTime: ts,
    fromCrawler: true,
  };
  return ensureAnalysisFields(v);
}

// 检测是否为 MediaCrawler 原始格式
function detectMediaCrawler(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  const sample = data[0];
  const mcKeys = ['note_id', 'aweme_id', 'photo_id', 'bvid', 'liked_count', 'view_count', 'nickname', 'desc', 'caption'];
  const myKeys = ['factors', 'hook3s', 'structure', 'potential'];
  const hasMc = mcKeys.some(k => k in sample);
  const hasMine = myKeys.some(k => k in sample);
  return hasMc && !hasMine;
}

// 批量转换（可传平台提示；不传则尝试从数据/单条 platform 字段推断）
function transformMediaCrawler(data, platformHint) {
  if (!Array.isArray(data)) return [];
  return data.map(raw => {
    const p = raw.platform || platformHint || (() => {
      const k = Object.keys(raw || {});
      if (k.includes('note_id')) return 'xiaohongshu';
      if (k.includes('aweme_id')) return 'douyin';
      if (k.includes('photo_id')) return 'kuaishou';
      if (k.includes('bvid') || k.includes('aid')) return 'bilibili';
      return 'douyin';
    })();
    return transformRawItem(raw, p);
  });
}

// 暴露到全局
window.CrawlerAdapter = {
  parseCount, transformRawItem, transformMediaCrawler,
  detectMediaCrawler, ensureAnalysisFields, computeLevel, inferTopic,
  PLATFORM_LABEL, resolveUrl, genBurstReason,
  BURST_MIN_LIKES, BURST_MIN_PLAYS,
};
