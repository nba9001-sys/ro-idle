/* 經驗曲線與 GM 測試鈕（#80）。

   這支只驗**會壞的東西**，不驗「係數是不是等於 65」那種把資料檔抄一遍的東西：
     - 兩條曲線的單調性與段界連續性（改係數最容易在這裡破）
     - 職業曲線真的有看階層（一開始的版本忘了傳 tier，一轉跟二轉會拿到同一條）
     - 破表怪物的 exp/HP 比回到同級距水準（#80 修的那五筆）
     - GM 加等會照 statPointsAtLevel 發素質點（直接寫 baseLevel 會漏發）

   時數本身不在這裡驗——那要跑幾千次 gameTick，屬於 tools/measure_exp_curve.js 的工作。 */
const H = require('./harness');
const t = H.tester();
const g = H.boot();

/* ---------- 1. 基礎曲線 ---------- */
{
  let mono = true, minRatio = 9, maxRatio = 0;
  for (let L = 2; L <= 120; L++) {
    const a = g.expToNextBaseLevel(L - 1), b = g.expToNextBaseLevel(L);
    if (b <= a) mono = false;
    if (L >= 45 && L <= 55) { const r = b / a; minRatio = Math.min(minRatio, r); maxRatio = Math.max(maxRatio, r); }
  }
  t.ok('基礎需求逐級遞增（含 99 以上，三轉開等級上限時不會倒退）', mono);
  // 50 級是換段點，接得上代表兩段係數配對正確
  t.ok('50 級段界沒有斷崖', maxRatio < 1.25, `段界附近最大跳幅 ${maxRatio.toFixed(2)}×`);
  t.ok('Lv1 需求仍是個位到兩位數（開局第一級要立刻升）',
    g.expToNextBaseLevel(1) < 100, '實際 ' + g.expToNextBaseLevel(1));
  t.ok('後段確實變陡：Lv98 至少是 Lv50 的 10 倍',
    g.expToNextBaseLevel(98) / g.expToNextBaseLevel(50) >= 10,
    `${g.expToNextBaseLevel(98)} / ${g.expToNextBaseLevel(50)}`);
}

/* ---------- 2. 職業曲線分階層 ---------- */
{
  t.ok('新手（tier 0）維持舊公式', g.expToNextJobLevel(5, 0) === Math.floor(15 * Math.pow(5, 1.4) + 10));
  [10, 25, 39, 45].forEach(L => {
    t.ok(`job ${L}：二轉需求高於一轉`, g.expToNextJobLevel(L, 2) > g.expToNextJobLevel(L, 1) * 2,
      `一轉 ${g.expToNextJobLevel(L, 1)} / 二轉 ${g.expToNextJobLevel(L, 2)}`);
  });
  /* 三轉自己一條曲線（#122）。tier 2.5（進階二轉）仍走二轉那條 */
  t.ok('進階二轉（tier 2.5）仍與二轉共用', g.expToNextJobLevel(30, 2.5) === g.expToNextJobLevel(30, 2));
  t.ok('三轉不再與二轉共用', g.expToNextJobLevel(30, 3) !== g.expToNextJobLevel(30, 2));
  t.ok('三轉每一級都比二轉貴得多',
    [10, 30, 50, 69].every(L => g.expToNextJobLevel(L, 3) > g.expToNextJobLevel(L, 2) * 10));
  let mono = true;
  for (let L = 2; L <= 70; L++) if (g.expToNextJobLevel(L, 2) <= g.expToNextJobLevel(L - 1, 2)) mono = false;
  t.ok('二轉曲線逐級遞增（含 40／50 兩個換段點）', mono);
  // job40 是使用者指定的節奏牆：10 級要跟 39 級花一樣久，需求本來就得跳
  const step = g.expToNextJobLevel(40, 1) / g.expToNextJobLevel(39, 1);
  t.ok('一轉 job40 的台階在 2~4 倍之間', step > 2 && step < 4, '實際 ' + step.toFixed(2) + '×');
  // 超級初心者是 tier1 但上限 99，50 級以後不能掉回 0
  t.ok('超級初心者 job50 以上仍有需求', g.expToNextJobLevel(80, 1) > g.expToNextJobLevel(49, 1));
  // 沒傳 tier 時不能當成二轉（會讓一轉的玩家吃到六倍需求）
  t.eq('省略 tier 時走新手公式', g.expToNextJobLevel(5), g.expToNextJobLevel(5, 0));
}

