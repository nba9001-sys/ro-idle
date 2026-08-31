/* 離線／切分頁的掛機結算（#135）。

   使用者回報：掛單隻時切走再回來畫面會爆衝，組隊時反而完全沒收益。
   兩個症狀是同一件事的兩面——瀏覽器把背景分頁的計時器降頻，而 gameTick 的兩半
   對降頻的反應不同（玩家的攻擊用累積器會補、慢心跳裡的隊友一次都不補）。

   修法是「分頁切走就當離線」，把那段時間交給 computeOfflineProgress()。
   於是這支要盯的東西變成兩件，兩件都是**不會報錯的無聲失效**：

     1. 離線結算的抽樣以前只跑 `playerAttack()`，隊友的傷害完全沒算進去
        → 玩家是輔助職時離線收益趨近 0（就是「組隊直接沒經驗」）
     2. 結算完時間錨點沒推回現在的話，主迴圈一恢復就把離線那段「再打一次」
        → 就是爆衝畫面本身

   不重抄數字：收益是隨機外推的，斷言一律比較「有沒有」與「多還是少」。 */
const H = require('./harness');
const t = H.tester();

// 造一份「另一格存檔」的角色，好拿來雇成隊友
function makeSaveSlot(g, slot, path, job, lv) {
  const gg = H.boot();
  H.mkChar(gg, { path, job, baseLevel: lv, stats: { str: 90, agi: 60, vit: 50, int: 40, dex: 80, luk: 30 } });
  gg.state.name = '隊友' + slot;
  H.wield(gg, 'mace');
  gg.recomputeDerived(true);
  g.localStorage.setItem(g.getSlotKey(slot), JSON.stringify(gg.state));
}

/* 一隻站在有怪地圖上的主角。`weak` 用來模擬「輔助職玩家」：
   把攻擊力壓到幾乎打不動，這樣收益幾乎全部來自隊友，
   隊友沒算到的話結算就是 0——正是使用者回報的情境。 */
function scene(opts) {
  opts = opts || {};
  const g = H.boot();
  H.mkChar(g, { path: ['swordsman', 'knight'], job: 'knight', baseLevel: 80 });
  H.wield(g, 'spear1');
  const safe = g.MAPS.find(m => (m.monsters || []).length === 0);
  g.state.mapId = safe.id;
  makeSaveSlot(g, 1, ['merchant', 'blacksmith'], 'blacksmith', 80);
  makeSaveSlot(g, 2, ['swordsman', 'knight'], 'knight', 80);
  g.state.gold = 9e8;
  (opts.hire || []).forEach(s => g.hireAlly(String(s)));
  // 低等有怪的圖：怪夠弱，抽樣一定打得死，斷言才不會靠運氣
  const field = g.MAPS.filter(m => (m.monsters || []).length
    && m.monsters.every(x => (g.MONSTERS[x.id] || {}).level <= 20))[0];
  g.state.mapId = field.id;
  g.recomputeDerived(true);
  if (opts.weak) {
    // 攻擊力壓到最低，但**不要動 attackInterval**：抽樣的輪數是照它算的
    g.state.atk = 1; g.state.matk = 1; g.state.matkMin = 1; g.state.matkMax = 1;
    g.state.autoSkill = false;
  }
  return g;
}
// 讓「上次活動時間」倒退 n 秒，等同離線 n 秒
function rewind(g, sec) { g.state.lastActiveAt = Date.now() - sec * 1000; }

/* ---------- 主迴圈的開關（切分頁靠這個） ---------- */
{
  const g = scene();
  t.eq('剛開始沒有在跑', g.loopRunning(), false);
  g.startLoop();
  t.eq('startLoop 之後在跑', g.loopRunning(), true);
  g.stopLoop();
  t.eq('stopLoop 之後停了', g.loopRunning(), false);
  g.stopLoop();
  t.eq('重複停不會炸', g.loopRunning(), false);
}

/* ---------- 門檻：太短不結算，但時間戳要往前推 ---------- */
{
  const g = scene();
  rewind(g, 3);
  t.eq('離線 3 秒（低於預設 30 秒門檻）不結算', g.computeOfflineProgress(), null);
  t.ok('沒結算時仍把 lastActiveAt 推回現在', Date.now() - g.state.lastActiveAt < 1000);

  rewind(g, 10);
  t.eq('同樣 10 秒，用預設門檻仍不結算', g.computeOfflineProgress(), null);
  rewind(g, 10);
  t.ok('切分頁的 5 秒門檻就結算得出來', !!g.computeOfflineProgress(5000));
}

