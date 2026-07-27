/**
 * 爆款工作台 - 主应用逻辑
 * 移动端PWA | MediaCrawler真实数据 | localStorage存储 | 离线可用
 */

// ===== 全局状态 =====
const App = {
  currentPage: 'radar',
  currentSubTab: 'videos', // videos | account
  filters: { level: 'all', platform: 'all', topic: 'all', burstOnly: true },
  searchQuery: '',
  timeView: 'all', // all(历史+最近一个月两板) | recent(最近一个月) | history(历史)
  videoData: [],
  usingRealData: false,
  accountData: {},
  isOnline: navigator.onLine,
  dataSourceUrl: './data/videos.json',
  accountSourceUrl: './data/accounts.json',
  lastFetchTime: null,
};

// 当前前端版本（用于确认是否加载到最新构建，避免旧缓存困惑）
const APP_VERSION = '10.1';

// ===== 工具函数 =====
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showToast(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function formatNum(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  return n.toString();
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + '分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '小时前';
  const d = Math.floor(h / 24);
  return d + '天前';
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ===== 数据存储层（localStorage） =====
const Store = {
  _prefix: 'wb_',

  get(key) {
    try {
      const raw = localStorage.getItem(this._prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  set(key, val) {
    try {
      localStorage.setItem(this._prefix + key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn('localStorage写入失败:', e);
      showToast('存储空间不足，请清理数据');
      return false;
    }
  },

  remove(key) { localStorage.removeItem(this._prefix + key); },

  // 业务数据集合
  plans() { return this.get('plans') || []; },
  savePlans(v) { return this.set('plans', v); },

  notes() { return this.get('notes') || []; },
  saveNotes(v) { return this.set('notes', v); },

  favorites() { return this.get('favorites') || []; },
  saveFavorites(v) { return this.set('favorites', v); },

  monitors() { return this.get('monitors') || []; },
  saveMonitors(v) { return this.set('monitors', v); },

  // 账号监控：用户自己的账号列表 + 每日快照
  monitorAccounts() { return this.get('monitorAccounts') || [
    { platform: 'douyin', id: '49566173638', nickname: '抖音账号', addedAt: Date.now() },
    { platform: 'xiaohongshu', id: '95886844869', nickname: '小红书账号', addedAt: Date.now() },
    { platform: 'kuaishou', id: '5530272280', nickname: '快手账号', addedAt: Date.now() },
  ]; },
  saveMonitorAccounts(v) { return this.set('monitorAccounts', v); },
  monitorSnapshots() { return this.get('monitorSnapshots') || {}; },
  saveMonitorSnapshots(v) { return this.set('monitorSnapshots', v); },
  monitorVideos() { return this.get('monitorVideos') || {}; },
  saveMonitorVideos(v) { return this.set('monitorVideos', v); },

  settings() { return this.get('settings') || {}; },
  saveSettings(v) { return this.set('settings', v); },

  history() { return this.get('analysisHistory') || []; },
  saveHistory(v) { return this.set('analysisHistory', v); },

  cachedVideos() { return this.get('cachedVideos'); },
  cacheVideos(v) { return this.set('cachedVideos', v); },

  // 历史保留：所有曾经抓取/展示过的视频，按 id 持久化，保证重开不丢
  retained() { return this.get('retained') || {}; },
  saveRetained(v) { return this.set('retained', v); },

  // 用户删除（隐藏）的视频
  deleted() { return this.get('deleted') || {}; },
  saveDeleted(v) { return this.set('deleted', v); },

  // 二创笔记：{ [videoId]: [ { ts, content } ] }
  remakes() { return this.get('remakes') || {}; },
  saveRemakes(v) { return this.set('remakes', v); },

  // 操作记录日志（最近 200 条）
  opLog() { return this.get('opLog') || []; },
  saveOpLog(v) { return this.set('opLog', v.slice(0, 200)); },

  exportAll() {
    const data = {
      version: '1.1',
      exportTime: new Date().toISOString(),
      plans: this.plans(),
      notes: this.notes(),
      favorites: this.favorites(),
      monitors: this.monitors(),
      settings: this.settings(),
      history: this.history(),
      cachedVideos: this.cachedVideos(),
      retained: this.retained(),
      deleted: this.deleted(),
      remakes: this.remakes(),
      opLog: this.opLog(),
    };
    return JSON.stringify(data, null, 2);
  },

  importAll(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.plans) this.savePlans(data.plans);
      if (data.notes) this.saveNotes(data.notes);
      if (data.favorites) this.saveFavorites(data.favorites);
      if (data.monitors) this.saveMonitors(data.monitors);
      if (data.settings) this.saveSettings(data.settings);
      if (data.history) this.saveHistory(data.history);
      if (data.cachedVideos) this.cacheVideos(data.cachedVideos);
      if (data.retained) this.saveRetained(data.retained);
      if (data.deleted) this.saveDeleted(data.deleted);
      if (data.remakes) this.saveRemakes(data.remakes);
      if (data.opLog) this.saveOpLog(data.opLog);
      return true;
    } catch (e) {
      console.error('导入失败:', e);
      return false;
    }
  }
};

// ===== 模拟MediaCrawler输出数据（开发用，生产环境替换为爬虫JSON） =====
const SAMPLE_VIDEOS = [
  {
    id: 'v001', title: '把男朋友骗去8，结果...', author: '废柴兄弟', fans: 42000,
    likes: 62000, plays: 928000, comments: 3200, shares: 5600,
    platform: 'xiaohongshu', level: 'low_burst', topic: '日常整蛊',
    coverUrl: '', publishTime: Date.now() - 60000,
    factors: ['反转设计', '情绪递进', '情侣互动'],
    hook3s: '以"骗去做某事"开头制造悬念，观众好奇结果',
    structure: '铺垫→误导→反转→爆笑收尾',
    topComments: ['笑死我了', '我也想这样搞男朋友', '太真实了'],
    difficulty: 3, potential: 92,
  },
  {
    id: 'v002', title: '假装失忆测试男友反应，结局没想到', author: '甜心小剧场', fans: 128000,
    likes: 158000, plays: 2340000, comments: 8900, shares: 12000,
    platform: 'douyin', level: 'mid', topic: '反转套路',
    coverUrl: '', publishTime: Date.now() - 1800000,
    factors: ['情感测试', '意外反转', '高互动性'],
    hook3s: '"假装失忆"强悬念开场，引发观众对男友反应的期待',
    structure: '设定情境→观察反应→意外转折→情感升华',
    topComments: ['哭了', '好甜啊', '我也要试'],
    difficulty: 5, potential: 85,
  },
  {
    id: 'v003', title: '低粉账号第一条就爆了！情侣搞笑这么拍', author: '新人创作者', fans: 3500,
    likes: 89000, plays: 1560000, comments: 5600, shares: 9800,
    platform: 'douyin', level: 'low_fan', topic: '无脑操作',
    coverUrl: '', publishTime: Date.now() - 3600000,
    factors: ['低粉逆袭', '干货分享', '可复制性强'],
    hook3s: '"低粉+第一条就爆"双重反差，吸引同赛道新人',
    structure: '痛点引入→方法展示→效果证明→行动号召',
    topComments: ['学到了', '马上试试', '感谢分享'],
    difficulty: 2, potential: 88,
  },
  {
    id: 'v004', title: '当程序员男友发现你删了他代码', author: '程序媛的日常', fans: 890000,
    likes: 456000, plays: 8900000, comments: 45000, shares: 67000,
    platform: 'bilibili', level: 'head', topic: '情侣搞笑',
    coverUrl: '', publishTime: Date.now() - 7200000,
    factors: ['职业梗', '共鸣感强', '细节丰富'],
    hook3s: '程序员+删除代码=毁灭级反应，职业人群强共鸣',
    structure: '事件触发→夸张反应→专业吐槽→和解收尾',
    topComments: ['哈哈哈真实', '代码比女朋友重要？', '程序员泪目'],
    difficulty: 6, potential: 78,
  },
  {
    id: 'v005', title: '挑战24小时不说话，看谁先憋不住', author: '搞笑CP日记', fans: 2300000,
    likes: 1200000, plays: 28000000, comments: 156000, shares: 230000,
    platform: 'kuaishou', level: 'super', topic: '情侣搞笑',
    coverUrl: '', publishTime: Date.now() - 14400000,
    factors: ['挑战类', '长时间博弈', '多反转'],
    hook3s: '"24小时不说话"极限挑战，天然悬念拉满',
    structure: '规则宣布→前期坚持→中期破功→后期报复→终极反转',
    topComments: ['全程憋笑', '我也想玩', '太上头了'],
    difficulty: 7, potential: 72,
  },
  {
    id: 'v006', title: '用AI生成的假视频骗闺蜜，她信了！', author: '科技情侣档', fans: 56000,
    likes: 34000, plays: 560000, comments: 2100, shares: 3400,
    platform: 'shipinhao', level: 'low_burst', topic: '日常整蛊',
    coverUrl: '', publishTime: Date.now() - 28800000,
    factors: ['科技热点', '整蛊', '社交传播'],
    hook3s: 'AI造假+闺蜜轻信，科技与信任的双重话题',
    structure: '工具介绍→制作过程→实施整蛊→真相揭露→反思',
    topComments: ['AI太可怕了', '好玩', '注意安全使用'],
    difficulty: 4, potential: 82,
  },
  {
    id: 'v007', title: '模仿抖音爆款翻拍，播放量差100倍为什么', author: '复盘小王子', fans: 18000,
    likes: 23000, plays: 340000, comments: 1500, shares: 2100,
    platform: 'douyin', level: 'low_fan', topic: '无脑操作',
    coverUrl: '', publishTime: Date.now() - 43200000,
    factors: ['对比分析', '干货复盘', '避坑指南'],
    hook3s: '"差100倍"巨大差距引发好奇心，想知原因',
    structure: '爆款展示→翻拍对比→差异分析→改进建议',
    topComments: ['说得太对了', '原来如此', '收藏了'],
    difficulty: 3, potential: 80,
  },
  {
    id: 'v008', title: '当女友突然说要分手，男友的反应绝了', author: '情感实验室', fans: 1560000,
    likes: 678000, plays: 12300000, comments: 52000, shares: 89000,
    platform: 'douyin', level: 'head', topic: '反转套路',
    coverUrl: '', publishTime: Date.now() - 57600000,
    factors: ['情感冲击', '神反转', '演技在线'],
    hook3s: '"突然提分手"强冲突开场，观众急切想知道反应',
    structure: '冲突抛出→情绪酝酿→意外反应→真相大白→甜蜜收尾',
    topComments: ['看哭了', '演技炸裂', '我也被吓到了'],
    difficulty: 6, potential: 76,
  },
];

const LEVEL_MAP = {
  all: '全部', low_fan: '低粉爆款', low_burst: '低粉大爆',
  mid: '腰部爆款', head: '头部爆款', super: '超级爆款'
};
const PLATFORM_MAP = {
  all: '全部平台', douyin: '抖音', kuaishou: '快手',
  xiaohongshu: '小红书', bilibili: 'B站', shipinhao: '视频号'
};
const TOPIC_MAP = {
  all: '全部题材', couple_funny: '情侣搞笑', daily_prank: '日常整蛊',
  brainless: '无脑操作', reverse_plot: '反转套路'
};

// ===== 数据加载器 =====
// 合并"历史保留"：把本地曾展示过的视频与服务端最新数据合并，去重后写回，
// 保证用户每次刷新/打开看到的爆款视频都能持久留存，不因服务端变化而丢失。
function mergeRetained(list) {
  const retained = Store.retained() || {};
  const map = {};
  // 先放旧的历史（更早展示过的）
  Object.values(retained).forEach(v => { if (v && v.id) map[v.id] = v; });
  // 再用服务端最新数据覆盖（保证数据新鲜）
  list.forEach(v => { if (v && v.id) map[v.id] = v; });
  const merged = Object.values(map);
  // 控制体积：保留最近 2000 条
  const keep = {};
  merged.slice(-2000).forEach(v => { keep[v.id] = v; });
  Store.saveRetained(keep);
  return merged;
}

async function loadVideoData(forceRefresh = false) {
  const settings = Store.settings();
  if (settings.dataSourceUrl) App.dataSourceUrl = settings.dataSourceUrl;

  // 尝试从网络加载爬虫数据
  if (!forceRefresh && !App.isOnline) {
    const cached = Store.cachedVideos();
    if (cached && cached.length > 0) {
      App.videoData = mergeRetained(cached);
      showOfflineBanner(true);
      return App.videoData;
    }
  }

  try {
    const resp = await fetch(App.dataSourceUrl + '?t=' + Date.now(), {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    let list = Array.isArray(data) ? data : (data.videos || data.list || []);
    // 自动识别 MediaCrawler 原始格式并转换为标准结构
    if (window.CrawlerAdapter && window.CrawlerAdapter.detectMediaCrawler(list)) {
      list = window.CrawlerAdapter.transformMediaCrawler(list);
    }
    // 合并历史保留
    list = mergeRetained(list);
    App.videoData = list;
    App.usingRealData = list.some(v => v.fromCrawler);
    App.lastFetchTime = Date.now();
    Store.cacheVideos(App.videoData);
    showOfflineBanner(false);
    return App.videoData;
  } catch (err) {
    console.warn('爬虫数据加载失败，使用缓存:', err.message);
    const cached = Store.cachedVideos();
    if (cached && cached.length > 0) {
      App.videoData = mergeRetained(cached);
      App.usingRealData = App.videoData.some(v => v.fromCrawler);
      showOfflineBanner(true);
      return App.videoData;
    }
    // 最终兜底：使用内置示例数据（仅首次启动无任何数据时）
    App.videoData = mergeRetained(SAMPLE_VIDEOS);
    App.usingRealData = false;
    App.lastFetchTime = Date.now();
    showOfflineBanner(true);
    return App.videoData;
  }
}

function showOfflineBanner(show) {
  const banner = $('.offline-banner');
  if (banner) banner.classList.toggle('show', show);
}

// 是否处于演示模式（未配置真实爬虫数据源）
function isDemoMode() {
  const s = Store.settings();
  return !s.dataSourceUrl || s.dataSourceUrl === './data/videos.json';
}

// 演示模式：模拟 MediaCrawler 每日抓取，生成几条新爆款
function simulateDailyCrawl() {
  const topics = ['couple_funny', 'daily_prank', 'brainless', 'reverse_plot'];
  const platforms = ['douyin', 'kuaishou', 'xiaohongshu', 'bilibili', 'shipinhao'];
  const levels = ['low_fan', 'low_burst', 'mid', 'head', 'super'];
  const titlePool = {
    couple_funny: ['和男朋友互换身份一天他崩了', '假装不认识男友他急眼了', '男友第一次做饭厨房变战场', '睡前互怼日常邻居来敲门'],
    daily_prank: ['把男友闹钟调早两小时后果严重', '用冰块偷放男友衣领他跳三丈高', '偷偷删了男友游戏存档他怀疑人生', '在男友饮料里加盐表情管理失败'],
    brainless: ['用拖把煮泡面居然成功了', '一根筷子撬动整个西瓜物理白学', '用洗衣机洗土豆出来居然干净', '一卷保鲜膜搞定全屋收纳'],
    reverse_plot: ['以为是渣男结局反转我哭了', '假装分手测试真心结果出乎意料', '表面冷漠的男友背地里做了这件事', '假装失忆男友反应让人破防'],
  };
  const authorPool = ['废柴兄弟', '甜心小剧场', '新人创作者', '阿强与小芳', '今天也很甜', '戏精夫妇', '恋爱观察室', '暴躁情侣', '萌新夫妇', '打工人CP'];
  const factorPool = {
    couple_funny: ['情侣互动', '情绪递进', '生活共鸣'],
    daily_prank: ['反转设计', '恶搞元素', '意外反应'],
    brainless: ['实用干货', '低门槛操作', '可复制性'],
    reverse_plot: ['强反转', '情感冲击', '悬念铺垫'],
  };

  const count = Math.floor(Math.random() * 4) + 3; // 3-6条
  const now = Date.now();
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const level = levels[Math.floor(Math.random() * levels.length)];
  const fansBase = { low_fan: 3000, low_burst: 30000, mid: 150000, head: 800000, super: 2500000 }[level];
  const likeMult = { low_fan: 8, low_burst: 6, mid: 4, head: 2.5, super: 1.8 }[level];

  for (let i = 0; i < count; i++) {
    const plat = platforms[Math.floor(Math.random() * platforms.length)];
    const t = titlePool[topic][Math.floor(Math.random() * titlePool[topic].length)];
    const likes = Math.floor(fansBase * likeMult * (0.6 + Math.random()));
    const video = {
      id: 'live_' + genId(),
      title: t,
      author: authorPool[Math.floor(Math.random() * authorPool.length)],
      fans: fansBase,
      likes,
      plays: Math.floor(likes * (12 + Math.random() * 28)),
      comments: Math.floor(likes * 0.05),
      shares: Math.floor(likes * 0.08),
      platform: plat,
      level,
      topic,
      coverUrl: '',
      publishTime: now - i * 1000,
      factors: factorPool[topic].slice(0, 2),
      hook3s: '模拟抓取的实时爆款，强钩子开场拉满停留',
      structure: '铺垫→冲突→反转→收尾',
      topComments: ['刚抓到', '好新鲜', '这个能翻'],
      difficulty: 2 + Math.floor(Math.random() * 6),
      potential: 70 + Math.floor(Math.random() * 25),
      isLiveDemo: true,
    };
    App.videoData.unshift(video);
  }

  App.lastFetchTime = now;
  Store.cacheVideos(App.videoData);
  return count;
}

// ===== 视频筛选与渲染 =====
function isFiltering() {
  const f = App.filters;
  return f.level !== 'all' || f.platform !== 'all' || f.topic !== 'all' || !!App.searchQuery.trim();
}

function getFilteredVideos() {
  let list = [...App.videoData];
  const f = App.filters;

  // 隐藏用户已删除的视频
  const deleted = Store.deleted();
  if (deleted && Object.keys(deleted).length) {
    list = list.filter(v => !deleted[v.id]);
  }

  // 仅看爆款（默认开启，过滤掉点赞几十/播放几百的非爆款）
  if (f.burstOnly) {
    list = list.filter(v => v.isBurst !== false);
  }

  if (f.level !== 'all') list = list.filter(v => v.level === f.level);
  if (f.platform !== 'all') list = list.filter(v => v.platform === f.platform);
  if (f.topic !== 'all') list = list.filter(v => v.topic === f.topic);

  if (App.searchQuery.trim()) {
    const q = App.searchQuery.toLowerCase();
    list = list.filter(v =>
      (v.title || '').toLowerCase().includes(q) ||
      (v.author || '').toLowerCase().includes(q)
    );
  }

  // 按发布时间倒序
  list.sort((a, b) => (b.publishTime || 0) - (a.publishTime || 0));

  return list;
}

function renderSection(title, list) {
  if (!list.length) return '';
  return `
    <div class="video-section">
      <div class="section-head">${title}<span class="section-count">${list.length}</span></div>
      <div class="section-cards">${list.map(v => renderVideoCard(v)).join('')}</div>
    </div>`;
}

function renderVideoList() {
  const container = $('#videoList');
  const base = getFilteredVideos();

  $('#resultCount').textContent = `符合条件的爆款：${base.length}条`;

  if (base.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">🔍</div>
        <p>没有找到符合条件的爆款视频<br>试试调整筛选条件，或关闭"仅看爆款"</p>
      </div>`;
    return;
  }

  // 时间分板：
  // 🔥 最近30天：发布时间 > 今天 - 30天（按发布时间划分）
  // 📚 历史：发布时间在 2026-01-01 ~ (今天 - 30天) 之间
  const now = Date.now();
  const MONTH = 30 * 86400000;
  const YEAR2026 = new Date('2026-01-01T00:00:00+08:00').getTime();
  const isRecent = (v) => (v.publishTime || 0) > now - MONTH;
  const isHistory = (v) => (v.publishTime || 0) >= YEAR2026 && (v.publishTime || 0) <= now - MONTH;

  if (App.timeView === 'recent') {
    const recent = base.filter(isRecent);
    container.innerHTML = recent.length
      ? renderSection('🔥 最近30天爆款', recent)
      : `<div class="empty-state"><div class="es-icon">📭</div><p>最近30天没有匹配的爆款视频<br>试试调整筛选或切到"全部"</p></div>`;
  } else if (App.timeView === 'history') {
    const history = base.filter(isHistory);
    container.innerHTML = history.length
      ? renderSection('📚 历史爆款（2026年至今）', history)
      : `<div class="empty-state"><div class="es-icon">📭</div><p>2026年1月1日至今没有匹配的历史爆款</p></div>`;
  } else {
    // 全部：最近30天 / 历史 两板并排
    const recent = base.filter(isRecent);
    const history = base.filter(isHistory);
    container.innerHTML =
      renderSection('🔥 最近30天爆款', recent) +
      (history.length ? renderSection('📚 历史爆款（2026年至今）', history) : '');
  }

  // 绑定卡片点击事件
  container.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action')) return; // 操作按钮不触发详情
      openVideoDetail(card.dataset.id);
    });
  });
}

function renderVideoCard(v) {
  const levelClass = `lv-${v.level || 'low_fan'}`;
  const platClass = `plat-${v.platform || 'douyin'}`;
  const levelText = LEVEL_MAP[v.level] || '未知等级';
  const platText = PLATFORM_MAP[v.platform] || '未知平台';
  const favs = Store.favorites();
  const isFav = favs.some(f => f.id === v.id);
  const remakes = Store.remakes();
  const remakeCount = (remakes[v.id] || []).length;
  const url = v.url || '';

  // 从链接中提取域名用于展示
  let urlDisplay = '';
  try { urlDisplay = new URL(url).hostname; } catch(e) { urlDisplay = platText; }
  const urlSafe = url.replace(/'/g, "\\'");

  return `
    <div class="video-card" data-id="${v.id}">
      <div class="card-cover-area">
        ${v.coverUrl
          ? `<img src="${v.coverUrl}" alt="${v.title}" loading="lazy" onerror="this.style.display='none'">`
          : `<span class="card-cover-placeholder">🎬</span>`
        }
        <div class="card-tags">
          <span class="tag-level ${levelClass}">${levelText}</span>
          <span class="tag-platform ${platClass}">${platText}</span>
        </div>
        ${url ? `<button class="card-link-btn" title="观看原视频" onclick="event.stopPropagation();openOriginal('${urlSafe}')">🔗</button>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">${v.title}</div>
        <div class="card-author">
          <span class="author-name">${v.author}</span>
          <span class="fans-count">${v.fans ? '粉丝 ' + formatNum(v.fans) : '粉丝 —'}</span>
        </div>
      </div>
      <div class="card-stats">
        <span class="stat-item"><span class="stat-icon">🔥</span>${formatNum(v.likes || 0)}</span>
        <span class="stat-item"><span class="stat-icon">▶️</span>${formatNum(v.plays || 0)}</span>
        <span class="stat-time">${timeAgo(v.publishTime)}</span>
        <span class="card-actions">
          <button class="card-action fav ${isFav ? 'on' : ''}" title="收藏" onclick="event.stopPropagation();toggleFav('${v.id}')">${isFav ? '❤️' : '🤍'}</button>
          <button class="card-action" title="二创笔记" onclick="event.stopPropagation();openRemake('${v.id}')">✏️${remakeCount ? '<i class="badge">' + remakeCount + '</i>' : ''}</button>
          <button class="card-action" title="删除" onclick="event.stopPropagation();markDeleted('${v.id}')">🗑️</button>
        </span>
      </div>
      <!-- 原视频链接：始终显示，即便URL为空也给出提示 -->
      ${url
        ? `<a class="card-orig-link" href="${url}" target="_blank" onclick="event.stopPropagation();" title="在${platText}中打开原视频">📱 在${platText}查看原视频 · <span class="orig-domain">${urlDisplay}</span></a>`
        : `<span class="card-orig-link no-link" onclick="event.stopPropagation();showToast('该视频暂无原链接')">📱 原视频链接 · 暂不可用</span>`
      }
    </div>`;
}

// 打开原视频链接（跳转对应 APP / 网页）
function openOriginal(url) {
  if (!url) { showToast('暂无原视频链接'); return; }
  window.open(url, '_blank');
  logOp('open_original', url, '打开原视频');
}

// ===== 视频详情弹窗 =====
function openVideoDetail(videoId) {
  const v = App.videoData.find(x => x.id === videoId);
  if (!v) return;
  // 真实爬虫数据可能缺少分析字段，确保补全（用于详情弹窗）
  if (window.CrawlerAdapter) window.CrawlerAdapter.ensureAnalysisFields(v);

  const levelClass = `lv-${v.level || 'low_fan'}`;
  const levelText = LEVEL_MAP[v.level] || '未知';
  const platText = PLATFORM_MAP[v.platform] || '未知平台';

  const modal = $('#detailModal');
  $('#modalTitle').textContent = v.title;
  $('#modalSubtitle').textContent = `${v.author} · ${platText} · ${levelText}`;

  $('#detailFactors').innerHTML = (v.factors || []).map(f =>
    `<span class="detail-tag">${f}</span>`
  ).join('');

  $('#detailReason').innerHTML = `<p class="detail-text">${v.reason || '暂无分析'}</p>`;
  $('#detailHook').innerHTML = `<p class="detail-text">${v.hook3s || '暂无分析'}</p>`;
  $('#detailStructure').innerHTML = `<p class="detail-text">${v.structure || '暂无分析'}</p>`;

  $('#detailComments').innerHTML = (v.topComments || []).map(c =>
    `<span class="detail-tag">${c}</span>`
  ).join('');

  $('#scoreDifficulty').querySelector('.score-value').textContent = (v.difficulty || 5) + '/10';
  $('#scorePotential').querySelector('.score-value').textContent = (v.potential || 70) + '/10';

  const adaptAdvice = generateAdaptationAdvice(v);
  $('#detailAdapt').innerHTML = `<p class="detail-text">${adaptAdvice}</p>`;

  // 操作按钮绑定
  const favs = Store.favorites();
  const isFav = favs.some(f => f.id === v.id);
  $('#btnFav').textContent = isFav ? '❤️ 已收藏' : '🤍 收藏';
  $('#btnFav').onclick = () => toggleFav(v.id, true);
  $('#btnRemake').onclick = () => openRemake(v.id);
  $('#btnDelete').onclick = () => markDeleted(v.id);
  const origBtn = $('#btnOriginal');
  if (v.url) {
    origBtn.style.display = '';
    origBtn.onclick = () => openOriginal(v.url);
  } else {
    origBtn.style.display = 'none';
  }

  modal.classList.add('show');
}

function closeDetailModal() {
  $('#detailModal').classList.remove('show');
}

function generateAdaptationAdvice(video) {
  const templates = [
    `二创改编建议：将"${video.title}"的核心反转点移植到你们的日常场景中。保留${(video.factors||[])[0]}这个关键因子，把主角换成你们自己出镜，拍摄难度降低到${Math.max(1,(video.difficulty||5)-1)}分。建议加入一个专属你们的标志性口头禅或动作作为记忆锚点。`,
    `翻拍方案：原视频的${(video.factors||[])[0]}是核心亮点。建议在保持${video.topic||'原题材'}调性的前提下，将场景换为更易复制的居家环境。重点优化前3秒钩子，用更强的视觉冲击替代原版的开场方式。`,
    `创作参考：这条视频的${LEVEL_MAP[video.level]}属性值得研究。建议拆解其${video.structure||'内容结构'}，提取可复用的叙事框架。拍摄时注意控制节奏，在反转节点处给足表演空间。`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function addToMaterialLibrary(video) {
  const favs = Store.favorites();
  if (favs.find(f => f.id === video.id)) {
    showToast('已在素材库中');
    return;
  }
  favs.push({
    ...video,
    addedAt: Date.now(),
    notes: '',
  });
  Store.saveFavorites(favs);
  showToast('✅ 已加入二创素材库');
}

// ===== 用户操作：收藏 / 二创 / 删除 / 恢复（全部持久化） =====
function logOp(action, target, label) {
  const log = Store.opLog();
  log.unshift({ action, target, label: label || '', ts: Date.now() });
  Store.saveOpLog(log);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 收藏 / 取消收藏
function toggleFav(id, fromDetail) {
  const v = App.videoData.find(x => x.id === id);
  const favs = Store.favorites();
  const idx = favs.findIndex(f => f.id === id);
  if (idx >= 0) {
    favs.splice(idx, 1);
    Store.saveFavorites(favs);
    showToast('已取消收藏');
    logOp('unfavorite', id, v ? v.title : '');
  } else {
    if (!v) { showToast('视频不存在'); return; }
    favs.unshift({ ...v, addedAt: Date.now(), notes: '' });
    Store.saveFavorites(favs);
    showToast('✅ 已收藏');
    logOp('favorite', id, v.title);
  }
  if (fromDetail) {
    const btn = $('#btnFav');
    if (btn) { const on = favs.some(f => f.id === id); btn.textContent = on ? '❤️ 已收藏' : '🤍 收藏'; }
  }
  renderVideoList();
  if (App.currentPage === 'settings') renderOpsPage();
  updateSettingsStats();
}

// 二创笔记
function openRemake(id) {
  const v = App.videoData.find(x => x.id === id);
  if (!v) return;
  const remakes = Store.remakes();
  const list = remakes[id] || [];
  $('#remakeVideoTitle').textContent = v.title;
  const wrap = $('#remakeList');
  wrap.innerHTML = list.length
    ? list.map((r, i) => `<div class="remake-item"><div class="ri-text">${escapeHtml(r.content)}</div><div class="ri-foot"><span>${timeAgo(r.ts)}</span><button class="ri-del" onclick="deleteRemake('${id}',${i})">删除</button></div></div>`).join('')
    : '<p class="remake-empty">还没有二创笔记，写下你的翻拍灵感吧～</p>';
  $('#remakeInput').value = '';
  $('#remakeModal').dataset.vid = id;
  $('#remakeModal').classList.add('show');
}
function saveRemake() {
  const id = $('#remakeModal').dataset.vid;
  const content = $('#remakeInput').value.trim();
  if (!content) { showToast('请输入内容'); return; }
  const remakes = Store.remakes();
  if (!remakes[id]) remakes[id] = [];
  remakes[id].unshift({ ts: Date.now(), content });
  Store.saveRemakes(remakes);
  logOp('remake', id, content.slice(0, 20));
  showToast('✅ 二创已保存');
  $('#remakeInput').value = '';
  openRemake(id);
  renderVideoList();
  if (App.currentPage === 'settings') renderOpsPage();
}
function deleteRemake(id, idx) {
  const remakes = Store.remakes();
  if (remakes[id]) {
    remakes[id].splice(idx, 1);
    if (!remakes[id].length) delete remakes[id];
    Store.saveRemakes(remakes);
  }
  openRemake(id);
  renderVideoList();
}
function closeRemake() { $('#remakeModal').classList.remove('show'); }

// 删除（隐藏）视频
function markDeleted(id) {
  const v = App.videoData.find(x => x.id === id);
  if (!confirm('确定删除这条视频？（可在"我的→操作记录"里恢复）')) return;
  const deleted = Store.deleted();
  deleted[id] = Date.now();
  Store.saveDeleted(deleted);
  logOp('delete', id, v ? v.title : '');
  showToast('已删除（可在操作记录恢复）');
  if ($('#detailModal').classList.contains('show')) closeDetailModal();
  renderVideoList();
  if (App.currentPage === 'settings') renderOpsPage();
  updateSettingsStats();
}
function restoreDeleted(id) {
  const deleted = Store.deleted();
  delete deleted[id];
  Store.saveDeleted(deleted);
  logOp('restore', id, '');
  showToast('✅ 已恢复');
  renderVideoList();
  if (App.currentPage === 'settings') renderOpsPage();
  updateSettingsStats();
}

// 操作记录面板（我的页）
function renderOpsPage() {
  const favs = Store.favorites();
  const remakes = Store.remakes();
  const remakeCount = Object.values(remakes).reduce((s, a) => s + a.length, 0);
  const deleted = Store.deleted();
  const log = Store.opLog();

  const delArr = Object.entries(deleted).map(([id, ts]) => {
    const v = findAnyVideo(id);
    return { id, ts, title: v ? v.title : '(视频已从列表移除)', author: v ? v.author : '', platform: v ? v.platform : '' };
  });

  // 收藏按日期分组
  let favHtml = '<p class="ops-empty">还没有收藏</p>';
  if (favs.length) {
    const groups = {};
    favs.forEach(f => {
      const dateKey = new Date(f.addedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(f);
    });
    // 按日期倒序（最新在前），用组内第一条的 addedAt 时间戳排序
    const sortedDates = Object.keys(groups).sort((a, b) => groups[b][0].addedAt - groups[a][0].addedAt);
    favHtml = sortedDates.map(dateKey => {
      const items = groups[dateKey];
      return `<div class="fav-date-group">
        <div class="fav-date-head">📅 ${dateKey} · <span class="fav-date-count">${items.length}条</span></div>
        <div class="video-list">${items.map(f => renderVideoCard(f)).join('')}</div>
      </div>`;
    }).join('');
  }

  const remakeHtml = remakeCount ? Object.entries(remakes).map(([id, arr]) => {
    const v = findAnyVideo(id);
    return `<div class="ops-group"><div class="ops-group-title">${escapeHtml(v ? v.title : id)} (${arr.length})</div>${arr.map((r, i) => `<div class="ops-item"><div class="ops-main"><div class="ops-sub">${timeAgo(r.ts)}</div><div class="ops-text">${escapeHtml(r.content)}</div></div><button class="ops-x" onclick="deleteRemake('${id}',${i})">删除</button></div>`).join('')}</div>`;
  }).join('') : '<p class="ops-empty">还没有二创笔记</p>';

  const delHtml = delArr.length ? delArr.map(d => `
    <div class="ops-item">
      <div class="ops-main"><div class="ops-title">${escapeHtml(d.title)}</div><div class="ops-sub">${escapeHtml(d.author || '')} · ${PLATFORM_MAP[d.platform] || ''} · 删除于 ${new Date(d.ts).toLocaleDateString()}</div></div>
      <button class="ops-x" onclick="restoreDeleted('${d.id}')">恢复</button>
    </div>`).join('') : '<p class="ops-empty">没有已删除的视频</p>';

  const logHtml = log.length ? log.map(l => {
    const map = { favorite: '⭐ 收藏', unfavorite: '🤍 取消收藏', remake: '✏️ 二创', delete: '🗑️ 删除', restore: '♻️ 恢复', open_original: '🔗 看原片' };
    return `<div class="ops-log-item"><span class="ol-act">${map[l.action] || l.action}</span><span class="ol-label">${escapeHtml((l.label || '').slice(0, 30))}</span><span class="ol-time">${timeAgo(l.ts)}</span></div>`;
  }).join('') : '<p class="ops-empty">暂无操作记录</p>';

  const el = $('#opsPanel');
  if (el) el.innerHTML = `
    <div class="ops-block">
      <div class="ops-head">⭐ 我的收藏 <span class="ops-num">${favs.length}</span></div>
      ${favHtml}
    </div>
    <div class="ops-block">
      <div class="ops-head">✏️ 二创笔记 <span class="ops-num">${remakeCount}</span></div>
      ${remakeHtml}
    </div>
    <div class="ops-block">
      <div class="ops-head">🗑️ 已删除（可恢复） <span class="ops-num">${delArr.length}</span></div>
      ${delHtml}
    </div>
    <div class="ops-block">
      <div class="ops-head">📜 操作日志 <span class="ops-num">${log.length}</span></div>
      ${logHtml}
    </div>`;

  // 绑定收藏卡片点击事件（与主页卡片一致的交互）
  el.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action')) return;
      openVideoDetail(card.dataset.id);
    });
  });
}

// 在保留/当前数据中查找视频（含历史保留）
function findAnyVideo(id) {
  return App.videoData.find(x => x.id === id)
    || (Store.retained()[id])
    || null;
}

// ===== 数据导出/导入 =====

function addToMonitor(nickname) {
  const monitors = Store.monitors();
  if (monitors.find(m => m.nickname === nickname)) {
    showToast('已在监控库中'); return;
  }
  monitors.push({
    id: genId(),
    nickname,
    addedAt: Date.now(),
    lastCheck: null,
    newWorks: 0,
  });
  Store.saveMonitors(monitors);
  showToast('✅ 已添加到对标监控库');
}

// ===== 拍射计划模块 =====
function renderPlanPage() {
  const plans = Store.plans();
  const today = new Date().toISOString().split('T')[0];

  const todayPlans = plans.filter(p => p.date === today);
  const completedToday = todayPlans.filter(p => p.status === 'done' || p.status === 'published').length;
  const rate = todayPlans.length > 0 ? Math.round(completedToday / todayPlans.length * 100) : 0;

  // 更新进度环
  updateProgressRing(rate, completedToday, todayPlans.length);

  // 渲染任务列表
  const listEl = $('#planList');
  if (plans.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">📝</div><p>还没有拍摄计划<br>点击右下角 + 创建第一个任务</p></div>`;
    return;
  }

  // 按日期排序
  const sorted = [...plans].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  listEl.innerHTML = sorted.map(p => {
    const priClass = p.priority === 'high' ? 'priority-high' : p.priority === 'mid' ? 'priority-mid' : 'priority-low';
    const statusMap = { pending: '待策划', shooting: '待拍摄', done: '拍摄完成', published: '已发布' };
    const styleMap = { couple_daily: '情侣日常', prank: '整蛊搞笑', brainless: '无脑操作', reverse: '反转剧情' };
    const steps = ['pending', 'shooting', 'done', 'published'];
    const curIdx = steps.indexOf(p.status || 'pending');

    return `
      <div class="task-card ${priClass}" data-id="${p.id}">
        <div class="tc-top">
          <span class="tc-title">${p.title}</span>
          <span class="tc-tag">${statusMap[p.status] || '待策划'}</span>
        </div>
        <div class="tc-tags">
          <span class="tc-tag">${styleMap[p.style] || p.style || '未分类'}</span>
          <span class="tc-tag">📅 ${p.date || '未设日期'}</span>
          ${p.duration ? `<span class="tc-tag">⏱️ ${p.duration}</span>` : ''}
        </div>
        <div class="status-flow">
          ${steps.map((s, i) => `<span class="status-step ${i < curIdx ? 'done' : i === curIdx ? 'current' : ''}">${statusMap[s]}</span>`).join('')}
        </div>
        <div class="tc-meta">
          <span>优先级：${p.priority === 'high' ? '🔴高' : p.priority === 'mid' ? '🟡中' : '🟢低'}</span>
          <span onclick="deletePlan('${p.id}')" style="color:#ff2d55;cursor:pointer;">🗑️ 删除</span>
        </div>
      </div>`;
  }).join('');
}

function updateProgressRing(percent, done, total) {
  const ring = $('#progressRing');
  if (!ring) return;
  const circumference = 2 * Math.PI * 30;
  const offset = circumference - (percent / 100) * circumference;
  ring.querySelector('.ring-fill').style.strokeDasharray = circumference;
  ring.querySelector('.ring-fill').style.strokeDashoffset = offset;
  $('#progressText').textContent = `${done}/${total}`;
  $('#progressPercent').textContent = `${percent}%`;
}

function openPlanForm() {
  $('#planFormModal').classList.add('show');
}

function closePlanForm() {
  $('#planFormModal').classList.remove('show');
}

function savePlan() {
  const title = $('#planTitle').value.trim();
  if (!title) { showToast('请填写主题'); return; }

  const plan = {
    id: genId(),
    title,
    style: $('#planStyle').value,
    duration: $('#planDuration').value.trim(),
    priority: $('#planPriority').value,
    date: $('#planDate').value || new Date().toISOString().split('T')[0],
    status: 'pending',
    refVideoId: $('#planRefVideo').value.trim(),
    createdAt: Date.now(),
  };

  const plans = Store.plans();
  plans.unshift(plan);
  Store.savePlans(plans);

  closePlanForm();
  renderPlanPage();
  showToast('✅ 拍摄计划已创建');

  // 清空表单
  $('#planTitle').value = '';
  $('#planDuration').value = '';
  $('#planRefVideo').value = '';
}

function deletePlan(id) {
  if (!confirm('确定删除此计划？')) return;
  let plans = Store.plans().filter(p => p.id !== id);
  Store.savePlans(plans);
  renderPlanPage();
  showToast('已删除');
}

// ===== 灵感便签模块 =====
function renderNotesPage() {
  const notes = Store.notes();
  const container = $('#notesList');

  if (notes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">💡</div><p>还没有灵感记录<br>随时记录你的创意火花</p></div>`;
    return;
  }

  const catClassMap = { plot: 'cat-plot', dialogue: 'cat-dialogue', prop: 'cat-prop', scene: 'cat-scene' };
  const catNameMap = { plot: '剧情梗', dialogue: '台词文案', prop: '道具', scene: '场景' };

  const sorted = [...notes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // 应用搜索过滤
  const q = ($('#noteSearch').value || '').toLowerCase();
  const filtered = q ? sorted.filter(n =>
    (n.content || '').toLowerCase().includes(q) ||
    (n.tags || []).some(t => t.toLowerCase().includes(q))
  ) : sorted;

  container.innerHTML = filtered.map(n => `
    <div class="note-card ${catClassMap[n.category] || ''}" data-id="${n.id}">
      <div class="nc-content">${n.content.replace(/\n/g, '<br>')}</div>
      <div class="nc-footer">
        <div class="nc-tags">
          <span class="nc-tag">${catNameMap[n.category] || n.category || '未分类'}</span>
          ${(n.tags || []).map(t => `<span class="nc-tag">#${t}</span>`).join('')}
        </div>
        <span>${timeAgo(n.createdAt)}</span>
      </div>
    </div>
  `).join('');
}

function openNoteForm() {
  $('#noteFormModal').classList.add('show');
}

function closeNoteForm() {
  $('#noteFormModal').classList.remove('show');
}

function saveNote() {
  const content = $('#noteContent').value.trim();
  if (!content) { showToast('请填写内容'); return; }

  const note = {
    id: genId(),
    content,
    category: $('#noteCategory').value,
    tags: ($('#noteTags').value || '').split(/[,，]/).map(t => t.trim()).filter(Boolean),
    createdAt: Date.now(),
  };

  const notes = Store.notes();
  notes.unshift(note);
  Store.saveNotes(notes);

  closeNoteForm();
  renderNotesPage();
  showToast('✅ 灵感已记录');

  $('#noteContent').value = '';
  $('#noteTags').value = '';
}

function deleteNote(id) {
  let notes = Store.notes().filter(n => n.id !== id);
  Store.saveNotes(notes);
  renderNotesPage();
}

// ===== 数据分析模块 =====
function renderAnalyticsPage() {
  renderFollowerChart();
  renderWeeklyReport();
  renderMonitorSection();
}

function renderFollowerChart() {
  const canvas = $('#followerChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // 生成近7天的模拟粉丝增长数据
  const labels = [];
  const data = [];
  const baseFans = 3520;
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(`${d.getMonth()+1}/${d.getDate()}`);
    data.push(baseFans + Math.floor(Math.random() * 500) + (6-i) * 80);
  }

  // 清除旧图表
  if (window.followerChartInst) {
    window.followerChartInst.destroy();
  }

  // 使用原生Canvas绘制折线图（避免依赖Chart.js CDN）
  drawSimpleLineChart(ctx, canvas.width, canvas.height || 220, labels, data, '#0071e3');
}

function drawSimpleLineChart(ctx, w, h, labels, data, color) {
  const dpr = window.devicePixelRatio || 1;
  const cw = w || ctx.canvas.clientWidth;
  const ch = h || 220;
  ctx.canvas.width = cw * dpr;
  ctx.canvas.height = ch * dpr;
  ctx.scale(dpr, dpr);
  ctx.canvas.style.width = cw + 'px';
  ctx.canvas.style.height = ch + 'px';

  const pad = { top: 20, right: 16, bottom: 32, left: 44 };
  const chartW = cw - pad.left - pad.right;
  const chartH = ch - pad.top - pad.bottom;

  const maxVal = Math.max(...data) * 1.15;
  const minVal = Math.min(...data) * 0.85;

  ctx.clearRect(0, 0, cw, ch);

  // 网格线
  ctx.strokeStyle = '#e5e5ea';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(cw - pad.right, y); ctx.stroke();

    // Y轴标签
    const val = maxVal - ((maxVal - minVal) / 4) * i;
    ctx.fillStyle = '#aeaeb2';
    ctx.font = '10px -apple-system';
    ctx.textAlign = 'right';
    ctx.fillText(formatNum(Math.round(val)), pad.left - 6, y + 3);
  }

  // X轴标签
  ctx.textAlign = 'center';
  labels.forEach((lab, i) => {
    const x = pad.left + (chartW / (labels.length - 1)) * i;
    ctx.fillText(lab, x, ch - 8);
  });

  // 绘制渐变区域
  const gradient = ctx.createLinearGradient(0, pad.top, 0, ch - pad.bottom);
  gradient.addColorStop(0, 'rgba(0,113,227,0.15)');
  gradient.addColorStop(1, 'rgba(0,113,227,0)');

  ctx.beginPath();
  data.forEach((val, i) => {
    const x = pad.left + (chartW / (data.length - 1)) * i;
    const y = pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + chartW, ch - pad.bottom);
  ctx.lineTo(pad.left, ch - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // 绘制线条
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  data.forEach((val, i) => {
    const x = pad.left + (chartW / (data.length - 1)) * i;
    const y = pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 绘制数据点
  data.forEach((val, i) => {
    const x = pad.left + (chartW / (data.length - 1)) * i;
    const y = pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function renderWeeklyReport() {
  const videos = App.videoData;
  const plans = Store.plans();

  // 本周统计
  const weekAgo = Date.now() - 7 * 86400000;
  const weekVideos = videos.filter(v => (v.publishTime || 0) > weekAgo);
  const weekDonePlans = plans.filter(p => p.status === 'done' || p.status === 'published');

  // 爆款层级分布
  const levelDist = {};
  weekVideos.forEach(v => { levelDist[v.level] = (levelDist[v.level] || 0) + 1; });

  // 高频因子统计
  const factorCount = {};
  weekVideos.forEach(v => (v.factors || []).forEach(f => { factorCount[f] = (factorCount[f] || 0) + 1; }));
  const topFactors = Object.entries(factorCount).sort((a,b) => b[1]-a[1]).slice(0,3);

  const reportEl = $('#weeklyReportContent');
  if (reportEl) {
    reportEl.innerHTML = `
      <div class="report-item"><span class="ri-label">本周新增爆款</span><span class="ri-value">${weekVideos.length}条</span></div>
      <div class="report-item"><span class="ri-label">完成拍摄</span><span class="ri-value">${weekDonePlans.length}条</span></div>
      <div class="report-item"><span class="ri-label">超级爆款</span><span class="ri-value">${levelDist['super'] || 0}条</span></div>
      <div class="report-item"><span class="ri-label">头部爆款</span><span class="ri-value">${levelDist['head'] || 0}条</span></div>
      <div class="report-item"><span class="ri-label">TOP1爆款因子</span><span class="ri-value">${topFactors[0] ? topFactors[0][0] : '-'}</span></div>
      <div class="report-item"><span class="ri-label">TOP2爆款因子</span><span class="ri-value">${topFactors[1] ? topFactors[1][0] : '-'}</span></div>
      <div class="report-item"><span class="ri-label">TOP3爆款因子</span><span class="ri-value">${topFactors[2] ? topFactors[2][0] : '-'}</span></div>
    `;
  }

  // 最优翻拍推荐
  const topRemix = weekVideos
    .filter(v => v.potential >= 80)
    .sort((a, b) => (b.potential || 0) - (a.potential || 0))
    .slice(0, 3);

  const remixEl = $('#topRemixContent');
  if (remixEl) {
    remixEl.innerHTML = topRemix.length > 0
      ? topRemix.map((v, i) => `
          <div class="report-item" style="cursor:pointer" onclick="openVideoDetail('${v.id}')">
            <span class="ri-label">${i+1}. ${v.title}</span>
            <span class="ri-value" style="color:var(--primary)">潜力${v.potential}分</span>
          </div>
        `).join('')
      : '<div class="report-item"><span class="ri-label" style="width:100%;text-align:center">暂无足够数据</span></div>';
  }
}

function renderMonitorSection() {
  const monitors = Store.monitors();
  const el = $('#monitorList');
  if (!el) return;

  if (monitors.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="es-icon">📊</div><p>还没有添加对标账号</p></div>';
    return;
  }

  el.innerHTML = monitors.map(m => `
    <div class="monitor-item">
      <div class="mi-avatar">${m.nickname?.charAt(0) || '👤'}</div>
      <div class="mi-info">
        <div class="mi-name">${m.nickname}</div>
        <div class="mi-desc">添加于 ${new Date(m.addedAt).toLocaleDateString()}</div>
      </div>
      ${m.newWorks > 0 ? '<div class="mi-new"></div>' : ''}
    </div>
  `).join('');
}

// ===== 设置页面 =====
function renderSettingsPage() {
  // 渲染周报卡片
  const plans = Store.plans();
  const videos = App.videoData;
  const weekAgo = Date.now() - 7 * 86400000;
  const weekDone = plans.filter(p => (p.createdAt || 0) > weekAgo && (p.status === 'done' || p.status === 'published')).length;
  const weekTotal = plans.filter(p => (p.createdAt || 0) > weekAgo).length;
  const weekHotVideos = videos.filter(v => (v.publishTime || 0) > weekAgo).length;

  const wrCard = $('#weeklyReportCard');
  if (wrCard) {
    wrCard.innerHTML = `
      <div class="wrc-title">📊 本周复盘报告</div>
      <div class="wrc-stat"><span>新建计划</span><span>${weekTotal}个</span></div>
      <div class="wrc-stat"><span>完成拍摄</span><span>${weekDone}个</span></div>
      <div class="wrc-stat"><span>追踪爆款</span><span>${weekHotVideos}条</span></div>
      <div class="wrc-stat"><span>素材收藏</span><span>${Store.favorites().length}条</span></div>
    `;
  }
}

function exportData() {
  const json = Store.exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workbench_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 数据已导出');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    if (Store.importAll(text)) {
      showToast('✅ 数据导入成功，即将刷新页面');
      setTimeout(() => location.reload(), 1000);
    } else {
      showToast('❌ 导入失败，文件格式不正确');
    }
  };
  input.click();
}

function saveDataSourceSetting() {
  const url = $('#dataSourceInput').value.trim();
  const settings = Store.settings();
  settings.dataSourceUrl = url || './data/videos.json';
  settings.accountSourceUrl = $('#accountSourceInput')?.value.trim() || './data/accounts.json';
  Store.saveSettings(settings);
  showToast('✅ 数据源地址已保存');
}

// ===== AI浮窗指令系统 =====
function toggleAiPanel(show) {
  const panel = $('#aiPanel');
  if (show === undefined) show = !panel.classList.contains('show');
  panel.classList.toggle('show', show);
  if (show) {
    $('#aiInput').focus();
    renderAiQuickCmds();
  }
}

function renderAiQuickCmds() {
  const cmds = $('#aiQuickCmds');
  if (!cmds) return;
  cmds.innerHTML = `
    <span class="ai-qcmd" onclick="sendAiCmd('分析视频 +')">🎬 分析视频</span>
    <span class="ai-qcmd" onclick="sendAiCmd('记录灵感 +')">💡 记录灵感</span>
  `;
}

function sendAiCmd(prefix) {
  const input = $('#aiInput');
  input.value = prefix + ' ';
  input.focus();
}

function handleAiSend() {
  const input = $('#aiInput');
  const text = input.value.trim();
  if (!text) return;

  addAiMessage(text, 'user');
  input.value = '';

  // 关键词指令识别
  setTimeout(() => processAiCommand(text), 300);
}

function addAiMessage(text, role) {
  const container = $('#aiMessages');
  const div = document.createElement('div');
  div.className = `ai-msg ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function processAiCommand(text) {
  const lower = text.toLowerCase();

  if (lower.includes('分析视频') || lower.includes('视频链接')) {
    const linkMatch = text.match(/https?:\/\/\S+/) || text.match(/[a-zA-Z0-9]{10,}/);
    const vid = linkMatch ? linkMatch[0] : (App.videoData[0]?.id);
    addAiMessage(`好的，正在为您分析视频 ${vid || '(未识别链接)'} 的爆款要素...`, 'bot');
    setTimeout(() => {
      if (vid && App.videoData.find(v => v.id === vid)) {
        openVideoDetail(vid);
        toggleAiPanel(false);
      } else {
        addAiMessage('请在爆款雷达中选择一条视频查看详细分析，或粘贴视频链接后重试。\n\n💡 提示：您也可以直接在爆款雷达列表中点击任意视频卡片查看完整拆解。', 'bot');
      }
    }, 600);
    return;
  }

  if (lower.includes('灵感') || lower.includes('创意') || lower.includes('想法')) {
    const content = text.replace(/^[^\s]+\s*[+＋]\s*/, '').trim() || '新灵感';
    addAiMessage(`✨ 灵感已记录：「${content}」`, 'bot');

    const note = {
      id: genId(),
      content,
      category: 'plot',
      tags: [],
      createdAt: Date.now(),
    };
    const notes = Store.notes();
    notes.unshift(note);
    Store.saveNotes(notes);
    return;
  }

  if (lower.includes('分析账号') || lower.includes('博主') || lower.includes('达人')) {
    addAiMessage('当前版本已精简为「爆款视频」单板块，账号分析功能暂不可用。你可以在爆款视频里直接查看每条视频的爆款原因与二创方案 🙂', 'bot');
    return;
  }

  // 默认回复
  const replies = [
    '我可以帮你：\n\n🎬 分析视频 — 发送"分析视频+链接"\n💡 记录灵感 — 发送"记录灵感+内容"\n\n当前版本聚焦「爆款视频」单板块，账号分析已精简。',
    '我是你的创作助手！试试这些指令：\n• "分析视频 https://..."\n• "记录灵感 把冰箱藏起来"',
  ];
  addAiMessage(replies[Math.floor(Math.random() * replies.length)], 'bot');
}

// ===== Tab导航 =====
function switchTab(page) {
  App.currentPage = page;

  // 切换页面显示
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#' + page + 'Page')?.classList.add('active');

  // 更新底部导航高亮
  $$('.tab-item').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });

  // 页面特定处理
  document.body.classList.toggle('on-radar', page === 'radar');

  // 渲染对应页面
  switch (page) {
    case 'radar': renderVideoList(); break;
    case 'plan': renderPlanPage(); break;
    case 'notes': renderNotesPage(); break;
    case 'analytics': renderAnalyticsPage(); break;
    case 'settings': renderSettingsPage(); break;
  }
}

function switchSubTab(tab) {
  App.currentSubTab = tab;

  $$('.segment-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  const vv = $('#videosView');
  const mv = $('#monitorView');

  if (tab === 'monitor') {
    if (vv) vv.style.display = 'none';
    if (mv) mv.style.display = 'block';
    renderMonitorDashboard();
  } else {
    if (vv) vv.style.display = 'block';
    if (mv) mv.style.display = 'none';
    renderVideoList();
  }
}

// 仅看爆款 开关
// ===== 账号监控仪表盘 =====
// 平台颜色 + 域名
var _PLAT_COLORS = { douyin: '#000', xiaohongshu: '#ff2442', kuaishou: '#ff4906', bilibili: '#00a1d6', shipinhao: '#07c160' };
var _PLAT_DOMAINS = { douyin: 'douyin.com', xiaohongshu: 'xiaohongshu.com', kuaishou: 'kuaishou.com', bilibili: 'bilibili.com', shipinhao: 'channels.weixin.qq.com' };
var _monitorState = { selectedId: 'all', trendMode: 'all', metric: 'plays' };

// 指标维度名称映射
var METRIC_NAMES = { plays: '流量', likes: '点赞', comments: '评论', saves: '收藏', shares: '转发' };
var METRIC_KEYS = { plays: 'totalPlays', likes: 'totalLikes', comments: 'totalComments', saves: 'totalSaves', shares: 'totalShares' };

function renderMonitorDashboard() {
  // 无真实数据时灌入演示数据
  if (!Store.monitorAccounts().length) {
    seedMonitorMockData();
  }
  renderMonitorAccountCards();
  drawMonitorTrendChart();
  drawTimeSlotChart();
  renderMonitorAdvice();
  renderMonitorWeekGroups();
}

// ===== 演示数据生成（首次无真实数据时自动注入） =====
function seedMonitorMockData() {
  // 3个账号
  var accounts = [
    { id: 'a1', platform: 'douyin', nickname: '我的抖音', addedAt: Date.now() - 30*86400000 },
    { id: 'a2', platform: 'xiaohongshu', nickname: '我的小红书', addedAt: Date.now() - 25*86400000 },
    { id: 'a3', platform: 'kuaishou', nickname: '我的快手', addedAt: Date.now() - 20*86400000 },
  ];
  Store.saveMonitorAccounts(accounts);

  // 快照数据：每天每个账号存一份（totalPlays/totalLikes/totalComments/totalSaves/totalShares + fans + works）
  var snaps = {};
  var videos = {};
  var now = new Date();
  var baseData = {
    a1: { platform: 'douyin', startFans: 85000, growth: 1800, basePlays: 2200000, baseLikes: 85000, baseComments: 3200, baseSaves: 5800, baseShares: 2100, works: 12 },
    a2: { platform: 'xiaohongshu', startFans: 58000, growth: 800, basePlays: 800000, baseLikes: 32000, baseComments: 1500, baseSaves: 4200, baseShares: 900, works: 8 },
    a3: { platform: 'kuaishou', startFans: 32000, growth: 400, basePlays: 450000, baseLikes: 18000, baseComments: 800, baseSaves: 2100, baseShares: 500, works: 5 },
  };

  accounts.forEach(function(a) {
    var bd = baseData[a.id];
    var key = a.platform + '_' + a.id;
    videos[key] = [];

    // 生成过去60天的快照
    for (var days = 60; days >= 0; days--) {
      var d = new Date(now - days * 86400000);
      var dateStr = d.toISOString().slice(0, 10);
      var snapKey = key + '_' + dateStr;
      var f = bd.startFans + days * (bd.growth + Math.floor(Math.random() * 200 - 100));
      var randomFactor = 0.85 + Math.random() * 0.3;
      snaps[snapKey] = {
        fans: Math.max(bd.startFans * 0.8, Math.round(f)),
        works: bd.works + Math.floor(days / 5),
        totalPlays: Math.round(bd.basePlays * (0.7 + days / 200) * randomFactor),
        totalLikes: Math.round(bd.baseLikes * (0.7 + days / 200) * randomFactor),
        totalComments: Math.round(bd.baseComments * (0.7 + days / 200) * randomFactor),
        totalSaves: Math.round(bd.baseSaves * (0.7 + days / 200) * randomFactor),
        totalShares: Math.round(bd.baseShares * (0.7 + days / 200) * randomFactor),
      };
    }

    // 生成 mock 作品（按日期分布在近60天内）
    var workTemplates = {
      a1: douyin_works,
      a2: xhs_works,
      a3: ks_works,
    };
    var tmpls = workTemplates[a.id];
    tmpls.forEach(function(t, i) {
      var pubDate = new Date(now - (i * 4 + Math.floor(Math.random() * 3)) * 86400000);
      videos[key].push({
        id: a.id + '_w' + i,
        title: t.title,
        author: a.nickname,
        likes: t.likes, plays: t.plays, comments: t.comments, saves: t.saves, shares: t.shares,
        publishTime: pubDate.toISOString().slice(0, 10) + ' ' + t.time,
        platform: a.platform,
        videoUrl: t.url,
        topic: t.topic || 'couple_funny',
        duration: t.duration || 35,
      });
    });
  });

  Store.saveMonitorSnapshots(snaps);
  Store.saveMonitorVideos(videos);
}

// mock 作品模板
var douyin_works = [
  { title: '假装失忆测试男友反应😂', likes: 85000, plays: 2300000, comments: 3200, saves: 5800, shares: 2100, time: '20:30', url: 'https://www.douyin.com/video/7658644062555391722', topic: 'daily_prank', duration: 42 },
  { title: '趁他睡着把眉毛剃了一半', likes: 62000, plays: 1850000, comments: 2800, saves: 4200, shares: 1800, time: '21:15', url: 'https://www.douyin.com/video/7665596046256824570', topic: 'daily_prank', duration: 38 },
  { title: '在电梯里假装不认识他', likes: 38000, plays: 980000, comments: 1500, saves: 3100, shares: 1200, time: '20:00', url: 'https://www.douyin.com/video/7445677809080552731', topic: 'couple_funny', duration: 28 },
  { title: '偷偷换了他的洗发水', likes: 29000, plays: 720000, comments: 1200, saves: 2400, shares: 850, time: '19:30', url: 'https://www.douyin.com/video/7656773111907807942', topic: 'daily_prank', duration: 35 },
  { title: '假装把手机掉马桶里了', likes: 24000, plays: 650000, comments: 980, saves: 1900, shares: 720, time: '21:00', url: 'https://www.douyin.com/video/7622658539152217009', topic: 'reverse_plot', duration: 45 },
  { title: '测试他的求生欲第3卷', likes: 45000, plays: 1280000, comments: 2100, saves: 3600, shares: 1500, time: '20:45', url: 'https://www.douyin.com/video/7661206159093808251', topic: 'couple_funny', duration: 33 },
  { title: '在他最爱的T恤上画了卡通小猪', likes: 52000, plays: 1680000, comments: 2400, saves: 4800, shares: 1900, time: '22:00', url: 'https://www.douyin.com/video/7663050017858765236', topic: 'daily_prank', duration: 40 },
  { title: '跟他说我准备去相亲了', likes: 72000, plays: 2100000, comments: 3800, saves: 6200, shares: 2500, time: '19:45', url: 'https://www.douyin.com/video/7506094958207307066', topic: 'reverse_plot', duration: 52 },
  { title: '把他手机语言改成阿拉伯语', likes: 35000, plays: 890000, comments: 1600, saves: 2800, shares: 1100, time: '20:15', url: 'https://www.douyin.com/video/7621780734517293539', topic: 'daily_prank', duration: 30 },
  { title: '假装迷路让他电话导航', likes: 41000, plays: 1050000, comments: 1800, saves: 3200, shares: 1300, time: '18:30', url: 'https://www.douyin.com/video/7438971717759864115', topic: 'couple_funny', duration: 36 },
  { title: '在他背后贴了"请摸我头"的纸条', likes: 58000, plays: 1750000, comments: 2900, saves: 5100, shares: 2200, time: '17:45', url: 'https://www.douyin.com/video/7660938967830859062', topic: 'brainless', duration: 25 },
  { title: '用三句话让他给我买了奶茶', likes: 96000, plays: 3200000, comments: 4500, saves: 7800, shares: 3200, time: '20:30', url: 'https://www.douyin.com/video/7662966308720858020', topic: 'couple_funny', duration: 48 },
];

var xhs_works = [
  { title: '跟他说我怀孕了（吃多了）', likes: 41000, plays: 1200000, comments: 1800, saves: 5200, shares: 950, time: '19:45', url: 'https://www.xiaohongshu.com/explore/abc123', topic: 'reverse_plot', duration: 32 },
  { title: '给他手机存一百张丑表情包', likes: 28000, plays: 750000, comments: 1200, saves: 3800, shares: 700, time: '18:30', url: 'https://www.xiaohongshu.com/explore/def456', topic: 'daily_prank', duration: 28 },
  { title: '让他帮选衣服，选的都是反的', likes: 18000, plays: 420000, comments: 850, saves: 2600, shares: 450, time: '20:00', url: 'https://www.xiaohongshu.com/explore/ghi789', topic: 'couple_funny', duration: 38 },
  { title: '假装有私生饭，他的反应绝了', likes: 32000, plays: 890000, comments: 1500, saves: 3400, shares: 820, time: '19:15', url: 'https://www.xiaohongshu.com/explore/jkl012', topic: 'reverse_plot', duration: 45 },
  { title: '趁他开会时放了搞笑背景音', likes: 25000, plays: 680000, comments: 980, saves: 2900, shares: 620, time: '15:30', url: 'https://www.xiaohongshu.com/explore/mno345', topic: 'daily_prank', duration: 35 },
  { title: '把他的咖啡换成了酱油', likes: 35000, plays: 1050000, comments: 1600, saves: 4100, shares: 880, time: '09:00', url: 'https://www.xiaohongshu.com/explore/pqr678', topic: 'brainless', duration: 22 },
  { title: '在商场突然装哭看他反应', likes: 48000, plays: 1580000, comments: 2200, saves: 5800, shares: 1100, time: '21:00', url: 'https://www.xiaohongshu.com/explore/stu901', topic: 'couple_funny', duration: 40 },
  { title: '假装被困在卫生间求救', likes: 22000, plays: 550000, comments: 1100, saves: 2200, shares: 580, time: '18:00', url: 'https://www.xiaohongshu.com/explore/vwx234', topic: 'daily_prank', duration: 33 },
];

var ks_works = [
  { title: '黑暗料理让他先尝', likes: 22000, plays: 620000, comments: 850, saves: 2200, shares: 480, time: '20:45', url: 'https://www.kuaishou.com/short-video/ks123', topic: 'brainless', duration: 28 },
  { title: '假装把工资花光了', likes: 15000, plays: 380000, comments: 650, saves: 1800, shares: 350, time: '19:30', url: 'https://www.kuaishou.com/short-video/ks456', topic: 'reverse_plot', duration: 36 },
  { title: '给他微信改了个备注"ATM"', likes: 18000, plays: 480000, comments: 720, saves: 2000, shares: 420, time: '21:00', url: 'https://www.kuaishou.com/short-video/ks789', topic: 'daily_prank', duration: 25 },
  { title: '在他睡着后给他涂了指甲油', likes: 28000, plays: 850000, comments: 1100, saves: 3200, shares: 680, time: '23:00', url: 'https://www.kuaishou.com/short-video/ks012', topic: 'daily_prank', duration: 42 },
  { title: '让他在大庭广众下大声喊我爱你', likes: 32000, plays: 980000, comments: 1400, saves: 3800, shares: 750, time: '17:00', url: 'https://www.kuaishou.com/short-video/ks345', topic: 'couple_funny', duration: 48 },
];

// ===== 账号卡片行 =====
function renderMonitorAccountCards() {
  var el = $('#monitorAccountCards');
  if (!el) return;
  var accounts = Store.monitorAccounts();
  var snaps = Store.monitorSnapshots();
  var today = new Date().toISOString().slice(0, 10);
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 全部账号汇总
  var totalFans = 0, totalDelta = 0;
  accounts.forEach(function(a) {
    var key = a.platform + '_' + a.id;
    var ts = snaps[key + '_' + today];
    var ys = snaps[key + '_' + yesterday];
    var f = ts ? ts.fans : (ys ? ys.fans : 0);
    var pf = ys ? ys.fans : f;
    totalFans += f;
    totalDelta += (f - pf);
  });

  var sel = _monitorState.selectedId;
  var html = '<div class="monitor-card all' + (sel === 'all' ? ' selected' : '') + '" onclick="selectMonitorAcct(\'all\')">' +
    '<div class="mc-platform">全部账号</div>' +
    '<div class="mc-fans">' + formatNum(totalFans) + '<span class="mc-delta ' + (totalDelta >= 0 ? 'up' : 'down') + '">' + (totalDelta >= 0 ? '+' : '') + formatNum(totalDelta) + '</span></div>' +
    '<div class="mc-sub">' + accounts.length + ' 个账号</div></div>';

  accounts.forEach(function(a) {
    var key = a.platform + '_' + a.id;
    var ts = snaps[key + '_' + today];
    var ys = snaps[key + '_' + yesterday];
    var fans = ts ? ts.fans : (ys ? ys.fans : 0);
    var pf = ys ? ys.fans : fans;
    var delta = fans - pf;
    var ds = delta > 0 ? '+' + formatNum(delta) : delta < 0 ? formatNum(delta) : '0';
    var dc = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    var pn = PLATFORM_MAP[a.platform] || a.platform;
    var pc = _PLAT_COLORS[a.platform] || '#333';
    var ws = ts ? (ts.works || 0) : 0;
    html += '<div class="monitor-card' + (sel === a.id ? ' selected' : '') + '" onclick="selectMonitorAcct(\'' + a.id + '\')" style="border-left:3px solid ' + pc + ';">' +
      '<div class="mc-platform">' + pn + '</div>' +
      '<div class="mc-fans">' + formatNum(fans) + '<span class="mc-delta ' + dc + '">' + ds + '</span></div>' +
      '<div class="mc-sub">' + (a.nickname || a.id) + ' · ' + ws + '条作品</div></div>';
  });

  html += '<div class="monitor-card add" onclick="openAcctModal()"><span class="add-icon">+</span>添加账号</div>';
  el.innerHTML = html;
}

function selectMonitorAcct(id) {
  _monitorState.selectedId = id;
  renderMonitorAccountCards();
  drawMonitorTrendChart();
  drawTimeSlotChart();
  renderMonitorAdvice();
  renderMonitorWeekGroups();
}

function switchMonitorTrend(mode) {
  _monitorState.trendMode = mode;
  var btns = document.querySelectorAll('.tseg-btn');
  var modes = ['all', '30d', '7d'];
  btns.forEach(function(b, i) { b.classList.toggle('active', modes[i] === mode); });
  var titles = ['全部趋势', '近30天趋势', '近7天趋势'];
  var subs = ['发布至今', '近30天每日', '近7天每日'];
  var mi = modes.indexOf(mode);
  var tel = $('#monitorTrendTitle');
  if (tel) tel.innerHTML = METRIC_NAMES[_monitorState.metric] + ' · ' + titles[mi] + ' <span class="chart-sub">' + subs[mi] + '</span>';
  drawMonitorTrendChart();
}

function switchMonitorMetric(metric) {
  _monitorState.metric = metric;
  var btns = document.querySelectorAll('.metric-btn');
  var metrics = ['plays', 'likes', 'comments', 'saves', 'shares'];
  btns.forEach(function(b, i) { b.classList.toggle('active', metrics[i] === metric); });
  // 更新趋势图标题
  var modes = ['all', '30d', '7d'];
  var mi = modes.indexOf(_monitorState.trendMode);
  var titles = ['全部趋势', '近30天趋势', '近7天趋势'];
  var subs = ['发布至今', '近30天每日', '近7天每日'];
  var tel = $('#monitorTrendTitle');
  if (tel) tel.innerHTML = METRIC_NAMES[metric] + ' · ' + titles[Math.max(0, mi)] + ' <span class="chart-sub">' + subs[Math.max(0, mi)] + '</span>';
  drawMonitorTrendChart();
  drawTimeSlotChart();
  renderMonitorAdvice();
}

// ===== 趋势图 (支持三级切换 + 按账号筛选) =====
function drawMonitorTrendChart() {
  var canvas = $('#monitorTrendChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // 获取选定账号的数据
  var snaps = Store.monitorSnapshots();
  var accounts = Store.monitorAccounts();
  var sel = _monitorState.selectedId;

  // 聚合每天的互动数据
  var dayMap = {};
  // 收集所有快照按日期聚合
  Object.keys(snaps).forEach(function(k) {
    // key format: platform_id_date
    var parts = k.split('_');
    if (parts.length < 3) return;
    var date = parts.slice(2).join('_'); // 日期
    var platId = parts[0] + '_' + parts[1];
    // 筛选：只看选定账号
    if (sel !== 'all') {
      var selAcc = accounts.find(function(a) { return a.id === sel; });
      if (!selAcc || platId !== (selAcc.platform + '_' + selAcc.id)) return;
    }
    var snap = snaps[k];
    var metricKey = METRIC_KEYS[_monitorState.metric] || 'totalLikes';
    var val = snap[metricKey] || 0;
    dayMap[date] = (dayMap[date] || 0) + val;
  });

  var dates = Object.keys(dayMap).sort();
  if (!dates.length) {
    ctx.fillStyle = '#999'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('等待数据积累...', W/2, H/2); return;
  }

  var allValues = dates.map(function(d) { return dayMap[d]; });
  var allLabels = dates.map(function(d) { return d.slice(5); }); // MM-DD

  // 根据模式选取数据
  var values, labels;
  var mode = _monitorState.trendMode;
  if (mode === '7d' && allValues.length >= 7) {
    values = allValues.slice(-7); labels = allLabels.slice(-7);
  } else if (mode === '30d' && allValues.length >= 30) {
    values = allValues.slice(-30); labels = allLabels.slice(-30);
  } else if (mode === '30d') {
    // 不足30天就全部
    values = allValues; labels = allLabels;
  } else {
    values = allValues; labels = allLabels;
  }

  if (!values.length || values.every(function(v) { return v === 0; })) {
    ctx.fillStyle = '#999'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('等待数据积累...', W/2, H/2); return;
  }

  var maxV = Math.max.apply(null, values) * 1.15;
  var minV = Math.min.apply(null, values) * 0.85;
  var pad = { top: 24, right: 20, bottom: 32, left: 44 };
  var pw = W - pad.left - pad.right;
  var ph = H - pad.top - pad.bottom;

  // 网格
  ctx.strokeStyle = '#e5e5ea'; ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var gy = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.fillStyle = '#86868b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(formatNum(Math.round(maxV - (maxV - minV) * i / 4)), pad.left - 6, gy + 4);
  }

  // X标签
  ctx.textAlign = 'center'; ctx.fillStyle = '#86868b';
  var step = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach(function(l, i) {
    if (i % step === 0 || i === labels.length - 1) {
      var lx = pad.left + (pw / Math.max(labels.length - 1, 1)) * i;
      ctx.fillText(l, lx, H - 6);
    }
  });

  // 折线 + 填充
  var pts = values.map(function(v, i) {
    return { x: pad.left + (pw / Math.max(values.length - 1, 1)) * i, y: pad.top + ph - ((v - minV) / (maxV - minV)) * ph };
  });

  ctx.beginPath(); ctx.moveTo(pts[0].x, pad.top + ph);
  pts.forEach(function(p) { ctx.lineTo(p.x, p.y); });
  ctx.lineTo(pts[pts.length - 1].x, pad.top + ph); ctx.closePath();
  var g = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
  g.addColorStop(0, 'rgba(0,113,227,0.18)'); g.addColorStop(1, 'rgba(0,113,227,0.01)');
  ctx.fillStyle = g; ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = '#0071e3'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  pts.forEach(function(p, i) { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.stroke();

  // 数据点
  pts.forEach(function(p) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#0071e3'; ctx.lineWidth = 2; ctx.stroke();
  });

  // 末点标注
  var last = pts[pts.length - 1];
  ctx.fillStyle = '#0071e3'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(formatNum(values[values.length - 1]), last.x + 6, last.y - 6);
}

// ===== 发布时间分析柱状图 =====
function drawTimeSlotChart() {
  var canvas = $('#timeSlotChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  var videos = Store.monitorVideos();
  var allVids = Object.values(videos).flat();
  var accounts = Store.monitorAccounts();
  var sel = _monitorState.selectedId;

  // 按账号筛选
  if (sel !== 'all') {
    var selAcc = accounts.find(function(a) { return a.id === sel; });
    if (selAcc) {
      var key = selAcc.platform + '_' + selAcc.id;
      allVids = videos[key] || [];
    }
  }

  if (!allVids.length) {
    ctx.fillStyle = '#999'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('等待抓取作品数据...', W/2, H/2); return;
  }

  var hourSlots = Array(24).fill(null).map(function() { return { count: 0, totalLikes: 0 }; });
  var metricField = _monitorState.metric || 'likes';
  allVids.forEach(function(v) {
    if (!v.publishTime) return;
    var h = new Date(v.publishTime).getHours();
    hourSlots[h].count++;
    hourSlots[h].totalLikes += (v[metricField] || 0);
  });

  var avgs = hourSlots.map(function(s) { return s.count > 0 ? Math.round(s.totalLikes / s.count) : 0; });
  var maxAvg = Math.max.apply(null, avgs.concat([1]));

  var pad = { top: 10, right: 15, bottom: 26, left: 38 };
  var pw = W - pad.left - pad.right;
  var ph = H - pad.top - pad.bottom;
  var barW = Math.max(5, Math.floor(pw / 24) - 2);
  var gap = Math.max(1, (pw - barW * 24) / 23);

  // 网格
  ctx.strokeStyle = '#e5e5ea'; ctx.lineWidth = 0.5;
  for (var i = 0; i <= 3; i++) {
    var gy = pad.top + (ph / 3) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.fillStyle = '#86868b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxAvg - (maxAvg / 3) * i), pad.left - 5, gy + 3);
  }

  // 柱子
  avgs.forEach(function(v, i) {
    var bx = pad.left + (barW + gap) * i;
    var bh = (v / maxAvg) * ph;
    var by = pad.top + ph - bh;
    var color = '#d0d0d5';
    if (v >= maxAvg * 0.85) color = '#34c759';
    else if (v >= maxAvg * 0.5) color = '#0071e3';
    else if (v <= maxAvg * 0.1 && v > 0) color = '#ff3b30';
    ctx.fillStyle = color;
    // round rect manually
    ctx.beginPath(); var r = 2;
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + barW - r, by);
    ctx.quadraticCurveTo(bx + barW, by, bx + barW, by + r);
    ctx.lineTo(bx + barW, by + bh - r);
    ctx.quadraticCurveTo(bx + barW, by + bh, bx + barW - r, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath(); ctx.fill();
    if (i % 3 === 0) {
      ctx.fillStyle = '#86868b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(i + ':00', bx + barW / 2, H - 5);
    }
  });

  // 图例
  ctx.fillStyle = '#34c759'; ctx.fillRect(pad.left, 4, 8, 8);
  ctx.fillStyle = '#86868b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('最佳时段', pad.left + 12, 12);
  ctx.fillStyle = '#ff3b30'; ctx.fillRect(pad.left + 78, 4, 8, 8);
  ctx.fillText('低效时段', pad.left + 90, 12);
}

// ===== 运营建议 =====
function renderMonitorAdvice() {
  var el = $('#monitorAdvice');
  if (!el) return;
  var videos = Store.monitorVideos();
  var allVids = Object.values(videos).flat();
  var accounts = Store.monitorAccounts();
  var sel = _monitorState.selectedId;

  if (sel !== 'all') {
    var selAcc = accounts.find(function(a) { return a.id === sel; });
    if (selAcc) {
      var key = selAcc.platform + '_' + selAcc.id;
      allVids = videos[key] || [];
    }
  }

  if (!allVids.length) {
    el.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:10px;">等待首次数据抓取后自动生成建议</p>';
    return;
  }

  // 最佳发布时间
  var hourSlots = Array(24).fill(null).map(function() { return { count: 0, totalLikes: 0 }; });
  var mField = _monitorState.metric || 'likes';
  allVids.forEach(function(v) {
    if (!v.publishTime) return;
    var h = new Date(v.publishTime).getHours();
    hourSlots[h].count++;
    hourSlots[h].totalLikes += (v[mField] || 0);
  });
  var avgs = hourSlots.map(function(s) { return s.count > 0 ? Math.round(s.totalLikes / s.count) : 0; });
  var bestHour = avgs.indexOf(Math.max.apply(null, avgs));
  var totalAvg = avgs.length ? avgs.reduce(function(s, v) { return s + v; }, 0) / avgs.filter(function(v) { return v > 0; }).length || 1 : 1;
  var bestMultiplier = avgs[bestHour] > 0 ? (avgs[bestHour] / totalAvg).toFixed(1) : '—';

  // 平均指标
  var avgMetric = Math.round(allVids.reduce(function(s, v) { return s + (v[mField] || 0); }, 0) / allVids.length);

  // 最佳类型
  var topicCount = {};
  allVids.forEach(function(v) { var t = v.topic || 'other'; topicCount[t] = (topicCount[t] || 0) + 1; });
  var topEntry = Object.entries(topicCount).sort(function(a, b) { return b[1] - a[1]; })[0];
  var topicNames = { couple_funny: '情侣搞笑', daily_prank: '日常整蛊', reverse_plot: '反转剧情', brainless: '无脑操作' };

  // 作品平均时长
  var durations = allVids.map(function(v) { return v.duration || 0; }).filter(Boolean);
  var avgDuration = durations.length ? Math.round(durations.reduce(function(a, b) { return a + b; }, 0) / durations.length) : 0;

  // 近7天趋势（最近3条 vs 平均）
  var recent = allVids.filter(function(v) { return v.publishTime; }).sort(function(a, b) { return (b.publishTime || 0) - (a.publishTime || 0); }).slice(0, 3);
  var recentAvg = recent.length ? Math.round(recent.reduce(function(s, v) { return s + (v[mField] || 0); }, 0) / recent.length) : avgMetric;
  var trendWarn = recent.length >= 3 && recentAvg < avgMetric * 0.6;

  var accName = sel === 'all' ? '全部账号' : (accounts.find(function(a) { return a.id === sel; }) || {}).nickname || '当前账号';

  var metricName = METRIC_NAMES[_monitorState.metric] || '互动';
  var items = [
    '<div class="advice-row"><span class="advice-icon">⏰</span><div><div class="advice-title">最佳发布时间</div><div class="advice-text">' + bestHour + ':00-' + (bestHour + 2) + ':00，该时段平均' + metricName + '是全天平均的 ' + bestMultiplier + ' 倍</div></div></div>',
    '<div class="advice-row"><span class="advice-icon">🎯</span><div><div class="advice-title">推荐方向</div><div class="advice-text">情侣日常 + 反转剧情，' + accName + '的整蛊类视频平均表现远高于日常分享类</div></div></div>',
  ];
  if (avgDuration) {
    items.push('<div class="advice-row"><span class="advice-icon">⏱️</span><div><div class="advice-title">推荐时长</div><div class="advice-text">' + avgDuration + '秒，' + (avgDuration > 60 ? '可尝试精简至30-45秒提升完播率' : '时长合理，继续保持') + '</div></div></div>');
  }
  items.push('<div class="advice-row"><span class="advice-icon">📈</span><div><div class="advice-title">数据表现</div><div class="advice-text">' + accName + '平均' + metricName + ' <b>' + formatNum(avgMetric) + '</b>，共 <b>' + allVids.length + '</b> 条作品' + (topEntry ? ('，擅长类型：<b>' + (topicNames[topEntry[0]] || topEntry[0]) + '</b>') : '') + '</div></div></div>');

  if (trendWarn) {
    items.push('<div class="advice-row"><span class="advice-icon">⚠️</span><div><div class="advice-title">趋势预警</div><div class="advice-text">近3条作品数据持续低于平均水平，建议调整选题方向或发布时间</div></div></div>');
  }

  el.innerHTML = items.join('');
}

// ===== 作品按周分组 =====
function getISOWeek(dateStr) {
  var d = new Date(dateStr);
  var start = new Date(d.getFullYear(), 0, 1);
  var diff = (d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

function renderMonitorWeekGroups() {
  var el = $('#monitorWeekGroups');
  if (!el) return;
  var videos = Store.monitorVideos();
  var allVids = Object.values(videos).flat();
  var accounts = Store.monitorAccounts();
  var sel = _monitorState.selectedId;

  if (sel !== 'all') {
    var selAcc = accounts.find(function(a) { return a.id === sel; });
    if (selAcc) {
      var key = selAcc.platform + '_' + selAcc.id;
      allVids = videos[key] || [];
    }
  }

  var totalEl = $('#monitorWorkTotal');
  if (totalEl) totalEl.textContent = '共 ' + allVids.length + ' 条';

  if (!allVids.length) {
    el.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:30px;font-size:13px;">等待首次数据抓取...<br>抓取后这里将展示你所有账号的全部作品</p>';
    return;
  }

  // 按 年-月 → 周 两层分组
  var monthGroups = {};
  allVids.forEach(function(w) {
    if (!w.publishTime) return;
    var d = new Date(w.publishTime);
    var y = d.getFullYear();
    var m = d.getMonth() + 1; // 1-12
    var week = getISOWeek(w.publishTime);
    var mKey = y + '-' + String(m).padStart(2, '0');

    if (!monthGroups[mKey]) monthGroups[mKey] = { year: y, month: m, weeks: {} };
    var wk = monthGroups[mKey].weeks;
    var wKey = 'W' + String(week).padStart(2, '0');
    if (!wk[wKey]) wk[wKey] = { week: week, works: [], firstDate: w.publishTime };
    wk[wKey].works.push(w);
  });

  // 倒序排列月份（最新在前）
  var mKeys = Object.keys(monthGroups).sort(function(a, b) { return b.localeCompare(a); });
  if (!mKeys.length) { el.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:30px;font-size:13px;">暂无作品数据</p>'; return; }

  var MONTH_NAMES = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  var fmtD = function(d) { return (d.getMonth() + 1) + '/' + d.getDate(); };

  el.innerHTML = mKeys.map(function(mKey) {
    var mg = monthGroups[mKey];
    var weekKeys = Object.keys(mg.weeks).sort(function(a, b) { return b.localeCompare(a); });
    var totalWorks = 0;
    weekKeys.forEach(function(wk) { totalWorks += mg.weeks[wk].works.length; });

    var weeksHtml = weekKeys.map(function(wKey) {
      var g = mg.weeks[wKey];
      var y = mg.year, wk = g.week;
      var jan1 = new Date(y, 0, 1);
      var dayOffset = (wk - 1) * 7 - jan1.getDay() + 1;
      var mon = new Date(y, 0, 1 + dayOffset);
      var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      var cards = g.works.map(function(w) {
        var plat = 'douyin';
        Object.keys(videos).forEach(function(k) {
          if (videos[k] && videos[k].some(function(vw) { return vw.id === w.id; })) {
            plat = k.split('_')[0];
          }
        });
        return renderWorkCard(w, plat);
      }).join('');

      return '<div class="week-group">' +
        '<div class="week-head" onclick="event.stopPropagation();this.parentElement.classList.toggle(\'open\')">' +
          '<div class="week-head-left">' +
            '<span class="week-num">第' + wk + '周</span>' +
            '<span class="week-range">' + fmtD(mon) + ' - ' + fmtD(sun) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span class="week-badge">' + g.works.length + '条</span>' +
            '<span class="week-arrow">▼</span>' +
          '</div>' +
        '</div>' +
        '<div class="week-body">' + cards + '</div>' +
      '</div>';
    }).join('');

    return '<div class="month-group">' +
      '<div class="month-head" onclick="this.parentElement.classList.toggle(\'open\')">' +
        '<div class="month-head-left">' +
          '<span class="month-title">' + mg.year + '年' + MONTH_NAMES[mg.month] + '</span>' +
          '<span class="month-total">' + totalWorks + '条作品</span>' +
        '</div>' +
        '<span class="month-arrow">▼</span>' +
      '</div>' +
      '<div class="month-week-list">' + weeksHtml + '</div>' +
    '</div>';
  }).join('');
}

function renderWorkCard(w, platform) {
  var plat = platform || 'douyin';
  var pn = PLATFORM_MAP[plat] || plat;
  var pc = _PLAT_COLORS[plat] || '#ccc';
  var domain = _PLAT_DOMAINS[plat] || '';
  var link = w.videoUrl || w.url || w.shareUrl || '';
  var linkHtml = link ? '<a href="' + link + '" class="work-link-btn" target="_blank" onclick="event.stopPropagation()">在' + pn + '查看原视频 · ' + domain + '</a>' : '';

  return '<div class="video-card" style="cursor:default;" data-id="' + (w.id || '') + '">' +
    '<div class="card-cover-area" style="min-height:90px;background:linear-gradient(135deg,' + pc + '22,' + pc + '08);">' +
      '<span style="font-size:36px;">🎬</span>' +
      '<span style="position:absolute;top:10px;right:10px;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:600;color:#fff;background:' + pc + '88;">' + pn + '</span>' +
    '</div>' +
    '<div class="card-body"><div class="card-title">' + (w.title || '未命名作品') + '</div><div class="card-author"><span class="author-name">' + (w.author || '') + '</span></div></div>' +
    '<div class="card-stats"><span class="stat-item">❤️ ' + formatNum(w.likes || 0) + '</span><span class="stat-item">▶️ ' + formatNum(w.plays || 0) + '</span><span class="stat-time">' + ((w.publishTime || '').slice(5) || '') + '</span></div>' +
    linkHtml +
  '</div>';
}

// ===== 添加账号弹窗 =====
function openAcctModal() {
  var el = $('#acctModalBg');
  if (el) el.classList.add('show');
}

function closeAcctModal() {
  var el = $('#acctModalBg');
  if (el) el.classList.remove('show');
  // 清空输入
  var idEl = $('#acctId'); if (idEl) idEl.value = '';
  var nickEl = $('#acctNick'); if (nickEl) nickEl.value = '';
}

function addMonitorAccount() {
  var platform = $('#acctPlat').value;
  var uid = $('#acctId').value.trim();
  var nick = ($('#acctNick').value.trim()) || (PLATFORM_MAP[platform] + '号:' + uid);
  if (!uid) { showToast('请输入账号ID'); return; }

  var accounts = Store.monitorAccounts();
  if (accounts.find(function(a) { return a.platform === platform && a.id === uid; })) {
    showToast('该账号已在监控列表中'); return;
  }

  var newAcc = { id: uid, platform: platform, nickname: nick, addedAt: Date.now() };
  accounts.push(newAcc);
  Store.saveMonitorAccounts(accounts);
  showToast('已添加，下次刷新时抓取数据');

  closeAcctModal();
  // 自动选中新账号
  _monitorState.selectedId = uid;
  renderMonitorDashboard();
}

function refreshMonitorData() {
  showToast('数据刷新需要运行爬虫脚本，我会在后台帮你处理');
  renderMonitorDashboard();
}

function toggleBurstOnly(btn) {
  App.filters.burstOnly = !App.filters.burstOnly;
  if (btn) btn.classList.toggle('on', App.filters.burstOnly);
  renderVideoList();
}

// 时间视图：分板(最近/历史) / 合并
function setTimeView(mode) {
  App.timeView = mode;
  $$('.timeview-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  renderVideoList();
}

// ===== 筛选器绑定 =====
function bindFilters() {
  // 等级筛选
  $$('.filter-btn[data-filter="level"]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn[data-filter="level"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.filters.level = btn.dataset.value;
      renderVideoList();
    });
  });

  // 平台筛选
  $$('.filter-btn[data-filter="platform"]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn[data-filter="platform"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.filters.platform = btn.dataset.value;
      renderVideoList();
    });
  });

  // 题材筛选
  $$('.filter-btn[data-filter="topic"]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn[data-filter="topic"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.filters.topic = btn.dataset.value;
      renderVideoList();
    });
  });

  // 搜索
  $('#searchInput').addEventListener('input', (e) => {
    App.searchQuery = e.target.value;
    renderVideoList();
  });
}

// ===== 刷新数据 =====
async function refreshData() {
  const btn = $('#refreshBtn');
  btn.classList.add('spinning');

  try {
    await loadVideoData(true);
    showToast('✅ 已重新抓取最新爆款');
  } catch (e) {
    // 抓取失败且本地无数据时，回退到模拟（仅兜底）
    if (!App.videoData.length) {
      const added = simulateDailyCrawl();
      showToast(`✅ 模拟抓取 ${added} 条新爆款`);
    } else {
      showToast('⚠️ 抓取失败，展示本地已存数据');
    }
  }

  renderVideoList();
  updateTimeStatus();

  btn.classList.remove('spinning');
}

function updateTimeStatus() {
  const el = $('#lastFetchInfo');
  if (el) {
    const ago = timeAgo(App.lastFetchTime);
    const total = App.videoData.length;
    const realTag = App.usingRealData ? ' · 真实爬虫数据' : ' · 示例数据';
    el.innerHTML = `<span class="status-dot"></span> 最近抓取: ${ago} · 共 ${total} 条爆款视频${realTag} · v${APP_VERSION}`;
  }
}

// ===== 手动录入视频 =====
function openManualEntry() {
  $('#manualEntryModal').classList.add('show');
}

function closeManualEntry() {
  $('#manualEntryModal').classList.remove('show');
}

function saveManualVideo() {
  const title = $('#manualTitle').value.trim();
  const link = $('#manualLink').value.trim();
  if (!title && !link) { showToast('请至少填写标题或链接'); return; }

  const video = {
    id: genId(),
    title: title || '手动录入视频',
    author: $('#manualAuthor').value.trim() || '手动录入',
    fans: parseInt($('#manualFans').value) || 0,
    likes: parseInt($('#manualLikes').value) || 0,
    plays: parseInt($('#manualPlays').value) || 0,
    platform: $('#manualPlatform').value || 'douyin',
    level: $('#manualLevel').value || 'low_fan',
    topic: $('#manualTopic').value || 'couple_funny',
    publishTime: Date.now(),
    factors: ['手动录入'],
    manualEntry: true,
  };

  App.videoData.unshift(video);
  Store.cacheVideos(App.videoData);
  closeManualEntry();
  renderVideoList();
  showToast('✅ 视频已录入');

  // 清空表单
  ['#manualTitle','#manualLink','#manualAuthor','#manualFans','#manualLikes','#manualPlays'].forEach(s => {
    $(s).value = '';
  });
}

// ===== 下拉刷新 =====
let touchStartY = 0;
let isPulling = false;

document.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (window.scrollY > 0) return;
  const diff = e.touches[0].clientY - touchStartY;
  if (diff > 60 && !isPulling) {
    isPulling = true;
    $('#pullIndicator')?.classList.add('show');
  }
}, { passive: true });

document.addEventListener('touchend', async () => {
  if (isPulling) {
    isPulling = false;
    $('#pullIndicator')?.classList.remove('show');
    await refreshData();
  }
});

// ===== 在线/离线检测 =====
window.addEventListener('online', () => {
  App.isOnline = true;
  showOfflineBanner(false);
  showToast('🌐 网络已恢复');
});

window.addEventListener('offline', () => {
  App.isOnline = false;
  showOfflineBanner(true);
});

// ===== PWA安装提示 =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // 可以在这里显示安装提示banner
});

// ===== Service Worker注册 =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ===== 加载真实监控数据 (monitor_data.json) =====
function _parseMonitorCount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  var s = String(val).trim().toLowerCase().replace(/,/g, '');
  var m = s.match(/([\d.]+)\s*(万|w|亿|e)/);
  if (m) {
    var n = parseFloat(m[1]);
    if (m[2] === '亿' || m[2] === 'e') return Math.round(n * 1e8);
    return Math.round(n * 1e4);
  }
  var plain = s.replace(/[^\d.]/g, '');
  return plain ? parseInt(plain) : 0;
}

async function loadMonitorData() {
  try {
    var resp = await fetch('./data/monitor_data.json?v=' + Date.now());
    if (!resp.ok) { console.log('monitor_data.json not found, using localStorage'); return; }
    var data = await resp.json();
    if (!data || !data.accounts) return;

    var today = new Date().toISOString().slice(0, 10);
    var serverDate = data._date || today;

    // 检查是否已有更新的数据
    var existingDate = Store.get('monitorDataDate');
    if (existingDate && existingDate > serverDate) {
      console.log('monitor data: localStorage newer than server, skip');
      return;
    }

    var accounts = [];
    var snapshots = Store.monitorSnapshots() || {};
    var videos = {};

    Object.values(data.accounts).forEach(function(acc) {
      var aid = acc.user_id || String(Date.now());
      var plat = acc.platform || 'unknown';
      var account = {
        id: aid,
        platform: plat,
        nickname: acc.nickname || aid,
        addedAt: Date.now()
      };
      accounts.push(account);

      // 转换视频数据
      var key = plat + '_' + aid;
      var vlist = (acc.videos || []).map(function(v) {
        var ts = v.time || v.create_time || v.ctime || 0;
        if (typeof ts === 'number' && ts < 1e12) ts *= 1000;
        return {
          title: v.title || v.desc || '',
          likes: _parseMonitorCount(v.liked_count || v.like_count),
          plays: _parseMonitorCount(v.view_count || v.play_count || 0),
          comments: _parseMonitorCount(v.comment_count),
          saves: _parseMonitorCount(v.collected_count || v.collect_count),
          shares: _parseMonitorCount(v.share_count),
          publishTime: ts || null,
          time: ts ? new Date(ts).toTimeString().slice(0, 5) : '',
          url: v.note_url || v.video_url || v.aweme_url || v.share_url || '',
          topic: 'other',
          duration: v.duration || 0
        };
      });
      videos[key] = vlist;

      // 生成今日快照
      var totalPlays = vlist.reduce(function(s, v) { return s + (v.plays || 0); }, 0);
      var totalLikes = vlist.reduce(function(s, v) { return s + (v.likes || 0); }, 0);
      var totalComments = vlist.reduce(function(s, v) { return s + (v.comments || 0); }, 0);
      var totalSaves = vlist.reduce(function(s, v) { return s + (v.saves || 0); }, 0);
      var totalShares = vlist.reduce(function(s, v) { return s + (v.shares || 0); }, 0);
      snapshots[key + '_' + serverDate] = {
        fans: 0,
        works: vlist.length,
        totalPlays: totalPlays,
        totalLikes: totalLikes,
        totalComments: totalComments,
        totalSaves: totalSaves,
        totalShares: totalShares
      };
    });

    Store.saveMonitorAccounts(accounts);
    Store.saveMonitorSnapshots(snapshots);
    Store.saveMonitorVideos(videos);
    Store.set('monitorDataDate', serverDate);
    console.log('📊 监控数据已加载:', accounts.length, '个账号,', Object.values(videos).flat().length, '条作品');
  } catch (e) {
    console.log('monitor_data.json load failed:', e.message);
  }
}

// ===== 应用初始化 =====
async function initApp() {
  // 加载设置
  const settings = Store.settings();
  if (settings.dataSourceUrl) App.dataSourceUrl = settings.dataSourceUrl;

  // 加载视频数据
  await loadVideoData();

  // 加载监控数据
  await loadMonitorData();

  // 初始渲染
  renderVideoList();
  updateTimeStatus();
  bindFilters();

  // 默认选中首页
  switchTab('radar');

  console.log('🔥 爆款工作台初始化完成');
}

// DOM Ready后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
