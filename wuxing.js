/* 五行喜忌卡的规则。
 * 口径和 `AI提示词-五行喜忌与天选城市.md` 一致：身强身弱按固定分数表算，喜忌、调候、从格按规则排，
 * 所以同一个盘每次打开都是同一个结果。改规则时两边一起改。
 * 10-21 第二版（谷雨嫌自己的盘只算出「偏强」）：地支按本气整份算（讲义：地支的五行和十神都按本气算）；
 * 帮身占比再按两万个随机盘的分位数换算成「强弱值」，50＝中正，分八档：
 * 非常弱 / 很弱 / 弱 / 偏弱 / 偏强 / 强 / 很强 / 非常强，人数大约 5/10/15/20/20/15/10/5%。 */
(function (global) {
  const GAN = '甲乙丙丁戊己庚辛壬癸';
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  const WX5 = ['木', '火', '土', '金', '水'];
  const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  // 藏干：本气、中气、余气
  const CG = { 子: '癸', 丑: '己癸辛', 寅: '甲丙戊', 卯: '乙', 辰: '戊乙癸', 巳: '丙庚戊', 午: '丁己', 未: '己丁乙', 申: '庚壬戊', 酉: '辛', 戌: '戊辛丁', 亥: '壬甲' };
  const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // A 生 SHENG[A]
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };    // A 克 KE[A]
  const CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
  const HE = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
  const LING = { 寅: '木', 卯: '木', 巳: '火', 午: '火', 申: '金', 酉: '金', 亥: '水', 子: '水', 辰: '土', 戌: '土', 丑: '土', 未: '土' };
  const STATE = { 同我: '旺', 生我: '相', 我生: '休', 我克: '囚', 克我: '死' };
  const HELP = ['生我', '同我'], HURT = ['克我', '我生', '我克'];

  // 强弱值：原始帮身占比（%）→ 强弱值，按分位数分段换算（[原始, 强弱值]）
  const ANCH = [[0, 0], [8, 20], [16.6, 30], [25.4, 40], [37.6, 50], [52, 60], [64.8, 70], [77.3, 80], [100, 100]];
  function toIndex(raw) {
    for (let i = 1; i < ANCH.length; i++) {
      const [a, ia] = ANCH[i - 1], [b, ib] = ANCH[i];
      if (raw <= b) return ia + (raw - a) / (b - a) * (ib - ia);
    }
    return 100;
  }
  const LEVELS = [[80, '非常强'], [70, '很强'], [60, '强'], [50, '偏强'], [40, '偏弱'], [30, '弱'], [20, '很弱'], [0, '非常弱']];

  // 位置分：月支 4、日支 2、月干和时干 1.5、年干年支时支 1
  const W_GAN = [1, 1.5, 0, 1.5];
  const W_ZHI = [1, 4, 2, 1];
  const POS = ['年', '月', '日', '时'];

  const pairIn = (a, b, list) => a !== b && list.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  function rel(me, x) {
    if (x === me) return '同我';
    if (SHENG[x] === me) return '生我';
    if (SHENG[me] === x) return '我生';
    if (KE[me] === x) return '我克';
    return '克我';
  }
  function catWx(me, c) {
    return { 同我: me, 生我: WX5.find(x => SHENG[x] === me), 我生: SHENG[me], 我克: KE[me], 克我: WX5.find(x => KE[x] === me) }[c];
  }
  const wxCat = (me, w) => rel(me, w);

  function parse(s) {
    s = String(s || '').replace(/\s/g, '');
    if (s.length !== 6 && s.length !== 8) return null;
    const P = [];
    for (let i = 0; i < s.length; i += 2) {
      const g = s[i], z = s[i + 1];
      const gi = GAN.indexOf(g), zi = ZHI.indexOf(z);
      if (gi < 0 || zi < 0 || gi % 2 !== zi % 2) return null;
      P.push(g + z);
    }
    return P;
  }

  /* ---------- 卡片上的字 ---------- */
  const SEASON = { 寅: '初春', 卯: '仲春', 辰: '暮春', 巳: '初夏', 午: '盛夏', 未: '夏末', 申: '初秋', 酉: '仲秋', 戌: '深秋', 亥: '初冬', 子: '隆冬', 丑: '冬末' };
  // 一句话标签的后半句：日主五行 × 第一喜用
  const PHRASE = {
    木: { 水: '等一场好雨', 木: '要一片林子作伴', 火: '该开花了', 土: '要扎进实土里', 金: '修剪过才成材' },
    火: { 木: '要添一把柴', 火: '要同伴一起亮', 土: '把热量落进土里', 金: '炉中要有金可炼', 水: '要一汪水照见自己' },
    土: { 火: '要阳光晒暖', 土: '要同伴一起垒高', 金: '要把矿藏挖出来', 水: '要引一渠活水', 木: '要树根来松一松' },
    金: { 土: '先被厚土托住', 金: '要同伴并肩', 水: '淬过水才有光', 木: '要有木可雕', 火: '要进炉火锻造' },
    水: { 金: '要找到源头', 水: '要汇成江河', 木: '流去浇灌树林', 火: '在等一束光', 土: '要有河岸' },
  };
  const COLORS = {
    木: [['松针绿', '#2f6b4f'], ['薄荷绿', '#9fd8b8'], ['橄榄绿', '#7a8b3a'], ['青瓷色', '#9cc3b2']],
    火: [['酒红', '#8e1b3a'], ['珊瑚色', '#ff7f6a'], ['橘色', '#f28c28'], ['杏粉', '#f6c1b0'], ['薰衣草紫', '#b79cd9']],
    土: [['姜黄', '#d9a21b'], ['驼色', '#c19a6b'], ['卡其色', '#c3b091'], ['焦糖', '#af6e2d'], ['陶土色', '#b5653e']],
    金: [['象牙白', '#fffbea'], ['珍珠白', '#f1ece2'], ['银色', '#c4c6cc'], ['香槟金', '#e6cf9a'], ['土豪金', '#d4af37']],
    水: [['墨黑', '#1f1f24'], ['藏青', '#1f2f5a'], ['深海蓝', '#12406b'], ['雾霾蓝', '#8fa6b8'], ['炭灰', '#4a4a4f'], ['天蓝色', '#87ceeb']],
  };
  const HETU = { 水: [1, 6], 火: [2, 7], 木: [3, 8], 金: [4, 9], 土: [5] };
  const TASTE = { 木: '酸', 火: '苦', 土: '甜', 金: '辛辣', 水: '咸' };
  // 方位以中国中部为中心，按全国地图分
  const DIR = { 木: ['东', '东北'], 火: ['南', '东南'], 金: ['西', '西南'], 水: ['北', '西北'], 土: ['中'] };
  const DIR_NAME = { 东: '东方', 南: '南方', 西: '西方', 北: '北方', 中: '中部', 东北: '东北', 东南: '东南', 西南: '西南', 西北: '西北' };
  const CITY = {
    北: ['北京', '天津'],
    东北: ['沈阳', '大连', '哈尔滨'],
    东: ['上海', '杭州', '苏州', '南京', '宁波'],
    东南: ['福州', '厦门', '台湾'],
    南: ['广州', '深圳', '香港', '澳门', '潮汕', '海南'],
    西南: ['成都', '重庆', '昆明', '玉溪', '普洱', '西双版纳', '芒市', '大理', '丽江'],
    西: ['西安', '兰州'],
    西北: ['乌鲁木齐', '银川'],
    中: ['郑州', '洛阳', '武汉', '合肥'],
  };
  const COUNTRY = {
    北: ['俄罗斯'], 东北: ['韩国', '日本'], 东: ['日本'], 南: ['新加坡', '马来西亚', '泰国'],
    西: ['美国', '加拿大'], 西北: ['瑞典', '挪威', '芬兰'],
  };
  const pick = (arr, n, seed) => {
    const out = [];
    for (let i = 0; i < arr.length && out.length < n; i++) out.push(arr[(seed + i) % arr.length]);
    return out;
  };

  function judge(s) {
    const P = parse(s);
    if (!P) return { error: true };
    const has4 = P.length === 4;
    const g = P.map(p => p[0]), z = P.map(p => p[1]);
    const dm = g[2], me = GAN_WX[dm];
    const sum = { 生我: 0, 同我: 0, 克我: 0, 我生: 0, 我克: 0 };

    // 相邻地支六冲、六合，各打七折（两边都挨着就打两次）
    const disc = z.map(() => 1);
    const clash = [];
    for (let i = 0; i < z.length - 1; i++) {
      const c = pairIn(z[i], z[i + 1], CHONG), h = pairIn(z[i], z[i + 1], HE);
      if (c || h) { disc[i] *= 0.7; disc[i + 1] *= 0.7; clash.push(POS[i] + '支' + z[i] + POS[i + 1] + '支' + z[i + 1] + (c ? '相冲' : '相合')); }
    }

    const rows = [];
    const order = has4 ? [['g', 0], ['z', 0], ['g', 1], ['z', 1], ['z', 2], ['g', 3], ['z', 3]] : [['g', 0], ['z', 0], ['g', 1], ['z', 1], ['z', 2]];
    for (const [t, i] of order) {
      const row = { pos: POS[i] + (t === 'g' ? '干' : '支'), ch: t === 'g' ? g[i] : z[i], parts: [], help: 0, hurt: 0, disc: t === 'z' ? disc[i] : 1 };
      const items = t === 'g' ? [[g[i], W_GAN[i]]] : [[CG[z[i]][0], W_ZHI[i] * disc[i]]];   // 地支按本气整份算
      for (const [c, v] of items) {
        const cat = rel(me, GAN_WX[c]);
        sum[cat] += v;
        row.parts.push({ ch: c, cat, v });
        if (HELP.includes(cat)) row.help += v; else row.hurt += v;
      }
      rows.push(row);
    }
    // 先四舍五入，免得 0.4 被电脑算成 0.39999… 而卡错分界线
    const r6 = x => Math.round(x * 1e6) / 1e6;
    for (const k in sum) sum[k] = r6(sum[k]);
    const help = r6(sum.生我 + sum.同我), total = r6(help + sum.克我 + sum.我生 + sum.我克);
    const pct = r6(help / total);
    const raw = Math.round(help / total * 1e6) / 1e4;          // 原始帮身占比，百分数，保留 4 位
    const index = Math.round(toIndex(raw) * 1e4) / 1e4;        // 强弱值 0～100，50＝中正

    // 得令、得地、得生、得助
    const lingCat = rel(me, LING[z[1]]);
    const deling = HELP.includes(lingCat);
    const roots = [];
    z.forEach((b, i) => {
      const broken = z.some((o, j) => j !== i && pairIn(b, o, CHONG));
      [...CG[b]].forEach((c, k) => {
        if (GAN_WX[c] !== me) return;
        const rank = c === dm ? (k === 0 ? 1 : 3) : (k === 0 ? 2 : 4);
        roots.push({ pos: POS[i] + '支', zhi: b, ch: c, k, rank, broken });
      });
    });
    const sheng = [], zhu = [];
    g.forEach((c, i) => { if (i === 2) return; const r = rel(me, GAN_WX[c]); if (r === '生我') sheng.push(c); if (r === '同我') zhu.push(c); });
    z.forEach(b => { const r = rel(me, GAN_WX[CG[b][0]]); if (r === '生我') sheng.push(b); });

    const strong = index > 50 || (index === 50 && deling);
    let level = LEVELS.find(([th]) => index >= th)[1];
    if (index === 50 && !deling) level = '偏弱';

    // 扶抑取喜忌
    let xi, ji;
    if (!strong) {
      const top = HURT.reduce((a, b) => (sum[b] > sum[a] ? b : a));
      const first = top === '我克' ? '同我' : '生我';
      xi = [first, first === '生我' ? '同我' : '生我'];
      ji = HURT.slice().sort((a, b) => sum[b] - sum[a]);
    } else {
      let first;
      if (sum.生我 > sum.同我) first = '我克';
      else first = sum.克我 > sum.我生 ? '克我' : '我生';
      xi = [first, ...HURT.filter(c => c !== first).sort((a, b) => sum[a] - sum[b])];
      ji = HELP.slice().sort((a, b) => sum[b] - sum[a]);
    }
    let xiWx = xi.map(c => catWx(me, c)), jiWx = ji.map(c => catWx(me, c));

    // 调候
    const winter = '亥子丑'.includes(z[1]), summer = '巳午未'.includes(z[1]);
    let tiaohou = '';
    const lift = w => { if (xiWx.includes(w)) { xiWx = [w, ...xiWx.filter(x => x !== w)]; return true; } return false; };
    if (winter) tiaohou = lift('火') ? '生在冬天，偏冷，火提到第一位来暖局。' : '生在冬天，偏冷；火在这个盘里是忌神，暖一点会舒服，少量就好。';
    if (summer) tiaohou = lift('水') ? '生在夏天，偏燥，水提到第一位来润局。' : '生在夏天，偏燥；水在这个盘里是忌神，润一点会舒服，少量就好。';

    // 从格：满足才提
    let cong = '';
    const fuyi = { xiWx: xiWx.slice(), jiWx: jiWx.slice() };
    if (index >= 90) {
      cong = '从强';
      xiWx = HELP.slice().sort((a, b) => sum[b] - sum[a]).map(c => catWx(me, c));
      jiWx = ['克我', '我克'].map(c => catWx(me, c));
    } else if (index < 30) {
      const solid = roots.some(r => !r.broken && r.k <= 1);
      const helper = g.some((c, i) => i !== 2 && HELP.includes(rel(me, GAN_WX[c])));
      if (!solid && !helper) {
        cong = '从弱';
        const top = HURT.reduce((a, b) => (sum[b] > sum[a] ? b : a));
        const X = catWx(me, top);
        const shengX = WX5.find(w => SHENG[w] === X), keX = WX5.find(w => KE[w] === X);
        xiWx = [X, shengX];
        jiWx = [...new Set([...HELP.slice().sort((a, b) => sum[b] - sum[a]).map(c => catWx(me, c)), keX])];
      }
    }

    // 卡片内容
    const seed = P.reduce((a, p) => a + GAN.indexOf(p[0]) * 7 + ZHI.indexOf(p[1]) * 3, 0);
    const x0 = xiWx[0], x1 = xiWx[1];
    const label = SEASON[z[1]] + '的' + dm + me;
    const phrase = PHRASE[me][x0];
    const colors = [...pick(COLORS[x0], 2, seed), ...(x1 ? pick(COLORS[x1], 1, seed + 1) : [])];
    const nums = [...new Set([...HETU[x0], ...(x1 ? HETU[x1] : [])])];
    const dirs = DIR[x0];
    let cities = pick(CITY[dirs[0]], dirs[1] ? 3 : 4, seed);
    if (dirs[1]) cities = cities.concat(pick(CITY[dirs[1]], 1, seed));
    let countries = [];
    for (const d of [...dirs, ...(x1 ? DIR[x1] : [])]) { if (COUNTRY[d]) { countries = pick(COUNTRY[d], 2, seed); break; } }
    const tastes = [TASTE[x0], ...(x1 ? [TASTE[x1]] : [])];
    const tuCount = [...g, ...z.map(b => CG[b][0])].filter(c => GAN_WX[c] === '土').length;
    const veg = x0 === '木' || x1 === '木' || tuCount >= 3;
    const avoidDir = DIR[jiWx[0]].map(d => DIR_NAME[d]);

    return {
      pillars: P, has4, dm, me, rows, sum, total, pct, raw, index, level, strong, deling, ling: LING[z[1]], state: STATE[lingCat],
      roots, sheng, zhu, clash, tiaohou, cong, fuyi, xiWx, jiWx,
      label, phrase, colors, nums, dirText: dirs.map(d => DIR_NAME[d]).join('和'), cities, countries, tastes, veg, avoidDir,
    };
  }

  global.Wuxing = { judge, parse, GAN, ZHI, GAN_WX, CG, rel, catWx };
})(typeof window !== 'undefined' ? window : globalThis);