/* ---------- 單人：結算本身要有收益 ---------- */
{
  const g = scene();
  const exp0 = g.state.exp, gold0 = g.state.gold;
  rewind(g, 3600);
  const off = g.computeOfflineProgress();
  t.ok('離線一小時有結算結果', !!off);
  t.ok('經驗有進帳', off.expGained > 0, '得到 ' + off.expGained);
  t.ok('鋅幣有進帳', off.goldGained > 0);
  t.ok('擊殺數有算出來', off.kills > 0);
  t.ok('經驗真的加到角色身上', g.state.exp > exp0 || g.state.baseLevel > 80);
  t.ok('鋅幣真的加到角色身上', g.state.gold > gold0);
  t.eq('沒有隊友時 allyCount 是 0', off.allyCount, 0);
  t.ok('結果帶著地圖名（紀錄要顯示）', !!off.mapName);
}

/* ---------- 時間錨點：結算完不可以再爆衝一次 ---------- */
{
  const g = scene();
  g.state.monsters = [{ defId: g.currentMap().monsters[0].id, hp: 100, maxHp: 100, id: 1, lastAttackTime: Date.now() - 3600000 }];
  g.state.attackAccumulator = 999999;
  g.state._lastSlowTick = Date.now() - 3600000;
  rewind(g, 3600);
  g.computeOfflineProgress();
  const fresh = ms => Date.now() - ms < 1000;
  t.eq('玩家的攻擊累積器歸零', g.state.attackAccumulator, 0);
  t.ok('玩家的上次攻擊時間推回現在', fresh(g.state.lastAttackTime));
  t.ok('慢心跳的時間戳推回現在', fresh(g.state._lastSlowTick));
  t.ok('生怪計時推回現在', fresh(g.state.lastSpawnTime));
  t.ok('場上每隻怪的攻擊計時也推回現在（不然回來各賺一次免費攻擊）',
    g.state.monsters.every(m => fresh(m.lastAttackTime)));
}

/* ---------- 核心：隊友的傷害要算進離線收益 ---------- */
{
  const solo = scene({ weak: true });
  rewind(solo, 3600);
  const offSolo = solo.computeOfflineProgress();

  const party = scene({ weak: true, hire: [1, 2] });
  t.eq('兩位隊友都雇到了（後面的比較才有意義）', party.state.allies.length, 2);
  rewind(party, 3600);
  const offParty = party.computeOfflineProgress();

  t.ok('組隊也結算得出結果', !!offParty);
  t.eq('結果記得帶上參戰人數', offParty.allyCount, 2);
  /* 這一條就是使用者回報的 bug 本體：修之前隊友完全沒抽樣，
     輔助職玩家組隊的離線收益跟單人一樣少（幾乎是 0）。 */
  t.ok('輔助職玩家組隊時，離線經驗遠高於單人',
    offParty.expGained > (offSolo ? offSolo.expGained : 0) * 3,
    `單人 ${offSolo ? offSolo.expGained : 0} → 組隊 ${offParty.expGained}`);
  t.ok('組隊的擊殺數也跟著變多', offParty.kills > (offSolo ? offSolo.kills : 0));
}

/* ---------- 隊友的傭兵經驗 ---------- */
{
  const g = scene({ hire: [1, 2] });
  g.state.allies.forEach(a => { a._pendingExp = 0; a._pendingJobExp = 0; });
  rewind(g, 3600);
  const off = g.computeOfflineProgress();
  const pend = g.state.allies.map(a => a._pendingExp);
  t.ok('每位隊友都拿到待領的傭兵經驗', pend.every(p => p > 0), JSON.stringify(pend));
  t.eq('比例跟線上擊殺同一條規則',
    Math.round(pend[0]), Math.round(off.expGained * g.ALLY_MERC_EXP_PCT / 100));
  t.eq('全隊都記，不是只記給補刀的那個', Math.round(pend[0]), Math.round(pend[1]));
}