/* ---------- 3. 引擎真的有把 tier 傳進去 ---------- */
{
  const mk = (path, job) => {
    const gg = H.boot();
    H.mkChar(gg, { path, job, baseLevel: 50 });
    gg.state.jobLevel = 20; gg.state.jobExp = 0;
    return gg;
  };
  const a = mk(['swordsman'], 'swordsman');
  const b = mk(['swordsman', 'knight'], 'knight');
  const amt = g.expToNextJobLevel(20, 1) + 5;      // 剛好夠一轉升一級
  a.gainExp(0, amt); b.gainExp(0, amt);
  t.eq('同樣的職業經驗：一轉升得了一級', a.state.jobLevel, 21);
  t.eq('同樣的職業經驗：二轉升不了', b.state.jobLevel, 20);
}

/* ---------- 4. 破表怪物 ---------- */
{
  const onMap = new Set();
  g.MAPS.forEach(m => (m.monsters || []).forEach(x => onMap.add(x.id)));
  const list = [...onMap].map(i => g.MONSTERS[i]).filter(m => m && !m.isBoss);
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  let worst = null;
  list.forEach(m => {
    const peers = list.filter(p => Math.abs(p.level - m.level) <= 8);
    const k = (m.exp / Math.max(1, m.hp)) / med(peers.map(p => p.exp / Math.max(1, p.hp)));
    if (!worst || k > worst.k) worst = { m, k };
  });
  /* 門檻放在 10 倍：#80 修掉的那三隻是 35～84 倍，實測 Lv99 待在比芙羅斯特
     可以拿到相稱地圖 22 倍的經驗。目前最高的是毒黃蜂 7.7 倍——那個比例
     不會讓牠所在的地圖變成最佳去處（實跑 149 vs 393 exp/秒），所以留著。 */
  t.ok('沒有怪的 exp/HP 比超過同級距中位數 10 倍', worst.k < 10,
    `最高是 ${worst.m.name}(Lv${worst.m.level}) ${worst.k.toFixed(1)}×`);
  // hp=10 那種佔位資料會讓高等怪變成一擊必殺的經驗販賣機
  const stub = list.filter(m => m.level >= 25 && m.hp <= 200);
  t.eq('25 級以上沒有血量佔位資料（hp<=200）', stub.length, 0,
    stub.map(m => m.id + ':' + m.hp).join(','));
}

