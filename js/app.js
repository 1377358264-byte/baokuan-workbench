/**
 * 爆款工作台 - 主应用逻辑
 * 移动端PWA | MediaCrawler真实数据 | localStorage存储 | 离线可用
 */

// ===== 全局状态 =====
const App = {
  currentPage: 'radar',
  currentSubTab: 'videos', // videos | account
  filters: { level: 'all', platform: 'all', topic: 'all' },
  searchQuery: '',
  videoData: [],
  accountData: {},
  isOnline: navigator.onLine,
  dataSourceUrl: './data/videos.json',
  accountSourceUrl: './data/accounts.json',
  lastFetchTime: null,
};

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

  settings() { return this.get('settings') || {}; },
  saveSettings(v) { return this.set('settings', v); },

  history() { return this.get('analysisHistory') || []; },
  saveHistory(v) { return this.set('analysisHistory', v); },

  cachedVideos() { return this.get('cachedVideos'); },
  cacheVideos(v) { return this.set('cachedVideos', v); },

  exportAll() {
    const data = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      plans: this.plans(),
      notes: this.notes(),
      favorites: this.favorites(),
      monitors: this.monitors(),
      settings: this.settings(),
      history: this.history(),
      cachedVideos: this.cachedVideos(),
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
async function loadVideoData(forceRefresh = false) {
  const settings = Store.settings();
  if (settings.dataSourceUrl) App.dataSourceUrl = settings.dataSourceUrl;

  // 尝试从网络加载爬虫数据
  if (!forceRefresh && !App.isOnline) {
    const cached = Store.cachedVideos();
    if (cached && cached.length > 0) {
      App.videoData = cached;
      showOfflineBanner(true);
      return cached;
    }
  }

  try {
    const resp = await fetch(App.dataSourceUrl + '?t=' + Date.now(), {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    App.videoData = Array.isArray(data) ? data : (data.videos || data.list || []);
    App.lastFetchTime = Date.now();
    Store.cacheVideos(App.videoData);
    showOfflineBanner(false);
    return App.videoData;
  } catch (err) {
    console.warn('爬虫数据加载失败，使用缓存:', err.message);
    const cached = Store.cachedVideos();
    if (cached && cached.length > 0) {
      App.videoData = cached;
      showOfflineBanner(true);
      return cached;
    }
    // 最终兜底：使用内置示例数据（仅首次启动无任何数据时）
    App.videoData = SAMPLE_VIDEOS;
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
function getFilteredVideos() {
  let list = [...App.videoData];
  const f = App.filters;

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

function renderVideoList() {
  const container = $('#videoList');
  const filtered = getFilteredVideos();

  $('#resultCount').textContent = `符合条件的爆款：${filtered.length}条`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">🔍</div>
        <p>没有找到符合条件的爆款视频<br>试试调整筛选条件</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(v => renderVideoCard(v)).join('');

  // 绑定卡片点击事件
  container.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => openVideoDetail(card.dataset.id));
  });
}

function renderVideoCard(v) {
  const levelClass = `lv-${v.level || 'low_fan'}`;
  const platClass = `plat-${v.platform || 'douyin'}`;
  const levelText = LEVEL_MAP[v.level] || '未知等级';
  const platText = PLATFORM_MAP[v.platform] || '未知平台';

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
      </div>
      <div class="card-body">
        <div class="card-title">${v.title}</div>
        <div class="card-author">
          <span class="author-name">${v.author}</span>
          <span class="fans-count">粉丝 ${formatNum(v.fans || 0)}</span>
        </div>
      </div>
      <div class="card-stats">
        <span class="stat-item"><span class="stat-icon">🔥</span>${formatNum(v.likes || 0)}</span>
        <span class="stat-item"><span class="stat-icon">▶️</span>${formatNum(v.plays || 0)}</span>
        <span class="stat-time">${timeAgo(v.publishTime)}</span>
      </div>
    </div>`;
}

// ===== 视频详情弹窗 =====
function openVideoDetail(videoId) {
  const v = App.videoData.find(x => x.id === videoId);
  if (!v) return;

  const levelClass = `lv-${v.level || 'low_fan'}`;
  const levelText = LEVEL_MAP[v.level] || '未知';
  const platText = PLATFORM_MAP[v.platform] || '未知平台';

  const modal = $('#detailModal');
  $('#modalTitle').textContent = v.title;
  $('#modalSubtitle').textContent = `${v.author} · ${platText} · ${levelText}`;

  $('#detailFactors').innerHTML = (v.factors || []).map(f =>
    `<span class="detail-tag">${f}</span>`
  ).join('');

  $('#detailHook').innerHTML = `<p class="detail-text">${v.hook3s || '暂无分析'}</p>`;
  $('#detailStructure').innerHTML = `<p class="detail-text">${v.structure || '暂无分析'}</p>`;

  $('#detailComments').innerHTML = (v.topComments || []).map(c =>
    `<span class="detail-tag">${c}</span>`
  ).join('');

  $('#scoreDifficulty').querySelector('.score-value').textContent = (v.difficulty || 5) + '/10';
  $('#scorePotential').querySelector('.score-value').textContent = (v.potential || 70) + '/10';

  const adaptAdvice = generateAdaptationAdvice(v);
  $('#detailAdapt').innerHTML = `<p class="detail-text">${adaptAdvice}</p>`;

  $('#btnAddMaterial').onclick = () => addToMaterialLibrary(v);

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

// ===== 账号分析功能 =====
async function analyzeAccount() {
  const input = $('#accountInput').value.trim();
  const platform = $('#accountPlatform').value;

  if (!input) { showToast('请输入博主ID或主页链接'); return; }

  showToast('正在分析...');

  // 尝试从爬虫数据加载
  let accountData = null;
  try {
    const settings = Store.settings();
    const url = (settings.accountSourceUrl || App.accountSourceUrl) + '?id=' + encodeURIComponent(input) + '&platform=' + platform;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (resp.ok) accountData = await resp.json();
  } catch (e) {
    console.log('账号数据从网络获取失败，生成模拟分析');
  }

  // 如果没有爬虫数据，基于已有视频数据模拟分析
  if (!accountData) {
    accountData = generateMockAccountAnalysis(input, platform);
  }

  renderAccountResult(accountData);

  // 保存历史记录
  const history = Store.history();
  history.unshift({
    id: genId(),
    query: input,
    platform,
    result: accountData,
    time: Date.now(),
  });
  Store.saveHistory(history.slice(0, 50)); // 最多保留50条
}

function generateMockAccountAnalysis(query, platform) {
  // 基于查询词和当前视频数据生成合理的模拟分析
  const relatedVideos = App.videoData.filter(v =>
    (platform === 'all' || v.platform === platform) &&
    ((v.author || '').includes(query) || (v.title || '').includes(query))
  );

  const totalFans = relatedVideos.reduce((s, v) => s + (v.fans || 0), 0) || Math.floor(Math.random() * 5000000) + 10000;
  const totalLikes = relatedVideos.reduce((s, v) => s + (v.likes || 0), 0) || Math.floor(Math.random() * 2000000) + 5000;
  const totalWorks = Math.max(relatedVideos.length, Math.floor(Math.random() * 200) + 20);
  const avgLikes = Math.floor(totalLikes / totalWorks);
  const hotRate = ((relatedVideos.filter(v => ['mid','head','super'].includes(v.level)).length / Math.max(totalWorks, 1)) * 100).toFixed(1);

  return {
    nickname: query.includes('@') ? query.split('@')[1]?.split('.')[0] || query : query + '的账号',
    avatar: '',
    totalFans,
    totalLikes,
    totalWorks,
    avgLikes,
    avgComments: Math.floor(avgLikes * 0.05),
    avgShares: Math.floor(avgLikes * 0.08),
    hotRate: parseFloat(hotRate),
    recentWorks: (relatedVideos.length > 0 ? relatedVideos : SAMPLE_VIDEOS.slice(0, 5)).slice(0, 20).map(v => ({
      ...v,
      isHot: ['mid','head','super'].includes(v.level),
    })),
    patterns: [
      '开篇常用"你敢信"/"结果没想到"等悬念句式制造停留',
      '内容结构多为：日常场景铺垫 → 意外事件插入 → 夸张反应 → 反转收尾',
      '高频使用居家环境（卧室/客厅/厨房），道具简单易复制',
      '标题常含数字和对比："X分钟""差X倍""第一次就..."',
      '评论区引导话术固定，常用"你们会怎么做？""艾特你的TA"',
    ],
    suggestions: [
      '该账号的"日常场景+意外反转"模式复制成本低，适合新手起步',
      '其标题公式"数字+悬念+情感词"可直接套用',
      '建议学习其评论区运营策略，提高互动率',
      '注意避开其低数据作品中的"过度表演"问题',
      '情侣赛道可借鉴其"角色互换"类内容的互动设计',
    ],
    warnings: [
      '部分作品过度依赖单一反转套路，观众可能产生审美疲劳',
      '低数据作品中常见"铺垫过长"问题，建议控制在5秒内进入正题',
    ],
  };
}

function renderAccountResult(data) {
  const container = $('#accountResult');
  container.style.display = 'block';

  container.innerHTML = `
    <div class="account-profile-card">
      <div class="profile-header">
        <div class="profile-avatar">${data.nickname?.charAt(0) || '👤'}</div>
        <div class="profile-info">
          <h3>${data.nickname || '未知博主'}</h3>
          <p>共 ${data.totalWorks || 0} 条作品 · 爆款率 ${(data.hotRate || 0)}%</p>
        </div>
      </div>
      <div class="profile-stats-grid">
        <div class="ps-item"><div class="ps-value">${formatNum(data.totalFans || 0)}</div><div class="ps-label">总粉丝</div></div>
        <div class="ps-item"><div class="ps-value">${formatNum(data.totalLikes || 0)}</div><div class="ps-label">总获赞</div></div>
        <div class="ps-item"><div class="ps-value">${data.avgLikes || 0}</div><div class="ps-label">均赞</div></div>
        <div class="ps-item"><div class="ps-value">${data.hotRate || 0}%</div><div class="ps-label">爆款率</div></div>
      </div>
    </div>

    <div class="pattern-card">
      <h4>🔍 爆款套路提炼</h4>
      <ul class="pattern-list">
        ${(data.patterns || []).map(p => `<li><span class="pli-num">✓</span><span>${p}</span></li>`).join('')}
      </ul>
    </div>

    <div class="pattern-card">
      <h4>💡 可借鉴要点</h4>
      <ul class="pattern-list">
        ${(data.suggestions || []).map(s => `<li><span class="pli-num">💡</span><span>${s}</span></li>`).join('')}
      </ul>
    </div>

    ${(data.warnings && data.warnings.length > 0) ? `
    <div class="pattern-card">
      <h4>⚠️ 避坑提醒</h4>
      <ul class="pattern-list">
        ${data.warnings.map(w => `<li><span class="pli-num">⚠️</span><span>${w}</span></li>`).join('')}
      </ul>
    </div>` : ''}

    <div class="pattern-card">
      <h4>📋 近期作品（${(data.recentWorks || []).length}条）</h4>
      <div class="works-mini-list">
        ${(data.recentWorks || []).map(w => `
          <div class="work-mini-item ${w.isHot ? 'wmi-hot' : 'wmi-normal'}">
            <span class="wmi-title">${w.title}</span>
            <span class="wmi-stats">🔥${formatNum(w.likes || 0)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <button class="btn-primary" onclick="addToMonitor('${(data.nickname || '').replace(/'/g, "\\'")}')">
      ⭐ 收藏至对标账号监控库
    </button>
  `;
}

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
    <span class="ai-qcmd" onclick="sendAiCmd('明天拍摄 +')">📝 明天拍摄</span>
    <span class="ai-qcmd" onclick="sendAiCmd('记录灵感 +')">💡 记录灵感</span>
    <span class="ai-qcmd" onclick="sendAiCmd('分析账号 +')">🔍 分析账号</span>
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

  if (lower.includes('拍摄') || lower.includes('计划')) {
    const theme = text.replace(/^[^\s]+\s*[+＋]\s*/, '').trim() || '新拍摄任务';
    addAiMessage(`好的，已为您创建拍摄计划：「${theme}」`, 'bot');

    const plan = {
      id: genId(),
      title: theme,
      style: 'couple_daily',
      priority: 'mid',
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      createdAt: Date.now(),
    };
    const plans = Store.plans();
    plans.unshift(plan);
    Store.savePlans(plans);

    setTimeout(() => {
      switchTab('plan');
      renderPlanPage();
    }, 800);
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
    const query = text.replace(/^[^\s]+\s*[+＋]\s*/, '').trim();
    addAiMessage(`好的，正在跳转账号分析页面...`, 'bot');
    setTimeout(() => {
      switchSubTab('account');
      if (query) $('#accountInput').value = query;
      toggleAiPanel(false);
    }, 500);
    return;
  }

  // 默认回复
  const replies = [
    '我可以帮你：\n\n🎬 分析视频 — 发送"分析视频+链接"\n📝 创建计划 — 发送"X号拍摄+主题"\n💡 记录灵感 — 发送"记录灵感+内容"\n🔍 分析账号 — 发送"分析账号+ID"',
    '我是你的创作助手！试试这些指令：\n• "分析视频 https://..."\n• "明天拍摄 搞笑整蛊"\n• "记录灵感 把冰箱藏起来"\n• "分析账号 @某某博主"',
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

  $('#videosView').style.display = tab === 'videos' ? 'block' : 'none';
  $('#accountView').classList.toggle('active', tab === 'account');
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

  if (isDemoMode()) {
    const added = simulateDailyCrawl();
    showToast(`✅ 模拟抓取 ${added} 条新爆款`);
  } else {
    await loadVideoData(true);
    showToast('✅ 数据已更新');
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
    const demoTag = isDemoMode() ? ' · 示例数据' : '';
    el.innerHTML = `<span class="status-dot"></span> 最近抓取: ${ago} · 共 ${total} 条爆款视频${demoTag}`;
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

// ===== 应用初始化 =====
async function initApp() {
  // 加载设置
  const settings = Store.settings();
  if (settings.dataSourceUrl) App.dataSourceUrl = settings.dataSourceUrl;

  // 加载视频数据
  await loadVideoData();

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