/* ---------- 抽樣不可以留下痕跡 ---------- */
{
  const g = scene({ hire: [1, 2] });
  const a = g.state.allies[0];
  a.sp = 123;
  a.cooldowns = { bash: 4000 };
  a.buffs = [{ type: 'atk', mult: 2, msRemaining: 9000 }];
  a.hp = a.maxHp;
  rewind(g, 3600);
  g.computeOfflineProgress();
  t.eq('隊友的 SP 沒被抽樣扣掉', a.sp, 123);
  t.eq('隊友的冷卻沒被抽樣推進', a.cooldowns.bash, 4000);
  t.eq('隊友的 buff 沒被抽樣倒數掉', a.buffs.length, 1);
  t.eq('隊友的 HP 沒被抽樣改掉', a.hp, a.maxHp);
  t.eq('隊友沒有莫名倒地', a._downed, false);
}

/* ---------- 倒地的隊友不參戰 ---------- */
{
  const g = scene({ weak: true, hire: [1, 2] });
  g.state.allies.forEach(x => { x._downed = true; });
  rewind(g, 3600);
  const off = g.computeOfflineProgress();
  t.eq('倒地的不算進參戰人數', off.allyCount, 0);
  t.eq('倒地的也拿不到傭兵經驗', g.state.allies[0]._pendingExp || 0, 0);
}

/* ---------- 安全區照舊 ---------- */
{
  const g = scene();
  g.state.mapId = g.MAPS.find(m => (m.monsters || []).length === 0).id;
  rewind(g, 3600);
  const off = g.computeOfflineProgress();
  t.eq('城鎮裡沒有戰鬥收穫', off.safeTown, true);
  t.eq('城鎮裡經驗是 0', off.expGained, 0);
}

/* ---------- 收益紀錄：最多三筆、最新在最前面 ---------- */
{
  const g = scene();
  t.eq('一開始沒有紀錄', g.offlineLogList().length, 0);
  for (let i = 1; i <= 5; i++) {
    g.pushOfflineLog({ elapsedMs: i * 60000, expGained: i, jobExpGained: i, goldGained: i, kills: i, itemsGained: [] });
  }
  const list = g.offlineLogList();
  t.eq('只留三筆', list.length, g.OFFLINE_LOG_MAX);
  t.eq('最新的在最前面', list[0].expGained, 5);
  t.eq('最舊的被擠掉', list[2].expGained, 3);
  t.ok('每筆都有時間戳（畫面要標日期時間）', list.every(r => r.at > 0));
  // 掉落物要截斷，不然掛一整晚的上百種掉落會把存檔撐大
  const cap = g.OFFLINE_LOG_ITEMS_MAX;
  const many = Array.from({ length: 40 }, () => ({ item: 'apple', qty: 1 }));
  g.pushOfflineLog({ elapsedMs: 1000, itemsGained: many });
  t.ok('掉落物有截斷', g.offlineLogList()[0].itemsGained.length <= cap);
  t.eq('截掉的數量有記下來', g.offlineLogList()[0].itemsMore, 40 - cap);
}

/* ---------- 截斷前要先把貴重的排到前面 ---------- */
{
  const g = scene();
  // 一張卡、一把武器、一件防具，埋在一堆藥草的**最後面**
  const junk = Array.from({ length: 30 }, () => ({ item: 'red_herb', qty: 9 }));
  const raw = junk.concat([
    { item: 'poring_card', qty: 1 },
    { item: 'knife', qty: 1 },
    { item: 'cotton_shirt', qty: 1 },
  ]);
  const sorted = g.sortSpoilsByValue(raw);
  t.eq('卡片排第一', sorted[0].item, 'poring_card');
  t.ok('裝備緊接在後', ['knife', 'cotton_shirt'].includes(sorted[1].item), sorted[1].item);
  t.ok('裝備緊接在後（第二件）', ['knife', 'cotton_shirt'].includes(sorted[2].item), sorted[2].item);
  t.eq('雜物排在裝備之後', sorted[3].item, 'red_herb');
  t.eq('排序不會改變總數', sorted.length, raw.length);
  t.eq('原陣列沒有被就地改動', raw[0].item, 'red_herb');

  g.pushOfflineLog({ elapsedMs: 60000, itemsGained: raw });
  const kept = g.offlineLogList()[0].itemsGained.map(x => x.item);
  t.ok('截斷之後卡片還在（修之前會被藥草擠掉）', kept.includes('poring_card'), kept.join(','));
  t.ok('截斷之後兩件裝備也都還在',
    kept.includes('knife') && kept.includes('cotton_shirt'), kept.join(','));
  // 紀錄跟著存檔走
  g.saveGame();
  t.ok('紀錄存得進存檔',
    Object.values(g.localStorage._d).some(v => /offlineLog/.test(v)));
}