/* ---------- 5. GM 測試鈕 ---------- */
{
  const gg = H.boot();
  H.mkChar(gg, { path: ['swordsman'], baseLevel: 1 });
  gg.state.statPoints = 0;
  const before = gg.state.baseLevel;
  const got = gg.gmAddLevels();
  t.eq('按一下 +50 級', gg.state.baseLevel, before + 50);
  let expect = 0;
  for (let L = before + 1; L <= before + 50; L++) expect += gg.statPointsAtLevel(L);
  t.eq('素質點照 statPointsAtLevel 發滿', gg.state.statPoints, expect);
  // 每次 +50 級，共需 1 次到 99（劍士是 1 轉，上限 99）
  gg.gmAddLevels();
  t.eq('按第二下到 99 就停住', gg.state.baseLevel, 99);
  t.eq('已滿級再按不會變動', gg.gmAddLevels(), 0);
  const gold = gg.state.gold;
  gg.gmAddGold();
  t.eq('鋅幣 +100 萬', gg.state.gold - gold, 1000000);

  /* 職業等級滿（#98）。要驗的是**技能點有沒有跟著發**——
     直接把 jobLevel 設過去的話點數會漏，那才是拉滿最想要的東西。 */
  {
    const g2 = H.boot();
    H.mkChar(g2, { path: ['acolyte'], job: 'acolyte', jobLevel: 1, skillPoints: 0 });
    g2.state.jobSkillPoints = { acolyte: 0 };
    const cap = g2.JOB_TREE.acolyte.jobLevelMax;
    t.eq('拉到該職業的上限', g2.gmMaxJobLevel(), cap);
    t.eq('技能點補滿差額', g2.state.jobSkillPoints.acolyte, cap - 1);
    t.eq('已經滿級再按不會多發', (g2.gmMaxJobLevel(), g2.state.jobSkillPoints.acolyte), cap - 1);
  }
  // 新角色預設遠攻（#98）
  {
    const g3 = H.boot();
    H.mkChar(g3, { path: [] });
    t.eq('新角色是遠攻模式', g3.state.encounterMode, 'ranged');
    t.eq('遠攻場上只有 1 隻', g3.state.maxMonsters, 1);
  }

  /* 「沒設定就不要放」（#100 → #101）。以前沒設定時會回退到自動撈第一個能放的技能，
     而 `usableSkillEntries()` 從新手排起——使用者先回報「急救術我沒設定 自動發動」，
     #100 把回退限制成只撈攻擊技能，接著又回報「打勾沒選還是會自動施放攻擊技能」。
     現在回退整條移除：下拉選單選「不使用技能」就是真的一個都不放。 */
  {
    const g4 = H.boot();
    H.mkChar(g4, { path: [] });
    H.learn(g4, 'novice_firstaid', 5);
    g4.state.autoSupportSkills = {};
    g4.state.autoSkillConfig = { skillId: null, skillId2: null, mode: 'once', spThreshold: 30 };
    g4.changeMap(g4.MAPS.find(m => (m.monsters || []).length > 0).id);
    H.mon(g4, { defId: 'poring', hp: 9e9 });
    g4.state.hp = Math.floor(g4.state.maxHp * 0.2);
    g4.state.sp = g4.state.maxSp;
    const hp0 = g4.state.hp;
    g4.tryAutoCastSkill();
    t.eq('沒勾選就不會自動放急救術', g4.state.hp, hp0);
    // 勾了才放
    g4.state.autoSupportSkills = { novice_firstaid: true };
    g4.state.cooldowns = {};
    g4.tryAutoCastSupportSkills();
    t.ok('勾了就會放', g4.state.hp > hp0);

    const g5 = H.boot();
    H.mkChar(g5, { path: ['merchant'], job: 'merchant' });
    H.learn(g5, 'mammonite', 10);
    g5.state.autoSkill = true;
    g5.state.autoSkillConfig = { skillId: null, skillId2: null, mode: 'once', spThreshold: 30, spThreshold2: 50, monsterCount2: 2 };
    const mon = H.mon(g5, { defId: 'poring', hp: 9e9 });
    g5.state.sp = g5.state.maxSp;
    const mhp = mon.hp, gold0 = g5.state.gold;
    g5.tryAutoCastSkill();
    t.eq('兩招都選「不使用技能」時，攻擊技能也不放', mon.hp, mhp);
    t.eq('連帶不會偷扣金錢攻擊的鋅幣', g5.state.gold, gold0);
    // 選了才放
    g5.state.autoSkillConfig.skillId = 'mammonite';
    g5.tryAutoCastSkill();
    t.ok('選了第一招就會放', mon.hp < mhp);
  }
  // 面板只在安全區出現
  gg.changeMap(gg.MAPS.find(m => (m.monsters || []).length === 0).id);
  t.ok('安全區：inSafeZone 為真', gg.inSafeZone());
  gg.changeMap(gg.MAPS.find(m => (m.monsters || []).length > 0).id);
  t.ok('有怪的圖：inSafeZone 為假', !gg.inSafeZone());
}