/* ---------------- 頭目擊殺紀錄與離線頭目（#137）----------------

   離線以前完全碰不到 MVP（怪物池只有 map.monsters），BOSS 模式的獎勵離線拿不到。
   補上的關鍵是「這個角色打不打得動」——模擬算得出 DPS 但算不出會不會被打死，
   所以改用實際殺過的紀錄當通行證。

   會壞而且不會報錯的地方有三個，這裡一條一條釘：
     1. 沒殺過的頭目也算進離線（等於白送，也是被鑽的入口）
     2. 隊友補刀時紀錄寫進隊友快照而不是玩家（killMonster 一整排導向的老坑）
     3. 頭目吃掉的時間沒從雜魚那邊扣，兩邊加起來超過 100% */
function bossScene() {
  const g = H.boot();
  H.mkChar(g, { path: ['swordsman', 'knight'], rebirth: true, job: 'lordknight', baseLevel: 99,
    stats: { str: 99, agi: 70, vit: 60, int: 1, dex: 90, luk: 30 } });
  H.wield(g, 'spear1');
  const mapId = Object.keys(g.MVP_MAP_DATA).find(id =>
    g.MAPS.some(m => m.id === id && (m.monsters || []).length) && (g.MVP_MAP_DATA[id] || []).length >= 2);
  g.state.mapId = mapId;
  /* #147 之後 MVP 與迷你王是兩個獨立開關，離線只算**有開的那一類**。
     這一組測試驗的是「擊殺紀錄與時間預算」，跟哪一類無關，
     所以兩個都開，名單才會等於整份 MVP_MAP_DATA（就是拆分前的行為）。 */
  g.state.mvpMode = true;
  g.state.miniMode = true;
  g.recomputeDerived(true);
  return { g, mapId, list: g.MVP_MAP_DATA[mapId].filter(i => g.MONSTERS[i]) };
}
// 假裝在 mode 這個打寶模式下線上打死一隻，耗時 sec 秒
function fakeKill(g, id, sec, mode) {
  const m = mode == null ? (g.state.farmMode || 0) : mode;
  const def = g.MONSTERS[id];
  g.state.monsters = [{ defId: id, hp: 1, maxHp: def.hp, id: 99, spawnedAt: Date.now() - sec * 1000, farmMode: m }];
  g.killMonster(def, g.state.monsters[0]);
}

/* ---- 紀錄本身 ---- */
{
  const { g, list } = bossScene();
  const id = list[0];
  t.eq('一開始沒有任何頭目紀錄', Object.keys(g.state.bossKills || {}).length, 0);
  fakeKill(g, id, 90);
  const r1 = g.bossKillRecord(id);
  t.eq('殺一次就有紀錄', r1.n, 1);
  t.ok('耗時量得出來（約 90 秒）', Math.abs(r1.lastMs - 90000) < 1500, r1.lastMs + 'ms');
  fakeKill(g, id, 40);
  fakeKill(g, id, 120);
  const r2 = g.bossKillRecord(id);
  t.eq('次數累加', r2.n, 3);
  t.ok('最近一次跟著最後那一隻（120 秒）', Math.abs(r2.lastMs - 120000) < 1500, r2.lastMs + 'ms');
  t.ok('最佳停在最快那一次（40 秒）', Math.abs(r2.bestMs - 40000) < 1500, r2.bestMs + 'ms');
  // 雜魚不記，秒殺不記
  const mob = Object.values(g.MONSTERS).find(m => !m.isBoss && m.exp > 0);
  fakeKill(g, mob.id, 5);
  t.eq('雜魚不進頭目紀錄', !!g.bossKillRecord(mob.id), false);
  fakeKill(g, list[1], 0);
  t.eq('0 秒擊殺不採計（擋 GM 秒殺與假怪）', !!g.bossKillRecord(list[1]), false);
}

/* ---- 隊友補刀：紀錄要落在玩家身上 ---- */
{
  const { g, list } = bossScene();
  // 隨便造一個隊友快照塞進隊上（不必真的雇傭，這裡驗的是 killMonster 的導向）
  g.state.allies = [{ _allyName: '打手', _slot: '9', hp: 100, maxHp: 100, buffs: [], cooldowns: {}, inventory: [] }];
  const def = g.MONSTERS[list[0]];
  const mon = { defId: list[0], hp: 1, maxHp: def.hp, id: 77, spawnedAt: Date.now() - 60000 };
  g.state.monsters = [mon];
  g.withAlly(g.state.allies[0], () => g.killMonster(def, mon));
  t.ok('隊友補刀也算玩家的紀錄', !!g.bossKillRecord(list[0]));
  t.eq('紀錄沒有寫進隊友快照', !!(g.state.allies[0].bossKills), false);
}

/* ---- 離線只算「有勾的那一類」（#147）----
   兩個模式拆開之後，關掉的那一類不該還在離線裡刷。
   這個錯不會噴任何東西，只會表現成「我明明沒開迷你王，收益卻含迷你王」。 */
{
  const { g } = bossScene();
  const mvpOnly = g.bossListOf(g.state.mapId, 'mvp');
  const miniOnly = g.bossListOf(g.state.mapId, 'mini');
  if (mvpOnly.length && miniOnly.length) {
    // 兩類各殺一隻，紀錄都在
    fakeKill(g, mvpOnly[0], 600);
    fakeKill(g, miniOnly[0], 600);
    g.state.mvpMode = true; g.state.miniMode = false;
    rewind(g, 86400);
    const a = g.computeOfflineProgress();
    t.eq('只開 MVP：明細裡沒有迷你王',
      a.bossList.filter(b => miniOnly.includes(b.id)).length, 0,
      a.bossList.map(b => b.name).join('、'));
    t.ok('只開 MVP：MVP 還是算得到', a.bossList.some(b => mvpOnly.includes(b.id)));

    g.state.mvpMode = false; g.state.miniMode = true;
    rewind(g, 86400);
    const b2 = g.computeOfflineProgress();
    t.eq('只開迷你王：明細裡沒有 MVP',
      b2.bossList.filter(x => mvpOnly.includes(x.id)).length, 0,
      b2.bossList.map(x => x.name).join('、'));
    t.ok('只開迷你王：迷你王算得到', b2.bossList.some(x => miniOnly.includes(x.id)));

    g.state.mvpMode = false; g.state.miniMode = false;
    rewind(g, 86400);
    t.eq('兩個都關：一隻頭目都不算', g.computeOfflineProgress().bossKills, 0);
  } else {
    t.ok('（這張圖只有其中一類，拆分守門員跳過）', true);
  }
}

/* ---- 離線：沒殺過就沒有 ---- */
{
  const { g, list } = bossScene();
  rewind(g, 86400);
  const off = g.computeOfflineProgress();
  t.eq('沒殺過任何頭目時，離線一隻都不會遇到', off.bossKills, 0);
  t.eq('頭目明細是空的', off.bossList.length, 0);
  t.ok('雜魚照常算', off.kills > 0);
}

/* ---- 離線：殺過才算，而且照最近一次的耗時 ---- */
{
  const base = bossScene();
  rewind(base.g, 86400);
  const plain = base.g.computeOfflineProgress();

  const { g, list } = bossScene();
  fakeKill(g, list[0], 1200);                    // 20 分鐘一隻
  rewind(g, 86400);
  const off = g.computeOfflineProgress();
  t.ok('殺過的頭目離線遇得到', off.bossKills > 0, '擊殺 ' + off.bossKills);
  t.eq('明細只列打得動的那一隻', off.bossList.length, 1);
  t.eq('列的是對的那一隻', off.bossList[0].id, list[0]);
  /* 2026-08-22 改為方案A（逐隻模擬線上循環）：
     每 3 秒一輪擲 20%，中了殺 3/1200 隻 → 期望 = 86400/3 × 0.2 × 3/1200
     名單長度不再影響（殺得動哪隻就打哪隻，跟線上一致）。 */
  const expect = 86400 / 3 * (g.MVP_SPAWN_CHANCE_PCT / 100) * (3 / 1200);
  t.ok('擊殺數對得上線上循環', Math.abs(off.bossKills - expect) <= 1,
    `預期約 ${expect.toFixed(1)}，實得 ${off.bossKills}`);
  /* 頭目佔掉的時間要從雜魚那邊扣，不然兩邊加起來超過 100%。
     **總經驗可能因此變少**——那是對的：低階頭目給的經驗比同一段時間的雜魚少，
     線上開 BOSS 模式也是這樣，那個模式換的是掉落不是經驗。
     所以比較的基準是「扣掉兩成之後的雜魚經驗」，頭目那份要疊在它上面。 */
  t.ok('雜魚擊殺數跟著少了兩成', Math.abs(off.kills - plain.kills * 0.8) < plain.kills * 0.02,
    `${plain.kills} → ${off.kills}`);
  t.ok('頭目的經驗確實疊上去了', off.expGained > plain.expGained * 0.8,
    `雜魚八成 ${Math.round(plain.expGained * 0.8)} → 實得 ${off.expGained}`);
}