/* ---------- 100~200 的延伸段 + 等級上限 + 打寶模式（#110）---------- */
{
  const cum = (a, b) => { let s = 0; for (let L = a; L < b; L++) s += g.expToNextBaseLevel(L); return s; };

  // 接點不能有斷層：Lv100 要比 Lv99 貴，不能因為換公式往下掉
  t.ok('Lv99 → Lv100 沒有斷層',
    g.expToNextBaseLevel(100) > g.expToNextBaseLevel(99),
    `${g.expToNextBaseLevel(99)} → ${g.expToNextBaseLevel(100)}`);
  let mono = true;
  for (let L = 2; L <= 200; L++) if (g.expToNextBaseLevel(L) <= g.expToNextBaseLevel(L - 1)) mono = false;
  t.ok('1~200 全程單調遞增', mono);

  /* 曲線的**形狀**是這次改動的重點，總量則是校準目標。
     這幾條寫死數字沒有意義——會壞的是「改了某一段係數之後形狀跑掉」。

     2026-08-21 重配（#127）：舊曲線 190→200 佔 67.5%，實測 100→170 只要 2.4 天，
     使用者回報「玩一天就衝到 170」。新形狀把重量攤開。 */
  const tot = cum(100, 200);
  const share = (a, b) => cum(a, b) / tot;
  t.ok('190→200 是最後衝刺（35~45%，使用者指定 40%）',
    share(190, 200) > 0.35 && share(190, 200) < 0.45,
    (share(190, 200) * 100).toFixed(1) + '%');
  t.ok('100→150 要有實質份量（舊曲線只有 1.5%）',
    share(100, 150) > 0.15, (share(100, 150) * 100).toFixed(1) + '%');
  /* 最後十級以外，不該再有哪一段特別重——這是「一天衝到 170」那個病的通用形式：
     只要中段有一塊吃掉大半，前面就會變成白送的。收尾那一段是刻意的，另外驗。 */
  let worst = 0, worstAt = 0;
  for (let L = 100; L < 190; L += 10) if (share(L, L + 10) > worst) { worst = share(L, L + 10); worstAt = L; }
  t.ok('190 之前沒有任何十級區間佔超過兩成', worst < 0.2,
    `最重的是 ${worstAt}→${worstAt + 10}：${(worst * 100).toFixed(1)}%`);
  /* 接軌不能變成牆：Lv100 是進階二轉／打寶模式的門檻，玩家在這裡拿到 ×5 經驗，
     所以成本可以跳一階，但跳超過十倍就會變成卡關。 */
  t.ok('Lv100 的需求不超過 Lv99 的十倍',
    g.expToNextBaseLevel(100) < g.expToNextBaseLevel(99) * 10,
    `${g.expToNextBaseLevel(99)} → ${g.expToNextBaseLevel(100)}`);

  /* 校準：打寶一般檔（經驗 ×5）三個月＝ 90 天。

     **離線沒有折扣**：applyOfflineProgress() 是抽 3 秒真實戰鬥再外推，
     所以掛機一天就是滿速一天。舊的校準假設離線只有主動的 24%，
     總量因此少配了 2.3 倍——這條就是當時漏掉的那個檢查。

     RATE 來自 tools/measure_exp_100_200.js（領主騎士、打寶一般檔、
     商店裝無卡無精煉，真的跑 gameTick）：Lv140 之後穩定在 950~1,020 exp/秒。 */
  const RATE = 980;
  const days = mult => tot / (RATE / 5 * mult) / 86400;   // RATE 已含 ×5，先還原再乘
  t.ok('打寶一般檔約 90 天', Math.abs(days(5) - 90) < 15, days(5).toFixed(0) + ' 天');
  t.ok('瘋狂檔更快', days(10) < days(5));
  t.ok('不開打寶明顯更久（打寶是主要管道）', days(1) > days(5) * 4);

  /* 等級上限與素質上限都是**三轉**才解鎖（#111）。三轉本身沒有技能，
     它存在的意義就是這兩道門——所以這兩條是它唯一的驗收標準。 */
  {
    const g2 = H.boot();
    H.mkChar(g2, { path: ['swordsman', 'knight'], job: 'knight' });
    t.eq('二轉上限 99', g2.baseLevelCapOf(), 99);
    g2.state.baseLevel = 99; g2.state.baseExp = 0;
    g2.gainExp(9e9, 0);
    t.eq('二轉灌再多經驗也停在 99', g2.state.baseLevel, 99);

    const g3 = H.boot();
    H.mkChar(g3, { path: ['swordsman', 'knight'], rebirth: true, job: 'lordknight' });
    t.eq('進階二轉上限 99', g3.baseLevelCapOf(), 99);
    t.eq('進階二轉素質上限 99', g3.statCapOf(), 99);

    // 轉三轉：base 99 + job 70
    g3.state.baseLevel = 99;
    g3.state.jobLevel = g3.JOB_TREE.lordknight.jobLevelMax;
    g3.state.jobSkillPoints.lordknight = 0;
    t.eq('轉得了盧恩騎士', g3.doJobChange('runeknight'), true);
    t.eq('三轉上限 250', g3.baseLevelCapOf(), 250);
    t.eq('三轉素質上限 130', g3.statCapOf(), 130);
    g3.state.baseLevel = 99; g3.state.baseExp = 0;
    g3.gainExp(1e24, 0);
    t.eq('灌滿到得了 250', g3.state.baseLevel, 250);

    // 三轉是純外觀：自己沒有技能，但母職那份照樣用得到
    t.eq('三轉沒有自己的技能', (g3.JOB_TREE.runeknight.skills || []).filter(s => !g3.JOB_TREE.runeknight.borrowedFrom[s.id]).length, 0);
    t.ok('母職的技能還在', g3.JOB_TREE.runeknight.skills.some(s => s.id === 'lk_spiralpierce'));

    /* 100 以上的加點成本另有一張表（#112，使用者給的官方數字）。
       這裡驗的是**區間總計**——逐格比等於把表抄一遍，而區間總計是使用者自己
       算給我的驗收值，寫錯段界會立刻現形。 */
    const band = (a, b) => { let s = 0; for (let n = a; n <= b; n++) s += g3.statPointCost(n); return s; };
    t.eq('100 以下維持舊公式（99→100 是 11）', g3.statPointCost(99), 11);
    t.eq('100→101 還是 11（第一次吃到 16 是 101→102）', g3.statPointCost(100), 11);
    t.eq('101~105 區間總計 80', band(101, 105), 80);
    t.eq('106~110 區間總計 100', band(106, 110), 100);
    t.eq('111~115 區間總計 120', band(111, 115), 120);
    t.eq('116~120 區間總計 140', band(116, 120), 140);
    t.eq('121~125 區間總計 160', band(121, 125), 160);
    t.eq('126 以上每點 36', g3.statPointCost(129), 36);
    // 段界不能有倒退（改係數最容易在這裡破）
    let mono = true;
    for (let n = 2; n <= 130; n++) if (g3.statPointCost(n) < g3.statPointCost(n - 1)) mono = false;
    t.ok('成本一路不遞減', mono);

    g3.state.stats.str = 129; g3.state.statPoints = 999;
    const before = g3.state.statPoints;
    t.eq('點得上 130', g3.allocateStat('str'), true);
    t.eq('扣的是 36 點', before - g3.state.statPoints, 36);
    t.eq('130 之後點不動', g3.allocateStat('str'), false);
    // 點數不夠時不能偷點
    g3.state.stats.agi = 120; g3.state.statPoints = 10;
    t.eq('點數不夠就加不動', g3.allocateStat('agi'), false);
    t.eq('素質沒有被改到', g3.state.stats.agi, 120);
  }

  // 打寶模式的倍率真的接上去了
  {
    const g4 = H.boot();
    H.mkChar(g4, { path: ['swordsman', 'knight'], rebirth: true, job: 'lordknight' });
    g4.changeMap(g4.MAPS.find(m => (m.monsters || []).length > 0).id);
    const md = g4.MONSTERS.poring;

    const atk0 = g4.monsterBaseAtk(md, 'mid'), def0 = g4.defOf(md)[0];
    t.eq('一般檔開得起來', g4.setFarmMode(g4.FARM_MODE_NORMAL), true);
    const m1 = g4.FARM_MODE_MULT[g4.FARM_MODE_NORMAL];
    t.near('怪的傷害吃倍率', g4.monsterBaseAtk(md, 'mid') / atk0, m1.atk, 0.01);
    t.near('怪的防禦吃倍率', g4.defOf(md)[0] / def0, m1.def, 0.01);

    g4.state.lastSpawnTime = 0;
    g4.state.monsters = [];
    g4.spawnMonster();
    const mon = g4.state.monsters[0];
    t.near('生出來的怪血量吃倍率', mon.maxHp / g4.MONSTERS[mon.defId].hp, m1.hp, 0.02);

    // 經驗與金錢
    g4.state.baseLevel = 99; g4.state.baseExp = 0; g4.state.gold = 0;
    g4.killMonster(md, H.mon(g4, { defId: 'poring' }));
    t.eq('經驗吃倍率', g4.state.baseExp, md.exp * m1.exp);

    // 切換模式要清場（血量是生怪當下算的，混著兩種倍率的怪血條會對不上）
    g4.state.monsters = [{ defId: 'poring', hp: 1, maxHp: 1, id: 99 }];
    g4.setFarmMode(g4.FARM_MODE_MAD);
    t.eq('切換模式會清掉場上的怪', g4.state.monsters.length, 0);

    // 沒到進階二轉就開不了
    const g5 = H.boot();
    H.mkChar(g5, { path: ['swordsman', 'knight'], job: 'knight' });
    t.eq('二轉開不了打寶模式', g5.setFarmMode(g5.FARM_MODE_NORMAL), false);
    t.eq('狀態沒有被改掉', g5.farmMode(), g5.FARM_MODE_OFF);
  }
}