/* ---- 用的是「歷史最快」 ---- */
{
  const { g, list } = bossScene();
  fakeKill(g, list[0], 300);       // 先來一次很快的 → bestMs
  fakeKill(g, list[0], 2400);      // 再來一次很慢的 → lastMs
  const rec = g.bossKillRecord(list[0]);
  t.ok('best 與 last 確實不同（後面的比較才有意義）', rec.bestMs < rec.lastMs);
  rewind(g, 86400);
  const off = g.computeOfflineProgress();
  const byLast = 86400 * (g.MVP_SPAWN_CHANCE_PCT / 100) / list.length / 2400;
  const byBest = 86400 * (g.MVP_SPAWN_CHANCE_PCT / 100) / list.length / 300;
  t.ok('離線照最佳算',
    Math.abs(off.bossKills - byBest) < Math.abs(off.bossKills - byLast),
    `實得 ${off.bossKills}：照最近約 ${byLast.toFixed(1)}、照最佳約 ${byBest.toFixed(1)}`);
}

/* ---- 沒開 BOSS 模式就不該有頭目 ---- */
{
  const { g, list } = bossScene();
  fakeKill(g, list[0], 600);
  // #147 之後有兩個開關，兩個都要關（bossScene 兩個都開著）
  g.state.mvpMode = false;
  g.state.miniMode = false;
  rewind(g, 86400);
  const off = g.computeOfflineProgress();
  t.eq('關掉 BOSS 模式時離線沒有頭目', off.bossKills, 0);
}

/* ---- 頭目的掉落與圖鑑 ---- */
{
  const { g, list } = bossScene();
  const id = list[0];
  fakeKill(g, id, 600);
  const rec0 = Object.assign({}, g.bossKillRecord(id));
  const kills0 = g.ensureCodex().mon[id] || 0;
  // 只有這隻頭目會掉、雜魚不會掉的東西
  const normal = new Set();
  g.currentMap().monsters.forEach(e => (g.MONSTERS[e.id].drops || []).forEach(d => normal.add(d.item)));
  const only = (g.MONSTERS[id].drops || []).filter(d => !normal.has(d.item) && g.ITEMS[d.item]);
  rewind(g, 86400);
  const off = g.computeOfflineProgress();
  t.ok('頭目專屬掉落進得了收穫清單',
    !only.length || (off.itemsGained || []).some(x => only.some(d => d.item === x.item)),
    '專屬掉落 ' + only.length + ' 種');
  t.ok('離線擊殺記進圖鑑', (g.ensureCodex().mon[id] || 0) > kills0);
  // 離線是外推的，不該回頭改「線上實測」的耗時
  const rec1 = g.bossKillRecord(id);
  t.eq('離線不會覆寫實測耗時', rec1.lastMs, rec0.lastMs);
  t.eq('離線也不會灌水擊殺次數', rec1.n, rec0.n);
}

/* ---- 三種打寶模式各記一份（#137）----
   打寶把怪的血量拉到 ×3、瘋狂 ×5，同一隻頭目的耗時差三到五倍。
   混成一份的話，拿普通模式的紀錄去算瘋狂模式的離線會**多給五倍**——那是刷法不是收益。 */
{
  const { g, list } = bossScene();
  const id = list[0];
  fakeKill(g, id, 120, g.FARM_MODE_OFF);
  fakeKill(g, id, 360, g.FARM_MODE_NORMAL);
  fakeKill(g, id, 600, g.FARM_MODE_MAD);
  const r = m => g.bossKillRecord(id, m);
  t.ok('普通模式那一份是 120 秒', Math.abs(r(g.FARM_MODE_OFF).lastMs - 120000) < 1500);
  t.ok('打寶模式那一份是 360 秒', Math.abs(r(g.FARM_MODE_NORMAL).lastMs - 360000) < 1500);
  t.ok('瘋狂模式那一份是 600 秒', Math.abs(r(g.FARM_MODE_MAD).lastMs - 600000) < 1500);
  t.eq('三份互不干擾（各只殺過一次）',
    [r(0).n, r(1).n, r(2).n].join(','), '1,1,1');
  // 記的是生怪當下的模式，不是結算當下的
  g.state.farmMode = g.FARM_MODE_MAD;
  fakeKill(g, id, 90, g.FARM_MODE_OFF);
  t.ok('紀錄跟著怪身上的模式走，不是跟著現在的模式',
    Math.abs(r(g.FARM_MODE_OFF).lastMs - 90000) < 1500 && r(g.FARM_MODE_MAD).n === 1);
}
{
  // 離線只認當下這個模式的紀錄
  const { g, list } = bossScene();
  g.state.bossKills = {};
  g.state.bossKills[list[0]] = { 0: { n: 1, lastMs: 1200000, bestMs: 1200000, at: Date.now() } };
  const got = [];
  [g.FARM_MODE_OFF, g.FARM_MODE_NORMAL, g.FARM_MODE_MAD].forEach(m => {
    g.state.farmMode = m;
    rewind(g, 86400);
    got.push(g.computeOfflineProgress().bossKills);
  });
  t.ok('只在普通模式殺過 → 普通模式離線算得到', got[0] > 0, '擊殺 ' + got[0]);
  t.eq('打寶模式離線不算（沒在那個模式殺過）', got[1], 0);
  t.eq('瘋狂模式離線不算', got[2], 0);
}
{
  // 同一隻在兩個模式都殺過時，各自用各自的耗時
  const { g, list } = bossScene();
  const id = list[0];
  fakeKill(g, id, 600, g.FARM_MODE_OFF);      // 普通 10 分
  fakeKill(g, id, 3000, g.FARM_MODE_MAD);     // 瘋狂 50 分
  const kills = m => { g.state.farmMode = m; rewind(g, 86400); return g.computeOfflineProgress().bossKills; };
  const a = kills(g.FARM_MODE_OFF), b = kills(g.FARM_MODE_MAD);
  t.ok('兩個模式都算得到', a > 0 && b > 0, `普通 ${a} / 瘋狂 ${b}`);
  t.ok('瘋狂模式打得慢，離線隻數就少', b < a, `普通 ${a} / 瘋狂 ${b}`);
}

/* ---- 舊存檔沒有這一格 ---- */
{
  const { g } = bossScene();
  g.state.name = '舊角'; g.saveGame();
  const raw = JSON.parse(Object.values(g.localStorage._d).find(v => /"name":"舊角"/.test(v)));
  delete raw.bossKills;
  g.localStorage.setItem(g.getSlotKey(0), JSON.stringify(raw));
  t.ok('舊存檔讀得起來', g.loadGame());
  t.ok('讀檔後自動補上頭目紀錄欄位', !!g.state.bossKills);
  t.eq('補上的是空表', Object.keys(g.state.bossKills).length, 0);
}
{
  /* #137 初版的平鋪紀錄（沒分模式）要搬得動。
     搬到「普通」那一格：三種模式裡它最快，歸錯的方向是「之後要重新量」，
     而不是「白拿五倍」。 */
  const { g, list } = bossScene();
  g.state.bossKills = {};
  g.state.bossKills[list[0]] = { n: 2, lastMs: 99000, bestMs: 88000, at: 1 };
  g.migrateBossKills(g.state);
  t.ok('舊的平鋪紀錄搬進「普通」那一格', !!g.bossKillRecord(list[0], g.FARM_MODE_OFF));
  t.eq('搬過去的數字沒變', g.bossKillRecord(list[0], g.FARM_MODE_OFF).lastMs, 99000);
  t.eq('不會憑空出現在打寶模式', !!g.bossKillRecord(list[0], g.FARM_MODE_NORMAL), false);
  // 已經是新格式的不可以被重複包一層
  g.migrateBossKills(g.state);
  t.eq('重複遷移不會再包一層', g.bossKillRecord(list[0], g.FARM_MODE_OFF).lastMs, 99000);
}

process.exit(t.report('掛機結算與收益紀錄'));