/* ---------- 三轉的職業曲線（#122）----------
   設計目標是「job 1→70 與 base 99→200 差不多同時走完」，
   所以驗的是**兩條線的關係**，不是把數字抄一遍。 */
{
  const jobTotal = (() => { let n = 0; for (let L = 1; L < 70; L++) n += g.expToNextJobLevel(L, 3); return n; })();
  const baseTotal = (() => { let n = 0; for (let L = 99; L < 250; L++) n += g.expToNextBaseLevel(L); return n; })();

  // 200~250 採翻倍指數，基礎總量極大，JOB/基礎比例趨近 0
  t.ok('三轉 JOB 總量遠小於基礎 99→250（翻倍導致）', jobTotal / baseTotal < 1e-9);
  // 翻倍後 base 249→250 極大，遠高於 job 69→70
  t.ok('base 249→250 遠高於 job 69→70（翻倍）',
    g.expToNextBaseLevel(249) > g.expToNextJobLevel(69, 3) * 1e12);

  let mono = true;
  for (let L = 2; L < 70; L++) if (g.expToNextJobLevel(L, 3) <= g.expToNextJobLevel(L - 1, 3)) mono = false;
  t.ok('三轉曲線 1~70 單調遞增', mono);

  /* 兩條線真的會一起走完：拿基礎曲線當節拍器跑一遍，
     每升一級基礎就同時進帳 0.77 倍的職業經驗 */
  let jobAcc = 0, jl = 1;
  for (let bl = 99; bl < 250; bl++) {
    jobAcc += g.expToNextBaseLevel(bl) * 0.77;
    while (jl < 70 && jobAcc >= g.expToNextJobLevel(jl, 3)) { jobAcc -= g.expToNextJobLevel(jl, 3); jl++; }
  }
  t.ok('基礎練到 250 時職業也接近滿級', jl >= 65, 'base 250 時 job = ' + jl);
  t.ok('但不會提早太多把職業點滿', jl <= 70, 'base 250 時 job = ' + jl);

  // 舊角色不受影響：二轉與一轉那兩條完全沒動
  t.ok('一轉曲線沒被動到', g.expToNextJobLevel(30, 1) === Math.floor(41 * Math.pow(30, g.JOB_EXP_COEF ? 1.35 : 1.35)));
}

/* ---------- 轉職條件（#116）：只有 3轉 要基礎等級 ----------
   1轉／2轉／進階二轉只看 JOB 滿級＋技能點花完，
   只有 3轉 額外要求 基礎等級 99（＋JOB70）。 */
{
  // 1轉：base=1 就能轉
  const g = H.boot();
  g.createCharacter('T', { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, 'male');
  g.state.jobLevel = 10; g.state.jobSkillPoints = { novice: 0 }; g.state.baseLevel = 1;
  t.eq('1轉 base=1 可轉', g.doJobChange('swordsman'), true);

  // 2轉：base=20（低於 baseLevelReq=40）也能轉
  const g2 = H.boot();
  g2.createCharacter('T', { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, 'male');
  g2.state.jobLevel = 10; g2.state.jobSkillPoints = { novice: 0 };
  g2.doJobChange('swordsman');
  g2.state.jobLevel = 50; g2.state.jobSkillPoints = { novice: 0, swordsman: 0 }; g2.state.baseLevel = 20;
  t.eq('2轉 base=20 可轉', g2.doJobChange('knight'), true);

  // 進階二轉：只看 JOB 滿級，不要求 base=70
  const g25 = H.boot();
  g25.createCharacter('T', { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, 'male');
  g25.state.jobId = 'knight';
  g25.state.jobLevel = 50; g25.state.rebirthCount = 1;
  g25.state.rebirthPath = ['swordsman', 'knight'];
  g25.state.jobSkillPoints = { novice: 0, swordsman: 0, knight: 0 };
  g25.state.baseLevel = 40;
  t.eq('進階二轉 base=40 可轉', g25.doJobChange('lordknight'), true);

  // 3轉：base=50 不能轉，base=99 才給轉
  const g3 = H.boot();
  H.mkChar(g3, { path: ['swordsman', 'knight'], rebirth: true, job: 'lordknight', baseLevel: 99 });
  g3.state.jobLevel = 70; g3.state.jobSkillPoints.lordknight = 0; g3.state.baseLevel = 50;
  t.eq('3轉 base=50 不能轉', g3.doJobChange('runeknight'), false);
  g3.state.baseLevel = 99;
  t.eq('3轉 base=99 可轉', g3.doJobChange('runeknight'), true);
}

process.exit(t.report('經驗曲線 + GM 測試鈕'));
