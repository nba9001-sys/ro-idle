/* ============================================================
   諸神放置錄 — 免費同人放置遊戲
   本作完全免費，純為懷舊而作。**禁止任何形式的販售或營利**
   （販售、內購、付費解鎖、廣告分潤皆不允許），修改版本亦同。
   設定致敬《仙境傳說 Ragnarok Online》；程式與文字為原創實作，
   與 Gravity Co., Ltd. 無關，亦未獲其授權或認可。
   授權：CC BY-NC-SA 4.0（可散布可改作，不得商用，衍生版本須同樣授權）。
   特別鳴謝：本作靈感源自 秋玥[shifine] 發布的免費遊戲。
   完整聲明與授權全文見 repo 根目錄的 LICENSE。
   ============================================================ */
/* ============================================================
   RO 放置世界 — 遊戲引擎
   ============================================================ */

const SAVE_KEY_PREFIX = 'ro_idle_save_slot_';
let currentSlot = 0; // 目前使用的存檔欄位 (0 ~ MAX_SLOTS-1)
/* 存檔欄位數（#104：9 → 12；#137：12 → 15）。所有掃全帳號的地方都讀這個常數
   （選擇畫面、跨角色倉庫、鐵匠名字、隊友雇傭名單、整包備份），加欄位只要改這一個數。
   選擇畫面每頁 SLOTS_PER_PAGE 格，頁數是算出來的，不必跟著動。 */
const MAX_SLOTS = 15;

function getSlotKey(slot) { return SAVE_KEY_PREFIX + slot; }
const TICK_MS = 100;

/* ---------------- 跨角色倉庫（獨立於任何存檔欄位，全帳號共用）---------------- */
const WAREHOUSE_KEY = 'ro_idle_warehouse';
function loadWarehouse() {
  try {
    const raw = localStorage.getItem(WAREHOUSE_KEY);
    const wh = raw ? JSON.parse(raw) : { items: [] };
    if (!wh.items) wh.items = [];
    if (typeof wh.gold !== 'number') wh.gold = 0;
    return wh;
  } catch (e) { return { items: [], gold: 0 }; }
}
function saveWarehouse(wh) {
  try { localStorage.setItem(WAREHOUSE_KEY, JSON.stringify(wh)); } catch (e) { /* 忽略儲存失敗 */ }
}
/* 倉庫匯入：外部 JSON 寫進全帳號倉庫（WAREHOUSE_KEY）。
   只做形狀檢查＋白名單清洗，不跑 loadGame 那套角色遷移——倉庫沒有角色欄位。
   個體裝備（instanceId）的精煉與卡片原樣帶入；不存在的道具直接丟掉不帶入。 */
function importWarehouse(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, msg: '檔案內容不是有效的倉庫資料。' };
  }
  if (!Array.isArray(obj.items)) {
    return { ok: false, msg: '不是本遊戲的倉庫匯出檔（缺少物品清單）。' };
  }
  const wh = { items: [], gold: 0 };
  obj.items.forEach(r => {
    if (!r || typeof r.item !== 'string' || typeof r.qty !== 'number' || r.qty < 1) return;
    if (!ITEMS[r.item]) return;   // 已不存在的道具，丟掉不帶入
    const row = { item: r.item, qty: Math.floor(r.qty) };
    if (r.instanceId) {
      row.instanceId = 'wh_' + r.item + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      row.refine = r.refine || 0;
      row.cards = Array.isArray(r.cards) ? r.cards.slice() : [];
    }
    wh.items.push(row);
  });
  if (typeof obj.gold === 'number' && obj.gold > 0) wh.gold = Math.floor(obj.gold);
  saveWarehouse(wh);
  return { ok: true };
}
/* ---------------- 全體備份（所有存檔欄位＋倉庫＋傭兵帳本）----------------
   匯出：把 12 個欄位、跨角色倉庫、傭兵經驗帳本打包成一個物件。
   匯入：逐欄位寫回 localStorage（空欄位清掉、格式錯的略過），
   不跑 loadGame——個別存檔的相容性遷移在使用者進該欄位時才跑，
   跟現有的舊存檔一樣。 */
function buildFullBackup() {
  const slots = {};
  for (let i = 0; i < MAX_SLOTS; i++) {
    const raw = localStorage.getItem(getSlotKey(i));
    if (!raw) { slots[i] = null; continue; }
    try { slots[i] = JSON.parse(raw); } catch (e) { slots[i] = null; }
  }
  const whRaw = localStorage.getItem(WAREHOUSE_KEY);
  const out = {
    app: 'ro-idle', type: 'backup', version: 1, exportedAt: Date.now(),
    slots: slots,
    warehouse: whRaw ? JSON.parse(whRaw) : { items: [], gold: 0 }
  };
  const ledgerRaw = localStorage.getItem(MERC_LEDGER_KEY);
  if (ledgerRaw) { try { out.mercLedger = JSON.parse(ledgerRaw); } catch (e) { /* 損壞就略過 */ } }
  return out;
}
function importFullBackup(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, msg: '檔案內容不是有效的備份檔。' };
  }
  if (obj.app !== 'ro-idle' || obj.type !== 'backup') {
    return { ok: false, msg: '不是本遊戲的全體備份檔。' };
  }
  if (!obj.slots || typeof obj.slots !== 'object' || Array.isArray(obj.slots)) {
    return { ok: false, msg: '備份檔缺少存檔欄位資料。' };
  }
  let wrote = 0;
  Object.keys(obj.slots).forEach(k => {
    const idx = parseInt(k, 10);
    const v = obj.slots[k];
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_SLOTS) return;
    if (v === null) { localStorage.removeItem(getSlotKey(idx)); return; }
    if (typeof v !== 'object' || typeof v.name !== 'string' || typeof v.jobId !== 'string') return;
    localStorage.setItem(getSlotKey(idx), JSON.stringify(v));
    wrote++;
  });
  if (obj.warehouse && typeof obj.warehouse === 'object') importWarehouse(obj.warehouse);
  if (obj.mercLedger && typeof obj.mercLedger === 'object') {
    try { localStorage.setItem(MERC_LEDGER_KEY, JSON.stringify(obj.mercLedger)); } catch (e) { /* 略過 */ }
  }
  return { ok: true, wrote: wrote };
}
function depositToWarehouse(itemId, qty) {
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!row || row.qty < qty) return false;
  removeItem(itemId, qty);
  const wh = loadWarehouse();
  const whRow = wh.items.find(r => r.item === itemId && !r.instanceId);
  if (whRow) whRow.qty += qty; else wh.items.push({ item: itemId, qty });
  saveWarehouse(wh);
  saveGame();
  logMsg(`📦 將 ${getItemDisplayName(itemId)} x${qty} 存入倉庫。`);
  return true;
}
function depositToWarehouseAll(itemId) {
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!row || row.qty < 1) return false;
  return depositToWarehouse(itemId, row.qty);
}
function withdrawFromWarehouse(itemId, qty) {
  const wh = loadWarehouse();
  const whRow = wh.items.find(r => r.item === itemId && !r.instanceId);
  if (!whRow || whRow.qty < qty) return false;
  whRow.qty -= qty;
  if (whRow.qty <= 0) wh.items = wh.items.filter(r => !(r.item === itemId && !r.instanceId));
  saveWarehouse(wh);
  addItem(itemId, qty);
  saveGame();
  logMsg(`📦 從倉庫領出 ${getItemDisplayName(itemId)} x${qty}。`);
  return true;
}
function withdrawFromWarehouseAll(itemId) {
  const wh = loadWarehouse();
  const whRow = wh.items.find(r => r.item === itemId && !r.instanceId);
  if (!whRow || whRow.qty < 1) return false;
  return withdrawFromWarehouse(itemId, whRow.qty);
}
/* 個體裝備進出倉庫：精煉度與卡片直接寫在倉庫那一行資料裡。
   倉庫是全帳號共用的，不能引用任何角色自己的 state.instances，
   所以存入時把個體內容攤平寫進倉庫，領出時再於當前角色重建一個新個體。 */
function depositInstanceToWarehouse(instanceId) {
  const idx = state.inventory.findIndex(r => r.instanceId === instanceId);
  const inst = state.instances && state.instances[instanceId];
  if (idx === -1 || !inst) return false;
  const label = describeInstance(inst);
  state.inventory.splice(idx, 1);
  delete state.instances[instanceId];
  const wh = loadWarehouse();
  wh.items.push({
    item: inst.item, qty: 1,
    instanceId: 'wh_' + inst.item + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    refine: inst.refine || 0,
    cards: (inst.cards || []).slice()
  });
  saveWarehouse(wh);
  saveGame();
  logMsg(`📦 將 ${label} 存入倉庫。`);
  return true;
}
function withdrawInstanceFromWarehouse(whInstanceId) {
  const wh = loadWarehouse();
  const idx = wh.items.findIndex(r => r.instanceId === whInstanceId);
  if (idx === -1) return false;
  const row = wh.items[idx];
  wh.items.splice(idx, 1);
  saveWarehouse(wh);
  if (!state.instances) state.instances = {};
  const id = row.item + '#' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  state.instances[id] = { item: row.item, refine: row.refine || 0, cards: (row.cards || []).slice() };
  state.inventory.push({ item: row.item, qty: 1, instanceId: id });
  codexRecordItem(row.item, 1);
  saveGame();
  logMsg(`📦 從倉庫領出 ${describeInstance(state.instances[id])}。`);
  return true;
}
function depositGoldToWarehouse(amount) {
  amount = Math.floor(Number(amount));
  if (!amount || amount < 1 || state.gold < amount) return false;
  state.gold -= amount;
  const wh = loadWarehouse();
  wh.gold += amount;
  saveWarehouse(wh);
  saveGame();
  logMsg(`📦 將 ${amount} 鋅幣存入倉庫。`);
  return true;
}
function withdrawGoldFromWarehouse(amount) {
  amount = Math.floor(Number(amount));
  const wh = loadWarehouse();
  if (!amount || amount < 1 || wh.gold < amount) return false;
  wh.gold -= amount;
  saveWarehouse(wh);
  state.gold += amount;
  saveGame();
  logMsg(`📦 從倉庫領出 ${amount} 鋅幣。`);
  return true;
}
const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000; // 離線掛機最多累積 24 小時
const OFFLINE_MIN_MS = 30 * 1000;            // 離線超過 30 秒才顯示結算

/* ---------------- ASPD 攻擊間隔計算 ----------------
   對照 RO Wiki 官方公式：
     Hits/sec = 50 / (200 - ASPD)
     Attack Interval (ms) = 1000 / Hits/sec = 20 * (200 - ASPD)
   
   ASPD 範圍：100 ~ 193
   - ASPD 100 → 0.5 hits/s (2000ms) 每 2 秒攻擊一次（極慢）
   - ASPD 150 → 1.0 hits/s (1000ms) 每秒攻擊一次
   - ASPD 175 → 2.0 hits/s (500ms) 每秒攻擊兩次
   - ASPD 190 → 5.0 hits/s (200ms) 每秒攻擊五次
   - ASPD 193 → 7.14 hits/s (140ms) 最速
------------------------------------------------- */
function getAttackInterval(finalASPD) {
  // RO 官方公式：Attack Interval (ms) = 20 * (200 - ASPD)
  const interval = 20 * (200 - finalASPD);
  return Math.max(140, Math.round(interval)); // 最短 140ms（ASPD 193）
}

let state = null;      // 目前角色狀態
let tickTimer = null;
let combatLogBuf = [];
/* ---------------- 戰鬥訊息的三條分流（#86）----------------
   底下的資訊欄拆成三塊：左邊是一般戰鬥（普攻、擊殺、掉落、狀態），
   中間只放技能（玩家與怪物雙方），右邊只放隊友。

   分流規則：
     · 換身中（`_allyActing`）→ 隊友欄。隊友走的是同一支 playerAttack()，
       這個旗標就是現成的判斷依據
     · 訊息帶「」括號 → 技能欄。全庫的技能名一律用「」包起來（castSkill、
       monsterCastSkill、場域效果都是），這是最穩的特徵
     · 開頭是「  → 」的續行 → 跟著上一則走，不然技能的傷害明細會被拆到別欄
   三個緩衝各留 40 則。`combatLogBuf` 照舊保留全部，既有呼叫端不受影響。 */
const combatLogLanes = { main: [], skill: [], ally: [] };
let _lastLogLane = 'main';
/* 技能欄靠**呼叫端明確標記**，不靠猜。
   第一版用「訊息帶「」括號就是技能」來認，結果轉職訊息（恭喜你轉職成為「騎士」）
   跟換地圖（前往「新手訓練場」）全跑進技能欄——「」在這份資料裡到處都是。 */
let _logLaneOverride = null;
function withLogLane(lane, fn) {
  const prev = _logLaneOverride;
  _logLaneOverride = lane;
  try { return fn(); } finally { _logLaneOverride = prev; }
}
function logLaneOf(text, lane) {
  if (lane) return lane;
  if (_allyActing) return 'ally';
  if (/^\s*→/.test(text)) return _lastLogLane;
  return _logLaneOverride || 'main';
}
function pushCombatLog(text, lane) {
  const ln = logLaneOf(text, lane);
  _lastLogLane = ln;
  /* 隊友走的是同一支 playerAttack()，訊息開頭一律是「你」——
     丟進隊友欄會變成「你對蚯蚓造成…」，看起來像玩家自己打的。換成他的名字。 */
  if (_allyActing && typeof text === 'string' && text.indexOf('你') >= 0) {
    text = text.split('你').join(_allyActing._allyName);
  }
  combatLogBuf.push(text);
  if (combatLogBuf.length > 60) combatLogBuf.shift();
  const buf = combatLogLanes[ln];
  buf.push(text);
  if (buf.length > 40) buf.shift();
}

/* ---------------- 建立新角色 ---------------- */
function createCharacter(name, statAlloc, gender) {
  const stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 };
  STAT_KEYS.forEach(k => { stats[k] += (statAlloc[k] || 0); });

  state = {
    name: name || '無名冒險者',
    gender: gender || 'male',
    jobId: 'novice',
    baseLevel: 1, baseExp: 0,
    jobLevel: 1, jobExp: 0,
    stats,
    statPoints: 0,
    skillPoints: 0, // 保留相容性，實際使用 jobSkillPoints
    jobSkillPoints: {}, // { jobId: remainingPoints } 按職業分離的技能點
    jobLevelHistory: {}, // { jobId: jobLevel } 轉職歷史（職業加成跨職業繼承）
    rebirthCount: 0,     // 轉生次數。**上限 1，每隻角色只能轉生一次**（見 doRebirth）
    rebirthPath: null,   // 轉生前走過的職業鏈，例 ['swordsman','knight']。轉生後只能照這條路重走
    learnedSkills: {},   // {skillId: level}
    equip: { head_top: null, head_mid: null, head_bottom: null, weapon: null, armor: null, shield: null, garment: null, footgear: null, accessory1: null, accessory2: null, ammo: null },
    relics: emptyRelicSlots(),   // 遺物欄（#113）：8 格，跟一般裝備完全分開
    relicReviveUsed: 0,          // 牧師遺物用掉幾次復活（換圖回滿）
    relicReviveReadyAt: 0,
    relicMonkReadyAt: 0,         // 武僧遺物的加特林冷卻
    relicShieldReadyAt: 0,       // 鐵匠遺物的護盾冷卻
    equipSkin: 'grid',  // 裝備視窗外觀：grid / ro / ro_dark
    refinement: {},   // 舊版精煉資料（按itemId），僅供遷移讀取，新邏輯一律用 instances
    equippedCards: {}, // 舊版插卡資料（按欄位），僅供遷移讀取，新邏輯一律用 instances
    instances: {},     // { instanceId: {item, refine, cards:[cardId,...]} } 精煉或插卡過的裝備會變成獨立個體，跟著那一件走
    inventory: [],        // [{item:'jellopy', qty:3}]
    gold: 50,
    mapId: 'novice_safe',
    monster: null,        // {defId, hp, maxHp} - 保留相容性
    monsters: [],         // [{defId, hp, maxHp, id}] 多怪物系統
    monsterIdCounter: 0,  // 怪物唯一ID計數器
    maxMonsters: 1,       // 近戰模式最大怪物數量（遠攻固定 1，recomputeDerived 會照模式改）
    /* 新角色預設**遠攻**（#98）。一開始只有一隻怪、節奏看得懂；
       近戰一次五隻對剛進遊戲的人來說畫面太滿。
       舊存檔沒有這個欄位時照樣退回 'melee'（見 loadGame），不改變既有角色的行為。 */
    encounterMode: 'ranged', // 'melee'=近戰, 'ranged'=遠攻
    mvpMode: false,         // MVP 模式開關（#147 之後只管正牌 MVP）
    miniMode: false,        // 迷你王模式開關（#147）：跟 MVP 各自獨立勾選
    farmMode: 0,            // 打寶模式（#110）：0 關／1 一般／2 瘋狂
    lastSpawnTime: 0,     // 上次生怪時間
    hp: 1, sp: 1, maxHp: 1, maxSp: 1,
    cooldowns: {},         // {skillId: msRemaining}
    buffs: [],             // [{type,mult,msRemaining}]
    spirits: 0,            // 武僧的氣球體（#70）：跨 tick 的資源，不歸 recomputeDerived 管
    sageAutoSpellId: null, // 賢者自動念咒挑的魔法（#71）
    converterElement: null,// 肯貝特武器附魔選的屬性
    elementChangePick: null,// 元素更換選的屬性
    autoSkill: true,
    autoSkillConfig: { skillId: null, mode: 'once', spThreshold: 30, skillId2: null, spThreshold2: 50, monsterCount2: 2 }, // skillId2=第二招, spThreshold2=SP%門檻, monsterCount2=怪物數門檻
    autoPotion: { enabled: true, primary: '', fallback: 'red_potion', hpThreshold: 50 },
    autoSpPotion: { enabled: false, primary: '', fallback: 'blue_potion', spThreshold: 30 },
    autoAspdPotion: { enabled: false, items: [] },
    autoBuyAspdPotion: false,
    dpsTracker: { since: Date.now(), damage: 0, exp: 0, jobExp: 0, gold: 0, kills: 0 },
    autoBuyPotion: true,
    autoBuySpPotion: false,
    autoBuyArrow: true,
    /* 隊友那三個自動購買（#93 補進來）。以前只寫在 loadGame() 的補欄位那段，
       新角色在第一次讀檔之前是 undefined——面板上三個勾勾都是空的，
       實際行為卻要等重載才會變成預設的「開」。 */
    autoBuyAllyPotion: true,
    autoBuyAllySpPotion: true,   // 藍水（#105）：隊友要放技能就得有 SP
    autoBuyAllyArrow: true,
    autoBuyReviveLeaf: true,
    autoSellConfig: { enabled: false, items: [] }, // 自動販賣：每30秒自動賣出背包內已選擇的道具
    autoSellReadyAt: 0,
    cardEleDmgBonus: {}, // 屬性傷害加成（由卡片提供）
    codex: { mon: {}, seen: {}, item: {}, maps: {} }, // 圖鑑：擊殺數 / 已發現怪物 / 累計取得道具 / 造訪過的地圖
    lockedItems: {}, // { itemId: 1 } 鎖定的道具，不會被賣出／自動販賣／露天商店處理
    achievements: { done: {}, points: 0 },
    deaths: 0,
    muted: false,
    lastAttackTime: Date.now(),
    attackAccumulator: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };
  recomputeDerived(true);
  addItem('red_potion', 100);
  // Starting items: dagger and clothes
  addItem('knife', 1);
  addItem('cotton_shirt', 1);
  logMsg(`歡迎，${state.name}！你的冒險即將展開。`);
  logMsg('新手包：獲得紅色藥水 x100、短劍 x1、棉襯衫 x1！');
  spawnMonster();
  saveGame();
}

function renameCharacter(newName) {
  const n = (newName || '').trim();
  if (!n) { logMsg('⚠️ 名稱不可為空！'); return false; }
  if (n.length > 12) { logMsg('⚠️ 名稱最多 12 字！'); return false; }
  if (n === state.name) return true;
  state.name = n;
  logMsg(`已更名為「${n}」！`);
  saveGame();
  return true;
}

/* ---------------- 衍生數值計算 ----------------
   六圍的公式參考 RO 正式版(Renewal)的計算邏輯調整而來(非逐位元還原，依放置遊戲步調調整常數)：
     ATK    = STR + floor((STR/10)^2) + floor(DEX/5) + floor(LUK/5)      ← StatusATK 公式
     MATK   = INT + floor((INT/7)^2)~floor((INT/5)^2) 區間，取中點戰鬥用 ← MATK 區間公式
     HIT    = 175 + 基礎等級 + DEX                                       ← 經典命中公式
     FLEE   = 100 + 基礎等級 + AGI                                       ← 經典迴避公式
     完全迴避 = floor(LUK/10) %                                          ← LUK 完全迴避
     暴擊率  = 4 + floor(LUK/3) %（新增：暴擊無視命中判定）
     DEF    = VIT為主的軟防禦 + 裝備硬防禦，戰鬥時以「比例減傷」而非直接相減
------------------------------------------------- */
function currentJob() { return JOB_TREE[state.jobId]; }

// 可雙持單手武器的職業（左手欄位可放武器而非盾牌）
// 刺客系全部都可以：刺客（二轉）／十字刺客（進階二轉）／十字斬首者（三轉）
function canDualWield(jobId) {
  return jobId === 'assassin' || jobId === 'assassincross' || jobId === 'guillotinecross';
}

// 長矛類武器判定（矛限定技能共用）：道具資料的weaponType欄位對矛類武器標示很乾淨，直接用它判斷
/* ---------------- 箭矢／彈藥系統 ----------------
   弓類武器需要裝備箭矢才能攻擊。箭矢提供額外 ATK，且屬性箭會覆寫武器屬性
   （官方 RO 規則：弓本身無屬性，實際打出去的屬性由箭矢決定）。
   每次普攻消耗 1 支，用完會自動從背包補同一種，沒有就停手。
------------------------------------------------- */
// 只有真的弓要箭。樂器在本作的 weaponType 也是 'bow'（分類壓縮的產物），
// 但官方樂器是詩人專用、不吃箭，所以這裡要看還原後的官方分類而不是 weaponType。
function isBowWeapon(itemId) {
  const c = aspdCategoryOf(itemId);
  return c === 'bow' || c === 'instrument' || c === 'whip';
}
function needsAmmo() { return isBowWeapon(getEquipBaseItemId('weapon')); }
function isAmmoItem(itemId) {
  const d = itemId ? ITEMS[itemId] : null;
  return !!(d && d.ammo);
}
function getEquippedAmmoId() { return (state && state.equip) ? (state.equip.ammo || null) : null; }
function getEquippedAmmo() {
  const id = getEquippedAmmoId();
  return id ? ITEMS[id] : null;
}
// 目前裝備的箭矢剩餘數（箭矢就存在背包裡，裝備欄只記「選了哪一種」）
function getAmmoCount() {
  const id = getEquippedAmmoId();
  return id ? getItemQty(id) : 0;
}
function equipAmmo(itemId) {
  if (!isAmmoItem(itemId)) return false;
  if (getItemQty(itemId) < 1) { logMsg('⚠️ 你沒有這種箭矢。'); return false; }
  state.equip.ammo = itemId;
  recomputeDerived(false);
  logMsg(`🏹 裝備了 ${ITEMS[itemId].name}（剩餘 ${getItemQty(itemId)}）。`);
  saveGame();
  return true;
}
function unequipAmmo() {
  if (!state.equip.ammo) return false;
  const nm = ITEMS[state.equip.ammo] ? ITEMS[state.equip.ammo].name : '箭矢';
  state.equip.ammo = null;
  recomputeDerived(false);
  logMsg(`卸下了 ${nm}。`);
  saveGame();
  return true;
}
// 消耗一支箭；回傳 false 代表沒箭了（呼叫端要中止這次攻擊）
function consumeAmmo() {
  const id = getEquippedAmmoId();
  if (!id) return false;
  if (getItemQty(id) < 1) return false;
  removeItem(id, 1);
  if (getItemQty(id) <= 0) {
    logMsg(`🏹 ${ITEMS[id].name} 用完了！`);
    // 背包還有別種箭就自動換上，免得掛機時默默停擺
    const next = state.inventory.find(r => !r.instanceId && isAmmoItem(r.item) && r.qty > 0);
    if (next) {
      state.equip.ammo = next.item;
      logMsg(`🏹 自動換上 ${ITEMS[next.item].name}（剩餘 ${next.qty}）。`);
    } else {
      state.equip.ammo = null;
    }
    recomputeDerived(false);
  }
  return true;
}

function hasSpearEquipped() {
  const wId = getEquipBaseItemId('weapon');
  const w = wId ? ITEMS[wId] : null;
  return !!(w && w.weaponType === 'spear');
}

function equippedWeaponType() {
  const wId = getEquipBaseItemId('weapon');
  const w = wId ? ITEMS[wId] : null;
  return w ? w.weaponType : null;
}
// 體型傷害修正：只影響物理傷害，怪物沒有size資料（尚未套用新資料）時視為無修正
function getSizeMultiplier(monDef) {
  if (!monDef || !monDef.size) return 1;
  // 索引改用 aspdCategoryOf()：weaponType 分不出斧與鈍器，也沒有拳刃／書／杖／槍（見 SIZE_MODIFIER 的註解）
  const table = SIZE_MODIFIER[aspdCategoryOf(getEquipBaseItemId('weapon'))] || SIZE_MODIFIER.default;
  const pct = table[monDef.size];
  const mult = pct !== undefined ? pct / 100 : 1;
  /* 無視體型修正，一律照 100% 打（只補到 1，本來就超過 1 的不會被壓下來）。
     兩個來源：海盜之王卡片，以及鐵匠的無視體型攻擊（#131，官方的武器完全定義）。 */
  if (state.cardIgnoreSizePenalty) return Math.max(1, mult);
  if (state.buffs && state.buffs.some(b => b.type === 'ignoresize')) return Math.max(1, mult);
  return mult;
}
// 種族固定傷害加成，不受DEF削減：動物殺手（動物/昆蟲）、天使之擊（惡魔/不死）
/* 「加在防禦之後」的固定附加傷害。所有物理傷害路徑都是
   `mitigateDamage(...) + raceFlatBonus(def)`，所以放在這裡就等於**無視防禦**。

   本來只有種族限定的兩個（動物系加成、天使之擊），靈氣劍（#58）也是同一個性質——
   官方寫的就是「附加固定傷害，無視防禦」——所以掛在這裡，8 個呼叫點一個都不用改。 */
function raceFlatBonus(monDef) {
  let bonus = state.auraBladeFlat || 0;   // 靈氣劍：不限種族，只要 buff 在身上就加
  if (!monDef || !monDef.race) return bonus;
  if ((monDef.race === 'brute' || monDef.race === 'insect') && state.animalDamageFlat) {
    bonus += state.animalDamageFlat;
  }
  if ((monDef.race === 'demon' || monDef.race === 'undead') && state.angelicAtkBonus) {
    bonus += state.angelicAtkBonus;
  }
  return bonus;
}

/* ---------------- 裝備個體化 ----------------
   精煉或插卡之後，那一件裝備就變成獨立個體，狀態跟著它本身走，不再跟背包裡同名的其他份共用。
   state.equip[slot] 存的可能是「道具id」（普通裝備）或「個體id」（個體裝備），
   一律透過 getEquipBaseItemId() 取得真正的道具id，別直接拿 state.equip[slot] 去查 ITEMS。
------------------------------------------------- */
function getEquipBaseItemId(slot) {
  const ref = state.equip && state.equip[slot];   // 離線結算等場景可能帶未初始化的 state 快照
  if (ref && state.instances && state.instances[ref]) return state.instances[ref].item;
  return ref;
}
function getEquipInstance(slot) {
  const ref = state.equip[slot];
  if (ref && state.instances && state.instances[ref]) return state.instances[ref];
  return null;
}
// 取得（或視需要建立）該欄位裝備的個體紀錄，回傳 instanceId；精煉/插卡第一次發生時把普通道具轉成個體
function getOrCreateEquipInstance(slot) {
  const ref = state.equip[slot];
  if (!ref) return null;
  if (state.instances[ref]) return ref;
  const id = ref + '#' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  state.instances[id] = { item: ref, refine: 0, cards: [] };
  state.equip[slot] = id;
  return id;
}
// 個體如果精煉歸零又沒卡片，還原成普通道具，免得背包留下一堆沒意義的獨立行
function maybeDeinstanceSlot(slot) {
  const ref = state.equip[slot];
  if (!ref || !state.instances[ref]) return;
  const inst = state.instances[ref];
  if ((inst.refine || 0) === 0 && (!inst.cards || inst.cards.length === 0)) {
    state.equip[slot] = inst.item;
    delete state.instances[ref];
  }
}
// 把某欄位目前的裝備放回背包（普通道具照樣堆疊，個體裝備獨立一行），並清空欄位
function returnEquipToInventory(slot) {
  const ref = state.equip[slot];
  if (!ref) return;
  if (state.instances && state.instances[ref]) {
    state.inventory.push({ item: state.instances[ref].item, qty: 1, instanceId: ref });
  } else {
    addItem(ref, 1);
  }
  state.equip[slot] = null;
}

function equippedAtk() {
  const wId = getEquipBaseItemId('weapon');
  const w = wId ? ITEMS[wId] : null;
  const baseAtk = w && w.atk ? w.atk : 0;
  const refLevel = getRefinementLevel('weapon');
  const weaponLv = w ? getRefineWeaponLv(w) : 1;
  let mainAtk = baseAtk + getRefinementAtkBonus(refLevel, weaponLv);
  // 弓：箭矢的 ATK 直接加進武器攻擊力（官方 RO 就是這樣算）
  if (isBowWeapon(wId)) {
    const ammo = getEquippedAmmo();
    if (ammo && ammo.atk) mainAtk += ammo.atk;
  }

  // 雙持：左手欄位裝備的是單手武器而非盾牌時，套用右手/左手修練的傷害修正
  const offId = getEquipBaseItemId('shield');
  const offItem = offId ? ITEMS[offId] : null;
  if (offItem && offItem.type === 'weapon' && canDualWield(state.jobId)) {
    const offRefLevel = getRefinementLevel('shield');
    const offWeaponLv = getRefineWeaponLv(offItem);
    const offAtk = (offItem.atk || 0) + getRefinementAtkBonus(offRefLevel, offWeaponLv);
    const rightPct = (state.rightHandPct != null ? state.rightHandPct : 50) / 100;
    const leftPct = (state.leftHandPct != null ? state.leftHandPct : 30) / 100;
    mainAtk = mainAtk * rightPct + offAtk * leftPct;
  }
  return mainAtk;
}
function equippedMatk() {
  const wId = getEquipBaseItemId('weapon');
  const w = wId ? ITEMS[wId] : null;
  if (!w || !w.matk) return 0;
  // 官方（renewal）：精煉對有 MATK 的武器同步加 MATK，對照表與 ATK 相同
  return w.matk + getRefinementAtkBonus(getRefinementLevel('weapon'), getRefineWeaponLv(w));
}
function equippedDef() {
  let def = 0;
  // Check all equipped armor slots
  ['head_top', 'head_mid', 'head_bottom', 'armor', 'shield', 'garment', 'footgear', 'accessory1', 'accessory2'].forEach(slot => {
    const id = getEquipBaseItemId(slot);
    const a = id ? ITEMS[id] : null;
    const baseDef = a && a.def ? a.def : 0;
    def += baseDef + getRefinementDefBonus(getRefinementLevel(slot));
  });
  return def;
}
// 裝備本體（武器/防具/飾品）自帶的加成數值加總：許多防具本身就有寫str/agi/vit/int/dex/luk/atk/flee/hit/critRate/perfectDodge/hp/sp等欄位，
// 但過去只有equippedDef()把def讀出來，其餘欄位全部沒有實際套用，等於裝了也沒效果（純UI顯示用），這裡統一補上
const EQUIP_SLOTS_ALL = ['weapon', 'head_top', 'head_mid', 'head_bottom', 'armor', 'shield', 'garment', 'footgear', 'accessory1', 'accessory2'];
// atk/matk已由equippedAtk()/equippedMatk()從武器欄位讀取（含精煉加成），這裡加總其餘欄位時排除武器欄，避免武器ATK被重複計算兩次
const EQUIP_SLOTS_NO_WEAPON = EQUIP_SLOTS_ALL.filter(s => s !== 'weapon');
function equippedStatBonus(stat) {
  const slots = (stat === 'atk' || stat === 'matk') ? EQUIP_SLOTS_NO_WEAPON : EQUIP_SLOTS_ALL;
  let total = 0;
  slots.forEach(slot => {
    const id = getEquipBaseItemId(slot);
    const it = id ? ITEMS[id] : null;
    if (it && typeof it[stat] === 'number') total += it[stat];
  });
  return total;
}

/* buff 是誰給的。大部分 buff 身上有 skillId，查得到就用技能名，
   查不到才退回一個看得懂的中文標籤（總比畫面上出現 "statpct" 好）。 */
const BUFF_TYPE_LABELS = {
  blessing: '天使之賜福', flatstat: '大聲吶喊', agiflat: '加速術',
  lukflat: '幸運之頌歌', statpct: '心神凝聚'
};
function buffSourceLabel(b) {
  if (b.skillId && typeof findSkillById === 'function') {
    const sk = findSkillById(b.skillId);
    if (sk) return sk.name;
  }
  return BUFF_TYPE_LABELS[b.type] || b.type;
}

/* ---------------- 卡片賦予的技能（#17）----------------
   官方有一批卡片寫「可使用【偷竊】Lv1技能」——裝著就多一個技能可用，
   跟職業、技能點都沒有關係（商人的技能可以出現在騎士身上）。
   資料寫在 `CARDS[x].grantSkill = [{ id, lv }]`。

   **刻意不併進 state.learnedSkills**：那份是玩家花技能點買的，要存檔、
   轉職時要退點、重置技能時要清空。卡片給的技能脫下就沒有，混進去遲早會
   把玩家真正學到的等級蓋掉，或在轉職時被當成自己的退成技能點。
   所以另外開一份 `state.cardSkills`，所有「這個技能有幾級」的判斷一律走
   `skillLv()`，取兩邊較高的那個（卡片給 Lv1、玩家學到 Lv10 就是 Lv10）。 */
function cardGrantedSkills() {
  const out = {};
  if (typeof allEquippedCards !== 'function') return out;
  /* 卡片與**裝備本身**都可以給技能（#127）。官方不只卡片會寫「可使用○○」，
     武器也會（強襲戰矛的連刺攻擊 Lv3、長角之矛的解毒）。兩邊格式相同，走同一段。 */
  const givers = allEquippedCards().map(id => CARDS[id]);
  if (typeof EQUIP_SLOTS_ALL !== 'undefined') {
    EQUIP_SLOTS_ALL.forEach(slot => {
      const itemId = getEquipBaseItemId(slot);
      if (itemId && ITEMS[itemId]) givers.push(ITEMS[itemId]);
    });
  }
  givers.forEach(c => {
    if (!c || !c.grantSkill) return;
    c.grantSkill.forEach(g => {
      if (!SKILLS[g.id]) return;                       // 本作沒有這個技能就跳過
      const lv = Math.max(1, Math.min(SKILLS[g.id].maxLv || 1, g.lv || 1));
      if (!out[g.id] || lv > out[g.id]) out[g.id] = lv;
    });
  });
  return out;
}
/* 這個技能實際上有幾級：玩家學的與卡片給的取高。 */
function skillLv(skillId) {
  return Math.max(
    (state.learnedSkills && state.learnedSkills[skillId]) || 0,
    (state.cardSkills && state.cardSkills[skillId]) || 0,
    // 抄襲（#69）：抄來的那個技能能用到「抄襲的等級」與「該技能本身上限」的較小值
    plagiarizedLv(skillId)
  );
}
/* 抄襲抄到的技能等級。分開一支是因為 skillLv() 被叫得非常兇，
   而這裡要夾兩層上限（抄襲等級、技能本身的 maxLv），寫在原地會很難讀。 */
function plagiarizedLv(skillId) {
  if (!state || !state.plagiarismSkillId || state.plagiarismSkillId !== skillId) return 0;
  const lv = state.plagiarismLv || 0;
  if (!lv) return 0;
  const sk = SKILLS[skillId];
  return Math.min(lv, (sk && sk.maxLv) || lv);
}
/* 要施放時查技能定義：先找已學職業的技能表，找不到才看是不是卡片給的。
   （不能直接用 findSkillAnywhere，那會讓沒學過也沒卡片的技能一樣查得到。） */
function findSkillForUse(skillId) {
  return findSkillById(skillId)
    || ((state.cardSkills && state.cardSkills[skillId]) ? findSkillAnywhere(skillId) : null)
    // 抄襲來的技能不在任何已學職業的技能表裡，要另外放行（#69）
    || (plagiarizedLv(skillId) ? findSkillAnywhere(skillId) : null);
}
/* 現在真的能用的技能清單（已學職業的 + 卡片賦予的），同一個技能只出現一次。
   技能列、自動施放、自動輔助都走這裡，卡片給的技能才不會只有手動能用。 */
function usableSkillEntries() {
  const out = [];
  const seen = new Set();
  getAllLearnedJobs().forEach(jid => {
    const jd = JOB_TREE[jid];
    if (!jd) return;
    jd.skills.forEach(sk => {
      const lv = skillLv(sk.id);
      if (!lv || seen.has(sk.id)) return;
      seen.add(sk.id);
      out.push({ sk, lv, fromCard: !(state.learnedSkills && state.learnedSkills[sk.id]) });
    });
  });
  Object.keys(state.cardSkills || {}).forEach(id => {
    if (seen.has(id)) return;
    const sk = findSkillAnywhere(id);
    if (!sk) return;
    seen.add(id);
    out.push({ sk, lv: state.cardSkills[id], fromCard: true });
  });
  // 抄襲來的技能（#69）：不是本職也不是卡片給的，但技能列與自動施放都該看得到
  const plagLv = plagiarizedLv(state.plagiarismSkillId);
  if (plagLv && !seen.has(state.plagiarismSkillId)) {
    const sk = findSkillAnywhere(state.plagiarismSkillId);
    if (sk) out.push({ sk, lv: plagLv, fromCard: true, fromPlagiarism: true });
  }
  return out;
}

/* ---------------- 抄襲：挑一個技能（#69）----------------
   官方是「記住最後一個打到你的技能」，使用者 2026-08-10 改成自己挑。
   可挑的範圍是**全技能庫裡的攻擊技能**，等級上限＝抄襲的等級。 */
const PLAGIARISM_ATTACK_TYPES = ['damage', 'magic', 'damage_aoe', 'magic_aoe',
  'damage_multi', 'damage_multihit', 'dot', 'poison_proc', 'stun_field', 'multi_dot_stun',
  'field_aoe_magic', 'special_charge'];
/* 被動型的攻擊技（普攻觸發那一批）。自由保護（#79）學了之後才進候選名單。
   判斷方式是「有沒有 passiveStat、而且那個 passive 真的會打人」——
   沒有一個共用旗標可以查，所以列出目前會造成傷害的那些 passiveStat。 */
const PLAGIARISM_PASSIVE_STATS = [
  'tripleAttack', 'chainCombo', 'comboFinish', 'extremityFist', 'investigate',
  'fingerOffensive', 'balkyoung', 'palmStrike', 'tigerFist', 'chainCrush',
  'raidProc', 'onAttackStrike', 'magicCrasher', 'soulBurn', 'tarotCard',
];
function plagiarismIsAttack(sk) {
  if (PLAGIARISM_ATTACK_TYPES.includes(sk.type)) return true;
  return !!(state.preserveOn && sk.type === 'passive'
    && PLAGIARISM_PASSIVE_STATS.includes(sk.passiveStat));
}
function plagiarismChoices() {
  if (!state.plagiarismLv) return [];
  return Object.keys(SKILLS)
    .filter(id => plagiarismIsAttack(SKILLS[id]))
    // 已經是自己職業的技能就沒有抄的必要，抄了也只是佔一個名額
    .filter(id => !findSkillById(id))
    .map(id => SKILLS[id]);
}

/* 抄襲的選單要照職業主系分組（使用者 2026-08-15 指定）。
   主系＝一路往上走 `parent` 走到 tier<=1 的那個職業，
   所以騎士與十字軍都歸劍士、鐵匠與鍊金術士都歸商人，不必另外維護一張表。 */
function skillOriginJob(skillId) {
  const has = j => (j.skills || []).some(sk => sk.id === skillId);
  /* **借來的不算來源**。jobs.js 在載入時把 `borrowSkillsFrom` 攤平進 `job.skills`，
     所以光看「誰的清單裡有」會把超級新手當成六個一轉技能的來源
     （它 tier 也是 1，排序上還排在劍士前面）。先排除掉借得到的那些。 */
  const jobs = Object.values(JOB_TREE)
    .filter(j => !(j.borrowSkillsFrom || []).some(src => JOB_TREE[src] && has(JOB_TREE[src])))
    .sort((a, b) => (a.tier || 0) - (b.tier || 0));
  for (const j of jobs) { if (has(j)) return j; }
  return null;
}
function jobFamilyRoot(job) {
  let cur = job;
  const seen = new Set();
  while (cur && (cur.tier || 0) > 1 && cur.parent && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = JOB_TREE[cur.parent];
  }
  return cur;
}
function plagiarismGroups() {
  const groups = new Map();
  plagiarismChoices().forEach(sk => {
    const origin = skillOriginJob(sk.id);
    const root = origin ? jobFamilyRoot(origin) : null;
    const key = root ? root.id : '_other';
    const label = root ? `${root.icon || ''}${root.name}系` : '其他';
    if (!groups.has(key)) groups.set(key, { id: key, label, skills: [] });
    groups.get(key).skills.push(sk);
  });
  return [...groups.values()]
    .map(g => (g.skills.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')), g))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}
function setPlagiarismSkill(skillId) {
  if (!state.plagiarismLv) { logMsg('⚠️ 還沒學會抄襲。'); return false; }
  if (!skillId) { state.plagiarismSkillId = null; saveGame(); return true; }
  const sk = SKILLS[skillId];
  if (!sk || !plagiarismIsAttack(sk)) {
    logMsg('⚠️ 抄襲只能記住攻擊類技能。');
    return false;
  }
  state.plagiarismSkillId = skillId;
  recomputeDerived(false);
  logMsg(`📖 抄襲記住了「${sk.name}」（可用到 Lv${plagiarizedLv(skillId)}）。`);
  saveGame();
  return true;
}
/* 被動技能的掃描來源：已學職業的技能表（含重複，維持原本的行為）
   ＋ 卡片賦予、但任何已學職業都沒有的技能。 */
/* **同一個技能只能出現一次**（#79 修）。進階二轉靠 `borrowSkillsFrom` 把本職的技能
   整份借過來，而轉生後的 `getAllLearnedJobs()` 同時含有一轉、二轉與進階二轉，
   所以一個一轉技能會被走到三次。加法型的被動（`+=`）與 push 型的（卸除四連）
   因此會算兩三遍——`state.stripProcs` 實測是 8 筆而不是 4 筆。
   查覺得晚是因為大部分被動用的是 `=` 或 `Math.max`，重複算了也看不出來。 */
function passiveSourceSkills() {
  const out = [];
  const inJobs = new Set();
  getAllLearnedJobs().forEach(jid => {
    const jd = JOB_TREE[jid];
    if (!jd) return;
    jd.skills.forEach(sk => {
      if (inJobs.has(sk.id)) return;
      out.push(sk); inJobs.add(sk.id);
    });
  });
  Object.keys(state.cardSkills || {}).forEach(id => {
    if (inJobs.has(id)) return;
    const sk = findSkillAnywhere(id);
    if (sk) { out.push(sk); inJobs.add(id); }
  });
  /* 抄襲抄來的技能（#102）。`skillLv()` 早就把等級算進去了，所以主動技抄了就能放，
     但**被動抄了完全沒有效果**——被動的效果是在 recomputeDerived 那一圈裡照
     `passiveStat` 掛上去的，而抄來的技能不在任何已學職業的技能表、也不是卡片給的，
     一輩子進不了這個清單。使用者 2026-08-16 回報「抄襲的被動技 六合拳沒有觸發」。

     `plagiarizedLv()` 讀的 `state.plagiarismLv` 也是那一圈才設的，等於「要先跑完
     才知道要不要跑」——所以先就地把抄襲等級與自由保護的開關算出來。
     兩個值稍後在迴圈裡會被 case 'plagiarism' / 'preserve' 設成同一個結果。 */
  out.forEach(sk => {
    if (sk.type !== 'passive') return;
    if (sk.passiveStat === 'plagiarism') state.plagiarismLv = skillLv(sk.id);
    else if (sk.passiveStat === 'preserve' && skillLv(sk.id)) state.preserveOn = true;
  });
  const plagId = state.plagiarismSkillId;
  if (plagId && !inJobs.has(plagId) && plagiarizedLv(plagId)) {
    const sk = findSkillAnywhere(plagId);
    if (sk) out.push(sk);
  }
  return out;
}

function recomputeDerived(fullHeal) {
  const job = currentJob();
  const s = state.stats;
  const bl = state.baseLevel;

  // 卡片賦予的技能（見 cardGrantedSkills 的註解）。要在被動技能那兩圈之前算好
  state.cardSkills = cardGrantedSkills();

  // 職業加成（跨職業累計繼承）
  const jobBonus = computeJobBonuses();

  /* RO 官方 HP/SP 查找表（#92 之後就是官方公式，沒有本作自己的係數）

       MAX_HP = floor(JOB_BASE_HP[job][lv-1] × (1 + VIT/100))   轉生再 × 1.25
       MAX_SP = floor(JOB_BASE_SP[job][lv-1] × (1 + INT/100))   轉生再 × 1.25

     以前這裡還乘了 `job.hpMod` / `job.spMod`。那是錯的——**JOB_BASE_HP/SP 本身就已經
     分職業**（法師 Lv100 是 2050、騎士是 8128），再乘一次等於把職業差異算兩遍。
     實測 Lv99 巫師 INT106：SP 應該是 1856，spMod 9.0 讓它變成 16704，而技能的
     SP 消耗又是官方值（火球術 25、雷爆術 29+5/級），SP 因此形同無限。#92 全部移除。

     轉生加成走 `state.rebirthCount` 而不是掛在進階二轉的職業資料上：官方的 25%
     是「轉生過」就有，高等劍士、高等巫師那些中途職業同樣吃得到，不必等轉到進階二轉。
     rAthena 是**先乘 VIT 再乘 25%**，兩段各自取整，這裡照抄。

      `hpSpFrom`：進階二轉沿用本職的成長表（官方轉生職用的就是同一張表）。
      不寫的職業照舊用自己的 id；查不到才退回新手表。
      全部三轉 `hpSpFrom` 指向進階二轉 `js/jobs.js:658`，而進階二轉表未建時
      遞迴追到二轉基表（`guillotinecross→assassincross→assassin`）才正確。 */
   const jobId = job.id;
   let tblKey = job.hpSpFrom || jobId;
   let hpTable = JOB_BASE_HP[tblKey];
   let spTable = JOB_BASE_SP[tblKey];
   {
     const seen = new Set([tblKey]);
     let cur = JOB_TREE[tblKey];
     while ((!hpTable || !spTable) && cur && cur.hpSpFrom && !seen.has(cur.hpSpFrom)) {
       tblKey = cur.hpSpFrom;
       seen.add(tblKey);
       hpTable = hpTable || JOB_BASE_HP[tblKey];
       spTable = spTable || JOB_BASE_SP[tblKey];
       cur = JOB_TREE[tblKey];
     }
   }
   hpTable = hpTable || JOB_BASE_HP.novice;
   spTable = spTable || JOB_BASE_SP.novice;
  const baseHP = hpTable[Math.min(bl, 100) - 1] || 35;
  const baseSP = spTable[Math.min(bl, 100) - 1] || 10;
  const effVit = s.vit + jobBonus.vit;
  const effInt = s.int + jobBonus.int;
  let newMaxHp = Math.floor(baseHP * (1 + effVit * 0.01));
  let newMaxSp = Math.floor(baseSP * (1 + effInt * 0.01));
  /* `job.tier >= 2.5` 是保險絲：正常途徑走不到進階二轉而 rebirthCount 還是 0
     （canJobChange 只認 nextLocked，而那條路要有 rebirthPath 才開），
     但 GM 鈕與舊存檔做得到，而進階二轉本來就是官方的轉生職。 */
  if ((state.rebirthCount || 0) > 0 || job.tier >= 2.5) {
    newMaxHp = Math.floor(newMaxHp * TRANSCENDENT_HPSP_MULT);
    newMaxSp = Math.floor(newMaxSp * TRANSCENDENT_HPSP_MULT);
  }

  state.maxHp = newMaxHp;
  state.maxSp = newMaxSp;
  // 注意：這裡先不夾住hp/sp！體能強化(maxHpMult)、卡片HP%/SP%加成等都會在後面才疊加到
  // state.maxHp/maxSp 上，若在此處就用未套用加成的newMaxHp夾住hp，會在每次呼叫(tickBuffs每100ms
  // 都會呼叫一次)把hp錯誤地砍回未加成的較低數值——夾住的動作統一移到函式最後，用最終數值執行。

  /* 素質加成一律記帳到 skillSrc/buffSrc，角色分頁才有辦法把「這 +10 是哪來的」列出來。
     沒有這份帳，鶚梟之眼的 DEX+10、心神凝聚的 DEX/AGI% 都只會默默混進戰鬥數值，
     玩家在角色分頁完全看不到數字，會以為技能沒效果。 */
  const skillFlat = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  const buffFlat  = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  const skillSrc = {}, buffSrc = {};
  const addSrc = (bag, flat, stat, v, name) => {
    if (!v) return;
    flat[stat] += v;
    (bag[stat] = bag[stat] || []).push({ name, v });
  };

  // 被動技能 STR/INT/DEX 固定加成（必須在衍生數值計算之前，避免直接修改 state.stats 導致膨脹）
  {
    passiveSourceSkills().forEach(sk => {
      const lv = skillLv(sk.id);
      if (!lv || sk.type !== 'passive') return;
      const label = `${sk.name} Lv${lv}`;
      if (sk.passiveStat === 'dexFlat') {
        const val = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
        addSrc(skillSrc, skillFlat, 'dex', Math.round(val), label);
      } else if (sk.passiveStat === 'triStatBonus') {
        // 物品鑑定：STR/INT/DEX 同時加成
        const val = Math.round(Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult);
        addSrc(skillSrc, skillFlat, 'str', val, label);
        addSrc(skillSrc, skillFlat, 'int', val, label);
        addSrc(skillSrc, skillFlat, 'dex', val, label);
      }
      // 武器保有：附加固定STR加成
      if (sk.strBonus) {
        const sb = Array.isArray(sk.strBonus) ? sk.strBonus[lv - 1] : sk.strBonus;
        addSrc(skillSrc, skillFlat, 'str', Math.round(sb), label);
      }
      // 怪物情報：附加固定INT加成
      if (sk.intBonus) {
        const ib = Array.isArray(sk.intBonus) ? sk.intBonus[lv - 1] : sk.intBonus;
        addSrc(skillSrc, skillFlat, 'int', Math.round(ib), label);
      }
    });
  }

  // buff 類的固定加成：大聲吶喊(STR)、天使之賜福(STR/INT/DEX)、加速術(AGI)、幸運之頌歌(LUK)
  state.buffs.forEach(b => {
    const label = buffSourceLabel(b);
    if (b.type === 'flatstat' && b.strBonus) addSrc(buffSrc, buffFlat, 'str', b.strBonus, label);
    if (b.type === 'blessing') {
      addSrc(buffSrc, buffFlat, 'str', b.strBonus || 0, label);
      addSrc(buffSrc, buffFlat, 'int', b.intBonus || 0, label);
      addSrc(buffSrc, buffFlat, 'dex', b.dexBonus || 0, label);
    }
    if (b.type === 'agiflat') addSrc(buffSrc, buffFlat, 'agi', b.flatBonus || 0, label);
    if (b.type === 'lukflat') addSrc(buffSrc, buffFlat, 'luk', b.flatBonus || 0, label);
    /* 全素質 +N（#61 狙殺瞄準）。現有的 flat buff 都只加一兩個素質
       （blessing 是 STR/INT/DEX、statpct 是 DEX/AGI、lukflat 是 LUK），
       拼不出「六個一起 +5」，所以開一個一次加滿的型別。 */
    if (b.type === 'allstat') {
      BASE_STAT_KEYS.forEach(k => addSrc(buffSrc, buffFlat, k, b.flatBonus || 0, label));
    }
  });

  const passiveStrBonus = skillFlat.str + buffFlat.str;
  const passiveIntBonus = skillFlat.int + buffFlat.int;
  const passiveDexBonus = skillFlat.dex + buffFlat.dex;
  const buffAgiBonus = buffFlat.agi;
  const buffLukBonus = buffFlat.luk;
  state._passiveDexBonus = passiveDexBonus;

  // 心神凝聚buff：DEX/AGI 百分比加成（影響下面所有衍生自DEX/AGI的數值，含攻速）
  let buffStatPct = 0;
  const pctSrc = [];
  state.buffs.forEach(b => {
    if (b.type !== 'statpct') return;
    buffStatPct += b.mult;
    pctSrc.push({ name: buffSourceLabel(b), v: b.mult });
  });
  state._buffStatPct = buffStatPct;

  // ATK：官方有兩套 StatusATK 公式，弓／樂器／鞭以 DEX 為主屬性、STR 退為副屬性
  //   一般武器：STR + (STR/10)² + DEX/5 + LUK/5
  //   弓系武器：DEX + (DEX/10)² + STR/5 + LUK/5
  // （含職業加成與卡片加成）
  const cStr = s.str + jobBonus.str + getCardBonus('str') + equippedStatBonus('str') + passiveStrBonus;
  const cDex = Math.round((s.dex + jobBonus.dex + getCardBonus('dex') + equippedStatBonus('dex') + passiveDexBonus) * (1 + buffStatPct));
  const cLuk = s.luk + jobBonus.luk + getCardBonus('luk') + equippedStatBonus('luk') + buffLukBonus;
  const cAgi = Math.round((s.agi + jobBonus.agi + getCardBonus('agi') + equippedStatBonus('agi') + buffAgiBonus) * (1 + buffStatPct));
  /* VIT 以前**完全沒有接 buff 的固定加成**——因為在 #61 之前沒有任何 buff 加 VIT
     （blessing 是 STR/INT/DEX、agiflat/lukflat 各管一個）。狙殺瞄準的全素質 +5 一來就露餡了。 */
  const cVit = s.vit + jobBonus.vit + getCardBonus('vit') + equippedStatBonus('vit') + buffFlat.vit;
  const cInt = s.int + jobBonus.int + getCardBonus('int') + equippedStatBonus('int') + passiveIntBonus;
  /* 角色分頁要用的素質明細：base / 職業 / 裝備卡片 / 技能 / buff 各佔多少，
     以及百分比 buff 最後實際加了幾點（四捨五入後的差額，跟戰鬥用的數字一致）。 */
  const STAT_TOTALS = { str: cStr, agi: cAgi, vit: cVit, int: cInt, dex: cDex, luk: cLuk };
  state._statBreakdown = {};
  ['str', 'agi', 'vit', 'int', 'dex', 'luk'].forEach(k => {
    const gear = equippedStatBonus(k) + getCardBonus(k);
    const flat = s[k] + jobBonus[k] + gear + skillFlat[k] + buffFlat[k];
    state._statBreakdown[k] = {
      base: s[k],
      job: jobBonus[k],
      gear,
      skill: skillFlat[k],
      buff: buffFlat[k],
      pct: STAT_TOTALS[k] - flat,          // 心神凝聚之類的 % 加成實際多出來的點數
      pctSrc: (k === 'dex' || k === 'agi') ? pctSrc : [],
      skillSrc: skillSrc[k] || [],
      buffSrc: buffSrc[k] || [],
      total: STAT_TOTALS[k]
    };
  });

  const dexAtk = isDexAtkWeapon(getEquipBaseItemId('weapon'));
  const atkMain = dexAtk ? cDex : cStr;
  const atkSub = dexAtk ? cStr : cDex;
  const statusAtk = atkMain + Math.floor((atkMain / 10) ** 2) + Math.floor(atkSub / 5) + Math.floor(cLuk / 5);
  state._atkUsesDex = dexAtk;
  /* ATK 拆成三個桶子，總和仍然是 state.atk（其他地方照舊只讀 state.atk）。
     普通攻擊的傷害鏈要分開處理它們——官方的體型修正與屬性倍率**只作用在武器ATK**上：
       _atkWeapon   武器本體＋精煉＋箭矢＋裝備/卡片的 ATK 加成 → 吃體型、屬性、武器浮動
       _atkStatus   素質衍生的 ATK（STR/DEX 那條公式 × 職業係數） → 不吃
       _atkMastery  熟練度被動、大聲吶喊之類的固定加成 → 不吃（官方「熟練度無視體型懲罰」） */
  state._atkStatus = Math.round(statusAtk * job.atkMod);
  state._atkWeapon = equippedAtk();
  state._atkMastery = 0;
  state.atk = state._atkStatus + state._atkWeapon;
  // 大聲吶喊buff：ATK 固定加成（於狀態ATK算完後直接加）
  let buffAtkFlat = 0;
  state.buffs.forEach(b => { if (b.type === 'flatstat' && b.flatBonus) buffAtkFlat += b.flatBonus; });
  state.atk += buffAtkFlat;
  state._atkMastery += buffAtkFlat;

  // MATK：區間公式，min = INT+(INT/7)²，max = INT+(INT/5)²，取平均當戰鬥數值
  const matkMinRaw = cInt + Math.floor((cInt / 7) ** 2) + Math.floor(cDex / 5);
  const matkMaxRaw = cInt + Math.floor((cInt / 5) ** 2) + Math.floor(cDex / 5) + Math.floor(cLuk / 3);
  state.matkMin = Math.round(matkMinRaw * job.matkMod) + equippedMatk();
  state.matkMax = Math.round(matkMaxRaw * job.matkMod) + equippedMatk();
  state.matk = Math.round((state.matkMin + state.matkMax) / 2);

  /* DEF 拆成硬防與軟防，兩者的運算方式完全不同（官方 battle_calc_defense）：
       硬防（裝備DEF）→ 比例減傷 傷害 × (4000+硬防)/(4000+10×硬防)
       軟防（等級+VIT）→ 固定扣血，每一擊各扣一次
     `state.def` 只留給介面顯示（兩者相加），戰鬥一律讀 defHard / defSoft。 */
  state.defHard = equippedDef();
  state.defSoft = Math.floor((bl + cVit) / 2);   // 官方 renewal 的怪物軟防公式，玩家沿用同一條
  state.def = state.defHard + state.defSoft;

  /* MDEF 走跟 DEF 完全平行的一套（官方 battle_calc_defense 對魔法用的是同一條公式，
     只是換一組數字）：硬魔防比例減傷、軟魔防固定扣血。

     **本作先前根本沒有玩家魔防**，怪物那 197 條魔法技能打過來時扣的是物理 DEF——
     官方魔法根本不看 DEF。那不是「少一個功能」，是一條算錯的公式。

     硬魔防來自裝備與卡片（在下面的加成區統一加，跟 defHard 的寫法一致）。
     **精煉不加 MDEF**，官方精煉只給 DEF。
     軟魔防是 INT/2，官方玩家軟魔防就是這條。 */
  state.mdefHard = 0;
  state.mdefSoft = Math.floor(cInt / 2);
  state.mdef = state.mdefSoft;

  /* 場上同時最多幾隻怪：一律由遇怪模式推導，不要用「取大值」的寫法累積。
     以前是 setEncounterMode() 直接寫值、被動技能再 Math.max 疊上去，只要疊過一次
     就再也降不回來——切到遠攻模式（該只有 1 隻）時會殘留近戰的數字。 */
  /* **模式名是 `'ranged'` 不是 `'remote'`**（見上面的欄位註解與 UI 的按鈕）。
     這裡本來寫成 'remote'，所以遠攻模式的 maxMonsters 一直是 5 而不是 1——
     spawnMonster 的遠攻分支自己有「場上有怪就不生」的判斷，所以平常看不出來，
     但衝鋒攻擊（spawnExtraMonster）與召喚小弟（#65）都是照 maxMonsters 補的，
     那兩條路在遠攻模式下會補出第 2~5 隻。 */
  state.maxMonsters = state.encounterMode === 'ranged' ? 1 : MELEE_MAX_MONSTERS;

  // HIT / FLEE：經典 RO 常數公式
  state.hit = 175 + bl + cDex;
  state.flee = 100 + bl + cAgi;

  // 完全迴避（無視命中判定）與暴擊率（無視閃避判定）
  state.perfectDodge = Math.floor(cLuk / 10);
  state.critRate = Math.min(50, 4 + Math.floor(cLuk / 3));
  // 拳刃：暴擊率加倍（官方特性，也是刺客拿拳刃而不是雙短劍的主要理由）
  state._katarEquipped = isKatarWeapon(getEquipBaseItemId('weapon'));
  if (state._katarEquipped) state.critRate = Math.min(100, state.critRate * KATAR_CRIT_MULT);

  // ASPD 初始計算（不含 buff，buff 在 tick 時動態套用）
  // 官方計算機用的是「總 AGI/DEX」（含職業、裝備、卡片、buff），先寄存給 computeAspd() 用
  state._totalAgi = cAgi;
  state._totalDex = cDex;
  state._totalStr = cStr;   // 武器浮動用（官方 1 + STR/200 ± 武器等級×0.05）
  computeAspd();

  // Passive skill bonuses（跨職業）
  state.stealChance = 0;
  state.hasAutoDetox = false;
  state.hasSandmanProc = false;
  state.hasBackslideDodge = false;
  state.hasPoisonReact = false;
  state.hasVenomdustProc = false;
  state.hasVenominfusionProc = false;
  state.hasSonicblowBoost = false;
  state.passiveAspdFlat = 0;
  state.falconFlatBonus = 0;
  state.animalDamageFlat = 0;
  state.angelicAtkBonus = 0;
  state.divineDefBonus = 0;
  state.trapCdReductionSec = 0;
  state.trapChanceBonusPct = 0;
  state.shopDiscountMult = 1;
  state.shopOverchargeMult = 1;
  state.hasAutoCartItem = false;
  state.cartItemIntervalSec = 15;
  state.cartItemPool = ['carrot'];
  state.cartDmgBonusMult = 0;
  state.hasElementalStoneProc = false;
  state.elementalStoneChance = 0;
  state.craftBonusPct = 0;
  state.unlockedCraftCategories = [];
  state.unlockedMaterialCrafts = [];
  state.fireResistPct = 0;
  state.neutralResistPct = 0;
  state.hasFindingOreProc = false;
  state.findingOreChance = 0;
  state.hasGreedProc = false;
  state.greedChance = 0;
  state.hasHammerfallProc = false;
  state.hammerfallSingleChance = 0;
  state.hammerfallAoeChance = 0;
  state.hammerfallStunSec = 1;
  state.zenyCostReductionPct = {};
  state.hiltBindingDurationBonus = 0;
  state.hasOnHitStunProc = false;
  state.onHitStunChance = 0;
  state.onHitStunSec = 0.5;
  state.onHitStunCooldownSec = 10;
  state.zenSpFlatBonus = 0;
  state.zenSpPctBonus = 0;
  state.spItemEffectBonusPct = 0;
  /* 自然回復的兩個**乘法**加成（#107）。這兩個以前完全沒有被重設，
     而 `case 'hpRegenMult'` / `case 'spRegen'` 寫的是 `= (舊值 || 1) * val`——
     等於每跑一次 recomputeDerived() 就再乘一次。升級、換裝、插卡、buff 到期
     都會跑 recomputeDerived，所以是指數成長：實測快速恢復 Lv10（×2）
     的角色玩一陣子之後每秒回 9.3e+220 HP，等於完全不會死。
     跟更早那次 DEX 膨脹是同一種病（加成直接寫回累積欄位、忘了先歸零），
     修法一樣——加總前先歸零。 */
  state.hpRegenMult = 1;
  state.spRegenMult = 1;
  /* 遺物的特殊效果旗標（#113）。跟上面兩行同一個理由放在歸零區：
     卸下遺物就要跟著消失，不能靠「下次算的時候會蓋掉」。 */
  state.relicProcs = {};
  if (typeof activeRelicTiers === 'function') {
    activeRelicTiers().forEach(({ tier }) => { if (tier.proc) state.relicProcs[tier.proc] = true; });
  }
  state.hasAspdFlatPassive = false;
  state.hasAngelusProc = false;
  state.angelusCooldownSec = 10;
  state.hasAutoRevive1 = false;
  state.autoRevive1HpPct = 0;
  state.autoRevive1CooldownSec = 0;
  state.autoRevive1SpCost = 0;
  state.hasAutoRevive2 = false;
  state.autoRevive2HpPct = 0;
  state.autoRevive2CooldownSec = 0;
  if (!state.activeFieldEffects) state.activeFieldEffects = [];
  if (!state.shields) state.shields = [];
  state.hasEnergyCoatUnlock = false;
  state.energyCoatDmgReductionPct = 0;
  state.energyCoatSpCostPct = 0;
  if (typeof state.energyCoatEnabled !== 'boolean') state.energyCoatEnabled = false;
  if (typeof state.energyCoatSpFloorPct !== 'number') state.energyCoatSpFloorPct = 20;
  state.hasOnHitAoeProc = false;
  state.onHitAoeProcChance = 0;
  state.onHitAoeProcMult = 0;
  state.onHitAoeProcElement = 'none';
  state.onHitAoeProcCooldownSec = 5;
  state.hasOnAttackAoeProc = false;
  state.onAttackAoeProcChance = 0;
  state.onAttackAoeFlatDmg = 0;
  state.onAttackAoeMult = 0;
  state.onAttackAoeElement = 'none';
  state.onAttackAoeCooldownSec = 5;
  state.hasPartyAutoCure = false;
  state.partyAutoCureTypes = null;
  state.partyAutoCureCooldownSec = 10;
  state.hasAttackSilenceProc = false;
  state.attackSilenceChance = 0;
  state.attackSilenceCooldownSec = 10;
  state.attackSilenceSec = 8;
  state.hasAutoShield = false;
  state.autoShieldCapacity = 0;
  state.autoShieldCharges = 0;
  state.autoShieldCooldownSec = 20;
  state.hasOnHitAoeStunProc = false;
  state.onHitAoeStunChance = 0;
  state.onHitAoeStunMult = 0;
  state.onHitAoeStunElement = 'none';
  state.onHitAoeStunStunChance = 0;
  state.onHitAoeStunStunSec = 0;
  state.onHitAoeStunCooldownSec = 10;
  state.hasOnHitStunProc2 = false;
  state.onHitStunChance2 = 0;
  state.onHitStunSec2 = 0.5;
  state.onHitStunCooldownSec2 = 10;
  state.hpItemEffectBonusPct = 0;
  state._pitcherPct = 0;        // 兩個藥水投擲取大值後才併進上面那個（#78）
  state.hasBashStunProc = false;
  state.bashStunProcChance = 0;
  state.bashStunProcSec = 1;
  state.hasSpearCounterProc = false;
  state.spearCounterChance = 0;
  state.spearCounterMult = 0;
  state.spearCounterStunSec = 2;
  state.spearCounterCooldownSec = 10;
  state.hasSpearBoomerangProc = false;
  state.spearBoomerangMult = 0;
  state.spearBoomerangCooldownSec = 5;
  state.hasChargeRandomProc = false;
  state.chargeRandomMult = 0;
  state.chargeRandomCooldownSec = 5;
  // 領主騎士被動（#58）
  state.hasFrenzyProc = false;
  state.frenzyChance = 0;
  state.frenzyAtkMult = 2;
  state.frenzyAspdFlat = 0;
  state.frenzyDurSec = 10;
  state.frenzyCdSec = 30;
  state.regenDoubleChance = 0;
  state.regenDoubleMult = 2;
  state.parryingChance = 0;
  state.onAttackStrikes = [];   // 傷害增壓／巧打：普攻追擊，一個技能一筆
  // 十字刺客被動（#59）
  state.physDmgPct = 0;         // 高階拳刃修練：物理傷害 +N%（拳刃限定）
  state.hasEdpProc = false;     // 致命塗毒：敵人中毒時觸發
  state.edpWeaponMult = 1;
  state.edpPoisonMult = 2;
  state.edpDurSec = 10;
  state.edpCdSec = 30;
  state.physAoeStrikes = [];    // 黑暗瞬間：普攻機率觸發的物理範圍追擊
  // 高等巫師被動（#63）
  state.hasGanbantein = false;  // 咖般塔音：帶著兩種魔力礦石時普攻觸發的全體暈眩
  state.ganbanteinChance = 0;
  state.ganbanteinStunMin = 1;
  state.ganbanteinStunMax = 2;
  state.ganbanteinCdSec = 10;
  state.hasMagicCrasher = false;   // 魔擊術：普攻機率追加一發 MATK 傷害
  state.magicCrasherChance = 0;
  state.magicCrasherMult = 1;
  state.magicCrasherCdSec = 5;
  state.spOnKillFlat = 0;          // 吸魂術：擊殺回 SP
  // 高階祭司被動（#64）
  state.skillSpCostPct = 0;        // 魔力減免：技能 SP 消耗 −N%（負值）
  state.healBonusPct = 0;          // 冥想：治癒術恢復量 +N%
  state.skillSpRegenPct = 0;       // 冥想：SP 自然恢復 +N%（技能來源，跟卡片的分開記）
  // 神匠被動（#60）
  state.refineBonusPct = 0;     // 武器精煉：精煉成功率 +N%
  state.hasCartBoost = false;   // 手推車加速：常駐自動觸發的生怪加速
  state.cartBoostMult = 1;
  state.cartBoostDurSec = 60;
  state.cartBoostCdSec = 10;
  // 野蠻凶砍是主動 buff（型別 'meltdown'），機率掛在 buff 上，這裡不需要常駐欄位
  // 十字軍被動（#66）
  state.defenderProcPct = 0;    // 光之盾：受擊觸發時免除的傷害 %
  state.defenderProcCdSec = 5;  // 光之盾：內部冷卻（秒）
  state.defenderAspdPct = 0;    // 光之盾：攻速 −N%（常駐，跟免傷是同一個技能的兩半）
  state.shrinkStunChance = 0;   // 退縮：自動防禦擋下時的暈眩機率
  state.shrinkStunSec = 1;
  // 詩人／舞孃被動（#68）
  state.aoeAilmentProcs = [];   // 冷笑話／驚聲尖叫／醜陋之舞：普攻觸發的全體異常
  state.aoeMagicProcs = [];     // 不諧和音：普攻觸發的全體魔法
  state.dualAilmentProcs = [];  // 陣痛之聲／眨眼之誘：普攻觸發的雙異常
  state.songMaxSpPct = 0;       // 操控樂器／練習舞蹈：最大SP +N%
  state.songAspdPct = 0;
  state.songSpawnSpeedPct = 0;
  // 流氓被動（#69）
  state.stealCoinChance = 0;    // 偷錢：基礎機率
  state.stealCoinDexMax = 0;    // DEX 99 時的額外機率
  state.stealCoinLukMax = 0;    // LUK 99 時的額外機率
  state.stealCoinPct = 10;      // 偷到的金額佔擊殺獎勵的比例
  state.stealCoinCdSec = 5;
  state.stripProcs = [];        // 卸除頭盔／盾牌／鎧甲／武器
  state.fullStrip = null;       // 所有卸除（#79）
  state.preserveOn = false;     // 自由保護（#79）：抄襲可選被動攻擊技
  state.soulCollect = null;     // 狂蓄氣（#79）
  state.palmStrike = null;      // 猛虎硬派山（#79）
  state.tigerFist = null;       // 伏虎拳（#79）
  state.chainCrush = null;      // 氣絕崩擊（#79）
  state.raidProc = null;        // 潛擊
  state.intimidateProc = null;  // 脅持
  state.closeConfineProc = null;// 緊密的約束
  state.plagiarismLv = 0;       // 抄襲：可使用的最高技能等級（0＝沒學）
  /* 武僧被動（#70）。氣球體本身（state.spirits）**不在這裡歸零**——
     那是跨 tick 的資源，跟冷卻時間戳同性質；這裡歸零的只有「技能給的設定值」。 */
  state.spiritsMax = 0;         // 蓄氣：氣球體上限（＝技能等級）
  state.spiritRefillSec = 5;    // 蓄氣：幾秒補 1 顆
  state.absorbSpirits = null;   // 吸氣：普攻回 SP
  state.explosionSpirits = null;// 爆氣：滿球自動啟動
  state.bladeStop = null;       // 真劍百破道：開增傷視窗
  state.tripleAttack = null;    // 六合拳：連段起點
  state.chainCombo = null;      // 連環全身掌
  state.comboFinish = null;     // 猛龍誇強
  state.steelBody = null;       // 金剛不壞
  state.investigate = null;     // 浸透勁
  state.fingerOffensive = null; // 彈指神通
  state.extremityFist = null;   // 阿修羅霸凰拳
  state.balkyoung = null;       // 發勁
  state.kiTranslation = null;   // 振氣注入（等隊伍系統）
  state.monkRegen = null;       // 運氣調息：自然回復加成
  // 賢者被動（#71）
  state.dragonMatkPct = 0;      // 龍知識：對龍族的魔法傷害 +N%
  state.freeCastAutoSpellPct = 0; // 自由施法：自動念咒機率 +N%
  state.sageAutoSpell = null;   // 自動念咒
  state.magicRod = null;        // 魔法懲罰
  state.spellBreaker = null;    // 念咒拆除
  state.dispellProc = null;     // 魔法效果解除
  state.abracadabra = null;     // 隨機技能
  state.elementConverter = null;// 肯貝特武器附魔（面板功能）
  state.elementChanges = {};    // 元素更換：{ fire: {...}, water: {...}, … }
  // 鍊金術士被動（#72）
  state.pharmacyLv = 0;         // 配藥等級＝解鎖表（1 火煙瓶／2 鹽酸瓶／3 植物瓶／4 護貝藥／5~8 四屬抵抗藥水）
  state._alchemyZenyMult = 1;   // 知識藥水＋配藥 Lv9：鍊金術技能的鋅幣倍率（相乘）
  state._homunZenyMult = 1;     // 安息＋復活生命體：生命體召喚再乘一次
  // 智者被動（#76）
  state.fogWall = null;         // 薄霧牆：普攻時全體判定黑暗
  state.soulChange = null;      // 心神互換：普攻機率沉默
  state.soulBurn = null;        // 精神耗弱術：普攻機率沉默＋魔法傷害
  state.mindBreaker = null;     // 精神撼動：普攻機率降對方魔防
  state.doubleCastBonusPct = 0; // 速讀術：雙倍投擲的機率加成
  state.tarotCard = null;       // 命運的塔羅牌（#77）
  state.skillMaxHpFlat = 0;     // 信任：最大HP 固定值
  /* 信任的聖屬性耐性、神祐之光的惡魔種族減傷：**不要另開消費點**。
     卡片那兩桶（cardEleDmgReduce / cardRaceDmgReduce）已經有八個消費者了，
     這裡先收進來，等卡片那邊建好表再合併進去（見下面的「技能來源的減傷併桶」）。 */
  state._skillEleReduce = {};
  state._skillRaceReduce = {};
  state._skillRaceBonus = {};   // 龍知識的對龍族增傷（#71），併進 cardRaceDmgBonus
  // 雙持右手/左手傷害修正：未修練時的預設值（低於Lv1）
  state.rightHandPct = 50;
  state.leftHandPct = 30;
  {
    passiveSourceSkills().forEach(sk => {
      const lv = skillLv(sk.id);
      if (!lv || sk.type !== 'passive') return;
      const val = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      // 取這個等級的欄位值（陣列就取第 lv-1 格，純數字就直接用，沒寫就給預設）
      const at = (k, d) => (Array.isArray(sk[k]) ? sk[k][lv - 1] : (sk[k] != null ? sk[k] : d));
      switch (sk.passiveStat) {
        case 'atkFlat': {
          // 武器限定的熟練度（單手劍／雙手劍／拳刃／鈍器／長矛）：沒拿對武器就不加
          if (!weaponReqMet(sk.requiresWeapon)) break;
          // 天使之擊：官方效果限定對惡魔/不死種族生效，改成攻擊時依目標種族判定，不再全體適用
          if (sk.id === 'angelic') { state.angelicAtkBonus = Math.round(val); break; }
          state.atk += Math.round(val);
          state._atkMastery += Math.round(val);   // 熟練度加成不吃體型/屬性修正
          // 武器修理：附加固定暴擊率加成
          if (sk.critBonus) {
            const cb = Array.isArray(sk.critBonus) ? sk.critBonus[lv - 1] : sk.critBonus;
            state.critRate = Math.min(100, state.critRate + cb);
          }
          // 武器研究：附加固定HIT與鍛造成功率加成
          if (sk.hitBonus) {
            const hb = Array.isArray(sk.hitBonus) ? sk.hitBonus[lv - 1] : sk.hitBonus;
            state.hit += Math.round(hb);
          }
          if (sk.craftBonusExtra) {
            const cbe = Array.isArray(sk.craftBonusExtra) ? sk.craftBonusExtra[lv - 1] : sk.craftBonusExtra;
            state.craftBonusPct += cbe;
          }
          // 武器保有：使速度激發/凶砍持續時間延長
          if (sk.buffDurationBonusPct) {
            const bd = Array.isArray(sk.buffDurationBonusPct) ? sk.buffDurationBonusPct[lv - 1] : sk.buffDurationBonusPct;
            state.hiltBindingDurationBonus = bd / 100;
          }
          break;
        }
        case 'matkFlat': state.matk += Math.round(val); break;
        case 'maxHpMult': state.maxHp = Math.round(state.maxHp * val); break;
        case 'maxSpMult': state.maxSp = Math.round(state.maxSp * val); break;
        case 'critRate': state.critRate = Math.min(100, state.critRate + val); break;
        case 'hitFlat': {
          state.hit += Math.round(val);
          // 蒼鷹之眼：額外附帶固定ASPD加成
          if (sk.id === 'vultureeye' && sk.aspdFlat) {
            const aspdBonus = Array.isArray(sk.aspdFlat) ? sk.aspdFlat[lv - 1] : sk.aspdFlat;
            state.passiveAspdFlat += aspdBonus;
          }
          break;
        }
        case 'fleeFlat': {
          // 殘影：轉職刺客系後改用較高的加成曲線
          let fleeVal = val;
          if (sk.id === 'improvedodge' && sk.assassinMult && state.jobId === 'assassin') {
            fleeVal = Array.isArray(sk.assassinMult) ? sk.assassinMult[lv - 1] : sk.assassinMult;
          }
          state.flee += Math.round(fleeVal);
          break;
        }
        // dexFlat 已在 recomputeDerived 開頭計算並加入 cDex，不再修改 state.stats.dex
        case 'defFlat': {
          // 天使之護：官方效果限定對惡魔/不死種族生效，改成被攻擊時依攻擊者種族判定，不再全體適用
          if (sk.id === 'divineprotection') { state.divineDefBonus = Math.round(val); break; }
          // 技能給的 DEF+N 當硬防（跟裝備同性質）；state.def 之後會重新加總
          state.defHard = (state.defHard || 0) + Math.round(val);
          break;
        }
        case 'spRegen': state.spRegenMult = (state.spRegenMult || 1) * val; break;
        case 'hpRegenMult': {
          state.hpRegenMult = (state.hpRegenMult || 1) * val;
          // 快速恢復：附加HP恢復道具效果加成
          // 累加而不是覆蓋：#72 的知識藥水與藥水投擲寫的是同一個欄位
          if (sk.itemEffectBonus) state.hpItemEffectBonusPct += Array.isArray(sk.itemEffectBonus) ? sk.itemEffectBonus[lv - 1] : sk.itemEffectBonus;
          break;
        }
        case 'hpMoveRegen': state.hpMoveRegen = true; break;
        case 'berserk': state.hasBerserk = true; break;
        case 'bashStunProc': {
          state.hasBashStunProc = true;
          state.bashStunProcChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.bashStunProcSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
          break;
        }
        /* 騎乘術：技能敘述寫的是「生怪速度+25%」，那條在 spawnMonster() 裡看 hasRiding
           判斷（補怪間隔 3000→2250ms、清場後 500→375ms）。
           **這句以前是錯的**：spawnMonster() 實際上是直接查 `learnedSkills['riding']`，
           hasRiding 寫了兩處、讀 0 處。#70 加武僧的弓身彈影時發現，
           兩個消費點都改成讀這個旗標了。
           原本這裡還有一行 state.maxMonsters = Math.max(state.maxMonsters || 1, 1)，
           取大值跟 1 比永遠等於原值，是個從來沒生效過的空動作，已移除。
           沒有改成拉高同屏怪物數是刻意的：場上每一隻怪都會攻擊玩家（gameTick 的
           怪物攻擊迴圈是 forEach 全部），而玩家普攻只打 monsters[0]，
           拉高上限對單體流是純粹挨打，會把一個獎勵技能變成懲罰。 */
        case 'riding': state.hasRiding = true; break;
        case 'cavalierBonus': {
          state.flee += Math.round(val);
          if (sk.atkBonus) { const ab = Array.isArray(sk.atkBonus) ? sk.atkBonus[lv - 1] : sk.atkBonus; state.atk += Math.round(ab); state._atkMastery += Math.round(ab); }
          if (sk.critBonus) { const cb = Array.isArray(sk.critBonus) ? sk.critBonus[lv - 1] : sk.critBonus; state.critRate = Math.min(100, state.critRate + cb); }
          break;
        }
        case 'counterAttack': state.hasCounterAttack = true; state.counterAttackChance = val; break;
        /* 領主騎士三個被動（#58）。

           `frenzyProc` 的 state 名字刻意不叫 berserk——`state.hasBerserk` 已經被
           劍士的「狂暴狀態」佔用了（HP<25% 時 DEF−55%），那是完全不同的東西。 */
        case 'frenzyProc': {
          state.hasFrenzyProc = true;
          state.frenzyChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.frenzyAtkMult = val;
          state.frenzyAspdFlat = Array.isArray(sk.aspdFlat) ? sk.aspdFlat[lv - 1] : (sk.aspdFlat || 0);
          state.frenzyDurSec = Array.isArray(sk.duration) ? sk.duration[lv - 1] : (sk.duration || 10);
          state.frenzyCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 30);
          break;
        }
        case 'regenDoubleProc': {
          state.regenDoubleChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.regenDoubleMult = val;
          break;
        }
        // 雙劍挌擋：只有真的拿著雙手劍才算，所以武器條件在這裡就先判掉
        case 'parryingProc': {
          state.parryingChance = weaponReqMet(sk.requiresWeapon) ? val : 0;
          break;
        }
        /* 詩人／舞孃的普攻觸發被動（#68）。

           官方這幾個都是主動技（冷笑話、驚聲尖叫、不諧和音、醜陋之舞是範圍弱化／演奏技，
           陣痛之聲與眨眼之誘是 maxLv 0 的未開放技能）。使用者 2026-08-09 指定
           全部改成**普通攻擊觸發的被動**，各自帶內部冷卻。
           結構照十字刺客的 onAttackPhysAoeProc：一個技能一筆，各擲各的。 */
        case 'onAttackAoeAilment': {
          state.aoeAilmentProcs.push({
            id: sk.id, name: sk.name,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            ailment: sk.ailment,
            sec: Array.isArray(sk.ailSec) ? sk.ailSec[lv - 1] : (sk.ailSec || 1),
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5),
          });
          break;
        }
        case 'onAttackAoeMagic': {
          state.aoeMagicProcs.push({
            id: sk.id, name: sk.name,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            mult: val,
            element: sk.element || 'neutral',
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5),
          });
          break;
        }
        // 陣痛之聲／眨眼之誘：打單體，兩種異常各擲一次（可能同時中）
        case 'onAttackDualAilment': {
          state.dualAilmentProcs.push({
            id: sk.id, name: sk.name,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            ailments: sk.ailments || [],
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 0),
          });
          break;
        }
        /* 操控樂器／練習舞蹈：官方是「最大SP +N%、該武器 ATK +N、攻速 +N%」，
           舞孃那個第三欄是暴擊而不是攻速。移速照既定慣例改成生怪加速。 */
        case 'songMastery': {
          state.songMaxSpPct += val;
          if (weaponReqMet(sk.requiresWeapon)) {
            const a = Array.isArray(sk.atkFlat) ? sk.atkFlat[lv - 1] : (sk.atkFlat || 0);
            if (a) { state.atk += Math.round(a); state._atkMastery += Math.round(a); }
            const asp = Array.isArray(sk.aspdPct) ? sk.aspdPct[lv - 1] : (sk.aspdPct || 0);
            if (asp) state.songAspdPct += asp;
            const cr = Array.isArray(sk.critFlat) ? sk.critFlat[lv - 1] : (sk.critFlat || 0);
            if (cr) state.critRate = Math.min(100, state.critRate + cr);
          }
          const sp = Array.isArray(sk.spawnSpeedPct) ? sk.spawnSpeedPct[lv - 1] : (sk.spawnSpeedPct || 0);
          if (sp) state.songSpawnSpeedPct += sp;
          break;
        }
        /* 流氓的被動（#69）。九個官方主動技全部改成普攻觸發，判定寫在 tryRogueProcs()，
           這裡只負責把數字放上去。 */
        case 'snatcher': {          // 強奪：併進既有的偷竊機率，不另開欄位
          state.stealChance += val;
          break;
        }
        case 'stealCoin': {
          state.stealCoinChance += val;
          state.stealCoinDexMax = Array.isArray(sk.dexMaxBonus) ? sk.dexMaxBonus[lv - 1] : (sk.dexMaxBonus || 0);
          state.stealCoinLukMax = Array.isArray(sk.lukMaxBonus) ? sk.lukMaxBonus[lv - 1] : (sk.lukMaxBonus || 0);
          state.stealCoinPct = sk.stealPct || 10;
          state.stealCoinCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          break;
        }
        case 'stripProc': {
          state.stripProcs.push({
            id: sk.id, name: sk.name, label: sk.stripLabel || '能力',
            chance: val,
            kind: sk.stripKind, mult: Array.isArray(sk.stripMult) ? sk.stripMult[lv - 1] : sk.stripMult,
            fallbackMult: sk.stripFallbackMult,
            durSec: Array.isArray(sk.stripDuration) ? sk.stripDuration[lv - 1] : sk.stripDuration,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5),
          });
          break;
        }
        case 'fullStrip': {
          state.fullStrip = { chance: val, durSec: at('duration', 75), cdSec: at('internalCooldown', 5) };
          break;
        }
        case 'preserve': { state.preserveOn = true; break; }
        // ---- 武術宗師（#79）----
        case 'soulCollect': {
          state.soulCollect = { chance: val, cdSec: at('internalCooldown', 5) };
          break;
        }
        case 'palmStrike': {
          state.palmStrike = {
            name: sk.name, mult: val, strScale: sk.strScale || 200,
            chance: at('chance', 20), stunSec: at('stunSec', 1),
            chainChance: at('chainChance', 20), cdSec: at('internalCooldown', 5),
          };
          break;
        }
        case 'tigerFist': {
          state.tigerFist = {
            name: sk.name, mult: val, cost: sk.cost || 1,
            chance: at('chance', 20), stunChance: at('stunChance', 20), stunSec: at('stunSec', 2),
            chainChance: at('chainChance', 20),
          };
          break;
        }
        case 'chainCrush': {
          state.chainCrush = {
            name: sk.name, mult: val, cost: sk.cost || 1, chance: at('chance', 20),
          };
          break;
        }
        case 'critPct': {           // 潛遁：官方是隱匿中的移速，本作改成暴擊率
          state.critRate = Math.min(100, state.critRate + val);
          break;
        }
        case 'raidProc': {
          state.raidProc = {
            name: sk.name, mult: val,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            ailChance: Array.isArray(sk.ailChance) ? sk.ailChance[lv - 1] : sk.ailChance,
            dmgTakenPct: sk.dmgTakenPct || 30,
            boostSec: sk.boostSec || 10,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10),
          };
          break;
        }
        case 'intimidateProc': {
          state.intimidateProc = {
            name: sk.name, mult: val,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5),
          };
          break;
        }
        case 'closeConfineProc': {
          state.closeConfineProc = {
            name: sk.name,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            enemyFleeCut: Array.isArray(sk.enemyFleeCut) ? sk.enemyFleeCut[lv - 1] : sk.enemyFleeCut,
            selfFlee: Array.isArray(sk.selfFlee) ? sk.selfFlee[lv - 1] : sk.selfFlee,
            durSec: Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10),
          };
          break;
        }
        /* 抄襲：官方是「記住最後一個打到你的技能」。使用者 2026-08-10 改成
           **自己挑一個攻擊技能**，等級上限就是抄襲的等級。
           挑哪一個存在 `state.plagiarismSkillId`，這裡只記上限與攻速。 */
        case 'plagiarism': {
          state.plagiarismLv = lv;
          const asp = Array.isArray(sk.aspdPct) ? sk.aspdPct[lv - 1] : (sk.aspdPct || 0);
          if (asp) state.songAspdPct += asp;
          break;
        }
        case 'shopDiscount': {      // 強制減價：併進既有的商人折扣
          state.shopDiscountMult *= Math.max(0, 1 - val / 100);
          break;
        }
        /* ---------------- 武僧的被動（#70）----------------
           官方 17 個技能全做。使用者 2026-08-10 指定除了少數例外全部被動化，
           判定分成三處：tickSpirits()（補球、爆氣、金剛不壞）、
           tryMonkProcs()（普攻觸發）、tryMonkCombo()（連段串接）。
           這裡一律只負責把數字放上去。 */
        case 'callSpirits': {
          state.spiritsMax = Math.max(state.spiritsMax, Math.round(val));
          state.spiritRefillSec = sk.refillSec || 5;
          /* 每顆氣球體 ATK +3。氣球體數量每 5 秒會變，而 recomputeDerived 每個 tick
             都會重跑，所以這裡直接讀當下的顆數就會自動跟著加減。 */
          const per = sk.atkPerSphere || 0;
          const bonus = Math.round(per * Math.min(state.spirits || 0, state.spiritsMax));
          if (bonus) { state.atk += bonus; state._atkMastery += bonus; }
          break;
        }
        case 'absorbSpirits': {
          state.absorbSpirits = {
            name: sk.name, chance: val,
            spGain: Array.isArray(sk.spGain) ? sk.spGain[lv - 1] : sk.spGain,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 3),
          };
          break;
        }
        case 'explosionSpirits': {
          state.explosionSpirits = {
            name: sk.name, critFlat: val, cost: sk.spiritCost || 5,
            durSec: Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration,
            spRegenPct: sk.spRegenPct || 0,
          };
          break;
        }
        case 'bladeStop': {
          state.bladeStop = {
            name: sk.name, dmgBonusPct: val, cost: sk.spiritCost || 1,
            durSec: Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        /* 運氣調息：官方是坐著時的額外回復。併進自然回復的每 tick 量
           （跟禪心同一個位置），所以不會另開一條回血心跳。 */
        case 'spiritsRecovery': {
          state.monkRegen = {
            hpFlat: Array.isArray(sk.hpFlat) ? sk.hpFlat[lv - 1] : sk.hpFlat,
            hpPct: Array.isArray(sk.hpPct) ? sk.hpPct[lv - 1] : sk.hpPct,
            spFlat: Array.isArray(sk.spFlat) ? sk.spFlat[lv - 1] : sk.spFlat,
            spPct: Array.isArray(sk.spPct) ? sk.spPct[lv - 1] : sk.spPct,
          };
          break;
        }
        case 'tripleAttack': {
          state.tripleAttack = {
            name: sk.name, mult: val, hits: sk.hits || 3,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
          };
          break;
        }
        case 'chainCombo': {
          state.chainCombo = {
            name: sk.name, mult: val, hits: sk.hits || 4,
            knuckleHits: sk.knuckleHits || 6, knuckleMult: sk.knuckleMult || 2,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
          };
          break;
        }
        case 'comboFinish': {
          state.comboFinish = {
            name: sk.name, mult: val, cost: sk.spiritCost || 1,
            strScale: sk.strScale || 200,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
          };
          break;
        }
        case 'steelBody': {
          state.steelBody = {
            name: sk.name, cutPct: val, cost: sk.spiritCost || 5,
            durSec: Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        case 'investigate': {
          state.investigate = {
            name: sk.name, mult: val, defScale: sk.defScale || 100,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        case 'fingerOffensive': {
          state.fingerOffensive = {
            name: sk.name, mult: val,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        case 'extremityFist': {
          state.extremityFist = {
            name: sk.name, mult: val, cost: sk.spiritCost || 5,
            spScale: sk.spScale || 100,
            flat: Array.isArray(sk.flatBonus) ? sk.flatBonus[lv - 1] : sk.flatBonus,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            /* 直發機率（方案C）：爆氣中普攻直接發動，不走前置連段。 */
            directChance: Array.isArray(sk.directChance) ? sk.directChance[lv - 1] : (sk.directChance || 20),
          };
          break;
        }
        /* 弓身彈影：官方是瞬移。位移做不了，使用者指定「比照騎乘術」——
           所以直接點亮騎乘術那個旗標，生怪加速那段在 spawnMonster() 裡本來就在跑，
           不必再開一條平行的加速管線。 */
        case 'bodyRelocation': state.hasRiding = true; break;
        case 'balkyoung': {
          state.balkyoung = {
            name: sk.name, mult: val,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            hpCost: Array.isArray(sk.hpCost) ? sk.hpCost[lv - 1] : sk.hpCost,
            stunChance: Array.isArray(sk.stunChance) ? sk.stunChance[lv - 1] : sk.stunChance,
            stunSec: Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : sk.stunSec,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10),
          };
          break;
        }
        case 'kiTranslation': {
          state.kiTranslation = {
            name: sk.name,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        /* ---------------- 賢者的被動（#71）----------------
           判定分成三處：trySageProcs()（普攻觸發）、tickConverter()（肯貝特自動維持）、
           tryMagicRod()（受怪物技能攻擊時）。這裡一律只負責把數字放上去。 */
        // 進化之書：書本 ATK 與攻速。攻速併進 songAspdPct 那條技能層，不另開一層
        case 'advancedBook': {
          if (!weaponReqMet(sk.requiresWeapon)) break;
          state.atk += Math.round(val);
          state._atkMastery += Math.round(val);
          const asp = Array.isArray(sk.aspdPct) ? sk.aspdPct[lv - 1] : (sk.aspdPct || 0);
          if (asp) state.songAspdPct += asp;
          break;
        }
        /* 龍知識：官方四欄。物理與耐性併進卡片那兩桶（消費者一堆，不必新開），
           MATK 那欄在 skillBaseDamage() 接，INT 直接加。 */
        case 'dragonology': {
          /* **不可以直接寫 state.cardRaceDmgBonus** ——那個物件在這個迴圈之後才被
             `= {}` 重建（卡片那一段），寫進去會被整個蓋掉。用暫存桶，
             跟 `_skillRaceReduce` 同一個手法，在卡片那段之後才併進去。
             INT 那欄用既有的 `sk.intBonus` 掛鉤（recomputeDerived 開頭那個素質迴圈），
             那裡才記得到帳，角色分頁才看得到「這 +3 是龍知識給的」。 */
          state._skillRaceBonus.dragon = (state._skillRaceBonus.dragon || 0) + val / 100;
          state._skillRaceReduce.dragon = (state._skillRaceReduce.dragon || 0) + val / 100;
          state.dragonMatkPct += Array.isArray(sk.matkPct) ? sk.matkPct[lv - 1] : (sk.matkPct || 0);
          break;
        }
        case 'freeCast': {
          state.freeCastAutoSpellPct += val;
          const asp = Array.isArray(sk.aspdPct) ? sk.aspdPct[lv - 1] : (sk.aspdPct || 0);
          if (asp) state.songAspdPct += asp;
          break;
        }
        case 'sageAutoSpell': {
          state.sageAutoSpell = {
            name: sk.name, chance: val, lv,
            spCostPct: sk.spCostPct || 67,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 3),
          };
          break;
        }
        case 'magicRod': {
          state.magicRod = {
            name: sk.name, chance: val,
            spGain: Array.isArray(sk.spGain) ? sk.spGain[lv - 1] : sk.spGain,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        case 'spellBreaker': {
          state.spellBreaker = {
            name: sk.name, chance: val, hpPct: sk.hpPct || 2,
            spGain: Array.isArray(sk.spGain) ? sk.spGain[lv - 1] : sk.spGain,
            stunSec: Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1),
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
          };
          break;
        }
        case 'dispellProc': {
          state.dispellProc = {
            name: sk.name, successPct: val,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
            costItems: sk.costItems || [], costQty: sk.costQty || 1,
          };
          break;
        }
        case 'abracadabra': {
          state.abracadabra = {
            name: sk.name, castLv: Math.round(val),
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
            costItems: sk.costItems || [], costQty: sk.costQty || 2,
          };
          break;
        }
        case 'elementConverter': {
          state.elementConverter = {
            name: sk.name,
            durSec: Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration,
            goldFallback: sk.goldFallback || 0,
          };
          break;
        }
        /* 四個元素更換共用這個 case，只有 element 不同。
           實際會觸發的是玩家在自動戰鬥面板選的那一個（`state.elementChangePick`）。 */
        /* ---------------- 鍊金術士的被動（#72）----------------
           這個職業的技能幾乎全部要花鋅幣，所以三個被動都在做同一件事：把價錢壓下來。
           折扣本身**不在這裡寫進 zenyCostReductionPct**——那張表在這個迴圈之前就被
           `= {}` 重建了，而且 castSkill 是按技能 id 查的，要等所有被動都掃完才算得出來。
           先累加到暫存欄位，迴圈之後再一次寫進去。 */
        case 'learningPotion': {
          // 藥效那半併進既有的 hpItemEffectBonusPct（快速恢復在用同一個欄位）
          state.hpItemEffectBonusPct = (state.hpItemEffectBonusPct || 0) + val;
          state._alchemyZenyMult *= 1 - (Array.isArray(sk.zenyCut) ? sk.zenyCut[lv - 1] : (sk.zenyCut || 0)) / 100;
          break;
        }
        case 'pharmacy': {
          state.pharmacyLv = Math.max(state.pharmacyLv, lv);
          state._alchemyZenyMult *= 1 - val / 100;   // Lv9 起 −30%
          break;
        }
        /* 藥水投擲與纖細藥水投擲（#78）都是「喝藥回復量」，**取大值不相加**——
           相加會得到 110%+150% 這種官方任何一級都沒有的數字。
           快速恢復那條走 hpItemEffectBonusPct 的另一個入口，不受影響。 */
        case 'potionPitcher': {
          state._pitcherPct = Math.max(state._pitcherPct || 0, val);
          break;
        }
        case 'homunDiscount': {
          state._homunZenyMult *= 1 - val / 100;
          break;
        }
        case 'bioethics': break;   // 官方就寫「沒有任何效能」，只是技能樹的起頭
        case 'elementChange': {
          state.elementChanges[sk.element] = {
            id: sk.id, name: sk.name, element: sk.element, chance: val,
            durSec: Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown,
            costItems: sk.costItems || [], goldFallback: sk.goldFallback || 0,
          };
          break;
        }
        /* 十字軍兩個被動（#66）。 */
        /* 光之盾：官方是主動 buff、只擋遠距離物理（−20%~−80%）＋攻速懲罰。
           本作怪物沒有遠近之分，照抄就是全域減傷 80%；使用者指定改成被動、免傷砍半到 10%~40%、
           攻速懲罰照官方保留。盾牌條件在這裡就判掉——跟雙劍挌擋同一個寫法，
           沒拿盾時兩個欄位都留 0，攻速與減傷自動回到沒點技能的狀態。 */
        case 'defenderPassive': {
          if (!equipReqMet(sk.requiresEquip)) break;
          state.defenderProcPct += val;
          state.defenderProcCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          state.defenderAspdPct += Array.isArray(sk.aspdPenalty) ? sk.aspdPenalty[lv - 1] : (sk.aspdPenalty || 0);
          break;
        }
        /* 信任：最大HP 固定值 +200~2000、聖屬性耐性 +5%~50%。
           HP 加在這裡（卡片的 %HP 加成在後面才乘），耐性收進暫存桶等下併進卡片那桶。 */
        /* 退縮：官方是「自動防禦成功時 50% 機率暈眩對方」的開關技能。
           判定寫在 tryShrinkStun()，這裡只負責把數字放上去。 */
        case 'shrinkStun': {
          state.shrinkStunChance = val;
          state.shrinkStunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
          break;
        }
        case 'trustPassive': {
          state.skillMaxHpFlat += Math.round(val);
          const hr = Array.isArray(sk.holyResist) ? sk.holyResist[lv - 1] : (sk.holyResist || 0);
          if (hr) state._skillEleReduce.holy = (state._skillEleReduce.holy || 0) + hr / 100;
          break;
        }
        /* 智者（#76）的四個普攻觸發被動。全部只在這裡放數字，判定在 tryProfessorProcs()。
           內部冷卻共用 `state.songProcReadyAt` 那張表（詩人開的，流氓、賢者都在用），
           不另開一份計時器。 */
        case 'fogWall': {
          state.fogWall = { chance: val, sec: at('ailSec', 2), cdSec: at('internalCooldown', 10) };
          break;
        }
        case 'soulChange': {
          state.soulChange = { chance: val, sec: at('ailSec', 1), cdSec: at('internalCooldown', 5) };
          break;
        }
        case 'soulBurn': {
          state.soulBurn = {
            chance: val, sec: at('ailSec', 1), dmgMult: at('dmgMult', 1),
            element: sk.element || 'ghost', cdSec: at('internalCooldown', 10),
          };
          break;
        }
        case 'mindBreaker': {
          state.mindBreaker = {
            chance: val, cut: at('mdefCut', 0),
            durSec: at('duration', 10), cdSec: at('internalCooldown', 10),
          };
          break;
        }
        // 速讀術：本身沒有效果，只是把雙倍投擲的機率往上加（見 tryDoubleCast）
        case 'memorize': { state.doubleCastBonusPct += val; break; }
        // 命運的塔羅牌（#77）：普攻觸發，效果表見 TAROT_CARDS
        case 'tarotCard': {
          state.tarotCard = { chance: val, cdSec: at('internalCooldown', 10) };
          break;
        }
        /* 傷害增壓與巧打（#58 二版）：普攻命中後機率追加一段傷害＋異常狀態。
           兩個技能共用這個型別，各自一筆設定、各自一組內部冷卻，
           所以同時點滿也是各擲各的、不會互相排擠。 */
        case 'onAttackStrikeProc': {
          if (!weaponReqMet(sk.requiresWeapon)) break;
          state.onAttackStrikes.push({
            id: sk.id,
            name: sk.name,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            mult: val,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5),
            inflict: sk.inflict || null,
            lv,
          });
          break;
        }
        /* 十字刺客三個被動（#59）。 */
        // 高階拳刃修練：官方是「以拳刃攻擊時物理傷害 +12~20%」，所以是傷害%不是 ATK 固定值，
        // 而且普攻與物理技能都算——套在 weaponChainDamage() 的尾端，兩邊自動一致
        case 'physDmgPct': {
          if (!weaponReqMet(sk.requiresWeapon)) break;
          state.physDmgPct += val;
          break;
        }
        /* 致命塗毒：官方是主動 buff、消耗毒藥瓶×1。使用者改成**被動**——
           打到中毒的敵人時觸發，身上要有毒藥瓶但**不消耗**（瓶子當門票不當彈藥）。 */
        case 'edpProc': {
          state.hasEdpProc = true;
          state.edpWeaponMult = val;
          state.edpPoisonMult = Array.isArray(sk.poisonDmgMult) ? sk.poisonDmgMult[lv - 1] : (sk.poisonDmgMult || 2);
          state.edpDurSec = Array.isArray(sk.duration) ? sk.duration[lv - 1] : (sk.duration || 10);
          state.edpCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 30);
          break;
        }
        /* 黑暗瞬間：官方是主動範圍技，使用者改成普攻觸發的被動。
           結構照 onAttackStrikeProc（一個技能一筆＋各自的內部冷卻），差別是打全場不是打單體。 */
        case 'onAttackPhysAoeProc': {
          if (!weaponReqMet(sk.requiresWeapon)) break;
          state.physAoeStrikes.push({
            id: sk.id,
            name: sk.name,
            chance: Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance,
            mult: val,
            cdSec: Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 0),
            inflict: sk.inflict || null,
            element: sk.element || 'neutral',
            lv,
          });
          break;
        }
        /* 神匠三個被動（#60）。 */
        // 武器精煉：官方是「自己也能精煉，JOB50 後每級 +0.5%」。本作本來就是自己按精煉，
        // 那半邊的價值天生沒有，所以只留成功率加成——使用者指定 Lv10 給 +10%
        case 'refineBonus': { state.refineBonusPct += val; break; }
        /* 手推車加速：官方是移速 +20% 的主動 buff。本作沒有移動，比照騎乘術與月夜貓
           改成**生怪加速**，並照使用者指定做成「自己會續」的被動：60 秒持續、10 秒冷卻。 */
        case 'cartBoost': {
          state.hasCartBoost = true;
          state.cartBoostMult = val;
          state.cartBoostDurSec = Array.isArray(sk.duration) ? sk.duration[lv - 1] : (sk.duration || 60);
          state.cartBoostCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
        /* 高等巫師三個被動（#63）。 */
        /* 咖般塔音：官方是「消耗兩種魔力礦石，消除地面效果」。
           本作的地面效果全是玩家自己放的、怪物又沒有地面技能（#36 已列永久 N/A），
           等於**沒有可以作用的對象**。使用者改成「帶著兩種礦石時，普攻機率全體暈眩」——
           礦石從消耗品變成門票，跟致命塗毒的毒藥瓶同一個形狀。 */
        case 'ganbanteinProc': {
          state.hasGanbantein = true;
          state.ganbanteinChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.ganbanteinStunMin = sk.stunSecMin || 1;
          state.ganbanteinStunMax = sk.stunSecMax || 2;
          state.ganbanteinCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
        // 魔擊術：官方是主動的「拿 MATK 當數值、走物理傷害流程」，使用者改成普攻觸發的被動
        case 'magicCrasherProc': {
          state.hasMagicCrasher = true;
          state.magicCrasherChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.magicCrasherMult = val;
          state.magicCrasherCdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          break;
        }
        /* 吸魂術：最大SP +2~20% ＋ 擊殺回 SP。
           官方的回復量是「依對方等級 × 110~245%」而且限單體技能／普攻擊殺，
           使用者改成固定 5~50 SP、不分擊殺方式——`killMonster()` 不知道是誰打死的，
           要傳「擊殺來源」得動到十幾個呼叫點，代價跟收益不成比例。 */
        case 'soulDrain': {
          state.maxSp = Math.round(state.maxSp * val);
          state.spOnKillFlat += Array.isArray(sk.spOnKill) ? sk.spOnKill[lv - 1] : (sk.spOnKill || 0);
          break;
        }
        /* 高階祭司兩個被動（#64）。 */
        // 魔力減免：技能 SP 消耗 −4~20%。資料寫正值，這裡轉成負的接進 skillSpCost()
        case 'skillSpCostReduce': {
          state.skillSpCostPct -= val;
          break;
        }
        /* 冥想：最大SP +1~10%、SP 自然恢復 +3~30%、治癒術恢復量 +2~20%。
           三件事一個被動包辦，所以不共用 maxSpMult/zenRecovery，自己一個 case。 */
        case 'meditatio': {
          state.maxSp = Math.round(state.maxSp * (1 + val / 100));
          /* **不要寫進 `state.spRegenPct`** ——那個名字看起來對，但沒有任何地方讀它
             （自然回復讀的是 `cardSpRegenPct`），寫進去就是第五次「推了沒人讀」。
             這裡開一個自己的鍵，消費端在 tickRegen() 一起接。 */
          state.skillSpRegenPct += Array.isArray(sk.spRegenPct) ? sk.spRegenPct[lv - 1] : (sk.spRegenPct || 0);
          state.healBonusPct += Array.isArray(sk.healPct) ? sk.healPct[lv - 1] : (sk.healPct || 0);
          break;
        }
        case 'spearCounterProc': {
          state.hasSpearCounterProc = true;
          state.spearCounterChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.spearCounterMult = val;
          state.spearCounterStunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 2);
          state.spearCounterCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
        case 'spearBoomerangProc': {
          state.hasSpearBoomerangProc = true;
          state.spearBoomerangMult = val;
          state.spearBoomerangCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          break;
        }
        case 'chargeRandomProc': {
          state.hasChargeRandomProc = true;
          state.chargeRandomMult = val;
          state.chargeRandomCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          break;
        }
        case 'steal': state.stealChance = val; break;
        case 'doubleAttack': {
          // 二刀連擊：額外附帶永久命中加成
          if (sk.hitBonus) {
            const hb = Array.isArray(sk.hitBonus) ? sk.hitBonus[lv - 1] : sk.hitBonus;
            state.hit += Math.round(hb);
          }
          break;
        }
        case 'autoDetox': {
          state.hasAutoDetox = true;
          state.autoDetoxCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 30);
          break;
        }
        case 'sandmanProc': {
          state.hasSandmanProc = true;
          state.sandmanProcChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.sandmanHitDebuff = Array.isArray(sk.hitDebuff) ? sk.hitDebuff[lv - 1] : sk.hitDebuff;
          state.sandmanDebuffDuration = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
          break;
        }
        case 'backslideDodge': {
          state.hasBackslideDodge = true;
          state.backslideDodgeChance = Array.isArray(sk.dodgeChance) ? sk.dodgeChance[lv - 1] : sk.dodgeChance;
          break;
        }
        case 'rightHandPct': state.rightHandPct = val; break;
        case 'leftHandPct': state.leftHandPct = val; break;
        case 'poisonReact': {
          state.hasPoisonReact = true;
          state.poisonReactMult = val;
          state.poisonReactCooldownSec = sk.internalCooldown || 10;
          break;
        }
        case 'venomdustProc': {
          state.hasVenomdustProc = true;
          state.venomdustDmgPct = val;
          state.venomdustCooldownSec = sk.internalCooldown || 10;
          break;
        }
        case 'venominfusionProc': {
          state.hasVenominfusionProc = true;
          state.venominfusionDmgMult = val;
          state.venominfusionProcChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.venominfusionCooldownSec = sk.internalCooldown || 10;
          break;
        }
        case 'sonicblowBoost': state.hasSonicblowBoost = true; break;
        case 'falconFlatBonus': state.falconFlatBonus = val; break;
        case 'animalDamageFlat': state.animalDamageFlat = val; break;
        case 'trapCdReduction': state.trapCdReductionSec = val; break;
        case 'trapChanceBonus': state.trapChanceBonusPct = val; break;
        case 'huntingMastery': break; // 馴鷹術本身無效果，僅作為前置解鎖
        case 'discount': state.shopDiscountMult = val; break;
        case 'overcharge': state.shopOverchargeMult = val; break;
        case 'autoCartItem': {
          state.hasAutoCartItem = true;
          state.cartItemIntervalSec = Array.isArray(sk.intervalSec) ? sk.intervalSec[lv - 1] : sk.intervalSec;
          state.cartItemPool = Array.isArray(sk.itemPools) ? sk.itemPools[lv - 1] : ['carrot'];
          break;
        }
        case 'cartDmgBonus': state.cartDmgBonusMult = val; break;
        case 'vending': break; // 露天商店本身不影響數值，實際邏輯在 tryAutoVending()
        case 'craftBonus': state.craftBonusPct += val; break;
        case 'weaponCraft': {
          if (sk.craftCategory) state.unlockedCraftCategories.push(sk.craftCategory);
          break;
        }
        case 'materialCraft': {
          if (sk.craftCategory) state.unlockedMaterialCrafts.push(sk.craftCategory);
          break;
        }
        case 'fireResist': {
          state.fireResistPct = val;
          if (sk.neutralResistMult) {
            const nv = Array.isArray(sk.neutralResistMult) ? sk.neutralResistMult[lv - 1] : sk.neutralResistMult;
            state.neutralResistPct = nv;
          }
          break;
        }
        case 'findingoreProc': {
          state.hasFindingOreProc = true;
          state.findingOreChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          break;
        }
        case 'greedProc': {
          state.hasGreedProc = true;
          state.greedChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          break;
        }
        case 'hammerfallProc': {
          state.hasHammerfallProc = true;
          state.hammerfallSingleChance = Array.isArray(sk.singleStunChance) ? sk.singleStunChance[lv - 1] : sk.singleStunChance;
          state.hammerfallAoeChance = Array.isArray(sk.aoeStunChance) ? sk.aoeStunChance[lv - 1] : sk.aoeStunChance;
          state.hammerfallStunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
          break;
        }
        case 'zenyCostReduction': {
          // 詭計的商術：目前僅套用於金錢攻擊(mammonite)，手推車終結技留待未來新職業加入後再接上
          state.zenyCostReductionPct['mammonite'] = val;
          break;
        }
        case 'onHitStunProc': {
          state.hasOnHitStunProc = true;
          state.onHitStunChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.onHitStunSec = sk.stunSec || 0.5;
          state.onHitStunCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
        case 'zenRecovery': {
          state.zenSpFlatBonus = val;
          if (sk.spPctBonus) state.zenSpPctBonus = Array.isArray(sk.spPctBonus) ? sk.spPctBonus[lv - 1] : sk.spPctBonus;
          if (sk.itemEffectBonus) state.spItemEffectBonusPct = Array.isArray(sk.itemEffectBonus) ? sk.itemEffectBonus[lv - 1] : sk.itemEffectBonus;
          break;
        }
        case 'energyCoatUnlock': {
          state.hasEnergyCoatUnlock = true;
          state.energyCoatDmgReductionPct = Array.isArray(sk.dmgReductionPct) ? sk.dmgReductionPct[lv - 1] : sk.dmgReductionPct;
          state.energyCoatSpCostPct = Array.isArray(sk.spCostPct) ? sk.spCostPct[lv - 1] : sk.spCostPct;
          break;
        }
        case 'aspdFlat': {
          state.hasAspdFlatPassive = true;
          state.passiveAspdFlat += val;
          break;
        }
        case 'angelusProc': {
          state.hasAngelusProc = true;
          state.angelusCooldownSec = sk.angelusCooldownSec || 10;
          break;
        }
        /* 沉默之術（#95）：官方是主動的單體沉默，使用者指定改成普攻機率觸發的被動。
           冷卻是「這個被動自己的」內部冷卻，不佔技能冷卻表。 */
        /* 治療術（#97）：官方是主動的單體解狀態，使用者指定改成
           「全隊有人中沉默／混亂／黑暗就自動解除」的被動。 */
        case 'partyAutoCure': {
          state.hasPartyAutoCure = true;
          state.partyAutoCureTypes = sk.cureTypes || ['silence', 'confusion', 'blind'];
          state.partyAutoCureCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
        case 'onAttackSilenceProc': {
          state.hasAttackSilenceProc = true;
          state.attackSilenceChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.attackSilenceCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          state.attackSilenceSec = sk.silenceSec || 8;
          break;
        }
        case 'onDeathRevive1': {
          state.hasAutoRevive1 = true;
          state.autoRevive1HpPct = Array.isArray(sk.revivePct) ? sk.revivePct[lv - 1] : sk.revivePct;
          state.autoRevive1CooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown;
          state.autoRevive1SpCost = Array.isArray(sk.reviveSpCost) ? sk.reviveSpCost[lv - 1] : (sk.reviveSpCost || 0);
          break;
        }
        case 'onDeathRevive2': {
          state.hasAutoRevive2 = true;
          state.autoRevive2HpPct = Array.isArray(sk.revivePct) ? sk.revivePct[lv - 1] : sk.revivePct;
          state.autoRevive2CooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : sk.internalCooldown;
          break;
        }
        case 'onHitAoeProc': {
          state.hasOnHitAoeProc = true;
          state.onHitAoeProcChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.onHitAoeProcMult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
          state.onHitAoeProcElement = sk.element || 'none';
          state.onHitAoeProcCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          break;
        }
        case 'onAttackAoeProc': {
          state.hasOnAttackAoeProc = true;
          state.onAttackAoeProcChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          // 火柱攻擊在本作做成被動（普攻機率觸發），不走 castSkill，
          // 所以卡片的 skillDmg_firepillar 要在這裡自己套上去
          {
            const fpBonus = 1 + getCardBonus('skillDmg_' + sk.id) / 100;
            state.onAttackAoeFlatDmg = Math.round((Array.isArray(sk.flatDmg) ? sk.flatDmg[lv - 1] : (sk.flatDmg || 0)) * fpBonus);
            state.onAttackAoeMult = (Array.isArray(sk.mult) ? sk.mult[lv - 1] : (sk.mult || 0)) * fpBonus;
          }
          state.onAttackAoeElement = sk.element || 'none';
          state.onAttackAoeCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 5);
          break;
        }
        case 'autoShield': {
          state.hasAutoShield = true;
          state.autoShieldCapacity = Array.isArray(sk.shieldCapacityFlat) ? sk.shieldCapacityFlat[lv - 1] : sk.shieldCapacityFlat;
          state.autoShieldCharges = Array.isArray(sk.shieldCharges) ? sk.shieldCharges[lv - 1] : sk.shieldCharges;
          state.autoShieldCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 20);
          break;
        }
        case 'onHitAoeStunProc': {
          state.hasOnHitAoeStunProc = true;
          state.onHitAoeStunChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.onHitAoeStunMult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
          state.onHitAoeStunElement = sk.element || 'none';
          state.onHitAoeStunStunChance = Array.isArray(sk.stunChance) ? sk.stunChance[lv - 1] : (sk.stunChance || 0);
          state.onHitAoeStunStunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
          state.onHitAoeStunCooldownSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
        case 'onHitStunProc2': {
          state.hasOnHitStunProc2 = true;
          state.onHitStunChance2 = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
          state.onHitStunSec2 = sk.stunSec ? (Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : sk.stunSec) : 0.5;
          state.onHitStunCooldownSec2 = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
          break;
        }
      }
    });
  }

  // 卡片加成 — 固定值（僅影響衍生數值，不修改 base stats 避免累加）
  // 裝備與卡片的 ATK 算「裝備攻擊力」，跟武器本體同一桶，會吃體型與屬性修正
  const gearAtk = getCardBonus('atk') + equippedStatBonus('atk');
  state.atk += gearAtk;
  state._atkWeapon += gearAtk;
  state.matk += getCardBonus('matk') + equippedStatBonus('matk');
  state.matkMin += getCardBonus('matk') + equippedStatBonus('matk');
  state.matkMax += getCardBonus('matk') + equippedStatBonus('matk');
  // 卡片的 DEF+N 是裝備類加成，歸到硬防
  state.defHard += getCardBonus('def');
  /* 戰鼓震天（#68）：ATK 與 DEF 的固定值。ATK 進**熟練度那一桶**——
     官方寫的是固定值加成，跟武器 ATK 不同，不該吃體型/屬性/武器浮動（#12 的分桶規則）。 */
  {
    const atkB = buffMult('atkflat').flatBonus, defB = buffMult('defflat').flatBonus;
    if (atkB) { state.atk += Math.round(atkB); state._atkMastery = (state._atkMastery || 0) + Math.round(atkB); }
    if (defB) state.defHard += Math.round(defB);
  }
  state.def = state.defHard + state.defSoft;
  // MDEF 同理歸到硬魔防。可以是負的（迪塔勒泰晤勒斯：免疫冰凍的代價是 MDEF−20）
  state.mdefHard += getCardBonus('mdef') + equippedStatBonus('mdef');
  state.mdef = state.mdefHard + state.mdefSoft;
  state.hit += getCardBonus('hit') + equippedStatBonus('hit');
  state.flee += getCardBonus('flee') + equippedStatBonus('flee');
  state.critRate = Math.min(100, state.critRate + getCardBonus('critRate') + equippedStatBonus('critRate'));
  // 吹口哨（#68）的完全迴避走 buff，tickBuffs 每次都會重算，過期自動還原
  state.perfectDodge += getCardBonus('perfectDodge') + equippedStatBonus('perfectDodge')
    + buffMult('perfectdodge').flatBonus;
  // 信任（#66）跟卡片的固定值 HP 走同一行——後面那道 %HP 加成兩者一起吃，官方也是這個順序
  state.maxHp += getCardBonus('hp') + equippedStatBonus('hp') + (state.skillMaxHpFlat || 0);
  state.maxSp += getCardBonus('sp') + equippedStatBonus('sp');
  // 操控樂器／練習舞蹈（#68）的最大SP +N%（被動，跟下面的 buff 版分開算）
  if (state.songMaxSpPct) state.maxSp = Math.round(state.maxSp * (1 + state.songMaxSpPct / 100));
  /* 伊登的蘋果／為您服務（#68）的最大HP・最大SP 百分比。
     放在固定值之後、卡片的 %HP 之前；tickBuffs 每次都會重算，所以 buff 過期會自己還原。 */
  {
    const hpB = buffMult('maxhppct').flatBonus, spB = buffMult('maxsppct').flatBonus;
    if (hpB) state.maxHp = Math.max(1, Math.round(state.maxHp * (1 + hpB / 100)));
    if (spB) state.maxSp = Math.max(0, Math.round(state.maxSp * (1 + spB / 100)));
    // 天使之障壁（#97）的最大HP 固定值。百分比之後才加，官方就是這個順序
    const hpFlat = buffMult('maxhpflat').flatBonus;
    if (hpFlat) state.maxHp = Math.max(1, state.maxHp + hpFlat);
  }

  /* perJobLv10_<目標>（#17）：官方「增加與自身 JOB 等級十位數相同的數值」
     （伊夫利特卡片的 ATK／CRI／HIT）。轉職會把 jobLevel 打回 1，所以這個加成
     在轉職當下會歸零再長回來——官方就是這個行為，不特別補償。
     放在這裡是因為要等 ATK/HIT/CRI 三個衍生值都算完才加得上去。 */
  {
    const tens = Math.floor((state.jobLevel || 1) / 10);
    if (tens > 0) {
      const per = n => getCardBonus('perJobLv10_' + n) * tens;
      const a = per('atk');
      if (a) { state.atk += a; state._atkWeapon += a; }
      state.hit += per('hit');
      state.critRate = Math.min(100, state.critRate + per('critRate'));
    }
  }

  // 卡片加成 — 百分比（負值也要吃，塔奧群卡那種有取捨的卡才成立）
  const hpPctBonus = getCardBonus('hpPct') / 100;
  if (hpPctBonus !== 0) {
    state.maxHp = Math.max(1, Math.round(state.maxHp * (1 + hpPctBonus)));
  }
  const spPctBonus = getCardBonus('spPct') / 100;
  if (spPctBonus !== 0) {
    state.maxSp = Math.max(1, Math.round(state.maxSp * (1 + spPctBonus)));
  }
  /* MATK +N%（#55 卡片、#63 魔力增幅的 buff）：乘在所有 MATK 來源加完之後，
     min/max/平均三個都要跟著動。

     **卡片與 buff 走同一行**是刻意的：本作已經因為「推了卻沒人讀」踩過四次
     （#24 buff_flee、#58 buff_def、#61 的 VIT flat buff…），
     新開一個 buff 型別時就把消費端跟既有的加成合在一起，少一個分岔就少一次。
     tickBuffs() 每個 tick 都會呼叫 recomputeDerived()，所以到期會自動還原。 */
  /* ATK +N%（#113 遺物）。跟 matkPct 對稱，乘在所有 ATK 來源加完之後。
     **三個桶子要一起乘**：普攻的傷害鏈是分開讀 _atkWeapon / _atkStatus / _atkMastery 的
     （官方的體型與屬性修正只作用在武器 ATK 上），只乘 state.atk 的話普攻完全吃不到。 */
  const atkPctBonus = getCardBonus('atkPct') / 100;
  if (atkPctBonus !== 0) {
    const m = 1 + atkPctBonus;
    state._atkWeapon = Math.round(state._atkWeapon * m);
    state._atkStatus = Math.round(state._atkStatus * m);
    state._atkMastery = Math.round(state._atkMastery * m);
    state.atk = state._atkStatus + state._atkWeapon + state._atkMastery;
  }
  const matkPctBonus = getCardBonus('matkPct') / 100;
  const matkBuffMult = buffMult('matk').mult;
  if (matkPctBonus !== 0 || matkBuffMult !== 1) {
    const m = (1 + matkPctBonus) * matkBuffMult;
    state.matkMin = Math.max(0, Math.round(state.matkMin * m));
    state.matkMax = Math.max(0, Math.round(state.matkMax * m));
    state.matk = Math.round((state.matkMin + state.matkMax) / 2);
  }
  // 塔奧群卡片：MaxHP 翻倍但固定防減半。放在所有 DEF 來源加完之後才乘。
  const defPctBonus = getCardBonus('defPct') / 100;
  if (defPctBonus !== 0) {
    state.defHard = Math.max(0, Math.round(state.defHard * (1 + defPctBonus)));
    state.defSoft = Math.max(0, Math.round(state.defSoft * (1 + defPctBonus)));
  }
  state.def = state.defHard + state.defSoft;

  /* 戰鬥迴圈每次揮擊都會用到的卡片數值，先在這裡收斂成純量，
     免得每一擊都去掃一遍所有插槽的卡片 */
  // 女神之吻（#68）的暴擊傷害併進這一格：三個消費點（普攻、單體技、範圍技）一次接滿
  state.cardCritDmgPct = getCardBonus('critDmgPct') + buffMult('critdmg').flatBonus;
  state.cardBossDmgPct = getCardBonus('bossDmgPct');
  state.cardAllTargetDmgPct = getCardBonus('allTargetDmgPct');
  state.cardRangedDmgPct = getCardBonus('rangedDmgPct');
  state.cardIgnoreSizePenalty = getCardBonus('ignoreSizePenalty') > 0;
  state.cardSplashAttack = getCardBonus('splashAttack') > 0;   // 巴風特卡片（#136）：普攻濺射
  state.cardBossDmgTakenPct = getCardBonus('bossDmgTakenPct');
  state.cardNormalDmgTakenPct = getCardBonus('normalDmgTakenPct');
  state.cardSpCostPct = getCardBonus('spCostPct');
  state.cardRangedCritRate = getCardBonus('rangedCritRate');
  /* 靈氣劍（#58）：buff 在身上時每次攻擊附加固定傷害。
     收斂成純量給 raceFlatBonus() 用，免得每一擊都去掃一遍 buff 陣列。 */
  state.auraBladeFlat = buffMult('auraflat').flatBonus;
  // 卡片反射（#17）：受到近距離物理攻擊時把 N% 傷害彈回去
  state.cardReflectPct = getCardBonus('reflectPct');
  /* 魔法反射（#17）：跟物理反射是兩回事。官方蟻后卡片是「把法術原樣彈回去」——
     成功時**玩家完全不受傷**，怪物吃下整發，所以這裡存的是機率不是比例。 */
  state.cardMagicReflectChance = Math.min(100, getCardBonus('magicReflectChance'));
  /* 黃金蟲卡片：怪物技能完全免疫（傷害與隊友的增益/狀態技能一起擋）。 */
  state.cardMonSkillImmune = getCardBonus('monSkillImmune') > 0;
  /* 鎧甲屬性（#17）：幽靈波利＝念、天使波利＝聖、巫婆＝暗。
     用 `armorEle_<屬性>` 一族的數字鍵而不是單一字串鍵——加成表是「同名相加」的
     數字表（mergeBonus），塞字串進去會壞掉。
     同時插了兩張時照 ARMOR_ELEMENT_PRIORITY 取一張：官方兩件鎧甲本來就不能同時穿，
     本作的卡片卻能插在不同部位，所以得有個決定性的規則而不是看誰先被掃到。 */
  state.playerElement = 'none';
  for (const e of ARMOR_ELEMENT_PRIORITY) {
    if (getCardBonus('armorEle_' + e) > 0) { state.playerElement = e; break; }
  }
  /* 聖之祈福（#95）的防禦屬性附加**蓋過卡片**——限時的東西壓過常駐的，
     不然穿著屬性防具時放這招會完全沒感覺。 */
  {
    const ea = (state.buffs || []).find(b => b.type === 'elearmor');
    if (ea && ea.element) state.playerElement = ea.element;
  }
  // 生怪加速（#55，月夜貓）：跟騎乘術同一個維度，在 spawnMonster() 生效
  state.cardSpawnSpeedPct = getCardBonus('spawnSpeedPct');
  // 無視魔法防禦力（#17）：貝思波只對 BOSS，亡靈巫師對全部。在 defOf() 生效
  state.cardMdefIgnorePct = getCardBonus('mdefIgnorePct');
  state.cardDefIgnorePct = getCardBonus('defIgnorePct');   // 無視物防（#127）
  state.cardBossMdefIgnorePct = getCardBonus('bossMdefIgnorePct');
  // 每次普攻的 SP 增減（紙妖：攻擊時消耗 1 SP）。可為負，就是代價
  state.cardSpOnAttack = getCardBonus('spOnAttack');
  // 俄塞里斯：復活術／捨身取義發動時改成 HP、SP 全滿
  state.cardReviveFull = getCardBonus('reviveFullRestore') > 0;
  state.cardHpOnMeleeKill = getCardBonus('hpOnMeleeKill');
  state.cardLifeStealChance = getCardBonus('lifeStealChance');
  state.cardLifeStealPct = getCardBonus('lifeStealPct');
  state.cardSpStealChance = getCardBonus('spStealChance');
  state.cardSpStealPct = getCardBonus('spStealPct');

  // 卡片加成 — 對特定目標的加傷/減傷（存入 state 供戰鬥使用）
  //   eleDmg_X / raceDmg_X / sizeDmg_X       ：打「屬性X / 種族X / 體型X」的怪時增傷
  //   eleReduce_X / raceDmgReduce_X          ：被「屬性X / 種族X」的怪打時減傷
  state.cardEleDmgBonus = {};
  state.cardRaceDmgBonus = {};
  state.cardSizeDmgBonus = {};
  state.cardEleDmgReduce = {};
  state.cardRaceDmgReduce = {};
  state.cardSizeDmgReduce = {};
  state.cardFamilyDmgBonus = {}; // 打某個魔物家族時增傷（哥布靈族、獸人族…）
  state.cardFamilyDmgTaken = {}; // 被某個魔物家族打時的傷害變動（妖道：殭屍 +100%）
  state.cardRaceDmgTaken = {};   // 被某個種族打時的傷害變動（天龍防具：受龍族 -2%）
  state.cardMonsterDmgBonus = {}; // 指名單一隻怪的增傷（熔岩巨石卡片）
  state.cardDefIgnoreRace = {}; // 只對某種族無視物防（#127，天龍短劍那一批）
  state.cardRaceCrit = {};      // 對某種族的 CRI 加點（點數，不是%）
  state.cardExpRace = {};       // 擊殺某種族的經驗加成（比例）
  state.cardSpOnKillRace = {};  // 近戰擊殺某種族回復的 SP（點數）
  state.itemHealBonus = {};     // 指定道具的回復量加成（道具id → %）
  state.ailResist = {};         // 玩家的異常狀態抗性（狀態 → %，100 以上＝免疫）
  // 自動念咒與異常狀態：都依觸發時機分籃，戰鬥時直接取用不必再掃卡片
  state.cardAutoSpells = { attack: [], hit: [], chain: [] };
  state.cardAilments = { attack: [], hit: [], magic: [] };
  state.cardAttackBuffs = { attack: [], hit: [] };
  state.cardKillDrops = [];
  {
    const lo = buildLoadout();
    lo.cards.forEach(cardId => {
      const c = CARDS[cardId];
      if (!c) return;
      // 條件式的那幾條（精煉、職業、同時裝了哪張卡、素質門檻）共用 condMet()
      const pass = e => {
        if (!e.when) return true;
        const host = (lo.cardHosts[cardId] || [])[0] || null;
        return condMet(e.when, host, lo);
      };
      (c.autoSpell || []).forEach(e => {
        // 自動念咒也可以帶條件（例：鴞裊首領要跟鴞裊男爵一起裝備才會放雷擊術）
        if (!pass(e)) return;
        const bucket = state.cardAutoSpells[e.on];
        if (bucket) bucket.push(e);
      });
      (c.ailment || []).forEach(e => {
        if (!pass(e)) return;
        const bucket = state.cardAilments[e.on];
        if (bucket) bucket.push(e);
      });
      (c.onAttackBuff || []).forEach(e => {
        if (!pass(e)) return;
        const bucket = state.cardAttackBuffs[e.on];
        if (bucket) bucket.push(e);
      });
      (c.killDrop || []).forEach(e => { if (pass(e)) state.cardKillDrops.push(e); });
    });
    /* 裝備**自己**的觸發型特效（#127）。跟卡片走同一組籃子、同一套資料格式——
       官方有一整批武器寫著「攻擊時有一定機率施展○○」「機率讓敵人中毒」，
       以前那些字只印在說明上，沒有任何程式讀它。 */
    EQUIP_SLOTS_ALL.forEach(slot => {
      const d = lo.slots[slot];
      const def = d && ITEMS[d.itemId];
      if (!def) return;
      const host = { slot, refine: d.refine, itemId: d.itemId };
      const pass = e => !e.when || condMet(e.when, host, lo);
      (def.autoSpell || []).forEach(e => {
        if (!pass(e)) return;
        const bucket = state.cardAutoSpells[e.on];
        if (bucket) bucket.push(e);
      });
      (def.ailment || []).forEach(e => {
        if (!pass(e)) return;
        const bucket = state.cardAilments[e.on];
        if (bucket) bucket.push(e);
      });
      (def.onAttackBuff || []).forEach(e => {
        if (!pass(e)) return;
        const bucket = state.cardAttackBuffs[e.on];
        if (bucket) bucket.push(e);
      });
      (def.killDrop || []).forEach(e => { if (pass(e)) state.cardKillDrops.push(e); });
    });
  }
  state.cardHpRegenPct = 0;
  state.cardSpRegenPct = 0;
  // 黑蛇卡片：賦予二刀連擊，且不受「只有短劍能觸發」的限制
  state.hasSideWinderDoubleAttack = allEquippedCards().includes('side_winder_card');
  const CARD_BONUS_MAPS = {
    'eleDmg_': 'cardEleDmgBonus',
    'raceDmg_': 'cardRaceDmgBonus',
    'sizeDmg_': 'cardSizeDmgBonus',
    'familyDmg_': 'cardFamilyDmgBonus',
    'familyDmgTaken_': 'cardFamilyDmgTaken',
    'raceDmgTaken_': 'cardRaceDmgTaken',
    'monDmg_': 'cardMonsterDmgBonus',
    'eleReduce_': 'cardEleDmgReduce',
    'raceDmgReduce_': 'cardRaceDmgReduce',
    'sizeDmgReduce_': 'cardSizeDmgReduce'
  };
  {
    // 卡片無條件加成、條件成立的加成、依精煉倍增的加成、以及套裝加成，
    // 在 effectiveGearBonuses() 就已經合併成一張表了，這裡只負責分流到各個桶子
    for (const [k, v] of Object.entries(effectiveGearBonuses())) {
      if (k === 'hpRegenPct') { state.cardHpRegenPct += v; continue; }
      if (k === 'spRegenPct') { state.cardSpRegenPct += v; continue; }
      // 這兩個不是「打某種怪時的傷害%」，不能丟進下面那個一律除以100的迴圈
      if (k.startsWith('raceCrit_')) {
        const r = k.slice(9);
        state.cardRaceCrit[r] = (state.cardRaceCrit[r] || 0) + v;
        continue;
      }
      // 無視物防是百分比但**不除以 100**（defOf 那邊自己除），所以不能進下面的通用迴圈
      if (k.startsWith('defIgnoreRace_')) {
        const r = k.slice(14);
        state.cardDefIgnoreRace[r] = (state.cardDefIgnoreRace[r] || 0) + v;
        continue;
      }
      if (k.startsWith('expRace_')) {
        const r = k.slice(8);
        state.cardExpRace[r] = (state.cardExpRace[r] || 0) + v / 100;
        continue;
      }
      if (k.startsWith('spOnKillRace_')) {
        const r = k.slice(13);
        state.cardSpOnKillRace[r] = (state.cardSpOnKillRace[r] || 0) + v;
        continue;
      }
      // 指定道具的回復量加成（啤酒企鵝的果汁、雪怪的冰淇淋），值就是百分比不用再除
      if (k.startsWith('itemHeal_')) {
        const it = k.slice(9);
        state.itemHealBonus[it] = (state.itemHealBonus[it] || 0) + v;
        continue;
      }
      // 異常狀態抗性（馬克免疫冰凍那一類）。值就是百分比，100 以上等於免疫
      if (k.startsWith('ailResist_')) {
        const t = k.slice(10);
        state.ailResist[t] = (state.ailResist[t] || 0) + v;
        continue;
      }
      // raceDmgReduce_ 必須排在 raceDmg_ 前面比對，否則會被前者的前綴先吃掉
      const prefix = Object.keys(CARD_BONUS_MAPS)
        .sort((a, b) => b.length - a.length)
        .find(p => k.startsWith(p));
      if (!prefix) continue;
      const bucket = state[CARD_BONUS_MAPS[prefix]];
      const key = k.slice(prefix.length);
      bucket[key] = (bucket[key] || 0) + v / 100;
    }
  }

  /* 技能來源的減傷併桶（#66）。

     信任的聖屬性耐性與神祐之光的惡魔種族減傷，官方跟卡片給的是同一種東西，
     合進卡片那兩桶而不是另開 state 欄位——那兩桶已經有八個消費者
     （普攻、技能傷害、怪物技能…），另開一個等於要把那八處全部再改一遍，
     而這個 repo 已經因為「推了沒人讀」踩過四次。
     `buffMult` 那類有時效的走 buff 陣列，這裡兩個都是常駐被動，所以放這。 */
  Object.entries(state._skillEleReduce || {}).forEach(([k, v]) => {
    state.cardEleDmgReduce[k] = (state.cardEleDmgReduce[k] || 0) + v;
  });
  Object.entries(state._skillRaceReduce || {}).forEach(([k, v]) => {
    state.cardRaceDmgReduce[k] = (state.cardRaceDmgReduce[k] || 0) + v;
  });
  // 龍知識的增傷那半（#71），同樣併進卡片那桶，cardTargetDmgMult 本來就在讀
  Object.entries(state._skillRaceBonus || {}).forEach(([k, v]) => {
    state.cardRaceDmgBonus[k] = (state.cardRaceDmgBonus[k] || 0) + v;
  });
  /* 鍊金術士的鋅幣折扣（#72）：併進 `zenyCostReductionPct`——castSkill 本來就在讀那張表
     （商人的詭計的商術用同一個地方），所以不必動 castSkill 一行。
     兩段折扣相乘而不是相加：知識藥水 −10% 與配藥 −30% 疊起來是 ×0.9×0.7 = −37%，
     相加會變成 −40%，四段全滿時差距更大。 */
  /* 武術宗師（#79）：氣球體上限從 5 提高到 7。
     新增的伏虎拳與氣絕崩擊各花 1 顆，不提高上限的話阿修羅的 5 顆會拿不到
     ——#70 已經踩過一次那個死鎖。
     修羅（三轉）同樣 7 顆（使用者 2026-08-22 指定）——三轉借的是母職整份技能，
     蓄氣上限照樣吃得到。 */
  if (state.spiritsMax > 0 && (state.jobId === 'champion' || state.jobId === 'sura')) state.spiritsMax = CHAMPION_SPIRITS_MAX;
  if (state._pitcherPct) state.hpItemEffectBonusPct += state._pitcherPct;
  {
    const base = state._alchemyZenyMult == null ? 1 : state._alchemyZenyMult;
    const homun = state._homunZenyMult == null ? 1 : state._homunZenyMult;
    Object.values(SKILLS).forEach(sk => {
      if (!sk.alchemyCost) return;
      const mult = Math.max(0, base) * (sk.homunCost ? Math.max(0, homun) : 1);
      // **不要先四捨五入成一位小數**：四段折扣相乘後 0.4032 會被壓成 59.7%，
      // 10 萬的生命體召喚就變成 40,300 而不是 40,320
      const cut = (1 - mult) * 100;
      if (cut > 0) state.zenyCostReductionPct[sk.id] = cut;
    });
  }
  // 屬性抵抗藥水（#72）：跟上面兩行一樣併進卡片那桶，消費端不必知道來源是藥水
  if (state.buffs && state.buffs.length) {
    state.buffs.forEach(b => {
      if (b.type !== 'eleresist' || !b.element) return;
      state.cardEleDmgReduce[b.element] = (state.cardEleDmgReduce[b.element] || 0) + (b.reducePct || 0) / 100;
    });
  }
  /* 神祐之光是**有時效的 buff**，所以在這裡讀 buff 陣列而不是被動掃描。
     跟上面兩行併進同一桶，消費端完全不必知道來源是卡片、被動還是 buff。 */
  if (state.buffs && state.buffs.length) {
    state.buffs.forEach(b => {
      if (b.type === 'providence') {
        const r = (b.reducePct || 0) / 100;
        state.cardEleDmgReduce.holy = (state.cardEleDmgReduce.holy || 0) + r;
        state.cardRaceDmgReduce.demon = (state.cardRaceDmgReduce.demon || 0) + r;
      }
      /* 不死神齊格弗里德（#68）：地水火風耐性 + 全異常狀態抗性，
         同樣併進既有的兩張表，消費端一個都不用改。 */
      if (b.type === 'songelereduce') {
        const r = (b.flatBonus || 0) / 100;
        ['earth', 'water', 'fire', 'wind'].forEach(e => {
          state.cardEleDmgReduce[e] = (state.cardEleDmgReduce[e] || 0) + r;
        });
      }
      if (b.type === 'songailresist') {
        Object.keys(PLAYER_AILMENTS).forEach(t => {
          state.ailResist[t] = (state.ailResist[t] || 0) + (b.flatBonus || 0);
        });
      }
      // 緩毒術（#95）：指定狀態的抗性直接拉到 100＝免疫，applyPlayerAilment() 那邊就擋掉了
      if (b.type === 'ailimmune' && b.ailType) state.ailResist[b.ailType] = 100;
    });
  }

  // HP/SP 夾住動作統一放在這裡執行，此時state.maxHp/maxSp已經是套用完所有被動技能與卡片加成後的最終值
  // 防止HP/SP因過去任何一次NaN污染而永久卡死（NaN < 任何數都是false，一旦中毒就無法自然回滿/回復）
  if (Number.isNaN(state.hp)) state.hp = state.maxHp;
  if (Number.isNaN(state.sp)) state.sp = state.maxSp;
  if (fullHeal) { state.hp = state.maxHp; state.sp = state.maxSp; }
  else { state.hp = Math.min(state.hp, state.maxHp); state.sp = Math.min(state.sp, state.maxSp); }
}

/* ---------------- 戰鬥公式輔助 ----------------
   命中率% = 100 + 攻擊方HIT - 防守方FLEE，夾在 5%~100% 之間（RO 經典公式）
   減傷比例 = DEF/(DEF+60)，讓 DEF 呈現遞減曲線而非直接相減（避免高防怪變成零傷害）
------------------------------------------------- */
function hitChancePct(attackerHit, defenderFlee) {
  return Math.min(100, Math.max(5, 100 + attackerHit - defenderFlee));
}

/* 卡片對「這隻怪」的總增傷倍率：屬性 + 種族 + 體型三種加成相加後一次套用。
   回傳的是倍率（例如 +20% 種族傷害會回傳 1.2），沒有任何加成時回傳 1。 */
/* 魔物 key → 家族 key。MONSTER_FAMILIES 是靜態資料，建一次索引就好。 */
let _monFamilyIndex = null;
function familyOfMonster(monDef) {
  if (!monDef) return null;
  if (!_monFamilyIndex) {
    _monFamilyIndex = {};
    if (typeof MONSTER_FAMILIES !== 'undefined') {
      for (const [fam, f] of Object.entries(MONSTER_FAMILIES)) {
        (f.members || []).forEach(k => { _monFamilyIndex[k] = fam; });
      }
    }
  }
  return _monFamilyIndex[monDef.id] || null;
}

/* 名字寫 card 但**不只吃卡片**：技能給的同類加成也走這裡（#64 神聖殿堂）。

   刻意合進同一支而不是另開一個函式——本作已經因為「新開了加成卻沒接上消費端」
   踩過四次（#24 buff_flee、#58 buff_def 與技能吃不到 ATK buff、#61 的 VIT flat buff）。
   八個物理傷害路徑全部呼叫這一支，接在這裡就等於一次接滿。 */
function cardTargetDmgMult(monDef) {
  if (!monDef) return 1;
  let bonus = 0;
  const ele = monDef.element || 'none';
  if (state.cardEleDmgBonus && state.cardEleDmgBonus[ele]) bonus += state.cardEleDmgBonus[ele];
  /* 神聖殿堂：對暗／不死目標的物理傷害 +5~25%（buff，不是卡片）。

     官方寫的是「暗**屬性**或不死**屬性**」，但**本作的怪物資料裡沒有不死屬性**
     （element 只有 none/water/wind/shadow/earth/fire/poison/ghost/holy，
     `undead` 只存在於 `ELEMENT_CHART` 的防守列，沒有一隻怪掛得上）。
     只認屬性的話這一半等於做白工——所以同時認 `race === 'undead'`。
     可遇怪：暗屬性 43 隻、不死種族 31 隻，聯集 74 隻，這一半才真的有作用。 */
  if (state.buffs && state.buffs.length) {
    state.buffs.forEach(b => {
      if (b.type !== 'targetele') return;
      const byEle = b.elements && b.elements.includes(ele);
      const byRace = b.races && monDef.race && b.races.includes(monDef.race);
      if (byEle || byRace) bonus += (b.pct || 0) / 100;
    });
  }
  if (monDef.race && state.cardRaceDmgBonus && state.cardRaceDmgBonus[monDef.race]) bonus += state.cardRaceDmgBonus[monDef.race];
  if (monDef.size && state.cardSizeDmgBonus && state.cardSizeDmgBonus[monDef.size]) bonus += state.cardSizeDmgBonus[monDef.size];
  // 魔物家族（哥布靈族／獸人族…）與指名單一隻怪的增傷
  if (state.cardFamilyDmgBonus) {
    const fam = familyOfMonster(monDef);
    if (fam && state.cardFamilyDmgBonus[fam]) bonus += state.cardFamilyDmgBonus[fam];
  }
  if (monDef.id && state.cardMonsterDmgBonus && state.cardMonsterDmgBonus[monDef.id]) bonus += state.cardMonsterDmgBonus[monDef.id];
  // 對所有階級敵人增傷（烏龜將軍／狂徒那類），以及只對首領類的增傷（深淵騎士）
  if (state.cardAllTargetDmgPct) bonus += state.cardAllTargetDmgPct / 100;
  if (monDef.isBoss && state.cardBossDmgPct) bonus += state.cardBossDmgPct / 100;
  return 1 + bonus;
}
/* 取怪物的「硬防, 軟防」一對，配 mitigateDamage 用展開運算子傳進去：
     mitigateDamage(raw, ...defOf(monDef))
   scale 給「無視部分防禦」的傷害用（持續傷害那類），硬防軟防同比例縮。
   官方沒有 def 拆分資料的 16 隻可遇怪沒有 defSoft 欄位，會當作純硬防。

   magic=true 時改查**魔防**。官方魔法傷害根本不看 DEF，看的是 MDEF；
   本作先前沒有魔防資料，只好拿物理硬防頂著，那是錯的。
   魔防的量級跟物防差很多——可遇怪平均物防 103+53、魔防只有 42，但軟魔防反而更大（73），
   所以換過去之後大魔法傷害會上升、小額魔法傷害會下降。

   軟魔防跟軟防一樣是「每一擊各扣一次」。場地類魔法（隕石術、火焰之壁）雖然會跳好幾次，
   但每一跳打的是**完整技能倍率**，本來就等於一次完整的法術命中，所以照扣不打折。

   inst 是「場上那一隻」的實體（不是 MONSTERS 的定義），有傳的話會套上異常狀態
   對防禦的修正（石化 +25%、中毒 −25%）。

   卡片的「無視魔法防禦力 N%」（#17）也套在這裡。全專案的魔法傷害都經過 defOf，
   放在這個唯一的出入口就不必去追那 8 個呼叫點。**這跟「魔法傷害 +N%」不是同一件事**：
   官方寫的是無視防禦，所以魔防越高的怪收益越大，對零魔防的怪完全沒有差別。 */
/* 掛在怪物身上的物防減益（野蠻凶砍的 debuffDef、流氓的卸除盾牌／鎧甲）。
   拆成一支是因為**技能與普攻是兩條各自算防禦的路**：
   普攻在 playerAttack() 裡自己算，技能走 defOf()。
   以前只有普攻那條讀 debuffDef，等於 #60 的野蠻凶砍削防對技能完全沒作用；
   #69 加卸除的時候一併補齊，兩條路現在看到同一個防禦值。 */
function monDebuffDef(inst) {
  if (!inst) return 1;
  let m = stripMult(inst, 'def');
  if (inst.debuffDef) {
    if (Date.now() < (inst.debuffDefEnd || 0)) m *= inst.debuffDef;
    else { delete inst.debuffDef; delete inst.debuffDefEnd; }
  }
  return m;
}
/* 魔防減益（#76 精神撼動）。跟 `monDebuffDef` 是兩個桶：
   那個只掛在物理分支上，魔法分支以前**完全沒有減益的入口**。 */
function monDebuffMdef(inst) {
  if (!inst || !inst.debuffMdef) return 1;
  if (Date.now() < (inst.debuffMdefEnd || 0)) return inst.debuffMdef;
  delete inst.debuffMdef; delete inst.debuffMdefEnd;
  return 1;
}
function defOf(mon, scale, magic, inst) {
  // 打寶模式（#110）：怪的物防與魔防一起變硬。這裡是防禦值的共用入口，乘一次全部吃到
  const fm = farmMult('def');
  const s = (scale === undefined ? 1 : scale) * (inst ? ailDefMult(inst) : 1) * fm;
  if (magic) {
    const ig = (state.cardMdefIgnorePct || 0) + (mon.isBoss ? (state.cardBossMdefIgnorePct || 0) : 0);
    const ms = s * Math.max(0, 1 - ig / 100) * monDebuffMdef(inst);
    return [(mon.mdef || 0) * ms, (mon.mdefSoft || 0) * ms];
  }
  const d = s * monDebuffDef(inst) * Math.max(0, 1 - physDefIgnorePct(mon) / 100);
  return [(mon.def || 0) * d, (mon.defSoft || 0) * d];
}
/* 無視**物理**防禦（#127）。魔防那邊本來就有（cardMdefIgnorePct），物防這邊沒有——
   官方有一整批武器寫著「無視人型系魔物的防禦力」「無視龍族魔物的防禦力」，
   以前那些字完全沒有作用。做法照抄上面魔防那一段，只是多一個種族維度：

     defIgnorePct           對所有怪都無視 N%
     defIgnoreRace_<種族>   只對該種族無視 N%（官方絕大多數是這種）

   兩者相加後夾在 100%，硬防與軟防同比例縮——跟 scale 那一路的處理一致。 */
function physDefIgnorePct(mon) {
  const all = state.cardDefIgnorePct || 0;
  const byRace = (state.cardDefIgnoreRace && mon && state.cardDefIgnoreRace[mon.race]) || 0;
  return Math.min(100, all + byRace);
}

/* 卡片的「從某個魔物家族受到的傷害 +N%」（妖道：從殭屍受到的傷害 +100%）。
   用的是 #37 的家族表，跟種族／屬性／體型減傷是各自獨立的維度——
   殭屍在本作的 race 是不死族，但「殭屍家族」只涵蓋名字真的是殭屍那 16 隻，
   拿 race 代替會連骷髏、木乃伊一起算進去。 */
function cardFamilyDmgTakenMult(monDef) {
  if (!state.cardFamilyDmgTaken || !monDef) return 1;
  const fam = familyOfMonster(monDef);
  // 跟其他 cardXxxDmg 桶子一致，分流迴圈已經把百分比除成比例了（+100% → 1）
  const ratio = fam && state.cardFamilyDmgTaken[fam];
  return ratio ? 1 + ratio : 1;
}
/* 種族版承傷（天龍防具「受到龍族怪的傷害-2%」）。同樣吃分流迴圈除好的比例。 */
function cardRaceDmgTakenMult(monDef) {
  if (!state.cardRaceDmgTaken || !monDef || !monDef.race) return 1;
  const ratio = state.cardRaceDmgTaken[monDef.race];
  return ratio ? 1 + ratio : 1;
}

/* 玩家打怪的減傷：官方硬防公式 (4000 + DEF) / (4000 + 10 × DEF)，再扣掉軟防。

   硬防是比例減傷、軟防是固定扣血，這是兩種不同的運算。資料匯入時原本把官方的
   "16+17" 直接相加成 33 丟進比例公式，等於把固定扣血當成比例在放大。
   軟防按官方是「每一擊各扣一次」，所以多段技能與持續傷害對高軟防的怪特別吃虧。

   硬防公式原本用的是 def/(def+60)，那條是為「DEF 只有個位數到二三十」的尺度設計的，
   但 MONSTERS 的 def 是從 renewal 資料匯入的（中位 101、最大 999），
   丟進去等於中階怪就吃掉六成傷害、高階怪吃掉八成，全庫平均傷害只有應有的 54%。
   兩條曲線在 DEF>30 之後劇烈分岔，這是傷害偏低的主因。 */
function mitigateDamage(rawDmg, def, softDef) {
  const defMultiplier = (4000 + def) / (4000 + 10 * def);
  const dmg = Math.max(1, Math.round(rawDmg * defMultiplier - (softDef || 0)));
  // DPS 統計：玩家造成的傷害全都會經過這裡（怪打玩家走 mitigatePlayerIncoming），
  // 是唯一乾淨的收斂點。離線結算也會呼叫本函式，那時要跳過，否則會灌水。
  if (!_dpsPaused && state && state.dpsTracker) state.dpsTracker.damage += dmg;
  return dmg;
}
let _dpsPaused = false;   // 離線估算期間暫停累計

/* ---------------- 怪物的基礎攻擊力（官方 renewal 公式）----------------
   rAthena `battle_calc_base_damage()` 的怪物分支：

     傷害 = ATK × (0.8 ~ 1.2) + batk
     batk = STR + Level

   `batk` 那一項由 `status_base_atk()` 算，而它被 battle.conf 的開關擋著——
   `enable_baseatk_renewal: 0x29F` 含 BL_MOB，`enable_baseatk: 0x9` 不含，
   所以**只有 renewal 的怪物才有 batk**，pre-RE 是純 rnd(ATK1, ATK2)。
   本作的怪物資料（等級／硬防／STR）全部對得上 renewal，所以走 renewal 這套。

   **怪物沒有體型修正**——原始碼那行註解直接寫著 "Size fix only for players"。
   也沒有武器浮動、沒有熟練度，跟玩家那條鏈（#12/#28）完全是兩回事。

   roll：'mid' 取期望值（產出估算用），其餘正常浮動。 */
function monsterBaseAtk(monDef, roll, mon) {
  // BS_MAXIMIZE：傷害固定取最大值；NPC_POWERUP：整體 ATK +N%
  const maxRoll = mon && monBuff(mon, 'maxRoll') > 0;
  const v = roll === 'mid' ? 1 : (maxRoll ? 1.2 : 0.8 + Math.random() * 0.4);
  const base = (monDef.atk || 0) * v + (monDef.mobStr || 0) + (monDef.level || 0);
  // 打寶模式（#110）：這裡是「怪物傷害的唯一入口」，乘一次普攻與怪物技能就一起吃到
  return base * farmMult('atk') * (1 + (mon ? monBuff(mon, 'atkPct') : 0) / 100) * monDebuffAtk(mon);
}

/* 怪物身上的物攻減益（#60 野蠻凶砍）。

   跟 `mon.debuffDef`（破壞防禦在用的物防減益）是對稱的一組，
   放在 `monsterBaseAtk()` 這個**怪物傷害的唯一入口**，所以普攻與怪物技能一起吃到。 */
function monDebuffAtk(mon) {
  // 卸除武器／卸除頭盔（#69）跟野蠻凶砍相乘：不同技能各佔一格，同一個技能重觸發只是刷新
  const strip = stripMult(mon, 'atk');
  if (!mon || !mon.debuffAtk) return strip;
  if (Date.now() >= (mon.debuffAtkEnd || 0)) {
    delete mon.debuffAtk; delete mon.debuffAtkEnd;
    return strip;
  }
  return mon.debuffAtk * strip;
}
/* 勿忘我（#68）：怪物攻速下降。跟 debuffAtk／debuffDef／debuffHit 同一組寫法
   （值掛在怪物實體上、附一個到期時間戳、過期時自己清掉），
   所以同一種怪的不同隻各自獨立。回傳的是**攻速倍率**（0.7 ＝ 攻速剩七成＝間隔變長）。 */
/* ---------------- 流氓的卸除系列（#69）----------------
   官方四個卸除技對**玩家**是剝除裝備（本作永久 N/A），對**怪物**寫的是素質下降：
     卸除頭盔 INT −40% / 卸除盾牌 DEF −15% / 卸除鎧甲 VIT −40% / 卸除武器 ATK −25%
   使用者 2026-08-09 改成：頭盔 MATK −25%（怪沒有 MATK 就 ATK −10%）、
   盾牌 DEF −15%、鎧甲 DEF −10%、武器 ATK −25%，四個都是普攻觸發的被動。

   **為什麼要一個獨立的袋子**：盾牌與鎧甲都削 DEF、頭盔與武器都可能削 ATK，
   而 `mon.debuffDef` / `mon.debuffAtk` 各只有一格（野蠻凶砍在用）。
   四個技能各自佔一個 key，取用時把還沒過期的相乘——
   這樣「不同技能疊加、同一個技能重複觸發只是刷新」兩件事同時成立。 */
function stripMult(mon, kind) {
  if (!mon || !mon.strip) return 1;
  const now = Date.now();
  let m = 1;
  Object.keys(mon.strip).forEach(k => {
    const e = mon.strip[k];
    if (!e || now >= e.end) { delete mon.strip[k]; return; }
    if (e.kind === kind) m *= e.mult;
  });
  return m;
}
function applyStrip(mon, key, kind, mult, sec) {
  if (!mon) return;
  mon.strip = mon.strip || {};
  mon.strip[key] = { kind, mult, end: Date.now() + sec * 1000 };
}
/* 潛擊：被打中的目標在一段時間內受到的傷害增加。
   跟卸除是同一種「掛在怪物實體上的暫時減益」，但因為是加傷不是減益，另外一格。 */
function monDmgTakenBoost(mon) {
  if (!mon || !mon.dmgTakenBoost) return 1;
  if (Date.now() >= (mon.dmgTakenBoostEnd || 0)) {
    delete mon.dmgTakenBoost; delete mon.dmgTakenBoostEnd;
    return 1;
  }
  return mon.dmgTakenBoost;
}

/* 勿忘我還開著的時候**新生出來的怪也要吃到**。
   不補這一段的話，技能只在施放的那一瞬間有用——放置遊戲的怪是一直換的，
   等於三秒後就完全沒效果了。 */
function applyDontForgetMe(mon) {
  if (!mon || !state.buffs || !state.buffs.length) return;
  const b = state.buffs.find(x => x.type === 'dontforgetme');
  if (!b) return;
  mon.debuffAspd = Math.max(0.1, 1 - (b.flatBonus || 0) / 100);
  mon.debuffAspdEnd = Date.now() + Math.max(0, b.msRemaining || 0);
}

function monDebuffAspd(mon) {
  if (!mon || !mon.debuffAspd) return 1;
  if (Date.now() >= (mon.debuffAspdEnd || 0)) {
    delete mon.debuffAspd; delete mon.debuffAspdEnd;
    return 1;
  }
  return mon.debuffAspd;
}

/* ---------------- 玩家挨打的減傷（硬防／軟防拆開）----------------
   官方 `battle_calc_defense()` 的 renewal 分支：

     傷害 = 傷害 × (4000 + 硬防) / (4000 + 10 × 硬防) − 軟防

   硬防與軟防**從來不相加**。這裡以前是把兩者加成一個 `state.def` 再套
   `def/(def+60)`，等於讓 VIT 每一點都變成百分比減傷，而且 `def/(def+60)`
   天生會飽和——完全沒穿裝備、只靠 VIT 就能減傷 60% 以上。
   跟 #11 替怪物修的是同一個錯，只是這次在玩家身上。

   硬防用 renewal 的 4000 式（本作的裝備 DEF 是 renewal 尺度，盾牌到 190、鎧甲到 450，
   套 pre-RE 的 (100−DEF)/100 會直接免疫）；軟防用 renewal 的 floor((等級 + VIT)/2)。

   `MONSTER_DAMAGE_SCALE` 是唯一的難度旋鈕：官方數值是給有走位、有隊友、
   會嗑藥的即時遊戲用的，放置遊戲是站著硬扛。要調難度只改這一個數。 */
const MONSTER_DAMAGE_SCALE = 1.0;
function mitigatePlayerIncoming(rawDmg, hardDef, softDef) {
  /* 下限從 0 放寬到 −100：**硬魔防可以是負的**（迪塔勒泰晤勒斯卡片免疫冰凍的代價是
     MDEF−20），夾在 0 會讓那張卡的代價完全不存在，變成純賺。
     負值代入官方公式就是放大傷害（−20 → ×1.047），行為正確；
     留 −100 這道下限只是防止資料出錯時算出 ×1.3 以上的離譜倍率。
     物理硬防不受影響——`state.defHard` 在 recomputeDerived 就已經夾過 0 了。 */
  const hard = Math.max(-100, hardDef || 0);
  const after = rawDmg * (4000 + hard) / (4000 + 10 * hard) - (softDef || 0);
  return Math.max(1, Math.round(after * MONSTER_DAMAGE_SCALE));
}
/* ---------------- DPS／收益統計 ----------------
   兩套數字並存，用途不同：
     實測 —— 從上次重置到現在真的打出多少傷害、拿到多少經驗與錢，用來看「現在跑得如何」
     預估 —— 拿目前素質去推算某張地圖的產出，用來看「該不該換圖」，不必先去打
------------------------------------------------- */
function resetDpsTracker() {
  state.dpsTracker = { since: Date.now(), damage: 0, exp: 0, jobExp: 0, gold: 0, kills: 0 };
  saveGame();
}

// 實測值。時間太短時比值會亂跳，交給 UI 決定要不要顯示
function dpsStats() {
  const t = state.dpsTracker;
  if (!t) return null;
  const sec = Math.max(1, (Date.now() - t.since) / 1000);
  return {
    sec,
    dps: t.damage / sec,
    kills: t.kills,
    expPer10m: t.exp / sec * 600,
    jobExpPer10m: t.jobExp / sec * 600,
    goldPer10m: t.gold / sec * 600,
  };
}

/* 預估：用目前素質推算在某張地圖的產出。
   走的是普攻路線（技能倍率無法一概而論，只用一個保守的加成係數帶過），
   命中率、體型、屬性、DEF 都照怪物權重加權，跟實戰同一套函式。 */
function estimateMapYield(mapObj) {
  const pool = (mapObj && mapObj.monsters) || [];
  if (!pool.length || !state.attackInterval) return null;
  const wSum = pool.reduce((s, m) => s + m.weight, 0) || 1;

  const weaponId = getEquipBaseItemId('weapon');
  const weapon = weaponId ? ITEMS[weaponId] : null;
  const atkElement = (weapon && weapon.element) ? weapon.element : 'none';
  const critRate = Math.min(100, state.critRate) / 100;

  let dmg = 0, exp = 0, jobExp = 0, gold = 0, hp = 0;
  pool.forEach(o => {
    const mon = MONSTERS[o.id];
    if (!mon) return;
    const share = o.weight / wSum;
    // 走跟實戰同一條傷害鏈（weaponChainDamage），浮動取中間值。
    // 暴擊分開算：官方暴擊無視 DEF，用「暴擊率加權」把兩種結果混起來才會準
    const hitPct = hitChancePctVsMonster(effectiveHitWithBuff(), mon) / 100;
    const elemMult = getElementMultiplierVsMonster(atkElement, mon);
    const base = weaponChainDamage(mon, elemMult, 'mid') * cardTargetDmgMult(mon);
    const critRaw = base * 1.5 * (1 + (state.cardCritDmgPct || 0) / 100);
    _dpsPaused = true;
    const normalPer = mitigateDamage(base, ...defOf(mon)) + raceFlatBonus(mon);
    _dpsPaused = false;
    const critPer = Math.max(1, Math.round(critRaw)) + raceFlatBonus(mon);
    dmg += (normalPer * (1 - critRate) * hitPct + critPer * critRate) * share;
    hp += (mon.hp || 1) * share;
    exp += (mon.exp || 0) * share;
    jobExp += (mon.jobExp || 0) * share;
    gold += Math.round(3 + (mon.level || 1) * 1.4) * share;
  });

  const dps = dmg / (state.attackInterval / 1000);
  /* 生怪速度會吃掉一部分產出，但不是單純的「每秒最多幾隻」上限。
     spawnMonster() 有兩段節流：場上還有怪時 3 秒補一隻、場上清空時 0.5 秒補一隻
     （騎乘術各縮短成 2.25 / 0.375 秒）。

     殺一隻要花的時間 >= 3 秒時，場上那 5 隻永遠補得回來，玩家不會空手，產出就是 dps/血量。
     殺得比 3 秒快時，緩衝那幾隻很快被清光，之後就變成「等 0.5 秒生一隻 → 花 T 秒殺掉」的循環，
     每隻的實際週期是 T + 0.5 秒，而不是 T。

     先前這裡寫成「上限 = 1/3 隻每秒」，等於假設緩衝永遠是空的，把擊殺數低估了一半以上。 */
  /* 走跟 spawnMonster() 同一支 spawnDelayMs()，不然估算會跟實際生怪速度對不上。
     以前這裡只認騎乘術，卡片／合奏／手推車／打寶那四個加速來源全都沒算進去，
     裝了月夜貓卡的人看到的預估產出一直偏低。 */
  const refillSec = spawnDelayMs(false) / 1000;
  const emptyGapSec = spawnDelayMs(true) / 1000;
  const secPerKill = hp > 0 && dps > 0 ? hp / dps : Infinity;
  // 遠攻模式是「死一隻補一隻」，沒有清場等待
  const throttled = state.encounterMode === 'melee' && secPerKill < refillSec;
  const killsPerSec = secPerKill === Infinity
    ? 0
    : 1 / (secPerKill + (throttled ? emptyGapSec : 0));
  return {
    dps, hpAvg: hp, spawnCapped: throttled,
    killsPer10m: killsPerSec * 600,
    expPer10m: exp * killsPerSec * 600,
    jobExpPer10m: jobExp * killsPerSec * 600,
    goldPer10m: gold * killsPerSec * 600 * buffMult('gold').mult,
  };
}

function monsterHitOf(def) { return def.hit || (90 + def.level * 2.5); }
function monsterFleeOf(def) { return def.flee || (80 + def.level * 4); }

/* ---------------- 命中/迴避（官方 pre-RE 的差值制）----------------
   `hitReq` / `fleeReq` 就是官方資料的「100% 命中」與「95% 回避」：
     hitReq  = 玩家 HIT 達到這個值 → 對這隻怪 100% 命中
     fleeReq = 玩家 FLEE 達到這個值 → 迴避這隻怪 95%（RO 的迴避上限）

   官方公式是 `命中% = 80 + 攻方HIT − 守方FLEE`，也就是**差 1 點就差 1%**。
   換算成上面那兩個門檻就是：
     命中% = 100 − (hitReq  − 玩家HIT)      夾在 5 ~ 100
     迴避% =  95 − (fleeReq − 玩家FLEE)     夾在 5 ~ 95

   2026-08-03 之前這裡寫的是**比例制**（玩家HIT / hitReq × 100），性質完全不同：
   官方的有效區間只有 95~100 點寬，門檻往下 95 點就歸零；比例制是「達成率」，永遠不會歸零。
   實測 422 隻可遇怪的平均迴避率，FLEE 150 時比例制給 62%、官方只有 17%；
   反過來打高門檻的怪（fleeReq 450）時比例制還有 85%、官方只剩 28%。
   等於 AGI 這條屬性線在前中期幾乎不用點就有九成效果，點滿也只多 5%。

   迴避的下限維持 5%（使用者指定）——再怎麼打不過也留一線生機，跟命中的 5% 下限對稱。
   沒有 hitReq/fleeReq 的怪才退回 monDef.hit/monDef.flee，但可遇怪已經全部補齊
   （見 tools/fix_monster_hit_flee_req.js），這條路實務上不會走到。
------------------------------------------------- */
/* hitReq = 怪物FLEE + 20、fleeReq = 怪物HIT + 75（官方「100%命中」「95%回避」的定義）。
   要對怪物的 HIT/FLEE 本身做百分比增減時，得先把這兩個偏移剝掉。 */
const REQ_HIT_OFFSET = 20;
const REQ_FLEE_OFFSET = 75;

function hitChancePctVsMonster(playerHit, monDef, inst) {
  let threshold = monDef.hitReq || monsterFleeOf(monDef);
  // 黑暗讓怪物的迴避下降（門檻變低＝更好打中）；冰凍與睡眠則是必定命中
  if (inst) {
    if (ailAlwaysHit(inst)) return 100;
    /* 官方的黑暗是「FLEE −25%」，打折的對象是**怪物的 FLEE** 而不是 hitReq。
       hitReq = 怪物FLEE + 20（100% 命中的定義），所以要先剝掉那 20 再打折、再加回去。
       直接對 hitReq 打折會多扣 5 點——比例制時代無所謂，差值制下 1 點就是 1%。 */
    threshold = Math.max(1, (threshold - REQ_HIT_OFFSET) * ailFleeMult(inst) + REQ_HIT_OFFSET);
    // 怪物自己的迴避增益（NPC_AGIUP）：加的是點數，1 點就是 1% 命中率
    threshold += monBuff(inst, 'fleeFlat');
    // 緊密的約束（#69）：怪物的迴避下降，一樣是點數
    if (inst.debuffFlee && Date.now() < (inst.debuffFleeEnd || 0)) threshold -= inst.debuffFlee;
    else if (inst.debuffFlee) { delete inst.debuffFlee; delete inst.debuffFleeEnd; }
  }
  return Math.min(100, Math.max(5, Math.round(100 - (threshold - playerHit))));
}
/* 迴避上限隨場上怪數遞減（#107，使用者 2026-08-16 指定）：
     1 隻 95%／2 隻 90%／3 隻 85%／4 隻 80%／5 隻 75%

   官方沒有這條，是本作自己的圍毆懲罰：一次被五隻打的時候，
   靠 AGI 站著不動就無敵的玩法要付出代價。

   **夾的是上限，不是公式的基準**。基準仍然是 95（`95 − (門檻 − FLEE)`），
   所以 FLEE 還沒堆到頂的角色一點都不受影響——算出來 60% 的人不管場上幾隻都還是 60%。
   被砍到的只有已經頂著上限的全迴避流，這就是「不會暴死但多一點危機」的意思。 */
const FLEE_CAP_BASE = 95;
const FLEE_CAP_STEP = 5;
function fleeCapPct(count) {
  const n = Math.max(1, count != null ? count : ((state.monsters || []).length || 1));
  return Math.max(5, FLEE_CAP_BASE - FLEE_CAP_STEP * (n - 1));
}
function dodgeChancePctFromMonster(playerFlee, monDef, hitDebuff) {
  let threshold = monDef.fleeReq || monsterHitOf(monDef);
  // 打寶模式讓怪更會打中（#110）：直接加在門檻上，迴避率就是等量減少（差值制 1 點 = 1%）
  threshold += farmFlat('hitFlat');
  if (hitDebuff) threshold = Math.max(1, threshold - hitDebuff);
  return Math.min(fleeCapPct(), Math.max(5, Math.round(FLEE_CAP_BASE - (threshold - playerFlee))));
}

/* ---------------- 中毒（施毒/塗毒共用）----------------
   固定持續3秒、不疊加（同一隻怪再次中毒直接覆蓋刷新）、毒屬性怪物免疫 */
function applyPoisonDot(mon, monDef, rawDmgPerTick) {
  const elemMult = getElementMultiplierVsMonster('poison', monDef, mon);
  if (elemMult === 0) {
    logMsg(`🚫 ${monDef.name} 對毒免疫！`);
    return;
  }
  const wasPoisoned = mon.poisonDotEnd && Date.now() < mon.poisonDotEnd;
  mon.poisonDotPerTick = Math.round(rawDmgPerTick * elemMult);
  mon.poisonDotEnd = Date.now() + 3000;
  // 只有從沒中毒變成中毒才出聲，續毒不重放
  if (!wasPoisoned && typeof playStatusSound === 'function') playStatusSound('poison');
}
function tickPoisonDot() {
  if (!state.monsters || state.monsters.length === 0) return;
  const now = Date.now();
  for (let i = state.monsters.length - 1; i >= 0; i--) {
    const mon = state.monsters[i];
    if (!mon.poisonDotEnd) continue;
    if (now >= mon.poisonDotEnd) {
      delete mon.poisonDotEnd;
      delete mon.poisonDotPerTick;
      continue;
    }
    const monDef = MONSTERS[mon.defId];
    const dmg = mitigateDamage(mon.poisonDotPerTick, ...defOf(monDef, 0.6));
    mon.hp -= dmg;
    logMsg(`☠️ 中毒對 ${monDef.name} 造成 ${dmg} 點傷害！`);
    if (mon.hp <= 0) killMonster(monDef, mon);
  }
}

/* ---------------- 怪物異常狀態 ----------------
   官方 pre-RE 的核心異常狀態共 10 種，這裡全部收進同一張表。以前本作只有「暈眩」
   一個欄位（`mon.stunnedUntil`），冰凍、石化都硬塞在裡面，分不出是哪一種。

   資料放在 `mon.ail = { 狀態: 結束時間戳 }`。無法行動類的狀態**同時**寫進
   `mon.stunnedUntil`，這樣既有那些讀 stunnedUntil 的地方（怪物攻擊判定、
   冰凍術甦醒）一行都不用改。

   刻意的偏離：
   - **混亂**官方是「移動方向隨機」，本作沒有移動概念，改成無法行動 1~3 秒（隨機）
   - **沉默**官方是「無法使用技能」，本作怪物目前只會平A，所以掛得上但沒有效果，
     等怪物技能做出來（見 docs/DONE.md #29）就會自動生效
   - **黑暗**只做「怪物命中下降」與「怪物迴避下降」，官方的視野縮小無從表現
   - **詛咒**官方是 LUK 歸 0 + ATK -25% + 移速下降，對怪物只有 ATK 那項有意義
------------------------------------------------- */
const MON_AILMENTS = {
  stun:      { name: '昏迷', icon: '💫', sec: 3, immobile: true },
  freeze:    { name: '冰凍', icon: '🧊', sec: 4, immobile: true, alwaysHit: true, immuneElement: ['water'], immuneRace: ['undead'] },
  stone:     { name: '石化', icon: '🗿', sec: 5, immobile: true, defMult: 1.25, immuneElement: ['earth'] },
  sleep:     { name: '睡眠', icon: '💤', sec: 6, immobile: true, alwaysHit: true, dmgTakenMult: 1.5, breakOnHit: true, immuneRace: ['undead'] },
  confusion: { name: '混亂', icon: '😵', secMin: 1, secMax: 3, immobile: true },
  blind:     { name: '黑暗', icon: '🌑', sec: 8, hitPenaltyPct: 25, fleePenaltyPct: 25 },
  curse:     { name: '詛咒', icon: '💀', sec: 8, atkMult: 0.75, immuneRace: ['undead'] },
  bleed:     { name: '出血', icon: '🩸', sec: 8, dotPctMaxHp: 1, immuneRace: ['undead', 'formless'] },
  poison:    { name: '中毒', icon: '☠️', sec: 3, defMult: 0.75, immuneElement: ['poison'] },
  silence:   { name: '沉默', icon: '🤐', sec: 8 },
};

function ailImmune(monDef, type) {
  const A = MON_AILMENTS[type];
  if (!A || !monDef) return true;
  if (A.immuneElement && A.immuneElement.includes(monDef.element || 'none')) return true;
  if (A.immuneRace && A.immuneRace.includes(monDef.race)) return true;
  return false;
}

/* 掛上一個異常狀態。回傳有沒有真的掛上去。
   同一種狀態重複觸發是「取較長的那個」而不是疊加——不然被連續攻擊時會無限延長。
   BOSS 階級的持續時間減半（官方 MVP 對狀態異常有高抗性，本作用減半代替完全免疫，
   免得那些卡片對 BOSS 完全失效）。 */
function applyAilment(mon, monDef, type, opts) {
  const A = MON_AILMENTS[type];
  if (!A || !mon || mon.hp <= 0) return false;
  if (ailImmune(monDef, type)) return false;

  let sec = (opts && opts.sec) || (A.secMin != null ? A.secMin + Math.random() * (A.secMax - A.secMin) : A.sec);
  if (monDef.isBoss) sec *= 0.5;

  const now = Date.now();
  mon.ail = mon.ail || {};
  const had = mon.ail[type] && now < mon.ail[type];
  mon.ail[type] = Math.max(mon.ail[type] || 0, now + sec * 1000);
  if (A.immobile) mon.stunnedUntil = Math.max(mon.stunnedUntil || 0, mon.ail[type]);
  if (A.dotPctMaxHp) mon.bleedNextTick = mon.bleedNextTick || now;

  if (!had) {
    logMsg(`${A.icon} ${monDef.name} ${A.name}了！（${sec.toFixed(1)}秒）`);
    if (typeof playStatusSound === 'function') playStatusSound(A.immobile ? 'stun' : 'poison');
  }
  return true;
}

function ailActive(mon, type) {
  return !!(mon && mon.ail && mon.ail[type] && Date.now() < mon.ail[type]);
}
// 目前掛著的狀態清單（顯示與除錯用）
function ailList(mon) {
  if (!mon || !mon.ail) return [];
  const now = Date.now();
  return Object.keys(mon.ail).filter(t => mon.ail[t] > now && MON_AILMENTS[t]);
}
function ailFold(mon, key, init) {
  let v = init;
  ailList(mon).forEach(t => { const x = MON_AILMENTS[t][key]; if (x != null) v *= x; });
  return v;
}
const ailAtkMult = mon => ailFold(mon, 'atkMult', 1);          // 詛咒
const ailDefMult = mon => ailFold(mon, 'defMult', 1);          // 石化↑／中毒↓
/* 睡眠 ×1.5，以及潛擊（#69）掛上去的「受到的傷害 +30%」。
   併在同一支而不是另開消費點：這條被八個傷害路徑呼叫，另開等於要改八個地方，
   而這個 repo 已經因為「推了沒人讀」踩過四次。 */
const ailDmgTakenMult = mon => ailFold(mon, 'dmgTakenMult', 1) * monDmgTakenBoost(mon);
const ailAlwaysHit = mon => ailList(mon).some(t => MON_AILMENTS[t].alwaysHit);   // 冰凍／睡眠
// 黑暗：怪物的命中與迴避各降一截，回傳「要打幾折」
function ailHitMult(mon) {
  let v = 1;
  ailList(mon).forEach(t => { const p = MON_AILMENTS[t].hitPenaltyPct; if (p) v *= (1 - p / 100); });
  return v;
}
function ailFleeMult(mon) {
  let v = 1;
  ailList(mon).forEach(t => { const p = MON_AILMENTS[t].fleePenaltyPct; if (p) v *= (1 - p / 100); });
  return v;
}
// 睡眠：受到任何傷害就醒（官方規則）
function ailBreakOnDamage(mon, monDef) {
  ailList(mon).forEach(t => {
    if (!MON_AILMENTS[t].breakOnHit) return;
    delete mon.ail[t];
    if (MON_AILMENTS[t].immobile) mon.stunnedUntil = Date.now();
    if (monDef) logMsg(`${MON_AILMENTS[t].icon} ${monDef.name} 被打醒了！`);
  });
}

/* 出血：每秒扣最大 HP 的固定比例，**無視防禦**（官方出血是直接扣血）。
   跟中毒分開跑，因為中毒的每跳傷害是從技能傷害推導的，出血則是純比例。 */
function tickBleed() {
  if (!state.monsters || state.monsters.length === 0) return;
  const now = Date.now();
  for (let i = state.monsters.length - 1; i >= 0; i--) {
    const mon = state.monsters[i];
    if (!ailActive(mon, 'bleed')) { delete mon.bleedNextTick; continue; }
    if (now < (mon.bleedNextTick || 0)) continue;
    mon.bleedNextTick = now + 1000;
    const monDef = MONSTERS[mon.defId];
    const dmg = Math.max(1, Math.round(mon.maxHp * MON_AILMENTS.bleed.dotPctMaxHp / 100));
    mon.hp -= dmg;
    if (!_dpsPaused && state && state.dpsTracker) state.dpsTracker.damage += dmg;
    logMsg(`🩸 出血對 ${monDef.name} 造成 ${dmg} 點傷害！`);
    if (mon.hp <= 0) killMonster(monDef, mon);
  }
}

/* ---------------- 卡片附加掉落 ----------------
   資料寫在 `CARDS[x].killDrop = [{ race?, items?, pool?, chance }]`：
     race   限定種族，省略代表任何魔物
     items  候選道具 id 陣列，隨機挑一個
     pool   改用分類池（'food' 食品類／'elementResist' 屬性抵抗藥水）
     chance 百分比。本作的規範是**限定種族 5%、不限種族 1%**
   跟 autoSpell / ailment 一樣支援 when（目前沒有卡片用到，留著格式一致）。 */
const ITEM_POOLS = {
  // 食品：有回血值的道具，扣掉藥水藥草那一類（那是藥品不是食品）
  food: () => Object.keys(ITEMS).filter(k => ITEMS[k].heal > 0 && !/药水|藥水|药草|藥草/.test(ITEMS[k].name)),
  elementResist: () => Object.keys(ITEMS).filter(k => /属性抵抗药水$/.test(ITEMS[k].name)),
};
const _itemPoolCache = {};
function itemPool(name) {
  if (!_itemPoolCache[name]) _itemPoolCache[name] = (ITEM_POOLS[name] || (() => []))();
  return _itemPoolCache[name];
}

function tryCardKillDrops(monDef) {
  if (!state.cardKillDrops || !state.cardKillDrops.length) return;
  state.cardKillDrops.forEach(e => {
    if (e.race && monDef.race !== e.race) return;
    if (Math.random() * 100 >= e.chance) return;
    // 掉的是錢不是道具（藍鼠：擊殺時機率得到一筆金幣）
    if (e.zeny) {
      state.gold += e.zeny;
      if (state.dpsTracker) state.dpsTracker.gold += e.zeny;
      logMsg(`🎁 卡片效果！額外獲得了 ${e.zeny}z！`);
      return;
    }
    const pool = e.pool ? itemPool(e.pool) : e.items;
    if (!pool || !pool.length) return;
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (!ITEMS[id]) return;
    addItem(id, 1);
    logMsg(`🎁 卡片效果！額外獲得了 ${ITEMS[id].name}！`);
  });
}

/* ---------------- 箱子 ----------------
   神秘箱子：從「全部道具扣掉卡片」均勻抽一件。裝備天然就佔 20%，不必另外做權重。
             三轉裝備與 1z 雜物都留在池子裡——這個箱子的定位就是賭博。
   禮物箱　：從 500z ~ 3,000,000z 的道具裡抽，但**權重 1/√售價**。
             均勻抽的話期望值 15,432z（現在整體收入的 8.8 倍），加權後降到 1,871z，
             300 萬的世界之星鑽石照樣抽得到，只是機率壓下來了。
   兩個池子都只建一次，之後查快取。 */
const BOX_ITEM_NAMES = ['神秘箱子', '神秘紫箱', '禮物箱'];   // 箱子不會開出箱子（同名的另一份也一起擋掉）
const EQUIP_TYPES = ['armor', 'weapon', 'ammo'];

/* 能不能進箱子的道具池。
   `ITEMS` 有 23,407 筆，裡面混著大量沒翻譯完或本作根本取得不到的東西：
   韓文名（손목 아대）、日文假名、以及完全沒有漢字的英文名（Costume Engineer Cap）。
   使用者要求把這些擋掉，只留有中文名的道具。過濾後剩 14,509 件。 */
function boxEligible(k) {
  const it = ITEMS[k];
  if (!it || CARDS[k] || /卡片$/.test(it.name)) return false;
  if (it.boxOpen || BOX_ITEM_NAMES.includes(it.name)) return false;
  const n = it.name || '';
  if (/[가-힯ᄀ-ᇿ]/.test(n)) return false;    // 韓文
  if (/[぀-ヿ]/.test(n)) return false;         // 日文假名
  if (!/[一-鿿]/.test(n)) return false;        // 完全沒有漢字（英文名）
  /* 時裝與轉蛋一律排除（使用者要求）。
     時裝在官方是獨立的外觀欄位，本作沒有時裝欄，開出來只是佔背包；
     轉蛋是抽獎容器，開箱子開出另一個抽獎道具很怪。

     **只認名字不認 desc**：desc 裡的「同時裝備」「與XX一起裝備時」都含有「時裝」兩個字，
     用 desc 比對會把幻影生存的魔杖那種正常武器一起誤殺。
     `(时装)` 是官方時裝的固定前綴；「系列: 时装」是結構化欄位，兩個都安全。 */
  if (/[(（]时装[)）]/.test(n)) return false;
  if (/转蛋\s*$/.test(n) || /转蛋专用/.test(n)) return false;
  if (/系列:\s*时装/.test(it.desc || '')) return false;
  return true;
}

const BOX_POOLS = {
  /* 神秘箱子：過濾之後裝備的天然占比會從 20% 跳到 31%（被擋掉的多半是雜物而不是裝備），
     所以改成兩段抽：先擲 20% 決定要不要給裝備，再從對應的子池裡均勻抽。
     三轉裝與 1z 雜物照樣留在池子裡——這個箱子的定位就是賭博。 */
  any: {
    build: () => Object.keys(ITEMS).filter(boxEligible),
    split: { rate: 0.2, pick: k => EQUIP_TYPES.includes(ITEMS[k].type) },
  },
  /* 神秘紫箱：跟神秘箱子同一個道具池，差別只在**裝備比例 40%**（神秘箱子是 20%）。
     兩者在官方都是「開出隨機道具」的雜物箱，本作拿裝備比例做出區隔——
     紫箱比較容易開出裝備，藍箱比較容易開出雜物但兩邊的大獎池一模一樣。 */
  violet: {
    build: () => Object.keys(ITEMS).filter(boxEligible),
    split: { rate: 0.4, pick: k => EQUIP_TYPES.includes(ITEMS[k].type) },
  },
  /* 禮物箱：售價 500z~3,000,000z，權重 1/√售價。
     均勻抽的期望值是 15,432z（全系 1% 等於每 10 分鐘 8.3 個箱子，收入會變成 8.8 倍），
     因為價格帶前 5% 的那 35 件吃掉了 83% 的期望值。加權之後降到 1,800z 上下，
     300 萬的世界之星鑽石照樣抽得到，只是機率壓到 0.005%。 */
  valuable: {
    build: () => Object.keys(ITEMS).filter(k => {
      if (!boxEligible(k)) return false;
      const s = ITEMS[k].sell || 0;
      return s >= 500 && s <= 3000000;
    }),
    weight: id => 1 / Math.sqrt(ITEMS[id].sell || 1),
  },
};
/* ---------------- 卡冊 ----------------
   一條「花錢換運氣」的鏈：道具商人賣 500 萬的**未解封的卡冊** → 開出某一種卡冊 → 再開出卡片。

     未解封的卡冊    → 9 種卡冊之一（具有魔力的卡片冊權重壓到很低）
     老舊收集冊      → 全部 553 張卡，**王卡權重壓很低**
     老舊收集冊(部位) → 只開該部位能插的卡（含任意部位卡），王卡一樣壓低
     具有魔力的卡片冊 → 全部 553 張**完全平均**，王卡機率最高，是這條鏈的頭獎

   王卡的判定：從 MONSTER_CARD_DROPS 反查來源怪，怪是 BOSS 階級就算。
   MVP 30 張、迷你王 39 張。 */
const CARD_ALBUM_WEIGHT = { mvp: 0.02, miniBoss: 0.1, normal: 1 };
let _bossCardKind = null;
function bossCardKind(cardId) {
  if (!_bossCardKind) {
    _bossCardKind = {};
    for (const [monKey, d] of Object.entries(MONSTER_CARD_DROPS)) {
      const m = MONSTERS[monKey];
      if (m && m.isBoss) _bossCardKind[d.card] = m.isMvp ? 'mvp' : 'miniBoss';
    }
  }
  return _bossCardKind[cardId] || 'normal';
}
/* 可以從卡冊開出來的卡片。兩道過濾：
   1. `CARDS` 裡有 108 筆其實是**附魔石**（STR+1、DEF+6、流溢Lv3、魔神的幸運精髓1…），
      沒有任何怪物會掉，也不該從卡冊開出來——用名稱結尾是不是「卡片」來擋
   2. 有 3 張卡片沒有對應的 ITEMS 條目，addItem 進不了背包
   剩下 445 張，其中 MVP 卡 30 張、迷你王卡 39 張。 */
const cardDrawable = () => Object.keys(CARDS).filter(k => ITEMS[k] && /卡片$/.test(CARDS[k].name));
const cardWeight = id => CARD_ALBUM_WEIGHT[bossCardKind(id)];

const ALBUM_ITEMS = {
  old_card_album: 10,          // 老舊收集冊：全部卡片
  old_c_album_helm: 5, old_c_album_armor: 5, old_c_album_shield: 5,
  old_c_album_garment: 5, old_c_album_shoes: 5, old_c_album_acc: 5,
  old_c_album_weapon: 5,       // 部位限定：命中率高，權重中等
  magic_card_album: 1,         // 完全平均的那本，權重壓到 1/46 ≈ 2%
};
// 部位限定卡冊 → 卡片的 slot
const ALBUM_SLOT = {
  old_c_album_helm: 'headgear', old_c_album_armor: 'armor', old_c_album_shield: 'shield',
  old_c_album_garment: 'garment', old_c_album_shoes: 'footgear', old_c_album_acc: 'accessory',
  old_c_album_weapon: 'weapon',
};

Object.assign(BOX_POOLS, {
  album: {
    build: () => Object.keys(ALBUM_ITEMS).filter(k => ITEMS[k]),
    weight: id => ALBUM_ITEMS[id],
  },
  card: { build: cardDrawable, weight: cardWeight },
  cardFlat: { build: cardDrawable },     // 完全平均
});
Object.entries(ALBUM_SLOT).forEach(([album, slot]) => {
  BOX_POOLS['card_' + slot] = {
    build: () => cardDrawable().filter(k => CARDS[k].slot === slot || CARDS[k].slot === 'any'),
    weight: cardWeight,
  };
});

const _boxCache = {};
function boxPool(kind) {
  if (_boxCache[kind]) return _boxCache[kind];
  const spec = BOX_POOLS[kind];
  if (!spec) return null;
  const all = spec.build();
  const mk = ids => {
    let cum = null, total = ids.length;
    if (spec.weight) {
      cum = new Float64Array(ids.length);
      let acc = 0;
      ids.forEach((id, i) => { acc += spec.weight(id); cum[i] = acc; });
      total = acc;
    }
    return { ids, cum, total };
  };
  const p = mk(all);
  if (spec.split) {
    p.split = spec.split.rate;
    p.hit = mk(all.filter(spec.split.pick));
    p.miss = mk(all.filter(k => !spec.split.pick(k)));
  }
  return (_boxCache[kind] = p);
}
function drawFromSub(p) {
  if (!p.ids.length) return null;
  if (!p.cum) return p.ids[Math.floor(Math.random() * p.ids.length)];
  // 加權抽：在累積權重上二分搜尋
  const r = Math.random() * p.total;
  let lo = 0, hi = p.ids.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid] < r) lo = mid + 1; else hi = mid;
  }
  return p.ids[lo];
}
function drawFromBox(kind) {
  const p = boxPool(kind);
  if (!p || !p.ids.length) return null;
  if (p.split != null) {
    const sub = Math.random() < p.split ? p.hit : p.miss;
    if (sub.ids.length) return drawFromSub(sub);
  }
  return drawFromSub(p);
}

/* ---------------- 玩家異常狀態 ----------------
   怪物端那套（MON_AILMENTS）的鏡像版本。放在 `state.playerAil = { 狀態: 結束時間戳 }`。

   官方那 10 種對玩家的效果跟對怪物不完全一樣，這裡各自寫清楚：
     昏迷／冰凍／石化／睡眠／混亂  無法攻擊（本作沒有移動，所以「不能動」＝不能攻擊）
     睡眠   額外：受到的傷害 ×1.5，而且**被打就醒**
     冰凍   額外：一定被打中
     黑暗   命中 −25%、迴避 −25%
     詛咒   ATK −25%
     沉默   **不能施放技能**（這是玩家端才真正有意義的那一條）
     中毒   每秒扣最大HP 0.8%
     出血   每秒扣最大HP 1%，而且**HP/SP 不會自然回復**

   抗性：`state.ailResist[狀態]` 是百分比減免（卡片給的），100 以上等於免疫。 */
const PLAYER_AILMENTS = {
  stun:      { name: '昏迷', icon: '💫', sec: 3, immobile: true },
  freeze:    { name: '冰凍', icon: '🧊', sec: 4, immobile: true, alwaysHit: true },
  stone:     { name: '石化', icon: '🗿', sec: 5, immobile: true },
  sleep:     { name: '睡眠', icon: '💤', sec: 6, immobile: true, alwaysHit: true, dmgTakenMult: 1.5, breakOnHit: true },
  confusion: { name: '混亂', icon: '😵', secMin: 1, secMax: 3, immobile: true },
  blind:     { name: '黑暗', icon: '🌑', sec: 8, hitPct: -25, fleePct: -25 },
  curse:     { name: '詛咒', icon: '💀', sec: 8, atkMult: 0.75 },
  silence:   { name: '沉默', icon: '🤐', sec: 8, noSkill: true },
  poison:    { name: '中毒', icon: '☠️', sec: 10, dotPctMaxHp: 0.8 },
  bleed:     { name: '出血', icon: '🩸', sec: 10, dotPctMaxHp: 1, noRegen: true },
};

function playerAilActive(type) {
  return !!(state.playerAil && state.playerAil[type] && Date.now() < state.playerAil[type]);
}
function playerAilList() {
  if (!state.playerAil) return [];
  const now = Date.now();
  return Object.keys(state.playerAil).filter(t => state.playerAil[t] > now && PLAYER_AILMENTS[t]);
}
function playerAilFold(key, init) {
  let v = init;
  playerAilList().forEach(t => { const x = PLAYER_AILMENTS[t][key]; if (x != null) v *= x; });
  return v;
}
const playerImmobile = () => playerAilList().some(t => PLAYER_AILMENTS[t].immobile);
const playerSilenced = () => playerAilList().some(t => PLAYER_AILMENTS[t].noSkill);
const playerNoRegen = () => playerAilList().some(t => PLAYER_AILMENTS[t].noRegen);
const playerAilAtkMult = () => playerAilFold('atkMult', 1);
const playerAilDmgTakenMult = () => playerAilFold('dmgTakenMult', 1);
const playerAlwaysHit = () => playerAilList().some(t => PLAYER_AILMENTS[t].alwaysHit);
function playerAilPct(key) {
  let v = 0;
  playerAilList().forEach(t => { const x = PLAYER_AILMENTS[t][key]; if (x) v += x; });
  return v;
}

/* 掛狀態到玩家身上。抗性由卡片提供（`ailResist`），100% 就是完全免疫。
   跟怪物端一樣「取較長的那個」而不是疊加。 */
function applyPlayerAilment(type, opts) {
  const A = PLAYER_AILMENTS[type];
  if (!A || state.hp <= 0) return false;
  const resist = (state.ailResist && state.ailResist[type]) || 0;
  if (resist >= 100) return false;
  if (resist > 0 && Math.random() * 100 < resist) return false;

  let sec = (opts && opts.sec) || (A.secMin != null ? A.secMin + Math.random() * (A.secMax - A.secMin) : A.sec);
  const now = Date.now();
  state.playerAil = state.playerAil || {};
  const had = state.playerAil[type] && now < state.playerAil[type];
  state.playerAil[type] = Math.max(state.playerAil[type] || 0, now + sec * 1000);
  if (A.dotPctMaxHp) state.playerAilTick = state.playerAilTick || now;
  if (!had) {
    logMsg(`${A.icon} 你${A.name}了！（${sec.toFixed(1)}秒）`);
    if (typeof playStatusSound === 'function') playStatusSound(A.immobile ? 'stun' : 'poison');
  }
  return true;
}
// 睡眠：受到任何傷害就醒
function playerAilBreakOnDamage() {
  playerAilList().forEach(t => {
    if (!PLAYER_AILMENTS[t].breakOnHit) return;
    delete state.playerAil[t];
    logMsg(`${PLAYER_AILMENTS[t].icon} 你被打醒了！`);
  });
}
/* 玩家身上的持續傷害（中毒／出血），每秒跳一次。
   打不死玩家——扣到剩 1 點就停，這種「站著不動被毒死」在放置遊戲裡體驗太差。 */
function tickPlayerAilments() {
  const now = Date.now();
  if (!state.playerAil) return;
  // 過期的清掉
  Object.keys(state.playerAil).forEach(t => { if (state.playerAil[t] <= now) delete state.playerAil[t]; });
  const dots = playerAilList().filter(t => PLAYER_AILMENTS[t].dotPctMaxHp);
  if (!dots.length) { delete state.playerAilTick; return; }
  if (now < (state.playerAilTick || 0)) return;
  state.playerAilTick = now + 1000;
  let dmg = 0;
  dots.forEach(t => { dmg += Math.max(1, Math.round(state.maxHp * PLAYER_AILMENTS[t].dotPctMaxHp / 100)); });
  const before = state.hp;
  state.hp = Math.max(1, state.hp - dmg);
  if (state.hp < before) {
    logMsg(`${dots.map(t => PLAYER_AILMENTS[t].icon).join('')} 持續傷害讓你損失了 ${before - state.hp} 點HP。`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('-' + (before - state.hp), 'normal');
  }
}

/* ---------------- 玩家身上的臨時減益（#36）----------------
   `mon.mbuff` 的鏡像。官方有一批怪物技能是「對玩家下暫時性的削弱」——
   挑釁（DEF 大降、ATK 反而上升）、緩緩移動（AGI 下降）、永恆之光（下一擊必定重傷）。
   本作原本沒有「玩家身上的臨時減益」這個容器，那 30 幾條一直躺在未對照清單。

   **刻意跟異常狀態（PLAYER_AILMENTS）分開**：那個是有名字的十種狀態、有卡片抗性、
   會擋住行動；這個是純數值增減、沒有抗性、時間到就沒了。混在一起的話「免疫昏迷」
   的卡片會莫名其妙開始擋挑釁，而且十種狀態那張表的每個欄位都要為它加例外。

   存在 `state.pdebuff = { 鍵: { v, until, once? } }`。不寫進存檔——本來就只有幾秒。
     defPct      防禦 ±N%（硬防軟防一起）
     atkPct      攻擊力 ±N%（挑釁官方是**加**攻擊力，所以可以是正的）
     aspdPct     攻速 ±N%（負的＝變慢）
     fleeFlat    迴避 ±N **點**（點數不是%，理由同 mon.mbuff 的 fleeFlat：
                 命中判定是差值制，百分比會被放大成幾十個百分點）
     dmgTakenPct 受到的傷害 ±N%；帶 `once` 的話下一次受傷結算完就消失 */
const PLAYER_DEBUFF_KEYS = ['defPct', 'atkPct', 'aspdPct', 'fleeFlat', 'dmgTakenPct'];
const PLAYER_DEBUFF_META = {
  defPct:      { name: '防禦下降', icon: '🔻' },
  atkPct:      { name: '攻擊力變動', icon: '💢' },
  aspdPct:     { name: '攻速下降', icon: '🐌' },
  fleeFlat:    { name: '迴避下降', icon: '🎯' },
  dmgTakenPct: { name: '受傷加重', icon: '💥' },
};
function pDebuffAdd(key, value, sec, once) {
  if (!PLAYER_DEBUFF_KEYS.includes(key) || !value) return;
  state.pdebuff = state.pdebuff || {};
  const cur = state.pdebuff[key];
  const until = Date.now() + sec * 1000;
  // 同一種不疊加，取「影響比較大的」那個並刷新時間（比絕對值，因為挑釁的 atkPct 是正的）
  if (!cur || Math.abs(value) >= Math.abs(cur.v)) state.pdebuff[key] = { v: value, until, once: !!once };
  else cur.until = Math.max(cur.until, until);
}
function pDebuff(key) {
  const b = state.pdebuff && state.pdebuff[key];
  if (!b) return 0;
  if (Date.now() >= b.until) { delete state.pdebuff[key]; return 0; }
  return b.v;
}
function pDebuffList() {
  if (!state.pdebuff) return [];
  return PLAYER_DEBUFF_KEYS.filter(k => pDebuff(k) !== 0);
}
// 永恆之光那種「只作用於下一擊」的：結算完就拔掉
function pDebuffConsumeOnce(key) {
  const b = state.pdebuff && state.pdebuff[key];
  if (b && b.once) delete state.pdebuff[key];
}
/* 受到傷害時的防禦：把 defPct 套上去。硬防軟防一起打折，跟狂暴那條同樣的做法。 */
function debuffedDef(hardDef, softDef) {
  /* `type:'def'` 的 buff 以前**推了卻沒有任何地方讀**——霸體從來沒有真的提升過 DEF，
     跟 #24 的 buff_flee 是一模一樣的問題。做集中攻擊（代價是 DEF −5%~25%，走同一個
     buff 型別）時撞到，順手一起修。這裡是玩家物防的唯一出入口，套在這裡兩者都生效。 */
  const b = buffMult('def');
  const pct = pDebuff('defPct');
  const m = Math.max(0, 1 + pct / 100) * b.mult;
  /* 聖母之祈福（#64）是**固定值** +50~250，跟霸體那種百分比是兩回事。
     加在乘數之後：官方順序是「裝備DEF 先算完再加上這一筆」，
     而且只加硬防——官方那個數字寫的是「裝備物理防禦力」，軟防是等級與 VIT 來的。 */
  const flat = b.flatBonus || 0;
  if (m === 1 && !flat) return [hardDef, softDef];
  return [Math.round(hardDef * m) + flat, Math.round(softDef * m)];
}
/* 受到的傷害倍率：異常狀態（睡眠 ×1.5）、臨時減益（永恆之光）與
   減傷型 buff（武僧的金剛不壞 −10~20%）合在一起。 */
/* 霸王魂（#79 神行太保）：機率讓這一擊只吃一半，並把擋下的那一半反射回去。
   回傳實際要吃的傷害。次數用完 buff 自己消失。
   **有副作用**（扣次數、反射傷害），所以一次攻擊只能呼叫一次。 */
function rejectSwordAbsorb(dmg, mon, monDef) {
  const b = state.buffs.find(x => x.type === 'reject' && (x.charges || 0) > 0);
  if (!b || dmg <= 0) return dmg;
  if (Math.random() * 100 >= (b.flatBonus || 0)) return dmg;
  b.charges -= 1;
  const kept = Math.floor(dmg / 2);
  const reflected = dmg - kept;
  logMsg(`⚔️ 「霸王魂」擋下一半（剩 ${b.charges} 次），反射 ${reflected} 點傷害！`);
  /* 反射打的是**怪物**。不要用 takeReflectDamage()——那支是反過來的
     （怪物的反射盾把傷害彈回玩家身上），拿來用會變成自己扣血。 */
  if (mon && reflected > 0) {
    mon.hp -= reflected;
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + reflected, 'normal');
    if (mon.hp <= 0 && monDef) killMonster(monDef, mon);
  }
  if (b.charges <= 0) {
    state.buffs = state.buffs.filter(x => x !== b);
    logMsg('⚔️ 霸王魂的次數用完了。');
  }
  return kept;
}

function playerDmgTakenMult() {
  return playerAilDmgTakenMult() * (1 + pDebuff('dmgTakenPct') / 100) * buffMult('dmgtaken').mult;
}

/* 光之盾（#66）：被攻擊時 10%~40% 機率**完全免除**這一次傷害，內部冷卻 5 秒。

   使用者 2026-08-09 兩次修正後的定版：一開始做成常駐減傷，但常駐對場上五隻怪的
   每一下都生效，等於憑空多一倍有效血量；改成觸發式之後又確認**是免傷一次不是減傷**——
   所以這支回傳的是「這一擊有沒有被整個吃掉」，不是傷害倍率。

   冷卻**只在成功免傷時**才進——擲骰失敗還在冷卻中的話，
   Lv1（10%）等於每 5 秒只有一次 10% 的機會，實際免傷率會掉到 2% 上下，
   那不是技能說明上寫的數字。

   **有副作用**（寫冷卻時間戳），所以只能在真的結算傷害時呼叫一次，
   不要拿去做預覽或估算。 */
function defenderNegates() {
  const pct = state.defenderProcPct || 0;
  if (!pct) return false;
  if (Date.now() < (state.defenderReadyAt || 0)) return false;
  if (Math.random() * 100 >= pct) return false;
  state.defenderReadyAt = Date.now() + (state.defenderProcCdSec || 5) * 1000;
  return true;
}

/* ---------------- 怪物技能 ----------------
   資料在 js/monster_skills.js（由 tools/import_monster_skills.js 從 rAthena 匯入）。
   每隻怪在自己攻擊的時候擲一次，命中的技能取代那一次普通攻擊。
   冷卻記在**怪物實體**上，所以同一種怪的不同隻各自獨立。 */
/* ---------------- 怪物身上的增益（#36）----------------
   官方有一大批「怪物對自己施加增益」的技能（NPC_POWERUP、CR_AUTOGUARD、
   CR_REFLECTSHIELD…），本作原本完全沒有「怪物身上的 buff」這個概念，
   所以那 80 幾條一直躺在未對照清單裡。

   一律存在怪物實例的 `mon.mbuff` 上（不是怪物定義），跟怪一起消滅，不寫進存檔。
     atkPct   攻擊力 +N%
     aspdPct  攻擊速度 +N%（縮短攻擊間隔）
     fleeFlat 迴避 +N 點（**點數不是%**：命中判定已經是差值制，
              百分比會被放大成幾十個百分點，20% 就足以把命中從 46% 打到 5%）
     cutPct   受到的傷害 −N%
     block    機率完全擋下玩家的攻擊（自動防禦）
     reflect  把受到的近距離傷害反彈 N% 回去
     maxRoll  傷害固定取最大值 */
const MON_BUFF_KEYS = ['atkPct', 'aspdPct', 'fleeFlat', 'cutPct', 'block', 'reflect', 'maxRoll'];
function monBuffAdd(mon, key, value, sec) {
  if (!mon || !MON_BUFF_KEYS.includes(key)) return;
  mon.mbuff = mon.mbuff || {};
  const cur = mon.mbuff[key];
  const until = Date.now() + sec * 1000;
  // 同一種增益不疊加，取較強的那個並刷新時間（不然怪會把自己疊到無敵）
  if (!cur || value >= cur.v) mon.mbuff[key] = { v: value, until };
  else cur.until = Math.max(cur.until, until);
}
function monBuff(mon, key) {
  const b = mon && mon.mbuff && mon.mbuff[key];
  if (!b) return 0;
  if (Date.now() >= b.until) { delete mon.mbuff[key]; return 0; }
  return b.v;
}
function monBuffList(mon) {
  if (!mon || !mon.mbuff) return [];
  return MON_BUFF_KEYS.filter(k => monBuff(mon, k) > 0);
}
/* 玩家打到怪物時，怪物身上的增益怎麼吃這一擊。
   回傳 { dmg, blocked, reflect }——blocked 代表整下被擋掉。 */
function monsterAbsorb(mon, dmg, isMelee) {
  if (!mon || !mon.mbuff) return { dmg, blocked: false, reflect: 0 };
  const blk = monBuff(mon, 'block');
  if (blk > 0 && Math.random() * 100 < blk) return { dmg: 0, blocked: true, reflect: 0 };
  const cut = monBuff(mon, 'cutPct');
  const out = cut > 0 ? Math.max(1, Math.round(dmg * (1 - cut / 100))) : dmg;
  const refPct = isMelee ? monBuff(mon, 'reflect') : 0;
  return { dmg: out, blocked: false, reflect: refPct > 0 ? Math.max(1, Math.round(out * refPct / 100)) : 0 };
}

/* 反射盾把傷害彈回玩家身上。走玩家的硬防／軟防，但**不會把玩家打死**——
   反射是自己打出去換來的，站著被自己的輸出反殺體驗太差（跟持續傷害同一個原則）。 */
function takeReflectDamage(monDef, amount) {
  const dmg = mitigatePlayerIncoming(amount, ...debuffedDef(state.defHard, state.defSoft));
  state.hp = Math.max(1, state.hp - dmg);
  logMsg(`🔁 ${monDef.name} 的反射盾彈回了 ${dmg} 點傷害！`);
  if (typeof showPlayerFloat === 'function') showPlayerFloat('-' + dmg, 'element-bad');
}

/* 玩家的反射（#17 的獸人領主 30% / 獸人戰士長 5% 那批卡片）。
   官方寫的是「受到近距離物理攻擊時，N% 的傷害反射給敵人」——
   反射的是**已經扣完防禦的實際傷害**，而且不吃怪物的防禦（官方反射無視 DEF）。 */
/* 鎧甲屬性的優先順序（同時插了兩張以上時取最前面那個）。
   順序是「愈稀有／愈極端的先」——巫婆與天使波利各自免疫一個屬性但對剋星吃雙倍，
   是有明確取捨的選擇；幽靈波利是全面小幅減傷，當墊底的預設比較合理。 */
/* 前三個是原本就有卡片的屬性，順序不能動（同時插兩張時要維持既有結果）。
   後面補齊其餘屬性：這份清單漏了哪個屬性，`armorEle_<那個屬性>` 就會**默默沒作用**——
   醬缸章魚卡片（水）就是這樣寫好了卻不生效（#126）。列全比列剛好安全。 */
const ARMOR_ELEMENT_PRIORITY = ['shadow', 'holy', 'ghost', 'water', 'fire', 'wind', 'earth', 'poison', 'undead'];

function applyPlayerReflect(mon, monDef, dmgTaken) {
  // 反射盾（#66）跟卡片的反射相加：官方兩者本來就是各自獨立的一份比率
  const pct = (state.cardReflectPct || 0) + buffMult('reflect').flatBonus;
  if (!pct || !mon || dmgTaken <= 0) return;
  const back = Math.max(1, Math.round(dmgTaken * pct / 100));
  mon.hp -= back;
  if (!_dpsPaused && state && state.dpsTracker) state.dpsTracker.damage += back;
  logMsg(`🔁 反射！對 ${monDef.name} 彈回 ${back} 點傷害。`);
  if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + back, 'normal');
  if (mon.hp <= 0) killMonster(monDef, mon);
}

/* 場上血量比例最低的「同伴」（不含自己），給 friendhpltmaxrate 用 */
function lowestHpAlly(mon) {
  let best = null, bestPct = 2;
  (state.monsters || []).forEach(m => {
    if (m === mon || m.hp <= 0 || !m.maxHp) return;
    const p = m.hp / m.maxHp;
    if (p < bestPct) { bestPct = p; best = m; }
  });
  return best;
}

/* 技能的觸發條件（官方 mob_skill_db 第 10、11 欄）。
   以前整欄被忽略，所以死靈那條「HP 低於 30% 才補血」變成每 5 秒無條件補一次。 */
function monsterSkillCondMet(e, mon) {
  const c = e.cond;
  if (!c) return true;
  const pct = mon.maxHp ? (mon.hp / mon.maxHp) * 100 : 100;
  if (c.hpLt != null && !(pct < c.hpLt)) return false;
  if (c.hpIn && !(pct >= c.hpIn[0] && pct <= c.hpIn[1])) return false;
  if (c.friendHpLt != null) {
    const f = lowestHpAlly(mon);
    if (!f || (f.hp / f.maxHp) * 100 >= c.friendHpLt) return false;
  }
  return true;
}

/* 治療量走官方公式（rAthena `skill_calc_heal()` 的 AL_HEAL 分支）：
     floor((施法者等級 + INT) / 8) × (4 + 技能等級 × 8)
   以前是寫死的「最大HP × 15%」，對死靈（38 萬血）等於一次補 57,000，
   官方其實只有 floor((77+67)/8) × (4+11×8) = 18 × 92 = 1,656。
   血越厚的怪錯得越誇張——這就是使用者回報「補血量太誇張」的成因。 */
function monsterHealAmount(monDef, skillLv) {
  const lv = monDef.level || 1;
  const int_ = monDef.mobInt || 0;
  return Math.max(1, Math.floor((lv + int_) / 8) * (4 + (skillLv || 1) * 8));
}

function monsterSkillFor(mon, monDef) {
  const list = (typeof MONSTER_SKILLS !== 'undefined') && MONSTER_SKILLS[mon.defId];
  if (!list || !list.length) return null;
  const now = Date.now();
  mon.skCd = mon.skCd || {};
  for (const e of list) {
    // 冷卻是「同一個技能」共用的，帶條件與不帶條件的同名技能不各自計時
    if (now < (mon.skCd[e.s] || 0)) continue;
    if (!monsterSkillCondMet(e, mon)) continue;
    // 血已經滿了就不要浪費出手機會去補血（也避免刷一排無意義的訊息）
    if (e.heal) {
      const t = e.healFriend ? lowestHpAlly(mon) : mon;
      if (!t || t.hp >= t.maxHp) continue;
    }
    if (Math.random() * 100 >= e.rate) continue;
    mon.skCd[e.s] = now + e.cd * 1000;
    return e;
  }
  return null;
}

/* ---------------- 怪物端的暈眩 ----------------
   技能造成的暈眩走這條（不吃 BOSS 減半，維持既有平衡），卡片造成的走 applyAilment()。
   additive=true 時會疊加時長（滑動/睡魔/定位陷阱共用），否則直接覆蓋（衝鋒箭） */
function applyStun(mon, sec, additive) {
  const now = Date.now();
  const wasStunned = mon.stunnedUntil && now < mon.stunnedUntil;
  if (additive) {
    mon.stunnedUntil = Math.max(now, mon.stunnedUntil || 0) + sec * 1000;
  } else {
    mon.stunnedUntil = now + sec * 1000;
  }
  // 一併登記成正式的異常狀態，讓畫面上的狀態圖示看得到
  mon.ail = mon.ail || {};
  mon.ail.stun = Math.max(mon.ail.stun || 0, mon.stunnedUntil);
  // 只有從沒暈到暈才出聲，續暈不重放
  if (!wasStunned && typeof playStatusSound === 'function') playStatusSound('stun');
}

// 冰凍術/石化術：被反制暈眩的目標，之後只要受到我方魔法傷害就會提前甦醒
function wakeIfFrozen(mon) {
  if (mon && mon.frozenByProc) {
    mon.stunnedUntil = Date.now();
    if (mon.ail) { delete mon.ail.stun; delete mon.ail.freeze; }
    mon.frozenByProc = false;
  }
}

/* 卡片觸發的異常狀態。trigger：'attack' 普攻命中後／'hit' 被打到後／'magic' 魔法技能命中後。
   type 可以寫成 'stun+curse+blind+stone'，代表隨機挑一種（火焰顱骨卡片）。

   `target`（#17 新增）：官方有一批卡片寫的是「對敵人**和自身**施毒」——
   代價跟效果綁在同一句話裡。只做敵人那半邊會讓毒液魔／諾博斯／皮影魔
   從「有取捨」變成「純賺」，那正是 #16 當初整張跳過那批卡的理由。
     'enemy'（預設）只打敵人／'self' 只打自己／'both' 兩邊各擲一次抗性
   自身那半邊走 applyPlayerAilment()，所以卡片的 ailResist_* 抗性照樣擋得下來。

   `melee`：官方寫「近距離物理攻擊時」的那幾張。本作以「手上不是弓」為準，
   跟反射盾（monsterAbsorb）用的是同一個判斷。 */
function tryCardAilments(trigger, mon) {
  if (!state.cardAilments) return;
  const list = state.cardAilments[trigger];
  if (!list || !list.length) return;
  const monDef = mon ? MONSTERS[mon.defId] : null;
  const melee = !isBowWeapon(getEquipBaseItemId('weapon'));
  list.forEach(e => {
    if (e.melee && !melee) return;
    if (Math.random() * 100 >= e.chance) return;
    const pool = String(e.type).split('+');
    const type = pool[Math.floor(Math.random() * pool.length)];
    const tgt = e.target || 'enemy';
    if (tgt !== 'self' && mon && monDef) applyAilment(mon, monDef, type);
    if (tgt !== 'enemy') applyPlayerAilment(type);
  });
}

/* ---------------- 獵人陷阱：被動觸發（攻擊時機率/固定觸發，各自獨立冷卻）---------------- */
const TRAP_SKILL_IDS = ['trap', 'skidtrap', 'flasher', 'sleeptrap', 'freezingtrap', 'blastmine', 'claymoretrap', 'magnumbreak_h'];
function tryTrapProcs(target, monDef) {
  if (!state.learnedSkills) return;
  if (!state.trapReadyAt) state.trapReadyAt = {};
  TRAP_SKILL_IDS.forEach(skillId => {
    const lv = state.learnedSkills[skillId];
    if (!lv) return;
    const readyAt = state.trapReadyAt[skillId] || 0;
    if (Date.now() < readyAt) return;

    const sk = findSkillById(skillId);
    let proc = false;
    if (sk.procChance == null) {
      proc = true; // 定時爆炸陷阱：無機率判定，冷卻好就必定觸發
    } else {
      const baseChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
      const chance = Math.min(100, baseChance + (state.trapChanceBonusPct || 0));
      proc = Math.random() * 100 < chance;
    }
    if (!proc) return;

    const cdSec = Math.max(1, (sk.internalCooldown || 10) - (state.trapCdReductionSec || 0));
    state.trapReadyAt[skillId] = Date.now() + cdSec * 1000;

    if (sk.trapEffect === 'stun') {
      applyStun(target, sk.stunSec || 1, true);
      logMsg(`💥 「${sk.name}」觸發！${monDef.name} 暈眩了！`);
    } else if (sk.trapEffect === 'hitDebuff') {
      const hitDebuff = Array.isArray(sk.hitDebuff) ? sk.hitDebuff[lv - 1] : sk.hitDebuff;
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      target.debuffHit = hitDebuff;
      target.debuffHitEnd = Date.now() + dur * 1000;
      logMsg(`💥 「${sk.name}」觸發！${monDef.name} 的命中下降了！`);
    } else if (sk.trapEffect === 'damage') {
      const mult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      const elemMult = getElementMultiplierVsMonster(sk.element || 'none', monDef, target);
      const dmg = mitigateDamage(skillBaseDamage(false, monDef, elemMult) * mult, ...defOf(monDef));
      target.hp -= dmg;
      logMsg(`💥 「${sk.name}」觸發！對 ${monDef.name} 造成 ${dmg} 點傷害！`);
      if (target.hp <= 0) killMonster(monDef, target);
    } else if (sk.trapEffect === 'damageAoe') {
      const mult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      logMsg(`💥 「${sk.name}」觸發！範圍爆炸！`);
      for (let i = state.monsters.length - 1; i >= 0; i--) {
        const mon = state.monsters[i];
        const mDef = MONSTERS[mon.defId];
        const elemMult = getElementMultiplierVsMonster(sk.element || 'none', mDef, mon);
        const dmg = mitigateDamage(skillBaseDamage(false, mDef, elemMult) * mult, ...defOf(mDef));
        mon.hp -= dmg;
        logMsg(`  → 對 ${mDef.name} 造成 ${dmg} 點傷害！`);
        if (mon.hp <= 0) killMonster(mDef, mon);
      }
    }
  });
}

/* ---------------- 冰凍術/石化術：被攻擊時機率反制暈眩並造成魔法傷害（各自獨立冷卻）---------------- */
const MAGIC_STUN_SKILL_IDS = ['frostdiver', 'stonecurse'];
function tryMagicStunProcs(mon, monDef) {
  if (!state.learnedSkills) return;
  if (!state.magicStunReadyAt) state.magicStunReadyAt = {};
  MAGIC_STUN_SKILL_IDS.forEach(skillId => {
    const lv = state.learnedSkills[skillId];
    if (!lv) return;
    const readyAt = state.magicStunReadyAt[skillId] || 0;
    if (Date.now() < readyAt) return;

    const sk = findSkillById(skillId);
    const chance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
    if (Math.random() * 100 >= chance) return;

    const cdSec = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
    state.magicStunReadyAt[skillId] = Date.now() + cdSec * 1000;

    const stunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 10);
    applyStun(mon, stunSec, true);
    mon.frozenByProc = true;
    const dmgMult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
    const elemMult = getElementMultiplierVsMonster(sk.element || 'none', monDef, mon);
    const dmg = mitigateDamage(state.matk * dmgMult * elemMult, ...defOf(monDef, 1, true));
    mon.hp -= dmg;
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', sk.element || null);
    logMsg(`❄️ 「${sk.name}」觸發！${monDef.name} 暈眩了，並受到 ${dmg} 點魔法傷害！`);
    if (mon.hp <= 0) killMonster(monDef, mon);
  });
}

// 長矛刺擊：被攻擊時機率反制，對攻擊者造成傷害並使其暈眩（需裝備矛類武器，不影響原本受到的傷害）
/* 傷害增壓／巧打（#58 二版）：普攻命中後機率追加一段傷害＋異常狀態。

   使用者把這兩個從主動技改成被動，所以不扣 SP、不佔技能冷卻，
   改用各自的內部冷卻節流（`state.onAttackStrikeReadyAt[技能id]`）。
   傷害走跟技能一樣的官方鏈（`skillBaseDamage`），所以體型／屬性／武器浮動都吃得到。 */
function tryOnAttackStrikes(target, monDef) {
  const list = state.onAttackStrikes;
  if (!list || !list.length || !target || target.hp <= 0) return;
  if (!state.onAttackStrikeReadyAt) state.onAttackStrikeReadyAt = {};
  const now = Date.now();
  for (const e of list) {
    if (target.hp <= 0) break;
    if (now < (state.onAttackStrikeReadyAt[e.id] || 0)) continue;
    if (Math.random() * 100 >= e.chance) continue;
    state.onAttackStrikeReadyAt[e.id] = now + e.cdSec * 1000;

    const elemMult = getElementMultiplierVsMonster('neutral', monDef, target);
    const dmg = mitigateDamage(
      skillBaseDamage(false, monDef, elemMult) * e.mult * cardTargetDmgMult(monDef) * ailDmgTakenMult(target),
      ...defOf(monDef, 1, false, target)) + raceFlatBonus(monDef);
    target.hp -= dmg;
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal');
    logMsg(`⚔️ 「${e.name.split(' ')[0]}」發動！追加 ${dmg} 點傷害！`);
    ailBreakOnDamage(target, monDef);

    if (e.inflict && target.hp > 0) {
      const ic = Array.isArray(e.inflict.chance) ? e.inflict.chance[e.lv - 1] : e.inflict.chance;
      if (Math.random() * 100 < ic) {
        const pool = String(e.inflict.type).split('+');
        applyAilment(target, monDef, pool[Math.floor(Math.random() * pool.length)]);
      }
    }
    if (target.hp <= 0) killMonster(monDef, target);
  }
}

/* 治療術（#97）：全隊有人中沉默／混亂／黑暗就自動解除，內部冷卻 10 秒。

   隊友那半邊現在還碰不到——`monsterAttackAlly()` 不會掛異常狀態，所以隊友身上
   一直是空的。照樣寫進去是因為規則是「全隊」，等哪天怪會對隊友下狀態就自動生效，
   不必回頭再想起這件事。 */
function tickPartyAutoCure() {
  const now = Date.now();
  /* 誰有這支被動、誰的冷卻好了就誰解（#105）。以前只認玩家身上那一份，
     祭司隊友的治療術等於不存在。倒地的隊友不算施術者。 */
  const caster = partySupportCasters().find(c => c.hasPartyAutoCure && now >= (c.partyAutoCureReadyAt || 0));
  if (!caster) return;
  const types = caster.partyAutoCureTypes || [];
  const cured = [];
  const clear = (holder, who) => {
    if (!holder || !holder.playerAil) return;
    types.forEach(t => {
      if (holder.playerAil[t] && holder.playerAil[t] > now) {
        delete holder.playerAil[t];
        cured.push(`${who}的${(PLAYER_AILMENTS[t] || {}).name || t}`);
      }
    });
  };
  clear(state, '你');
  allyList().forEach(a => clear(a, a && a._allyName));
  if (!cured.length) return;
  caster.partyAutoCureReadyAt = now + (caster.partyAutoCureCooldownSec || 10) * 1000;
  const by = caster === state ? '' : `（${caster._allyName}）`;
  logMsg(`💊 治療術發動${by}，解除了${cured.join('、')}。`);
}

/* 沉默之術（#95）：普攻機率讓目標沉默。使用者指定「20% 機率、冷卻 10 秒」，
   所以機率過了還要看內部冷卻——不然一場戰鬥裡目標幾乎不會有能開口的時候。
   走 `applyAilment()`，BOSS 的持續時間自動減半、免疫種族自動擋下。 */
function tryPriestProcs(target, monDef) {
  if (!state.hasAttackSilenceProc || !target || target.hp <= 0) return;
  const now = Date.now();
  if (now < (state.attackSilenceReadyAt || 0)) return;
  if (Math.random() * 100 >= (state.attackSilenceChance || 0)) return;
  state.attackSilenceReadyAt = now + (state.attackSilenceCooldownSec || 10) * 1000;
  if (applyAilment(target, monDef, 'silence', { sec: state.attackSilenceSec || 8 })) {
    logMsg(`🤐 沉默之術發動！${monDef.name} 沉默了！`);
  }
}

/* 野蠻凶砍（#60）：buff 在身上時，普攻機率削弱目標的物攻或物防。
   兩個機率各擲各的（官方就是兩個獨立數字），所以可能一次同時中兩個。 */
function tryMeltdown(target, monDef) {
  if (!target || target.hp <= 0) return;
  /* 來源有兩個（#133）：野蠻凶砍那個主動 buff，以及卡片。
     官方寫「破壞武器／鎧甲」的卡片（闇●神工匠 哈沃得）在本作走同一條路——
     裝備損壞永久 N/A，照 #60 訂下的慣例換成降對方物攻／物防。
     兩個來源的機率各自獨立，同時有就都擲。 */
  const fromCard = (getCardBonus('meltdownAtkChance') || getCardBonus('meltdownDefChance'))
    ? { atkChance: getCardBonus('meltdownAtkChance'), defChance: getCardBonus('meltdownDefChance'),
        debuffMult: 0.8, debuffSec: 10 }
    : null;
  const b = state.buffs.find(x => x.type === 'meltdown') || fromCard;
  if (!b) return;
  const ms = (b.debuffSec || 10) * 1000;
  if (Math.random() * 100 < (b.atkChance || 0)) {
    target.debuffAtk = b.debuffMult || 0.8;
    target.debuffAtkEnd = Date.now() + ms;
    logMsg(`🔥 野蠻凶砍：${monDef.name} 的攻擊力下降了！`);
  }
  if (Math.random() * 100 < (b.defChance || 0)) {
    target.debuffDef = b.debuffMult || 0.8;
    target.debuffDefEnd = Date.now() + ms;
    logMsg(`🔥 野蠻凶砍：${monDef.name} 的防禦力下降了！`);
  }
}

/* 手推車加速（#60）：官方是移速 +20% 的主動 buff，本作沒有移動，
   比照騎乘術與月夜貓改成**生怪加速**。使用者指定做成會自己續的被動——
   持續 60 秒、冷卻 10 秒，所以有大約 86% 的時間開著。 */
function tickCartBoost() {
  if (!state.hasCartBoost) return;
  const now = Date.now();
  if (state.buffs.some(b => b.type === 'spawnspeed')) return;
  if (now < (state.cartBoostReadyAt || 0)) return;
  state.cartBoostReadyAt = now + (state.cartBoostDurSec + state.cartBoostCdSec) * 1000;
  state.buffs.push({ type: 'spawnspeed', mult: state.cartBoostMult,
    msRemaining: state.cartBoostDurSec * 1000, skillId: 'ws_cartboost' });
}

/* 屬性別的傷害加成 buff（#59 致命塗毒的「毒傷害 +100%」）。
   buff 型別寫成 `eledmg_<屬性>`，所以之後要做「火傷害+N%」不必再改這裡。 */
function elementDmgMult(ele) {
  if (!ele || !state.buffs || !state.buffs.length) return 1;
  return buffMult('eledmg_' + ele).mult;
}

/* 致命塗毒（#59）：打到**中毒**的敵人時觸發。

   官方是主動 buff、消耗毒藥瓶×1、自己攻擊時再去讓對方中毒；
   使用者改成被動並反過來——先中毒才觸發，瓶子只當門票不消耗。
   所以毒的來源（塗毒、毒刃、卡片異常狀態）自然變成這個職業的前置，
   官方那條「先上毒再爆發」的節奏用不同的形狀保住了。 */
const EDP_BOTTLE_ITEM = 'poison_bottle';

/* 這隻怪中毒了沒。

   **本作有兩套毒**，兩套都算：
     `mon.poisonDotEnd` —— 塗毒／施毒那條舊的持續傷害（applyPoisonDot）
     `mon.ail.poison`   —— #29 的異常狀態系統（applyAilment）
   只認其中一套會很難發現：刺客自己的塗毒走的是**舊那條**，
   只判 ailActive 的話，這個職業用自己的招數反而觸發不了自己的技能。 */
function monPoisoned(mon) {
  if (!mon) return false;
  if (ailActive(mon, 'poison')) return true;
  return !!(mon.poisonDotEnd && Date.now() < mon.poisonDotEnd);
}

function tryEdpProc(target) {
  if (!state.hasEdpProc || !target) return;
  if (Date.now() < (state.edpReadyAt || 0)) return;
  if (!monPoisoned(target)) return;
  // 身上要有毒藥瓶（不消耗）
  if (typeof getItemQty === 'function' && getItemQty(EDP_BOTTLE_ITEM) <= 0) return;
  state.edpReadyAt = Date.now() + state.edpCdSec * 1000;
  const ms = state.edpDurSec * 1000;
  state.buffs.push({ type: 'weaponatk', mult: state.edpWeaponMult, msRemaining: ms, skillId: 'asc_edp' });
  state.buffs.push({ type: 'eledmg_poison', mult: state.edpPoisonMult, msRemaining: ms, skillId: 'asc_edp' });
  logMsg(`☠️ 致命塗毒發動！裝備ATK ×${state.edpWeaponMult}、毒屬性傷害 ×${state.edpPoisonMult}，持續 ${state.edpDurSec} 秒。`);
  recomputeDerived(false);
}

/* 黑暗瞬間（#59）：普攻機率觸發的**物理**範圍追擊。

   既有的三個範圍被動（火之獵殺、火柱攻擊、霜凍之術）走的都是 `state.matk`，
   這支不能共用——官方黑暗瞬間是近距離物理，傷害要走 weaponChainDamage 那條鏈，
   體型／屬性／武器浮動才會照官方只作用在武器 ATK 上。 */
function tryPhysAoeStrikes(monDef) {
  const list = state.physAoeStrikes;
  if (!list || !list.length || !state.monsters || !state.monsters.length) return;
  if (!state.physAoeReadyAt) state.physAoeReadyAt = {};
  const now = Date.now();
  for (const e of list) {
    if (now < (state.physAoeReadyAt[e.id] || 0)) continue;
    if (Math.random() * 100 >= e.chance) continue;
    if (e.cdSec) state.physAoeReadyAt[e.id] = now + e.cdSec * 1000;
    logMsg(`🌑 「${e.name.split(' ')[0]}」發動！`);
    for (let i = state.monsters.length - 1; i >= 0; i--) {
      const mon = state.monsters[i];
      const md = MONSTERS[mon.defId];
      if (!md) continue;
      const elemMult = getElementMultiplierVsMonster(e.element, md, mon) * elementDmgMult(e.element);
      const dmg = mitigateDamage(
        skillBaseDamage(false, md, elemMult) * e.mult * cardTargetDmgMult(md) * ailDmgTakenMult(mon),
        ...defOf(md, 1, false, mon)) + raceFlatBonus(md);
      mon.hp -= dmg;
      wakeIfFrozen(mon);
      pushCombatLog(`  → 對 ${md.name} 造成 ${dmg} 點傷害！`);
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal');
      ailBreakOnDamage(mon, md);
      if (e.inflict && mon.hp > 0) {
        const ic = Array.isArray(e.inflict.chance) ? e.inflict.chance[e.lv - 1] : e.inflict.chance;
        if (Math.random() * 100 < ic) {
          const pool = String(e.inflict.type).split('+');
          applyAilment(mon, md, pool[Math.floor(Math.random() * pool.length)]);
        }
      }
      if (mon.hp <= 0) killMonster(md, mon);
    }
    if (typeof renderLog === 'function') renderLog();
  }
}

/* 咖般塔音（#63）：普攻機率讓**全場**暈眩，每次觸發**消耗**藍色與黃色魔力礦石各 1 個。

   官方是消耗兩顆礦石去消除地面效果——本作沒有可以消的對象（怪物沒有地面技能），
   所以使用者把它改成控場。

   礦石第一版是「帶著就好、不消耗」（比照致命塗毒的毒藥瓶），
   使用者 2026-08-09 改成**照官方消耗**：全場 50% 暈眩太強，得有持續成本，
   「要嘛準備好物品，要嘛放棄」。所以這一招的續航直接綁在礦石庫存上——
   藍 10 隻、黃 12 隻可遇怪會掉，補給跟得上才用得起。

   **先扣礦石再擲骰**：官方是施放就消耗，命不命中是另一回事；
   而且若改成「擲中才扣」，冷卻已經先寫下去了，等於有機率白嫖一次冷卻。 */
const GANBANTEIN_STONES = ['blue_gemstone', 'yellow_gemstone'];
// 四種屬性抵抗藥水各自要的配藥等級（#72）
const ELE_RESIST_PHARMACY_LV = { fire: 5, water: 6, earth: 7, wind: 8 };
/* 詩人／舞孃的普攻觸發被動（#68）。三組各自獨立擲骰、各自獨立冷卻：

     aoeAilmentProcs  冷笑話（全體冰凍）／驚聲尖叫（全體暈眩 0.5 秒）／醜陋之舞（全體暈眩 1 秒）
     aoeMagicProcs    不諧和音（全體無屬性魔法 MATK 110~150%）
     dualAilmentProcs 陣痛之聲／眨眼之誘（單體，混亂與出血各擲一次）

   冷卻時間戳存在 `state.songProcReadyAt[技能id]`，跟其他 proc 一樣不進 recomputeDerived，
   所以重算不會把冷卻洗掉。 */
function trySongProcs(target, monDef) {
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  const ready = (p) => now >= (state.songProcReadyAt[p.id] || 0);
  const arm = (p) => { state.songProcReadyAt[p.id] = now + (p.cdSec || 0) * 1000; };

  (state.aoeAilmentProcs || []).forEach(p => {
    if (!state.monsters || !state.monsters.length) return;
    if (!ready(p) || Math.random() * 100 >= p.chance) return;
    arm(p);
    let hit = 0;
    state.monsters.forEach(mon => {
      const md = MONSTERS[mon.defId];
      if (!md) return;
      if (applyAilment(mon, md, p.ailment, { sec: p.sec })) hit++;
    });
    if (hit) logMsg(`🎵 「${p.name}」發動！${hit} 隻敵人中招。`);
  });

  (state.aoeMagicProcs || []).forEach(p => {
    if (!state.monsters || !state.monsters.length) return;
    if (!ready(p) || Math.random() * 100 >= p.chance) return;
    arm(p);
    logMsg(`🎵 「${p.name}」發動！`);
    for (let i = state.monsters.length - 1; i >= 0; i--) {
      const mon = state.monsters[i];
      const md = MONSTERS[mon.defId];
      if (!md) continue;
      const em = getElementMultiplierVsMonster(p.element, md, mon);
      const dmg = mitigateDamage(skillBaseDamage(true, md, em) * p.mult * (cardTargetDmgMult(md)) * ailDmgTakenMult(mon),
        ...defOf(md, 1, true, mon));
      mon.hp -= dmg;
      ailBreakOnDamage(mon, md);
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', p.element);
      if (mon.hp <= 0) killMonster(md, mon);
    }
  });

  (state.dualAilmentProcs || []).forEach(p => {
    if (!target || target.hp <= 0 || !monDef) return;
    if (!ready(p) || Math.random() * 100 >= p.chance) return;
    arm(p);
    const got = [];
    p.ailments.forEach(a => {
      if (Math.random() * 100 >= (a.chance || 0)) return;
      if (applyAilment(target, monDef, a.type)) got.push(MON_AILMENTS[a.type].name);
    });
    if (got.length) logMsg(`🎵 「${p.name}」發動！${monDef.name} 陷入${got.join('與')}。`);
  });
}

/* ---------------- 流氓的普攻觸發被動（#69）----------------
   官方 17 個技能裡有 9 個是主動技，使用者 2026-08-10 指定全部改成普攻觸發的被動
   （偷錢、卸除×4、潛擊、脅持、緊密的約束），各自帶內部冷卻。
   冷卻時間戳跟詩人那批共用 `state.songProcReadyAt`——那本來就是一張以技能 id 為 key 的表。 */
function tryRogueProcs(target, monDef) {
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  const ready = (id, cd) => {
    if (now < (state.songProcReadyAt[id] || 0)) return false;
    state.songProcReadyAt[id] = now + (cd || 0) * 1000;
    return true;
  };

  /* 偷錢：官方是主動技、成功率 1~10%，本作改成普攻觸發。
     使用者指定 DEX 99 時 +20%、LUK 99 時 +10%（線性換算），
     偷到的錢是「打死這隻怪會拿到的金額」的 10%。 */
  if (state.stealCoinChance && target && monDef) {
    const dexB = (state.stats.dex / 99) * state.stealCoinDexMax;
    const lukB = (state.stats.luk / 99) * state.stealCoinLukMax;
    const chance = state.stealCoinChance + dexB + lukB;
    if (Math.random() * 100 < chance && ready('rg_stealcoin', state.stealCoinCdSec)) {
      const full = Math.round((3 + (monDef.level || 1) * 1.4) * buffMult('gold').mult);
      const got = Math.max(1, Math.round(full * state.stealCoinPct / 100));
      state.gold += got;
      if (state.dpsTracker) state.dpsTracker.gold += got;
      logMsg(`💰 偷錢成功！從 ${monDef.name} 身上摸走了 ${got}z。`);
    }
  }

  /* 所有卸除（#79 神行太保）：一次判定、四個一起發動。
     借用既有的 stripProcs 定義（種類與倍率照那四個技能自己的設定），
     只換掉「各自擲骰」這件事——所以四個必須都已經學過。 */
  const fs = state.fullStrip;
  if (fs && target && target.hp > 0 && monDef && (state.stripProcs || []).length
      && Math.random() * 100 < fs.chance && ready('st_fullstrip', fs.cdSec)) {
    state.stripProcs.forEach(p => {
      let kind = p.kind, mult = p.mult;
      if (p.kind === 'matk' && !(monDef.matk > 0)) { kind = 'atk'; mult = p.fallbackMult; }
      applyStrip(target, p.id, kind, mult, fs.durSec);
    });
    logMsg(`🗡️ 「所有卸除」得手！${monDef.name} 的四項能力全部下降（${fs.durSec} 秒）。`);
  }

  // 卸除四連：各自擲骰、各自冷卻、各佔一格，所以會疊在一起
  (state.stripProcs || []).forEach(p => {
    if (!target || target.hp <= 0 || !monDef) return;
    if (Math.random() * 100 >= p.chance) return;
    if (!ready(p.id, p.cdSec)) return;
    /* 卸除頭盔官方削的是 INT。使用者指定改成 MATK −25%，怪沒有 MATK 就 ATK −10%。
       **本作目前沒有任何一隻怪帶 matk 欄位**（2,538 隻全部沒有），所以實務上一律走 ATK 那條，
       MATK 分支是留給日後真的給怪物加 MATK 時用的。 */
    let kind = p.kind, mult = p.mult;
    if (p.kind === 'matk' && !(monDef.matk > 0)) { kind = 'atk'; mult = p.fallbackMult; }
    applyStrip(target, p.id, kind, mult, p.durSec);
    logMsg(`🗡️ 「${p.name}」得手！${monDef.name} 的${p.label}下降了。`);
  });

  // 潛擊：範圍物理 + 異常 + 讓被打中的目標受到的傷害上升
  if (state.raidProc && state.monsters && state.monsters.length) {
    const p = state.raidProc;
    if (Math.random() * 100 < p.chance && ready('rg_raid', p.cdSec)) {
      logMsg(`🌑 「${p.name}」發動！`);
      for (let i = state.monsters.length - 1; i >= 0; i--) {
        const mon = state.monsters[i];
        const md = MONSTERS[mon.defId];
        if (!md) continue;
        const em = getElementMultiplierVsMonster('neutral', md, mon);
        const dmg = mitigateDamage(
          weaponChainDamage(md, em, false) * p.mult * cardTargetDmgMult(md) * ailDmgTakenMult(mon),
          ...defOf(md, 1, false, mon)) + raceFlatBonus(md);
        mon.hp -= dmg;
        ailBreakOnDamage(mon, md);
        if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal');
        if (mon.hp > 0) {
          if (Math.random() * 100 < p.ailChance) {
            applyAilment(mon, md, Math.random() < 0.5 ? 'stun' : 'blind');
          }
          mon.dmgTakenBoost = 1 + p.dmgTakenPct / 100;
          mon.dmgTakenBoostEnd = Date.now() + p.boostSec * 1000;
        }
        if (mon.hp <= 0) killMonster(md, mon);
      }
    }
  }

  // 脅持：官方的位移做不了（本作沒有座標），只留傷害那半
  // 闇●盜賊卡五件套（blockSnatch）：官方「不能使用脅持」——裝了套裝就封印這招
  if (state.intimidateProc && target && target.hp > 0 && monDef) {
    if (getCardBonus('blockSnatch') > 0) {
      logMsg(`🚫 闇●盜賊卡片套裝封印了「脅持」。`);
    } else {
    const p = state.intimidateProc;
    if (Math.random() * 100 < p.chance && ready('rg_intimidate', p.cdSec)) {
      const em = getElementMultiplierVsMonster('neutral', monDef, target);
      const dmg = mitigateDamage(
        weaponChainDamage(monDef, em, false) * p.mult * cardTargetDmgMult(monDef) * ailDmgTakenMult(target),
        ...defOf(monDef, 1, false, target)) + raceFlatBonus(monDef);
      target.hp -= dmg;
      logMsg(`🤝 「${p.name}」！對 ${monDef.name} 造成 ${dmg} 點傷害。`);
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal');
      if (target.hp <= 0) killMonster(monDef, target);
    }
    }
  }

  // 緊密的約束：官方是雙方定身，本作改成互相拉開迴避差距
  if (state.closeConfineProc && target && target.hp > 0 && monDef) {
    const p = state.closeConfineProc;
    if (Math.random() * 100 < p.chance && ready('rg_closeconfine', p.cdSec)) {
      target.debuffFlee = p.enemyFleeCut;
      target.debuffFleeEnd = Date.now() + p.durSec * 1000;
      state.buffs = state.buffs.filter(b => b.skillId !== 'rg_closeconfine');
      state.buffs.push({ type: 'flee', mult: 1, flatBonus: p.selfFlee, msRemaining: p.durSec * 1000, skillId: 'rg_closeconfine' });
      logMsg(`🪢 「${p.name}」！${monDef.name} 的迴避 −${p.enemyFleeCut}，自身迴避 +${p.selfFlee}，持續 ${p.durSec} 秒。`);
    }
  }
}

/* ---------------- 武僧：氣球體、連段與普攻觸發（#70）----------------

   三個進入點：
     tickSpirits()   每秒跑一次：補球、滿球時自動開爆氣、爆氣中滿球時自動開金剛不壞
     tryMonkProcs()  普攻命中後：吸氣、真劍百破道、浸透勁、彈指神通、發勁
     tryMonkCombo()  普攻命中後：六合拳 →（50%）連環全身掌 →（30%）猛龍誇強 →（20%）阿修羅霸凰拳

   氣球體 `state.spirits` **不歸 recomputeDerived 管**——它是跨 tick 的資源，
   跟冷卻時間戳同性質。上限 `state.spiritsMax` 才是技能給的設定值，每次重算會刷新，
   所以把蓄氣點數退掉時要順手把多出來的球夾回去（在 tickSpirits 開頭）。 */
// 發勁的自傷下限：HP 低於這個比例就不放（跟聖十字審判的 25% 同一組平衡參數）
const MONK_BALKYOUNG_HP_FLOOR = 0.25;
// 武術宗師（#79）：氣球體上限從 5 提高到 7，讓新增的兩招不會擠掉阿修羅的 5 顆
const CHAMPION_SPIRITS_MAX = 7;
function monkExplosionActive() {
  return state.buffs.some(b => b.skillId === 'mo_explosionspirits');
}
// 這一擊有沒有落在真劍百破道開的視窗裡（浸透勁與彈指神通的發動條件）
function monkBladeStopActive() {
  return Date.now() < (state.bladeStopEnd || 0);
}
/* 武僧各種追擊共用的一發傷害。
     ignoreDef  true＝完全不走減傷（浸透勁與阿修羅霸凰拳，官方就是無視防禦）
     defScale   >0 時傷害再隨目標的裝備防禦上升（浸透勁專用）
   回傳目標是否還活著，連段靠這個決定要不要往下接。 */
function monkStrike(target, monDef, mult, opts) {
  const o = opts || {};
  const em = getElementMultiplierVsMonster('neutral', monDef, target);
  let raw = weaponChainDamage(monDef, em, false) * mult
    * cardTargetDmgMult(monDef) * ailDmgTakenMult(target);
  if (o.defScale) raw *= 1 + (monDef.def || 0) / o.defScale;
  // 真劍百破道視窗：官方寫的就是「對被抓住的目標，彈指神通與浸透勁傷害 +50%」
  if (o.bladeStopBonus && monkBladeStopActive() && state.bladeStop) {
    raw *= 1 + state.bladeStop.dmgBonusPct / 100;
  }
  const dmg = (o.ignoreDef
    ? Math.max(1, Math.round(raw))
    : mitigateDamage(raw, ...defOf(monDef, 1, false, target))) + raceFlatBonus(monDef) + (o.flat || 0);
  target.hp -= dmg;
  ailBreakOnDamage(target, monDef);
  if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal');
  logMsg(`${o.icon || '👊'} 「${o.name}」造成 ${dmg} 點傷害！${o.suffix || ''}`);
  if (target.hp <= 0) { killMonster(monDef, target); return false; }
  return true;
}
function tickSpirits() {
  // 蓄氣沒點（或被退點）時，手上的球一律歸零／夾回上限
  if (!state.spiritsMax) { state.spirits = 0; state.spiritRefillAt = 0; return; }
  if ((state.spirits || 0) > state.spiritsMax) state.spirits = state.spiritsMax;
  const now = Date.now();

  if ((state.spirits || 0) < state.spiritsMax) {
    if (!state.spiritRefillAt) state.spiritRefillAt = now + state.spiritRefillSec * 1000;
    if (now >= state.spiritRefillAt) {
      state.spirits = (state.spirits || 0) + 1;
      state.spiritRefillAt = now + state.spiritRefillSec * 1000;
    }
  } else {
    state.spiritRefillAt = 0;
  }

  /* 爆氣：滿球自動引爆。暴擊走 crit buff 的 flatBonus（playerAttack 本來就在讀），
     SP 回復 −50% 走 sprate（passiveRegen 本來就在讀）——兩個都是既有的消費點。 */
  const e = state.explosionSpirits;
  if (e && (state.spirits || 0) >= e.cost && !monkExplosionActive()) {
    state.spirits -= e.cost;
    state.buffs.push({ type: 'crit', mult: 1, flatBonus: e.critFlat, msRemaining: e.durSec * 1000, skillId: 'mo_explosionspirits' });
    if (e.spRegenPct) {
      state.buffs.push({ type: 'sprate', mult: Math.max(0, 1 + e.spRegenPct / 100), msRemaining: e.durSec * 1000, skillId: 'mo_explosionspirits' });
    }
    logMsg(`🔥 「${e.name}」發動！暴擊率 +${e.critFlat}，持續 ${e.durSec} 秒（SP 自然回復減半）。`);
  }

  /* 金剛不壞：爆氣中再湊滿 5 顆就自動開。
     內部冷卻 60 秒是本作自訂的——不設的話它會把每一輪的球全吃掉，
     阿修羅霸凰拳永遠等不到 5 顆。 */
  const s = state.steelBody;
  if (s && monkExplosionActive() && (state.spirits || 0) >= s.cost
      && now >= (state.steelBodyReadyAt || 0)
      && !state.buffs.some(b => b.skillId === 'mo_steelbody')) {
    state.spirits -= s.cost;
    state.steelBodyReadyAt = now + s.cdSec * 1000;
    state.buffs.push({ type: 'dmgtaken', mult: Math.max(0, 1 - s.cutPct / 100), msRemaining: s.durSec * 1000, skillId: 'mo_steelbody' });
    logMsg(`🪨 「${s.name}」發動！受到的傷害 −${s.cutPct}%，持續 ${s.durSec} 秒。`);
  }

  /* 振氣注入：官方是把 1 顆氣球體給隊友。**本作沒有隊伍系統**，
     所以 monkPartyMembers() 永遠是空陣列，這段永遠不會成立。
     留著是為了等隊友模式開放時只要補那一支函式就會亮。 */
  const k = state.kiTranslation;
  if (k && (state.spirits || 0) >= 5 && now >= (state.kiTranslationReadyAt || 0)) {
    const mates = (typeof monkPartyMembers === 'function') ? monkPartyMembers() : [];
    if (mates.length) {
      state.spirits -= 1;
      state.kiTranslationReadyAt = now + k.cdSec * 1000;
      const who = mates[Math.floor(Math.random() * mates.length)];
      if (typeof who.giveSpirit === 'function') who.giveSpirit(1);
      logMsg(`🌀 「${k.name}」：分了 1 顆氣球體給隊友。`);
    }
  }
}
function tryMonkProcs(target, monDef) {
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  const ready = (id, cd) => {
    if (now < (state.songProcReadyAt[id] || 0)) return false;
    state.songProcReadyAt[id] = now + (cd || 0) * 1000;
    return true;
  };

  // 吸氣：官方吸的是目標身上的氣球體，只有對怪那半（機率回 SP）留得下來
  const ab = state.absorbSpirits;
  if (ab && state.sp < state.maxSp
      && Math.random() * 100 < ab.chance && ready('mo_absorbspirits', ab.cdSec)) {
    state.sp = Math.min(state.maxSp, state.sp + ab.spGain);
    logMsg(`🌀 「${ab.name}」回復了 ${ab.spGain} SP。`);
  }

  // 真劍百破道：開一個 10 秒的視窗，浸透勁與彈指神通只在視窗裡才會發動
  const bs = state.bladeStop;
  if (bs && !monkBladeStopActive() && (state.spirits || 0) >= bs.cost
      && ready('mo_bladestop', bs.cdSec)) {
    state.spirits -= bs.cost;
    state.bladeStopEnd = now + bs.durSec * 1000;
    logMsg(`🤲 「${bs.name}」！接下來 ${bs.durSec} 秒內浸透勁與彈指神通會發動（傷害 +${bs.dmgBonusPct}%）。`);
  }

  if (target && target.hp > 0 && monDef && monkBladeStopActive()) {
    // 浸透勁：無視防禦，而且傷害隨目標的防禦上升——專打高防怪的那一招
    const iv = state.investigate;
    if (iv && Math.random() * 100 < iv.chance && ready('mo_investigate', iv.cdSec)) {
      monkStrike(target, monDef, iv.mult,
        { name: iv.name, icon: '🫳', ignoreDef: true, defScale: iv.defScale, bladeStopBonus: true, suffix: '（無視防禦）' });
    }
  }
  if (target && target.hp > 0 && monDef && monkBladeStopActive()) {
    const fo = state.fingerOffensive;
    if (fo && Math.random() * 100 < fo.chance && ready('mo_fingeroffensive', fo.cdSec)) {
      monkStrike(target, monDef, fo.mult, { name: fo.name, icon: '☝️', bladeStopBonus: true });
    }
  }

  /* 發勁：官方 maxLv 0 的未開放技能，使用者指定轉職自動獲得。

     內部冷卻 10 秒，外加兩道保險（跟聖十字審判同一套，#66）：
     **HP 低於 25% 就不放**、自傷永遠留 1 HP。
     三個都有必要——沒有冷卻時實測 ASPD 173 每秒觸發 0.37 次、等於每秒燒 74 HP，
     角色會被自己的被動技一路釘在血量下限，然後被任何一隻怪一下打死。 */
  const bk = state.balkyoung;
  if (bk && target && target.hp > 0 && monDef
      && state.hp > state.maxHp * MONK_BALKYOUNG_HP_FLOOR
      && Math.random() * 100 < bk.chance && ready('mo_balkyoung', bk.cdSec)) {
    const cost = Math.min(bk.hpCost, Math.max(0, state.hp - 1));
    state.hp -= cost;
    logMsg(`💥 「${bk.name}」！消耗 ${cost} HP。`);
    const alive = monkStrike(target, monDef, bk.mult, { name: bk.name, icon: '💥' });
    let stunned = 0;
    (state.monsters || []).forEach(mon => {
      const md = MONSTERS[mon.defId];
      if (!md || mon.hp <= 0) return;
      if (Math.random() * 100 >= bk.stunChance) return;
      if (applyAilment(mon, md, 'stun', { sec: bk.stunSec })) stunned++;
    });
    if (stunned) logMsg(`💫 發勁的衝擊讓 ${stunned} 隻敵人暈眩了 ${bk.stunSec} 秒。`);
    if (!alive) return;
  }
}
/* 連段：六合拳 →（50%）連環全身掌 →（30%）猛龍誇強 →（20%）阿修羅霸凰拳。
   官方要在延遲窗內手動接三次，放置遊戲沒有這個操作空間，所以做成自動串接。

   **猛龍誇強接上阿修羅時兩者共用同一份氣球體消耗**（合計 5 顆）：
   上限就是 5 顆，猛龍先扣掉 1 顆的話永遠湊不滿阿修羅要的 5 顆，這條鏈會死鎖。 */
function tryMonkCombo(target, monDef) {
  const t = state.tripleAttack;
  if (!t || !target || target.hp <= 0 || !monDef) return;
  // 官方寫的是「近距離普通攻擊」，所以拿弓的時候整條鏈都不跑
  if (isBowWeapon(getEquipBaseItemId('weapon'))) return;
  if (Math.random() * 100 >= t.chance) return;
  if (!monkStrike(target, monDef, t.mult, { name: t.name, suffix: `（${t.hits} 連擊）` })) return;

  const c = state.chainCombo;
  if (!c || Math.random() * 100 >= c.chance) return;
  // 拳套：官方是 4 連擊變 6 連擊、傷害加倍
  const knuckle = weaponReqMet('knuckle');
  const cMult = c.mult * (knuckle ? c.knuckleMult : 1);
  const cHits = knuckle ? c.knuckleHits : c.hits;
  if (!monkStrike(target, monDef, cMult, { name: c.name, suffix: `（${cHits} 連擊${knuckle ? '・拳套' : ''}）` })) return;

  const f = state.comboFinish;
  if (!f || Math.random() * 100 >= f.chance) return;
  const x = state.extremityFist;
  const asuraReady = !!x && monkExplosionActive()
    && (state.spirits || 0) >= x.cost && Math.random() * 100 < x.chance;
  if (!asuraReady) {
    if ((state.spirits || 0) < f.cost) return;
    state.spirits -= f.cost;
  }
  // 猛龍誇強：官方傷害隨 STR 上升（STR 99 時約 +50%）
  const fMult = f.mult * (1 + state.stats.str / f.strScale);
  if (!monkStrike(target, monDef, fMult, { name: f.name, icon: '🐲' })) return;

  // 武術宗師（#79）：猛龍誇強之後也可以接伏虎拳
  if (tryTigerFist(target, monDef)) return;
  if (!asuraReady) return;
  fireAsura(target, monDef);
}

/* 阿修羅霸凰拳：消 5 顆氣球體與**全部 SP**，傷害隨消耗的 SP 上升，
   無視迴避與防禦，放完解除爆氣（官方規則）。
   猛龍誇強與氣絕崩擊（#79）兩條路都會走到這裡，所以抽成獨立函式。 */
function fireAsura(target, monDef) {
  const x = state.extremityFist;
  if (!x) return;
  state.spirits -= x.cost;
  const spSpent = state.sp;
  state.sp = 0;
  const mult = x.mult + spSpent / x.spScale;
  logMsg(`💢 「${x.name}」！燃燒了 ${spSpent} SP。`);
  monkStrike(target, monDef, mult,
    { name: x.name, icon: '💢', ignoreDef: true, flat: x.flat, suffix: '（無視迴避與防禦）' });
  state.buffs = state.buffs.filter(b => b.skillId !== 'mo_explosionspirits');
  logMsg('🔥 爆氣狀態解除。');
}

/* ---------------- 武術宗師的連段延伸（#79）----------------
   兩個進入點：猛虎硬派山（普攻觸發，需爆氣）與猛龍誇強（既有連段的末端）。
   之後接：伏虎拳 → 氣絕崩擊 →（爆氣中）阿修羅霸凰拳。
   回傳 true 代表目標已經死了，呼叫端不要再往下打。 */
function tryTigerFist(target, monDef) {
  const tf = state.tigerFist;
  if (!tf || !target || target.hp <= 0) return false;
  if (Math.random() * 100 >= tf.chance) return false;
  if ((state.spirits || 0) < tf.cost) return false;
  state.spirits -= tf.cost;
  if (!monkStrike(target, monDef, tf.mult, { name: tf.name, icon: '🐯' })) return true;
  if (Math.random() * 100 < tf.stunChance) applyAilment(target, monDef, 'stun', { sec: tf.stunSec });

  const cc = state.chainCrush;
  if (!cc || Math.random() * 100 >= tf.chainChance) return false;
  if ((state.spirits || 0) < cc.cost) return false;
  state.spirits -= cc.cost;
  if (!monkStrike(target, monDef, cc.mult, { name: cc.name, icon: '💥' })) return true;

  /* 氣絕崩擊之後可以接阿修羅（官方就有這條）。
     觸發機率與猛龍誇強那條相同（使用者 2026-08-15 指定），條件也一樣：爆氣中且球夠。 */
  const x = state.extremityFist;
  if (x && monkExplosionActive() && (state.spirits || 0) >= x.cost
      && Math.random() * 100 < x.chance) {
    fireAsura(target, monDef);
    return target.hp <= 0;
  }
  return false;
}

/* 猛虎硬派山：普攻觸發，只在爆氣狀態下。官方傷害隨 STR 與基本等級上升。 */
function tryChampionProcs(target, monDef) {
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  const ready = (id, cd) => {
    if (now < (state.songProcReadyAt[id] || 0)) return false;
    state.songProcReadyAt[id] = now + (cd || 0) * 1000;
    return true;
  };

  // 狂蓄氣：一口氣補滿 5 顆（不超過上限）
  const sc = state.soulCollect;
  if (sc && state.spiritsMax > 0 && (state.spirits || 0) < state.spiritsMax
      && Math.random() * 100 < sc.chance && ready('ch_soulcollect', sc.cdSec)) {
    const before = state.spirits || 0;
    state.spirits = Math.min(state.spiritsMax, before + 5);
    logMsg(`🔵 「狂蓄氣」一口氣聚起 ${state.spirits - before} 顆氣球體！`);
  }

  /* 阿修羅霸凰拳直發（使用者 2026-08-22 指定方案C）：爆氣中普攻直接 20% 機率發動，
     不用走六合拳→連環→猛龍那條 4.5% 的前置連段。
     放在猛虎硬派山的檢查之前——沒學猛虎硬派山的修羅也照樣發動。 */
  const x = state.extremityFist;
  if (x && monkExplosionActive() && !isBowWeapon(getEquipBaseItemId('weapon'))
      && (state.spirits || 0) >= x.cost && Math.random() * 100 < x.directChance) {
    fireAsura(target, monDef);
    return;
  }

  const ps = state.palmStrike;
  if (!ps || !target || target.hp <= 0 || !monDef) return;
  if (!monkExplosionActive()) return;                 // 官方限爆氣狀態
  if (isBowWeapon(getEquipBaseItemId('weapon'))) return;

  if (Math.random() * 100 >= ps.chance) return;
  if (!ready('ch_palmstrike', ps.cdSec)) return;

  const mult = ps.mult * (1 + state.stats.str / ps.strScale) * (1 + state.baseLevel / 198);
  if (!monkStrike(target, monDef, mult, { name: ps.name, icon: '🖐️' })) return;
  applyAilment(target, monDef, 'stun', { sec: ps.stunSec });

  if (Math.random() * 100 < ps.chainChance) tryTigerFist(target, monDef);
}

/* ---------------- 賢者（#71）----------------

   四個進入點：
     sageCanPay/sagePay  資源取用：**背包 → 倉庫 → 付錢**（使用者 2026-08-10 指定）
     trySageProcs()      普攻觸發：自動念咒、念咒拆除、魔法效果解除、隨機技能、元素更換
     tryMagicRod()       受怪物技能攻擊時：機率完全免傷並回 SP
     tickConverter()     肯貝特武器附魔：面板選定屬性後自動維持

   倉庫是**跨角色**的（`loadWarehouse()`，存在 localStorage 不在存檔裡），
   所以這裡動它要自己 saveWarehouse；但**不呼叫 saveGame**——
   這些是每次普攻都可能跑到的路徑，每次都寫存檔會拖垮 tick。 */
function sageWarehouseQty(id) {
  const wh = loadWarehouse();
  const row = wh.items.find(r => r.item === id && !r.instanceId);
  return row ? row.qty : 0;
}
// 湊不湊得出來（只看，不扣）。ids 依序試，第一個湊得出來的就算數
function sageCanPay(ids, qty, goldFallback) {
  qty = qty || 1;
  for (const id of ids || []) {
    if (getItemQty(id) >= qty || sageWarehouseQty(id) >= qty) return true;
  }
  return !!(goldFallback && state.gold >= goldFallback);
}
/* 真的扣。回傳 { id, label } 讓訊息印得出「用掉了什麼」，湊不出來回 null。
   `gemfree`（觸媒之所）在這裡一起認——那個 buff 講的就是「使用魔法時魔力礦石不消耗」。 */
function sagePay(ids, qty, goldFallback) {
  qty = qty || 1;
  const gemFree = buffMult('gemfree').flatBonus;
  if (gemFree > 0 && Math.random() * 100 < gemFree) return { id: null, label: '（觸媒之所免除）' };
  for (const id of ids || []) {
    if (getItemQty(id) >= qty) { removeItem(id, qty); return { id, label: `${getItemDisplayName(id)}×${qty}` }; }
  }
  const wh = loadWarehouse();
  for (const id of ids || []) {
    const row = wh.items.find(r => r.item === id && !r.instanceId);
    if (!row || row.qty < qty) continue;
    row.qty -= qty;
    if (row.qty <= 0) wh.items = wh.items.filter(r => !(r.item === id && !r.instanceId));
    saveWarehouse(wh);
    return { id, label: `倉庫的 ${getItemDisplayName(id)}×${qty}` };
  }
  if (goldFallback && state.gold >= goldFallback) {
    state.gold -= goldFallback;
    return { id: null, label: `${goldFallback} 鋅幣` };
  }
  return null;
}
// 身上有沒有正在開著的元素領域（切換領域免礦石的判斷依據）
function elementFieldActive() {
  return state.buffs.some(b => b.eleFieldTag === 1);
}
/* 自動念咒可以挑哪些魔法：**已學會的魔法技能**（官方就是「選擇特定已學到的魔法」）。
   發動等級上限是本技能等級的一半（官方規則），再被該魔法自己的上限與已學等級夾住。 */
const SAGE_AUTOSPELL_TYPES = ['magic', 'magic_aoe', 'field_aoe_magic'];
function sageAutoSpellChoices() {
  const out = [];
  const seen = new Set();
  getAllLearnedJobs().forEach(jid => {
    const jd = JOB_TREE[jid];
    if (!jd) return;
    jd.skills.forEach(sk => {
      if (seen.has(sk.id) || !SAGE_AUTOSPELL_TYPES.includes(sk.type)) return;
      if (!skillLv(sk.id)) return;
      seen.add(sk.id);
      out.push({ id: sk.id, name: sk.name, maxLv: sageAutoSpellLv(sk.id) });
    });
  });
  return out;
}
function sageAutoSpellLv(skillId) {
  const cfg = state.sageAutoSpell;
  if (!cfg) return 0;
  const cap = Math.max(1, Math.floor(cfg.lv / 2));
  return Math.min(cap, skillLv(skillId) || 0);
}
function setSageAutoSpell(skillId) {
  if (!skillId) { state.sageAutoSpellId = null; saveGame(); return true; }
  if (!sageAutoSpellChoices().some(c => c.id === skillId)) return false;
  state.sageAutoSpellId = skillId;
  logMsg(`📘 自動念咒記住了「${SKILLS[skillId].name}」（可用到 Lv${sageAutoSpellLv(skillId)}）。`);
  saveGame();
  return true;
}
/* 魔法懲罰：官方是「在被單體魔法擊中前一刻施展，擋下傷害並吸 SP」。
   本作沒有詠唱也沒有那個時機，但怪物真的會放技能（#45），
   所以改成「受怪物技能攻擊時機率完全免傷」。回傳 true 代表這一發被吃掉了。 */
function tryMagicRod() {
  const p = state.magicRod;
  if (!p) return false;
  const now = Date.now();
  if (now < (state.magicRodReadyAt || 0)) return false;
  if (Math.random() * 100 >= p.chance) return false;
  state.magicRodReadyAt = now + p.cdSec * 1000;
  state.sp = Math.min(state.maxSp, state.sp + p.spGain);
  logMsg(`🪄 「${p.name}」發動！完全擋下這次技能攻擊並吸收了 ${p.spGain} SP。`);
  return true;
}
/* 肯貝特武器附魔：官方 maxLv 0 的「肯貝特製作」做出來的道具效果。
   使用者指定改成自動戰鬥面板的一個開關——選定屬性就自動維持，
   每次消耗對應的靈礦石（背包 → 倉庫 → 付 1000z），一次 20 分鐘。 */
const SAGE_CONVERTER_ORE = { fire: 'boody_red', water: 'crystal_blue', wind: 'wind_of_verdure', earth: 'yellow_live' };
function tickConverter() {
  const c = state.elementConverter;
  const pick = state.converterElement;
  if (!c || !pick || !SAGE_CONVERTER_ORE[pick]) return;
  // 屬性附加放著的時候不要搶——那是玩家自己放的技能，效果比附魔好
  if (state.buffs.some(b => b.type === 'eleweapon')) return;
  const paid = sagePay([SAGE_CONVERTER_ORE[pick]], 1, c.goldFallback);
  if (!paid) {
    if (!state._converterWarned) {
      logMsg(`⚠️ 肯貝特武器附魔：${getItemDisplayName(SAGE_CONVERTER_ORE[pick])}與鋅幣都不足，暫停附魔。`);
      state._converterWarned = true;
    }
    return;
  }
  state._converterWarned = false;
  state.buffs.push({ type: 'eleweapon', element: pick, mult: 1, msRemaining: c.durSec * 1000, skillId: 'sa_createcon' });
  logMsg(`🔮 肯貝特武器附魔：武器變成${ELEMENT_NAMES[pick]}屬性 ${Math.round(c.durSec / 60)} 分鐘（消耗${paid.label}）。`);
}
function trySageProcs(target, monDef) {
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  const ready = (id, cd) => {
    if (now < (state.songProcReadyAt[id] || 0)) return false;
    state.songProcReadyAt[id] = now + (cd || 0) * 1000;
    return true;
  };

  /* 自動念咒：官方是「普攻時機率自動施放選定的魔法，SP 只花 2/3」。
     使用者指定**獨立冷卻 3 秒、不吃該魔法自己的冷卻**——
     不然挑到隕石術（20 秒冷卻）就等於這個被動幾乎不會動。 */
  const as = state.sageAutoSpell;
  if (as && state.sageAutoSpellId && target && target.hp > 0) {
    const chance = as.chance + (state.freeCastAutoSpellPct || 0);
    const lv = sageAutoSpellLv(state.sageAutoSpellId);
    const sk = lv ? findSkillAnywhere(state.sageAutoSpellId) : null;
    if (sk && Math.random() * 100 < chance && ready('sa_autospell', as.cdSec)) {
      const cost = Math.round(skillSpCost(sk, lv) * as.spCostPct / 100);
      if (state.sp >= cost) {
        state.sp -= cost;
        if (castSkill(sk.id, { free: true, forceLv: lv })) {
          logMsg(`📘 「${as.name}」發動！${sk.name} Lv${lv}（SP −${cost}）`);
        }
      }
    }
  }

  /* 念咒拆除：官方是打斷詠唱 + 吸 SP + 造成目標最大 HP 2% 的傷害。
     無詠唱可打斷，只留下傷害與吸 SP，再照使用者指定補上暈眩。
     **對首領階級不造成傷害**是官方就有的限制，暈眩照常判定。 */
  const sb = state.spellBreaker;
  if (sb && target && target.hp > 0 && monDef
      && Math.random() * 100 < sb.chance && ready('sa_spellbreaker', sb.cdSec)) {
    state.sp = Math.min(state.maxSp, state.sp + sb.spGain);
    applyAilment(target, monDef, 'stun', { sec: sb.stunSec });
    if (monDef.isBoss) {
      logMsg(`📕 「${sb.name}」！${monDef.name} 是首領階級，不受傷害（官方規則），但仍被震住了。回復 ${sb.spGain} SP。`);
    } else {
      const dmg = Math.max(1, Math.round((target.maxHp || monDef.hp || 1) * sb.hpPct / 100));
      target.hp -= dmg;
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal');
      logMsg(`📕 「${sb.name}」！對 ${monDef.name} 造成 ${dmg} 點傷害（最大HP 的 ${sb.hpPct}%）並回復 ${sb.spGain} SP。`);
      if (target.hp <= 0) { killMonster(monDef, target); return; }
    }
  }

  /* 魔法效果解除：#36 之後怪物真的會給自己上 buff（`mon.mbuff`），所以有實際對象。
     **怪身上沒有 buff 就不觸發、也不消耗礦石**（使用者指定）——
     不然這一招會把黃色魔力礦石燒在空氣上。 */
  const dp = state.dispellProc;
  if (dp && target && target.hp > 0 && monDef && monBuffList(target).length
      && Math.random() * 100 < dp.chance && ready('sa_dispell', dp.cdSec)) {
    if (sageCanPay(dp.costItems, dp.costQty)) {
      const paid = sagePay(dp.costItems, dp.costQty);
      if (Math.random() * 100 < dp.successPct) {
        target.mbuff = {};
        logMsg(`📗 「${dp.name}」成功！${monDef.name} 身上的強化效果全部消失（消耗${paid ? paid.label : '—'}）。`);
      } else {
        logMsg(`📗 「${dp.name}」失敗…（消耗${paid ? paid.label : '—'}）`);
      }
    }
  }

  /* 隨機技能：官方是消耗黃色魔力礦石×2 隨機發動一個技能。
     使用者指定池子限定**攻擊技能**、等級＝本技能等級但不超過該技能自己的上限。
     池子的查詢跟流氓的抄襲共用 `PLAGIARISM_ATTACK_TYPES`。 */
  const ab = state.abracadabra;
  if (ab && target && target.hp > 0
      && Math.random() * 100 < ab.chance && ready('sa_abracadabra', ab.cdSec)) {
    const pool = Object.values(SKILLS).filter(sk => PLAGIARISM_ATTACK_TYPES.includes(sk.type));
    if (pool.length && sageCanPay(ab.costItems, ab.costQty)) {
      const paid = sagePay(ab.costItems, ab.costQty);
      const sk = pool[Math.floor(Math.random() * pool.length)];
      const lv = Math.max(1, Math.min(sk.maxLv || 1, ab.castLv));
      if (castSkill(sk.id, { free: true, forceLv: lv })) {
        logMsg(`🎲 「${ab.name}」抽到了「${sk.name}」Lv${lv}！（消耗${paid ? paid.label : '—'}）`);
      }
    }
  }

  /* 元素更換：官方 maxLv 0 的四個技能，使用者指定轉職獲得、面板四選一。
     把**這一隻怪**暫時變成選定的屬性 10 秒（首領階級也吃，使用者指定）。
     覆寫寫在怪物實體上，`getElementMultiplierVsMonster` 的第三個參數就是為它加的。 */
  const pick = state.elementChangePick;
  const ec = pick && state.elementChanges ? state.elementChanges[pick] : null;
  if (ec && target && target.hp > 0 && monDef
      && monElementOf(monDef, target) !== ec.element
      && Math.random() * 100 < ec.chance && ready(ec.id, ec.cdSec)) {
    if (sageCanPay(ec.costItems, 1, ec.goldFallback)) {
      const paid = sagePay(ec.costItems, 1, ec.goldFallback);
      target.eleOverride = ec.element;
      target.eleOverrideEnd = now + ec.durSec * 1000;
      logMsg(`🌀 「${ec.name}」！${monDef.name} 變成${ELEMENT_NAMES[ec.element]}屬性 ${ec.durSec} 秒（消耗${paid ? paid.label : '—'}）。`);
    }
  }
}

/* ---------------- 聖殿十字軍（#74）----------------

   兩個進入點：
     tryPaladinProcs()  普攻觸發：捨命攻擊的自傷追擊
     gospelTick()       聖音每 10 秒一跳（由場域迴圈呼叫）

   捨命攻擊的自傷是這個 repo 第三次踩到的東西（聖十字審判、發勁、這個），
   所以規則寫在這裡一次：**扣完會死就整個不觸發，次數留著**。
   不是扣到剩 1 HP，是這一次完全不發生——玩家補完血還有這一次可以用。 */
function tryPaladinProcs(target, monDef) {
  const b = state.buffs.find(x => x.type === 'sacrifice' && (x.charges || 0) > 0);
  if (!b || !target || target.hp <= 0 || !monDef) return;
  const cost = Math.max(1, Math.floor(state.maxHp * (b.hpCostPct || 9) / 100));
  if (state.hp <= cost) return;      // 付不起就不觸發，次數不扣

  b.charges -= 1;
  state.hp -= cost;
  /* 傷害就是付出去的那份 HP × 倍率，無視迴避與防禦（官方原文）。
     不走 weaponChainDamage——官方這招的數值來源是 HP 不是武器，
     所以屬性、體型、武器浮動一概不參與，只有卡片對種族的加成照舊。 */
  const dmg = Math.max(1, Math.round(cost * (b.dmgMult || 1) * cardTargetDmgMult(monDef) * ailDmgTakenMult(target)));
  target.hp -= dmg;
  ailBreakOnDamage(target, monDef);
  if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal');
  logMsg(`🩸 「捨命攻擊」燃燒 ${cost} HP，造成 ${dmg} 點傷害！（無視迴避與防禦，剩 ${b.charges} 次）`);
  if (b.charges <= 0) {
    state.buffs = state.buffs.filter(x => x !== b);
    logMsg('🩸 捨命攻擊的次數用完了。');
  }
  if (target.hp <= 0) killMonster(monDef, target);
}

/* 聖音的兩張效果表（使用者 2026-08-14 指定，不是官方那份隨機 buff 清單——
   官方那份大半是隊伍增益，本作沒有隊伍）。每 10 秒兩邊各擲一次機率。 */
const GOSPEL_RANDOM_MAX = 9999;
const GOSPEL_EFFECT_SEC = 10;
const GOSPEL_BLESSINGS = [
  { name: '全素質提升', icon: '🙌', run: () => {
      state.buffs = state.buffs.filter(b => b.skillId !== 'pa_gospel' || b.type !== 'allstat');
      state.buffs.push({ type: 'allstat', mult: 1, flatBonus: 10, msRemaining: GOSPEL_EFFECT_SEC * 1000, skillId: 'pa_gospel' });
      recomputeDerived(false);
      return '全素質 +10';
    } },
  { name: '恩寵', icon: '💚', run: () => {
      const amt = 1 + Math.floor(Math.random() * GOSPEL_RANDOM_MAX);
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + amt);
      return `回復 ${state.hp - before} HP（擲出 ${amt}）`;
    } },
  { name: '淨化', icon: '🛡️', run: () => {
      // 抗性 100 以上＝免疫（applyPlayerAilment 的既有規則），借異常狀態抗性那個桶
      state.buffs = state.buffs.filter(b => b.skillId !== 'pa_gospel' || b.type !== 'songailresist');
      state.buffs.push({ type: 'songailresist', mult: 1, flatBonus: 100, msRemaining: GOSPEL_EFFECT_SEC * 1000, skillId: 'pa_gospel' });
      state.playerAil = {};
      recomputeDerived(false);
      return '異常狀態免疫';
    } },
  { name: '洞察', icon: '🎯', run: () => {
      state.buffs = state.buffs.filter(b => b.skillId !== 'pa_gospel' || (b.type !== 'hit' && b.type !== 'flee'));
      state.buffs.push({ type: 'hit', mult: 1, flatBonus: 20, msRemaining: GOSPEL_EFFECT_SEC * 1000, skillId: 'pa_gospel' });
      state.buffs.push({ type: 'flee', mult: 1, flatBonus: 20, msRemaining: GOSPEL_EFFECT_SEC * 1000, skillId: 'pa_gospel' });
      return '命中 +20、迴避 +20';
    } },
];
const GOSPEL_CURSES = [
  { name: '神罰', icon: '⚡', run: mons => {
      let total = 0;
      mons.forEach(m => {
        const amt = 1 + Math.floor(Math.random() * GOSPEL_RANDOM_MAX);
        m.hp -= amt; total += amt;
        wakeIfFrozen(m);
        if (typeof showDamageFloatAt === 'function') showDamageFloatAt(m.id, '-' + amt, 'normal');
      });
      return `${mons.length} 隻敵人共受到 ${total} 點無視防禦與迴避的傷害`;
    } },
  { name: '蒙蔽', icon: '🌑', run: mons => {
      let n = 0;
      mons.forEach(m => { if (applyAilment(m, MONSTERS[m.defId], 'blind', { sec: GOSPEL_EFFECT_SEC })) n++; });
      return `${n} 隻敵人陷入黑暗`;
    } },
  { name: '劇毒', icon: '☠️', run: mons => {
      let n = 0;
      mons.forEach(m => { if (applyAilment(m, MONSTERS[m.defId], 'poison', { sec: GOSPEL_EFFECT_SEC })) n++; });
      return `${n} 隻敵人中毒`;
    } },
  { name: '激怒', icon: '💢', run: mons => {
      // 10 級挑釁＝DEF ×0.45（照 SKILLS.provoke 的 mult 最後一格，改了那邊這裡跟著走）
      const pv = SKILLS.provoke;
      const m10 = pv && Array.isArray(pv.mult) ? pv.mult[pv.mult.length - 1] : 0.45;
      const until = Date.now() + GOSPEL_EFFECT_SEC * 1000;
      mons.forEach(m => { m.debuffDef = m10; m.debuffDefEnd = until; });
      return `${mons.length} 隻敵人受到 10 級挑釁（DEF −${Math.round((1 - m10) * 100)}%）`;
    } },
  { name: '無事發生', icon: '🌫️', run: () => null },
];

/* ---------------- 智者（#76）----------------
   四個普攻觸發的被動。內部冷卻共用 `state.songProcReadyAt`（詩人開的那張表），
   跟流氓、賢者、武僧走同一套，不另開計時器。
   `pf_doublecasting` 是主動 buff，判定在 tryDoubleCast()，不在這裡。 */
function tryProfessorProcs(target, monDef) {
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  const ready = (id, cd) => {
    if (now < (state.songProcReadyAt[id] || 0)) return false;
    state.songProcReadyAt[id] = now + (cd || 0) * 1000;
    return true;
  };

  // 薄霧牆：官方是霧牆罩住一片，本作沒有座標 → 對場上全體各判定一次
  const fw = state.fogWall;
  if (fw && (state.monsters || []).length && ready('pf_fogwall', fw.cdSec)) {
    let n = 0;
    state.monsters.forEach(m => {
      if (m.hp <= 0) return;
      if (Math.random() * 100 >= fw.chance) return;
      if (applyAilment(m, MONSTERS[m.defId], 'blind', { sec: fw.sec })) n++;
    });
    if (n) logMsg(`🌫️ 「薄霧牆」籠罩戰場，${n} 隻敵人陷入黑暗！`);
  }

  if (!target || target.hp <= 0 || !monDef) return;

  // 心神互換：官方是交換 SP，本作怪物沒有 SP 欄位 → 改成沉默
  const sc = state.soulChange;
  if (sc && Math.random() * 100 < sc.chance && ready('pf_soulchange', sc.cdSec)) {
    if (applyAilment(target, monDef, 'silence', { sec: sc.sec })) {
      logMsg(`🤐 「心神互換」擾亂了 ${monDef.name} 的心神！`);
    }
  }

  // 精神耗弱術：沉默 ＋ MATK 傷害。魔法傷害不判定命中（#76 的規則）
  const sb = state.soulBurn;
  if (sb && Math.random() * 100 < sb.chance && ready('pf_soulburn', sb.cdSec)) {
    applyAilment(target, monDef, 'silence', { sec: sb.sec });
    const em = getElementMultiplierVsMonster(sb.element, monDef, target);
    const dmg = mitigateDamage(state.matk * sb.dmgMult * em * ailDmgTakenMult(target),
      ...defOf(monDef, 1, true, target));
    target.hp -= dmg;
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal', sb.element);
    logMsg(`🧠 「精神耗弱術」造成 ${dmg} 點傷害！`);
    if (target.hp <= 0) { killMonster(monDef, target); return; }
  }

  // 精神撼動：降對方魔防。官方另一半（目標 MATK 上升）本作沒有對象，不做
  const mb = state.mindBreaker;
  if (mb && mb.cut > 0 && Math.random() * 100 < mb.chance && ready('pf_mindbreaker', mb.cdSec)) {
    target.debuffMdef = 1 - mb.cut / 100;
    target.debuffMdefEnd = now + mb.durSec * 1000;
    logMsg(`💠 「精神撼動」使 ${monDef.name} 的魔防 −${mb.cut}%（${mb.durSec} 秒）。`);
  }
}

/* ---------------- 命運的塔羅牌（#77）----------------
   官方是 14 張，但官方資料只寫「14 張其中一種」沒有列出內容。
   使用者 2026-08-15 直接指定了本作要用的十種，就是下面這張表。
   全部走既有的桶：applyAilment / debuffAtk / debuffDef / debuffFlee / debuffHit / mbuff，
   固定傷害則跟氣泡蟲召喚一樣不經過 mitigateDamage（無視防禦）。 */
const TAROT_EFFECT_SEC = 10;
const TAROT_CARDS = [
  { name: '沉默', run: (m, md) => applyAilment(m, md, 'silence', { sec: 2 }) ? '沉默 2 秒' : null },
  { name: '三重狀態', run: (m, md) => {
      const got = [];
      if (applyAilment(m, md, 'curse', { sec: 3 })) got.push('詛咒');
      if (applyAilment(m, md, 'stun', { sec: 1 })) got.push('暈眩');
      if (applyAilment(m, md, 'poison', { sec: 5 })) got.push('中毒');
      return got.length ? got.join('＋') : null;
    } },
  { name: '大審判', flat: 6666 },
  { name: '崩壞', flat: 4444 },
  { name: '力量流失', run: (m) => {
      m.debuffAtk = 0.8; m.debuffAtkEnd = Date.now() + TAROT_EFFECT_SEC * 1000;
      return 'ATK −20%';
    } },
  { name: '淨化', run: (m) => {
      const n = monBuffList(m).length;
      if (!n) return null;
      m.mbuff = {};
      return `解除了 ${n} 個增益`;
    } },
  { name: '小審判', flat: 1000 },
  { name: '雙重命運', double: true },
  { name: '沉眠', run: (m, md) => {
      const pool = ['sleep', 'freeze', 'stone'];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return applyAilment(m, md, pick) ? MON_AILMENTS[pick].name : null;
    } },
  { name: '全面衰弱', run: (m) => {
      const until = Date.now() + TAROT_EFFECT_SEC * 1000;
      m.debuffAtk = 0.8; m.debuffAtkEnd = until;
      m.debuffDef = 0.8; m.debuffDefEnd = until;
      m.debuffFlee = Math.round((m.flee || 0) * 0.2); m.debuffFleeEnd = until;
      m.debuffHit = 20; m.debuffHitEnd = until;
      return 'ATK／迴避／命中／防禦 全部 −20%';
    } },
];

/* 抽一張。`double` 那張要再抽兩張，所以拆出來讓它遞迴一層——
   再抽到 `double` 就跳過，不然會無限展開。 */
function drawTarot(mon, monDef, allowDouble) {
  const pool = allowDouble ? TAROT_CARDS : TAROT_CARDS.filter(c => !c.double);
  const c = pool[Math.floor(Math.random() * pool.length)];
  if (c.double) {
    const bits = [drawTarot(mon, monDef, false), drawTarot(mon, monDef, false)].filter(Boolean);
    return bits.length ? `${c.name}（${bits.join('、')}）` : c.name;
  }
  if (c.flat) {
    mon.hp -= c.flat;
    ailBreakOnDamage(mon, monDef);
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + c.flat, 'normal');
    return `${c.name} ${c.flat} 點無視防禦的傷害`;
  }
  const msg = c.run(mon, monDef);
  return msg ? `${c.name}：${msg}` : null;
}

function tryTarotCard(target, monDef) {
  const tc = state.tarotCard;
  if (!tc || !target || target.hp <= 0 || !monDef) return;
  if (!state.songProcReadyAt) state.songProcReadyAt = {};
  const now = Date.now();
  if (now < (state.songProcReadyAt.cg_tarotcard || 0)) return;
  if (Math.random() * 100 >= tc.chance) return;
  state.songProcReadyAt.cg_tarotcard = now + tc.cdSec * 1000;
  const msg = drawTarot(target, monDef, true);
  logMsg(msg ? `🃏 「命運的塔羅牌」${msg}！` : '🃏 「命運的塔羅牌」抽了一張，但什麼都沒發生。');
  if (target.hp <= 0) killMonster(monDef, target);
}

/* 雙倍投擲（#76）：三系箭術施放後機率立刻再放一次。
   由 castSkill 在**確定放得出來之後**呼叫，所以不會出現「主體失敗但複製成功」。
   複製那一發走 free 施放：官方不另外消耗 SP，也不該再吃一次冷卻。 */
const DOUBLECAST_SKILLS = ['firebolt', 'coldbolt', 'lightningbolt'];
function tryDoubleCast(sk, lv) {
  if (!sk || !DOUBLECAST_SKILLS.includes(sk.id)) return;
  const b = state.buffs.find(x => x.type === 'doublecast');
  if (!b) return;
  if (state._inDoubleCast) return;              // 複製出來的那一發不再複製
  const chance = (b.flatBonus || 0) + (state.doubleCastBonusPct || 0);
  if (Math.random() * 100 >= chance) return;
  state._inDoubleCast = true;
  try {
    logMsg('🔁 「雙倍投擲」再放了一次！');
    castSkill(sk.id, { free: true, forceLv: lv });
  } finally {
    state._inDoubleCast = false;
  }
}

function gospelTick(f) {
  const ticks = Math.max(1, f.ticksThisRound || 1);
  // 維持費照跳數收（分頁切回前景時補跳，費用不能白拿）
  state.hp = Math.max(1, state.hp - (f.hpDrain || 0) * ticks);
  state.sp = Math.max(0, state.sp - (f.spDrain || 0) * ticks);

  if (Math.random() * 100 < (f.chance || 0)) {
    const e = GOSPEL_BLESSINGS[Math.floor(Math.random() * GOSPEL_BLESSINGS.length)];
    const msg = e.run();
    if (msg) logMsg(`${e.icon} 「${f.name}」${e.name}：${msg}。`);
    /* 官方的聖音是隊伍範圍的祝福（#131）。祝福函式全都是對全域 state 動手，
       所以換身之後**把同一個祝福再跑一次**就好，不必為了分享把它們改寫成 buff。
       擲骰型的那個（恩寵）每個人各擲各的，這跟官方一樣。 */
    if (f.party) {
      const got = forEachPartyMate(() => { e.run(); });
      if (got.length) pushCombatLog(`  → 「${f.name}」的${e.name}也及於 ${partyMateNames(got)}。`, 'ally');
    }
  }
  const mons = (state.monsters || []).filter(m => m.hp > 0);
  if (mons.length && Math.random() * 100 < (f.chance || 0)) {
    const e = GOSPEL_CURSES[Math.floor(Math.random() * GOSPEL_CURSES.length)];
    const msg = e.run(mons);
    logMsg(msg ? `${e.icon} 「${f.name}」${e.name}：${msg}。` : `${e.icon} 「${f.name}」……無事發生。`);
    for (let i = state.monsters.length - 1; i >= 0; i--) {
      if (state.monsters[i].hp <= 0) killMonster(MONSTERS[state.monsters[i].defId], state.monsters[i]);
    }
  }
}

function tryGanbantein() {
  if (!state.hasGanbantein || !state.monsters || !state.monsters.length) return;
  if (Date.now() < (state.ganbanteinReadyAt || 0)) return;
  if (typeof getItemQty !== 'function') return;
  if (GANBANTEIN_STONES.some(id => getItemQty(id) <= 0)) return;
  state.ganbanteinReadyAt = Date.now() + state.ganbanteinCdSec * 1000;
  /* 觸媒之所（#68）：官方是「使用魔法時魔力礦石消耗 −1」。本作單人合奏只有一半效果，
     所以做成「N% 機率不消耗」——礦石本來就只吃 1 個，減半沒有整數可減。 */
  const gemFree = buffMult('gemfree').flatBonus;
  const freeThisTime = gemFree > 0 && Math.random() * 100 < gemFree;
  if (!freeThisTime) GANBANTEIN_STONES.forEach(id => removeItem(id, 1));
  let hit = 0;
  state.monsters.forEach(mon => {
    if (Math.random() * 100 >= state.ganbanteinChance) return;
    const sec = state.ganbanteinStunMin
      + Math.random() * (state.ganbanteinStunMax - state.ganbanteinStunMin);
    applyStun(mon, sec, true);
    hit++;
  });
  logMsg(`🪨 咖般塔音發動（${freeThisTime ? '觸媒之所讓這次不消耗礦石' : '消耗魔力礦石各 1'}）！${hit} 隻敵人被震暈。`);
  const left = Math.min(...GANBANTEIN_STONES.map(id => getItemQty(id)));
  if (left === 0) logMsg('🪨 魔力礦石用完了，咖般塔音暫時發動不了。');
}

/* 魔擊術（#63）：普攻機率追加一發 MATK 傷害。

   官方是「拿 MATK 當數值、但走**物理**傷害流程」——所以這裡傷害源用 state.matk、
   減傷卻走物理防禦（`defOf(..., false)`）。這是本作第一個把「傷害源」與「防禦類型」
   拆開的地方；因為只有這一支需要，所以做成專屬的 proc，不去動 skillBaseDamage 的旗標。 */
function tryMagicCrasher(target, monDef) {
  if (!state.hasMagicCrasher || !target || target.hp <= 0) return;
  if (Date.now() < (state.magicCrasherReadyAt || 0)) return;
  if (Math.random() * 100 >= state.magicCrasherChance) return;
  state.magicCrasherReadyAt = Date.now() + state.magicCrasherCdSec * 1000;
  const elemMult = getElementMultiplierVsMonster('neutral', monDef, target);
  const dmg = mitigateDamage(
    state.matk * state.magicCrasherMult * elemMult * cardTargetDmgMult(monDef) * ailDmgTakenMult(target),
    ...defOf(monDef, 1, false, target));
  target.hp -= dmg;
  if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, 'normal');
  logMsg(`💫 魔擊術發動！追加 ${dmg} 點傷害！`);
  ailBreakOnDamage(target, monDef);
  if (target.hp <= 0) killMonster(monDef, target);
}

/* 狂怒之槍（#58）：受擊時機率進入狂怒。ATK 倍率與 ASPD 固定值各推一個 buff。

   官方是主動技能，代價是期間持續掉血、不能喝水也不能用技能。
   使用者指定改成**受擊觸發的被動**，代價換成低觸發率（10%）＋內部冷卻（30 秒），
   所以這裡不做掉血也不封鎖技能——那組代價已經被觸發條件取代了。

   `state.hasBerserk` 是劍士的「狂暴狀態」（HP<25% DEF−55%），跟這個無關，別混用。 */
function tryFrenzyProc() {
  if (!state.hasFrenzyProc || state.hp <= 0) return;
  if (Date.now() < (state.frenzyReadyAt || 0)) return;
  if (Math.random() * 100 >= state.frenzyChance) return;
  state.frenzyReadyAt = Date.now() + state.frenzyCdSec * 1000;
  const ms = state.frenzyDurSec * 1000;
  state.buffs.push({ type: 'atk', mult: state.frenzyAtkMult, msRemaining: ms, skillId: 'lk_berserk' });
  if (state.frenzyAspdFlat) {
    state.buffs.push({ type: 'aspd', mult: 1, flatBonus: state.frenzyAspdFlat, msRemaining: ms, skillId: 'lk_berserk' });
  }
  recomputeDerived(false);
  logMsg(`🔥 狂怒之槍發動！ATK ×${state.frenzyAtkMult}、ASPD +${state.frenzyAspdFlat}，持續 ${state.frenzyDurSec} 秒！`);
}

function trySpearCounterProc(mon, monDef) {
  if (!state.hasSpearCounterProc || !hasSpearEquipped()) return;
  if (Date.now() < (state.spearCounterReadyAt || 0)) return;
  if (Math.random() * 100 >= state.spearCounterChance) return;
  state.spearCounterReadyAt = Date.now() + (state.spearCounterCooldownSec || 10) * 1000;
  const dmg = mitigateDamage(skillBaseDamage(false, monDef, 1) * state.spearCounterMult, ...defOf(monDef));
  mon.hp -= dmg;
  applyStun(mon, state.spearCounterStunSec || 2, true);
  logMsg(`🔱 長矛刺擊發動！對 ${monDef.name} 造成 ${dmg} 點反擊傷害，並使其暈眩了！`);
  if (mon.hp <= 0) killMonster(monDef, mon);
}

// 投擲長矛：敵人數≥2時，定時隨機對一隻造成傷害（需裝備矛類武器）
function trySpearBoomerangProc() {
  if (!state.hasSpearBoomerangProc || !hasSpearEquipped()) return;
  if (!state.monsters || state.monsters.length < 2) return;
  if (Date.now() < (state.spearBoomerangReadyAt || 0)) return;
  state.spearBoomerangReadyAt = Date.now() + (state.spearBoomerangCooldownSec || 5) * 1000;
  const mon = state.monsters[Math.floor(Math.random() * state.monsters.length)];
  const monDef = MONSTERS[mon.defId];
  const dmg = mitigateDamage(skillBaseDamage(false, monDef, 1) * state.spearBoomerangMult, ...defOf(monDef));
  mon.hp -= dmg;
  logMsg(`🔱 投擲長矛發動！對 ${monDef.name} 造成 ${dmg} 點傷害！`);
  if (mon.hp <= 0) killMonster(monDef, mon);
}

// 衝鋒攻擊：敵人數≥2時，定時隨機對一隻造成傷害（不限武器）
function tryChargeRandomProc() {
  if (!state.hasChargeRandomProc) return;
  if (!state.monsters || state.monsters.length < 2) return;
  if (Date.now() < (state.chargeRandomReadyAt || 0)) return;
  state.chargeRandomReadyAt = Date.now() + (state.chargeRandomCooldownSec || 5) * 1000;
  const mon = state.monsters[Math.floor(Math.random() * state.monsters.length)];
  const monDef = MONSTERS[mon.defId];
  const dmg = mitigateDamage(skillBaseDamage(false, monDef, 1) * state.chargeRandomMult, ...defOf(monDef));
  mon.hp -= dmg;
  logMsg(`🐎 衝鋒攻擊發動！對 ${monDef.name} 造成 ${dmg} 點傷害！`);
  if (mon.hp <= 0) killMonster(monDef, mon);
}

// 火之獵殺：被攻擊時觸發，對全體造成範圍魔法傷害
function tryOnHitAoeProc() {
  if (!state.hasOnHitAoeProc || !state.monsters || state.monsters.length === 0) return;
  if (Date.now() < (state.onHitAoeProcReadyAt || 0)) return;
  if (Math.random() * 100 >= state.onHitAoeProcChance) return;
  state.onHitAoeProcReadyAt = Date.now() + state.onHitAoeProcCooldownSec * 1000;
  logMsg('🔥 火之獵殺發動！');
  for (let i = state.monsters.length - 1; i >= 0; i--) {
    const mon = state.monsters[i];
    const monDef = MONSTERS[mon.defId];
    const elemMult = getElementMultiplierVsMonster(state.onHitAoeProcElement, monDef, mon);
    const dmg = mitigateDamage(state.matk * state.onHitAoeProcMult * elemMult, ...defOf(monDef, 1, true));
    mon.hp -= dmg;
    wakeIfFrozen(mon);
    pushCombatLog(`  → 對 ${monDef.name} 造成 ${dmg} 點傷害！`);
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', state.onHitAoeProcElement || null);
    if (mon.hp <= 0) killMonster(monDef, mon);
  }
  if (typeof renderLog === 'function') renderLog();
}

// 火柱攻擊：普攻時機率觸發，對全體造成固定值+百分比範圍魔法傷害
function tryOnAttackAoeProc() {
  if (!state.hasOnAttackAoeProc || !state.monsters || state.monsters.length === 0) return;
  if (Date.now() < (state.onAttackAoeProcReadyAt || 0)) return;
  if (Math.random() * 100 >= state.onAttackAoeProcChance) return;
  state.onAttackAoeProcReadyAt = Date.now() + state.onAttackAoeCooldownSec * 1000;
  logMsg('🔥 火柱攻擊發動！');
  for (let i = state.monsters.length - 1; i >= 0; i--) {
    const mon = state.monsters[i];
    const monDef = MONSTERS[mon.defId];
    const elemMult = getElementMultiplierVsMonster(state.onAttackAoeElement, monDef, mon);
    const dmg = mitigateDamage((state.onAttackAoeFlatDmg + state.matk * state.onAttackAoeMult) * elemMult, ...defOf(monDef, 1, true));
    mon.hp -= dmg;
    wakeIfFrozen(mon);
    pushCombatLog(`  → 對 ${monDef.name} 造成 ${dmg} 點傷害！`);
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', state.onAttackAoeElement || null);
    if (mon.hp <= 0) killMonster(monDef, mon);
  }
  if (typeof renderLog === 'function') renderLog();
}

// 冰刃之牆：沒有護盾在身且冷卻完畢時，自動補上一層護盾
function tryAutoShield() {
  if (!state.hasAutoShield) return;
  if (state.shields && state.shields.some(sh => sh.id === 'icewall')) return;
  if (Date.now() < (state.autoShieldReadyAt || 0)) return;
  state.autoShieldReadyAt = Date.now() + state.autoShieldCooldownSec * 1000;
  if (!state.shields) state.shields = [];
  state.shields.push({ id: 'icewall', remainingHp: state.autoShieldCapacity, remainingCharges: state.autoShieldCharges, expiresAt: Date.now() + 999999 * 1000 });
  logMsg('🧊 冰刃之牆自動展開！');
}

// 霜凍之術：被攻擊時觸發，對全體造成範圍魔法傷害並各自有機率暈眩
function tryOnHitAoeStunProc() {
  if (!state.hasOnHitAoeStunProc || !state.monsters || state.monsters.length === 0) return;
  if (Date.now() < (state.onHitAoeStunReadyAt || 0)) return;
  if (Math.random() * 100 >= state.onHitAoeStunChance) return;
  state.onHitAoeStunReadyAt = Date.now() + state.onHitAoeStunCooldownSec * 1000;
  logMsg('❄️ 霜凍之術發動！');
  for (let i = state.monsters.length - 1; i >= 0; i--) {
    const mon = state.monsters[i];
    const monDef = MONSTERS[mon.defId];
    const elemMult = getElementMultiplierVsMonster(state.onHitAoeStunElement, monDef, mon);
    const dmg = mitigateDamage(state.matk * state.onHitAoeStunMult * elemMult, ...defOf(monDef, 1, true));
    mon.hp -= dmg;
    wakeIfFrozen(mon);
    if (Math.random() * 100 < state.onHitAoeStunStunChance) applyStun(mon, state.onHitAoeStunStunSec, true);
    pushCombatLog(`  → 對 ${monDef.name} 造成 ${dmg} 點傷害！`);
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', state.onHitAoeStunElement || null);
    if (mon.hp <= 0) killMonster(monDef, mon);
  }
  if (typeof renderLog === 'function') renderLog();
}

// 泥沼地：被攻擊時觸發反制暈眩攻擊者（獨立於緩速術的狀態，避免同時學習時互相覆蓋）
function tryOnHitStunProc2(mon, monDef) {
  if (!state.hasOnHitStunProc2) return;
  if (Date.now() < (state.onHitStunReadyAt2 || 0)) return;
  if (Math.random() * 100 >= state.onHitStunChance2) return;
  state.onHitStunReadyAt2 = Date.now() + state.onHitStunCooldownSec2 * 1000;
  applyStun(mon, state.onHitStunSec2, true);
  logMsg(`💫 泥沼地發動！${monDef.name} 暈眩了！`);
}

/* ---------------- 戰鬥主迴圈 ---------------- */
function startLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(gameTick, TICK_MS);
  _loopOn = true;
}
/* 停掉主迴圈。分頁切走時用（#135）。

   為什麼要停：瀏覽器會把背景分頁的 setInterval 壓成 1 秒一次，離開超過五分鐘
   再壓成**一分鐘一次**。降頻本身還不是最糟的，糟的是這個 tick 有兩半，
   而兩半對「久久才跑一次」的反應完全不同：

     玩家攻擊  用累積時間差（attackAccumulator），會把缺的刀一次補完
     慢心跳    `if (now - _lastSlowTick >= 1000) { _lastSlowTick = now; … }`
               —— 多出來的時間**直接丟掉**，過了 60 秒也只跑一次

   於是切回來時：玩家一口氣爆發（使用者回報的「加速打怪畫面」），
   而掛在慢心跳裡的隊友、自然回復、自動喝藥、自動技能一次都沒補到
   （「組隊時就沒有加速，甚至直接沒經驗」）。

   與其兩邊都去補（要動 buff、冷卻、生怪、怪物攻擊各自的 wall-clock 判斷），
   不如承認「分頁切走就是離線」，交給離線結算算——那支本來就在做這件事。 */
function stopLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  _loopOn = false;
}
/* 用獨立旗標而不是 `!!tickTimer`：計時器 id 是不透明值，不保證非 0
   （Node 的測試治具就把 setInterval 樁成回傳 0），拿它當布林會漏判。 */
let _loopOn = false;
function loopRunning() { return _loopOn; }

/* 場域持續效果的一跳：光耀之堂（回血）、十字驅魔攻擊（範圍聖傷）、聖音…
   抽成獨立一支是因為**隊友也會放這些**（#131）。以前這段長在 gameTick() 裡面，
   而 gameTick 只跑玩家那一份——隊友祭司放的光耀之堂等於掛上去就沒人理，
   一跳都不會發生。現在 alliesTick() 會換身進去各跑一次。 */
function tickFieldEffects() {
  if (state.activeFieldEffects && state.activeFieldEffects.length > 0) {
    const now = Date.now();
    state.activeFieldEffects = state.activeFieldEffects.filter(f => now < f.endsAt);
    state.activeFieldEffects.forEach(f => {
      if (now < f.nextTickAt) return;
      /* **補跳**：這個迴圈住在每秒一次的慢心跳裡，但場域可以宣告比 1 秒更短的間隔
         （#72 火煙瓶投擲官方就是 0.5 秒）。只推一次時間戳的話，0.5 秒的場域
         實際上每秒只結算一次，傷害直接砍半。改成算出這一秒該跳幾次，一次補齊。
         上限 20 跳是保險：分頁切回前景時 now 可能一口氣跳很遠。 */
      let ticks = 1;
      if (f.tickIntervalSec > 0) {
        ticks = Math.min(20, Math.max(1, Math.floor((now - f.nextTickAt) / (f.tickIntervalSec * 1000)) + 1));
      }
      f.nextTickAt = now + f.tickIntervalSec * 1000;
      f.ticksThisRound = ticks;
      if (f.kind === 'selfheal') {
        const before = state.hp;
        state.hp = Math.min(state.maxHp, state.hp + f.amount);
        if (state.hp > before) logMsg(`💚 「${f.name}」持續恢復了 ${state.hp - before} 點HP。`);
        /* 光耀之堂是範圍治療，站在裡面的隊友也該回血（#131）。
           倒地的不算——復活是天使之嘆息那條路，不能靠站在陣裡自己爬起來。 */
        if (f.party) {
          const healed = [];
          forEachPartyMate(mate => {
            const b = state.hp;
            state.hp = Math.min(state.maxHp, state.hp + f.amount);
            if (state.hp > b) healed.push(mate);
          });
          if (healed.length) pushCombatLog(`  → 「${f.name}」也治療了 ${partyMateNames(healed)}。`, 'ally');
        }
      } else if (f.kind === 'aoe_holydmg') {
        if (state.monsters && state.monsters.length > 0) {
          state.monsters.forEach(mon => {
            const monDef = MONSTERS[mon.defId];
            const elemMult = getElementMultiplierVsMonster(f.element || 'holy', monDef, mon);
            const dmg = mitigateDamage(state.matk * f.mult * elemMult, ...defOf(monDef, 1, true)) * (f.ticksThisRound || 1);
            mon.hp -= dmg;
            wakeIfFrozen(mon);
            if (f.stunChance && Math.random() * 100 < f.stunChance) applyStun(mon, f.stunSec || 1, true);
            pushCombatLog(`  → 「${f.name}」對 ${monDef.name} 造成 ${dmg} 點傷害！`);
            // 場地魔法（隕石術、十字驅魔…）每一跳也照屬性上色
            if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', f.element || 'holy');
          });
          for (let i = state.monsters.length - 1; i >= 0; i--) {
            const mon = state.monsters[i];
            if (mon.hp <= 0) killMonster(MONSTERS[mon.defId], mon);
          }
          if (typeof renderLog === 'function') renderLog();
        }
      /* 鍊金術士（#72）：火煙瓶投擲的物理火場，與生物調撥／生命體召喚的定時攻擊。
         三者同一個形狀——每隔 N 秒對敵人打一次 ATK 倍率的物理傷害，
         所以共用一個 kind，差別只在打全體還是單體、有沒有附帶回血。
         **不是新增召喚實體**：本作玩家側召喚是 0 行，使用者 2026-08-10 指定
         把「有隻寵物在打」換成「場域定時自動攻擊」。 */
      } else if (f.kind === 'alchemy_strike') {
        if (state.monsters && state.monsters.length > 0) {
          const targets = f.aoe ? state.monsters.slice() : [state.monsters[0]];
          targets.forEach(mon => {
            const monDef = MONSTERS[mon.defId];
            if (!monDef || mon.hp <= 0) return;
            /* 這三招（火煙瓶投擲／生物調撥／生命體召喚）打的是 ATK，
               所以照 #76 的規則要判定命中——場域不是免死金牌。 */
            if (!skillHits(SKILLS[f.skillId], f.skillLv || 1, monDef, mon)) {
              pushCombatLog(`  → 「${f.name}」被 ${monDef.name} 閃避了！`);
              return;
            }
            const em = getElementMultiplierVsMonster(f.element || 'neutral', monDef, mon);
            const dmg = (mitigateDamage(
              weaponChainDamage(monDef, em, false) * f.mult * cardTargetDmgMult(monDef) * ailDmgTakenMult(mon),
              ...defOf(monDef, 1, false, mon)) + raceFlatBonus(monDef)) * (f.ticksThisRound || 1);
            mon.hp -= dmg;
            wakeIfFrozen(mon);
            pushCombatLog(`  → 「${f.name}」對 ${monDef.name} 造成 ${dmg} 點傷害！`);
            if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', f.element || null);
          });
          for (let i = state.monsters.length - 1; i >= 0; i--) {
            const mon = state.monsters[i];
            if (mon.hp <= 0) killMonster(MONSTERS[mon.defId], mon);
          }
          if (typeof renderLog === 'function') renderLog();
        }
        // 生物調撥的回血那半：官方沒有，是使用者 2026-08-10 指定的（打一下補 500）
        if (f.healFlat) {
          const before = state.hp;
          state.hp = Math.min(state.maxHp, state.hp + f.healFlat * (f.ticksThisRound || 1));
          if (state.hp > before) pushCombatLog(`  → 「${f.name}」回復了 ${state.hp - before} 點HP。`);
        }
      } else if (f.kind === 'gospel') {
        gospelTick(f);                    // 聖殿十字軍（#74）：聖音每 10 秒的隨機祝福與詛咒
      } else if (f.kind === 'multi_dot') {
        if (state.monsters && state.monsters.length > 0 && f.targetIds && f.targetIds.length > 0) {
          const targets = state.monsters.filter(m => f.targetIds.includes(m.id));
          targets.forEach(mon => {
            const monDef = MONSTERS[mon.defId];
            const elemMult = getElementMultiplierVsMonster(f.element || 'none', monDef, mon);
            const dmg = mitigateDamage(state.matk * f.mult * elemMult, ...defOf(monDef, 1, true)) * (f.ticksThisRound || 1);
            mon.hp -= dmg;
            wakeIfFrozen(mon);
            pushCombatLog(`  → 「${f.name}」對 ${monDef.name} 造成 ${dmg} 點持續傷害！`);
            if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, 'normal', f.element || null);
          });
          for (let i = state.monsters.length - 1; i >= 0; i--) {
            const mon = state.monsters[i];
            if (f.targetIds.includes(mon.id) && mon.hp <= 0) killMonster(MONSTERS[mon.defId], mon);
          }
          if (typeof renderLog === 'function') renderLog();
        }
      }
    });
  }
}

function gameTick() {
  if (!state) return;
  tickCooldowns();
  tickBuffs();
  /* 隊友身上的全體輔助 buff 也要倒數（#95）。**跟 tickBuffs 同一拍**——
     擺到下面那個「借慢心跳」的區塊裡的話，每秒只會扣掉 100ms，
     30 秒的幸運之頌歌會撐成 5 分鐘。 */
  tickAllyBuffs();
  tickAllyCooldowns();   // 隊友冷卻也要倒數（#116），不然輔助技能只放第一發
  tickPartyAutoCure();   // 治療術（#97）：全隊自動解沉默／混亂／黑暗

  if (state.hp <= 0) return; // 等待復活流程

  // 每秒執行一次的系統（回復、自動喝藥、自動技能）
  if (!state._lastSlowTick) state._lastSlowTick = Date.now();
  if (Date.now() - state._lastSlowTick >= 1000) {
    state._lastSlowTick = Date.now();
    passiveRegen();
    tickAllyRegen();          // 隊友也有自然回復（#105）
    townRestore();
    autoUsePotion();
    autoUseSpPotion();
    autoUseAspdPotion();
    // 成就一律在這裡集中判定，不在戰鬥流程裡埋觸發點（詳見 achievements.js 開頭說明）
    checkAchievements();
    if (state.autoSkill) {
      tryAutoCastSkill();
    }
    // 輔助技能獨立控制，不受自動施放技能開關影響
    tryAutoCastSupportSkills();
    // 中毒持續傷害：每秒跳一次
    tickPoisonDot();
    // 出血持續傷害：每秒扣最大HP的固定比例
    tickBleed();
    // 玩家身上的中毒／出血，順便清掉過期的異常狀態
    tickPlayerAilments();
    // 解毒被動：玩家中毒時自動解除（目前遊戲尚無玩家中毒機制，此為預留掛鉤）
    if (state.hasAutoDetox && state.playerPoisoned) {
      const readyAt = state.autoDetoxReadyAt || 0;
      if (Date.now() >= readyAt) {
        state.playerPoisoned = false;
        state.autoDetoxReadyAt = Date.now() + (state.autoDetoxCooldownSec || 30) * 1000;
        logMsg('💊 解毒發動！自動解除了中毒狀態。');
      }
    }
    // 手推車使用被動：定時從等級解鎖的道具池隨機獲得1個
    if (state.hasAutoCartItem) {
      const readyAt = state.cartItemReadyAt || 0;
      if (Date.now() >= readyAt) {
        state.cartItemReadyAt = Date.now() + (state.cartItemIntervalSec || 15) * 1000;
        const pool = (state.cartItemPool && state.cartItemPool.length) ? state.cartItemPool : ['carrot'];
        const itemId = pool[Math.floor(Math.random() * pool.length)];
        addItem(itemId, 1);
        logMsg(`🛒 手推車翻出了一個 ${ITEMS[itemId].name}！`);
      }
    }
    // 露天商店被動：定時自動以10倍價格販售已選擇的道具
    tryAutoVending();
    // 自動販賣：玩家勾選的道具，每30秒自動以原價賣出全部
    tryAutoSell();
    /* 沒選箭種就先挑一種（#129）。**不能只放在 tryAutoBuyArrow() 裡面**：
       那支第一行問的是 `state.autoBuyArrow`，玩家把自動購買關掉之後，
       連背包裡現成的箭都會用不到。 */
    ensurePlayerAmmo();
    // 自動補箭：弓箭手掛機時箭快見底就自動補貨
    tryAutoBuyArrow();
    // 隊友的箭也由玩家出（#93）。**要排在 alliesTick 前面**，這一秒買的這一秒就射得到
    tryAutoBuyAllyArrow();
    // 隊友（#83）：借慢心跳跑，攻擊次數照各自的攻擊間隔補齊
    alliesTick();
    tryAutoBuyReviveLeaf();
    // 冰刃之牆被動：自動補上護盾
    tryAutoShield();
    // 手推車加速被動（#60）：60 秒到期後隔 10 秒自己續上
    tickCartBoost();
    // 武僧的氣球體（#70）：補球、滿球自動爆氣、爆氣中滿球自動金剛不壞
    tickSpirits();
    // 賢者的肯貝特武器附魔（#71）：面板選定屬性後自動維持
    tickConverter();
    // 投擲長矛：敵人數≥2時定時隨機攻擊
    trySpearBoomerangProc();
    // 衝鋒攻擊：敵人數≥2時定時隨機攻擊
    tryChargeRandomProc();
    // 屬性石製造被動：定時機率隨機獲得一顆屬性石
    if (state.hasElementalStoneProc) {
      const readyAt = state.elementalStoneReadyAt || 0;
      if (Date.now() >= readyAt) {
        state.elementalStoneReadyAt = Date.now() + (state.elementalStoneCooldownSec || 60) * 1000;
        if (Math.random() * 100 < state.elementalStoneChance) {
          const stones = ['gemstone_wind', 'gemstone_water', 'gemstone_fire', 'gemstone_earth'];
          const stoneId = stones[Math.floor(Math.random() * stones.length)];
          addItem(stoneId, 1);
          logMsg(`💎 屬性石製造發動！獲得了 ${ITEMS[stoneId].name}！`);
        }
      }
    }
    tickFieldEffects();   // 場域持續效果（光耀之堂、十字驅魔攻擊、聖音…）
  }

  /* 合奏／歌曲類的維持費（#77 落花伴著月光下的水車小屋）：每 N 秒扣一次 SP。
     SP 不夠就讓 buff 直接結束——官方也是唱不下去就停。 */
  if (state.buffs && state.buffs.length) {
    const now2 = Date.now();
    state.buffs.slice().forEach(b => {
      if (!b.spDrain || !b.drainNextAt || now2 < b.drainNextAt) return;
      b.drainNextAt = now2 + (b.drainEverySec || 10) * 1000;
      if (state.sp < b.spDrain) {
        state.buffs = state.buffs.filter(x => x !== b);
        logMsg('🎼 SP 不足，演奏中斷了。');
        return;
      }
      state.sp -= b.spDrain;
    });
  }

  // 每10秒：移動時恢復HP（戰鬥中也有效）
  if (state.hpMoveRegen) {
    if (!state._lastHpMoveTick) state._lastHpMoveTick = Date.now();
    if (Date.now() - state._lastHpMoveTick >= 10000) {
      state._lastHpMoveTick = Date.now();
      const healAmt = Math.max(1, Math.ceil(state.maxHp * 0.05));
      if (state.hp < state.maxHp) {
        state.hp = Math.min(state.maxHp, state.hp + healAmt);
        logMsg(`💚 移動恢復：回復 ${healAmt} HP。`);
      }
    }
  }

  if (!state.monsters) state.monsters = [];
  tickRelicShield();          // 鐵匠遺物：每 5 秒補一面護盾（#113）
  // 近戰模式持續生怪，遠攻模式等怪物死後再生
  spawnMonster();
  if (state.monsters.length > 0) {
    // 使用攻擊間隔控制攻擊頻率（累積時間差模式）
    const now = Date.now();
    // 從無怪→有怪時重設，避免安全區累積爆發
    if (!state._prevHadMonsters) {
      state.attackAccumulator = 0;
      state.lastAttackTime = now;
    }
    state._prevHadMonsters = true;
    state.attackAccumulator += now - state.lastAttackTime;
    state.lastAttackTime = now;
    // 緩緩移動那批：攻速下降＝攻擊間隔拉長（不直接改 state.attackInterval，
    // 那是 recomputeDerived 算出來的角色數值，改了會被下一次重算蓋掉又難追）
    const atkInterval = state.attackInterval / Math.max(0.2, 1 + pDebuff('aspdPct') / 100);
    while (state.attackAccumulator >= atkInterval) {
      state.attackAccumulator -= atkInterval;
      // 昏迷／冰凍／石化／睡眠／混亂：不能攻擊。累積器照樣扣，不然解除的瞬間會一口氣連打
      if (playerImmobile()) continue;
      playerAttack();
      if (state.monsters.length === 0) break;
    }

    // 怪物攻擊（每隻怪物獨立攻擊間隔）
    if (state.monsters.length > 0) {
      state.monsters.forEach(mon => {
        if (!mon.lastAttackTime) mon.lastAttackTime = now;
        const monDef = MONSTERS[mon.defId];
        // 怪物自己的加速增益（NPC_AGIUP / BS_ADRENALINE / KN_TWOHANDQUICKEN）縮短間隔
        const interval = ((monDef && monDef.atkInterval) ? monDef.atkInterval * 1000 : 1000)
          / (1 + monBuff(mon, 'aspdPct') / 100)
          / monDebuffAspd(mon);              // 勿忘我（#68）：攻速下降＝間隔拉長
        if (now - mon.lastAttackTime >= interval) {
          mon.lastAttackTime = now;
          monsterAttackSingle(mon);
        }
      });
    }
  } else {
    state._prevHadMonsters = false;
  }
  saveGameThrottled();
  onTickUI();
}

/* ---------------- 自然回復 ----------------
   官方 pre-RE 的自然回復是**按 tick 給量**：
     HP：每 6 秒回 MaxHP/200 + VIT/5
     SP：每 8 秒回 MaxSP/100 + INT/6
   本作的迴圈是每秒跑一次，所以把官方的量除以 tick 長度換算成每秒速率。

   `REGEN_IDLE_SCALE` 是放置遊戲的加速倍率。改成官方節奏之前這裡是
   `MaxHP×1.5% + VIT×0.15` **每秒**，實測相當於官方的 14~17 倍——
   Lv99 角色 65 秒回滿，而且回血比全遊戲任何一隻怪的輸出都快，站著不動打不死。
   調難度只要改這一個數。 */
const REGEN_IDLE_SCALE = 3.5;
/* 近戰模式場上同時最多幾隻。衝鋒攻擊、召喚小弟、BOSS 帶小弟都照這個數字補位。 */
const MELEE_MAX_MONSTERS = 5;
/* 近戰模式**一次生幾隻**（使用者 2026-08-16 指定「隨機 1~3 隻」）。
   跟上面的上限是兩回事：上限管場上總數，這個管每次補怪的批量。
   實際生出來的數量還會被剩餘空位夾住，所以場上不會超過 MELEE_MAX_MONSTERS。 */
const MELEE_SPAWN_BATCH_MAX = 3;
/* 開了 BOSS 模式之後，每次補怪抽到 MVP 的機率（%）。
   圖鑑的「出沒地圖」也讀這個數字換算每張圖的出現率（#108），
   所以兩邊不會各寫各的。 */
const MVP_SPAWN_CHANCE_PCT = 20;

/* ---------------- 打寶模式（#110）----------------

   使用者 2026-08-16 指定，參考另一個放置遊戲的「席琳的世界」設計：
   一個可切換的開關，開了之後**全場的怪一起變強、產出也一起變高**，
   分「一般／瘋狂」兩檔，互斥。

   這是 99 級之後**唯一**的成長管道——基礎經驗曲線就是照
   「一般檔（經驗 ×5）三個月走完 100→200」配的（見 data.js 的 expToNextBaseLevel）。
   不開的話同一段要 15 個月，瘋狂檔 1.5 個月。

   倍率取自參考來源的一般／瘋狂兩檔，`hit` 那格是加在「命中門檻」上的比例
   （本作的命中/迴避是差值制，不是把怪的 HIT 直接乘上去，見 dodgeChancePctFromMonster）。 */
const FARM_MODE_OFF = 0, FARM_MODE_NORMAL = 1, FARM_MODE_MAD = 2;
/* `hitFlat` 是加在**命中門檻**上的點數，不是倍率（使用者 2026-08-16 改的）。
   本作的命中／迴避是差值制，1 點就是 1%——原本照參考來源寫成 ×1.5，
   對 Lv160 的怪等於門檻 317 → 438，玩家的迴避率會從 95% 直接掉到 5%，
   是斷崖不是斜坡。改成固定 +40／+80，迴避率就是穩穩地少 40%／80%。 */
const FARM_MODE_MULT = {
  [FARM_MODE_NORMAL]: { hp: 3, atk: 2, def: 1.5, hitFlat: 40, exp: 5, gold: 5, drop: 3, spawn: 0.8 },
  [FARM_MODE_MAD]:    { hp: 5, atk: 3, def: 1.75, hitFlat: 80, exp: 10, gold: 10, drop: 5, spawn: 0.8 },
};
const FARM_MODE_NAMES = { [FARM_MODE_NORMAL]: '打寶模式', [FARM_MODE_MAD]: '瘋狂打寶' };
// 進階二轉才開得了——99 之後才用得到，也才扛得住 HP×3 的怪
const FARM_MODE_JOB_TIER = 2.5;
function farmMode() { return (state && state.farmMode) || FARM_MODE_OFF; }
function farmMult(key) {
  const m = FARM_MODE_MULT[farmMode()];
  return m ? (m[key] != null ? m[key] : 1) : 1;
}
// 加法型的那幾格（目前只有命中）：沒開打寶時是 0，不是 1
function farmFlat(key) {
  const m = FARM_MODE_MULT[farmMode()];
  return m ? (m[key] || 0) : 0;
}
function farmModeUnlocked(jobId) {
  const jd = JOB_TREE[jobId || (state && state.jobId)];
  return !!(jd && jd.tier >= FARM_MODE_JOB_TIER);
}
function setFarmMode(mode) {
  const m = Number(mode) || FARM_MODE_OFF;
  if (m !== FARM_MODE_OFF && !farmModeUnlocked()) {
    logMsg('⚠️ 打寶模式要進階二轉才開得了。');
    return false;
  }
  if (state.farmMode === m) return true;
  state.farmMode = m;
  /* 場上的怪要清掉重生：血量是**生怪當下**照倍率算進去的，
     不清的話切換之後場上會混著兩種倍率的怪，玩家看到的血條對不上。 */
  state.monsters = [];
  state.monster = null;
  logMsg(m === FARM_MODE_OFF ? '🌙 關閉打寶模式。' : `🔥 ${FARM_MODE_NAMES[m]}開啟！怪物更強，經驗 ×${FARM_MODE_MULT[m].exp}、掉落 ×${FARM_MODE_MULT[m].drop}。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return true;
}
const REGEN_HP_TICK_SEC = 6;
const REGEN_SP_TICK_SEC = 8;
/* 每秒實際回多少 HP/SP。抽出來是為了讓角色分頁印得出同一個數字（#102）——
   禪心／運氣調息／聖母之頌歌那類技能**只動回復速度、不動上限**，
   而畫面上沒有任何地方看得到回復速度，點下去就像什麼都沒發生
   （使用者 2026-08-16：「法師 禪心點了 沒有加sp」）。
   `passiveRegen()` 與角色分頁讀同一支，不會再有「顯示跟實際對不上」。 */
function regenPerSecond() {
  // 卡片的「HP/SP恢復力+N%」加成
  const regenMult = (state.hpRegenMult || 1) * (1 + (state.cardHpRegenPct || 0) / 100);
  /* 運氣調息（#70）：官方是「坐著時每 10 秒回復 N + N% MaxHP」。本作沒有坐下的動作，
     使用者指定改成常駐——併進每 tick 的量（跟禪心同一個位置），不另開回血心跳。 */
  const mr = state.monkRegen;
  const monkHp = mr ? mr.hpFlat + state.maxHp * (mr.hpPct / 100) : 0;
  const monkSp = mr ? mr.spFlat + state.maxSp * (mr.spPct / 100) : 0;
  const hpPerTick = state.maxHp / 200 + state.stats.vit / 5 + monkHp;
  /* 恢復力可以是負的（幽靈波利 −25%、七彩飛龍 −100%），所以不能無腦 Math.max(1,…)——
     那會讓「恢復力歸零」的卡片還是每秒回 1 點。降到 0 以下就是完全不回。 */
  const hp = regenMult <= 0 ? 0 : Math.max(1, Math.ceil(hpPerTick / REGEN_HP_TICK_SEC * REGEN_IDLE_SCALE * regenMult));
  /* 禪心：官方是「每個 SP tick +3~30」，所以跟基底一樣要除以 tick 長度，
     不然一個技能就蓋過整條自然回復。百分比那項同理。 */
  const zenFlat = state.zenSpFlatBonus || 0;
  const zenPct = state.maxSp * ((state.zenSpPctBonus || 0) / 100);
  const spPerTick = state.maxSp / 100 + state.stats.int / 6 + zenFlat + zenPct + monkSp;
  // 聖母之頌歌buff：SP恢復速度倍率
  const sprateMult = buffMult('sprate').mult;
  const spRegenMult = (state.spRegenMult || 1) * sprateMult
    * (1 + ((state.cardSpRegenPct || 0) + (state.skillSpRegenPct || 0)) / 100);
  const sp = spRegenMult <= 0 ? 0 : Math.max(1, Math.ceil(spPerTick / REGEN_SP_TICK_SEC * REGEN_IDLE_SCALE * spRegenMult));
  return { hp, sp };
}

function passiveRegen() {
  /* 卡片的定時回復（闇●劍士 賽尼亞：每 10 秒 +50HP +10SP）。
     跟下面的自然回復是兩回事——這是固定量的獨立心跳，
     所以**不吃 hpRegenPct，也不受出血的「完全不回復」影響**（官方就是這樣寫的）。 */
  const tickHp = getCardBonus('regenTickHp'), tickSp = getCardBonus('regenTickSp');
  if (tickHp || tickSp) {
    const now = Date.now();
    if (now >= (state.cardRegenTickAt || 0)) {
      state.cardRegenTickAt = now + 10000;
      if (tickHp && state.hp > 0) state.hp = Math.min(state.maxHp, state.hp + tickHp);
      if (tickSp) state.sp = Math.min(state.maxSp, state.sp + tickSp);
    }
  }
  const { hp: hpRegen, sp: spRegen } = regenPerSecond();
  // 出血：官方規則，出血期間 HP/SP 完全不會自然回復
  if (playerNoRegen()) return;
  /* 極速回復（#58）：自然回 HP 時機率讓這一跳加倍。
     只作用在 HP，官方那個技能講的就是 HP；沒有冷卻，代價是機率。 */
  let hpThisTick = hpRegen;
  if (state.regenDoubleChance > 0 && hpThisTick > 0
      && Math.random() * 100 < state.regenDoubleChance) {
    hpThisTick = Math.round(hpThisTick * (state.regenDoubleMult || 2));
  }
  if (state.hp < state.maxHp) state.hp = Math.min(state.maxHp, state.hp + hpThisTick);
  if (state.sp < state.maxSp) state.sp = Math.min(state.maxSp, state.sp + spRegen);
}

/* 背包的查詢與扣除也一律走**玩家**那份（跟 addItem 同一個理由）。

   隊友快照沒有自己的背包。第一版把它設成 `{}`（物件）而不是陣列，
   弓箭手隊友一攻擊就 `state.inventory.find is not a function`，
   例外從 withAlly 一路竄出 alliesTick，**排在後面的隊友整個不會動**。
   箭矢、技能耗材本來就該吃玩家的補給，跟喝水的規則一致。 */
function getItemQty(itemId) {
  const inv = allyOwnerState().inventory;
  if (!Array.isArray(inv)) return 0;
  const row = inv.find(r => r.item === itemId && !r.instanceId);
  return row ? row.qty : 0;
}

/* ---------------- 藥水：自動使用 / 自動購買 ---------------- */
function autoUsePotion() {
  if (!state.autoPotion || !state.autoPotion.enabled) return;
  const threshold = (state.autoPotion.hpThreshold || 50) / 100;
  if (state.hp >= state.maxHp * threshold) return;

  const primary = state.autoPotion.primary;
  const fallback = state.autoPotion.fallback;

  // 優先使用第一選擇（背包道具）
  if (primary && getItemQty(primary) > 0) {
    useItem(primary);
    return;
  }
  // 第一選擇用完，使用第二選擇（固定藥水）
  if (fallback) {
    if (getItemQty(fallback) <= 0 && state.autoBuyPotion) {
      buyItem(fallback, AUTO_BUY_QTY);
    }
    if (getItemQty(fallback) > 0) {
      useItem(fallback);
    }
  }
}

/* SP 藥水自動使用：結構與 HP 那組一模一樣（第一格背包任選、第二格藍水可自動買）。
   商店只賣藍水，其他回SP道具（藍色藥草／葡萄／草莓／蜂蜜／蜂膠／天地樹）都要打怪拿。 */
const AUTO_BUY_SP_QTY = 50;
function autoUseSpPotion() {
  if (!state.autoSpPotion || !state.autoSpPotion.enabled) return;
  const threshold = (state.autoSpPotion.spThreshold || 30) / 100;
  if (state.sp >= state.maxSp * threshold) return;

  const primary = state.autoSpPotion.primary;
  const fallback = state.autoSpPotion.fallback;

  // 優先使用第一選擇（背包裡任何回SP道具）
  if (primary && getItemQty(primary) > 0) {
    useItem(primary);
    return;
  }
  // 第二選擇：藍水（唯一買得到的）
  if (fallback) {
    if (getItemQty(fallback) <= 0 && state.autoBuySpPotion) {
      buyItem(fallback, AUTO_BUY_SP_QTY);
    }
    if (getItemQty(fallback) > 0) useItem(fallback);
  }
}
/* 攻速藥水自動使用：勾選哪幾種就在 buff 消失後自動補上（由高到低挑職業能用的）。
   開了自動購買的話，勾選的那種喝完會自動補貨（買不起就換下一種）。 */
const AUTO_BUY_ASPD_QTY = 10;
function autoUseAspdPotion() {
  if (!state.autoAspdPotion || !state.autoAspdPotion.enabled) return;
  // 已經有攻速 buff 就不重複喝
  if (state.buffs.some(b => b.type === 'aspd' && b.fromPotion)) return;
  const picks = state.autoAspdPotion.items || [];
  // 效果高的優先
  const order = ['berserk_potion', 'awakening_potion', 'center_potion'];
  for (const id of order) {
    if (!picks.includes(id)) continue;
    if (aspdPotionBlockReason(id)) continue;
    if (getItemQty(id) <= 0 && state.autoBuyAspdPotion) {
      const def = ITEMS[id];
      const unit = def && def.buyPrice ? Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1))) : 0;
      // 買得起整批才買，免得把錢掏空只買到一兩瓶
      if (unit && state.gold >= unit * AUTO_BUY_ASPD_QTY) buyItem(id, AUTO_BUY_ASPD_QTY);
    }
    if (getItemQty(id) <= 0) continue;
    useItem(id);
    return;
  }
}
function setAutoBuyAspdPotion(v) { state.autoBuyAspdPotion = !!v; saveGame(); }
function toggleAutoAspdPotion(itemId, on) {
  if (!state.autoAspdPotion) state.autoAspdPotion = { enabled: true, items: [] };
  const arr = state.autoAspdPotion.items;
  const i = arr.indexOf(itemId);
  if (on && i < 0) arr.push(itemId);
  if (!on && i >= 0) arr.splice(i, 1);
  saveGame();
}
function setAutoAspdPotionEnabled(v) {
  if (!state.autoAspdPotion) state.autoAspdPotion = { enabled: true, items: [] };
  state.autoAspdPotion.enabled = !!v; saveGame();
}

function setAutoSpPotionEnabled(v) { state.autoSpPotion.enabled = !!v; saveGame(); }
function setAutoSpPotionPrimary(v) { state.autoSpPotion.primary = v; saveGame(); }
function setAutoSpPotionFallback(v) { state.autoSpPotion.fallback = v; saveGame(); }
function setAutoSpPotionThreshold(v) { state.autoSpPotion.spThreshold = Math.max(10, Math.min(90, parseInt(v) || 30)); saveGame(); }
function setAutoBuySpPotion(v) { state.autoBuySpPotion = !!v; saveGame(); }

/* 沒選箭種時自動挑一種（#129）。

   `state.equip.ammo` 是「選了哪一種箭」，箭本體放在背包。以前**沒有任何地方
   會自動填這個欄位**：弓箭手轉職拿到 1000 支鋼鐵箭矢，背包裡有箭，
   `getAmmoCount()` 卻回 0，攻擊時只印「沒有箭矢」；而自動補箭第一行就是
   `if (!id) return`，等於整條路被自己鎖死——買不了，也用不到手上的箭。

   隊友那邊 2026-08-15 就修過同一個症狀（`ensureAllyAmmo()`），玩家這邊漏了。
   這支是它的玩家版，規則一模一樣：
     背包有箭就挑一種裝上；一種都沒有就保留原本的箭種（沒有就退回鋼鐵箭矢），
     留著欄位讓 `tryAutoBuyArrow()` 知道要買什麼。

   弓、樂器、鞭都算（見 isBowWeapon），所以整條弓箭手線都吃得到。 */
const PLAYER_ARROW_FALLBACK = 'steel_arrow';
function ensurePlayerAmmo() {
  if (!state || !state.equip || !needsAmmo()) return;
  const cur = state.equip.ammo;
  if (cur && getItemQty(cur) > 0) return;          // 現在這種還有，不動
  const row = (state.inventory || []).find(r => !r.instanceId && isAmmoItem(r.item) && r.qty > 0);
  const next = row ? row.item : (cur || PLAYER_ARROW_FALLBACK);
  if (next === cur) return;
  state.equip.ammo = next;
  recomputeDerived(false);
  if (row) logMsg(`🏹 自動裝上了 ${ITEMS[next].name}（剩餘 ${getItemQty(next)}）。`);
}

/* 自動補箭：掛機時箭快用完就自動買同一種（只在城鎮外也能買，比照自動買藥水的做法）。
   買不起或那種箭商店沒賣就安靜跳過，playerAttack() 那邊會提示沒箭。 */
const AUTO_BUY_ARROW_QTY = 500;
const AUTO_BUY_ARROW_THRESHOLD = 50;
function tryAutoBuyArrow() {
  if (!state.autoBuyArrow) return;
  if (!needsAmmo()) return;
  ensurePlayerAmmo();                 // 沒選箭種的話先挑一種，不然下一行就 return 了
  const id = getEquippedAmmoId();
  if (!id) return;
  if (getItemQty(id) > AUTO_BUY_ARROW_THRESHOLD) return;
  const def = ITEMS[id];
  if (!def || !def.buyPrice) return;
  const unit = Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1)));
  if (state.gold < unit * AUTO_BUY_ARROW_QTY) return;
  buyItem(id, AUTO_BUY_ARROW_QTY);
}
function setAutoBuyArrow(v) { state.autoBuyArrow = !!v; saveGame(); }

function buyItem(itemId, qty) {
  const def = ITEMS[itemId];
  if (!def || !def.buyPrice) return false;
  const unitPrice = Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1)));
  let actualQty = qty;
  if (state.gold < unitPrice * actualQty) {
    actualQty = Math.floor(state.gold / unitPrice);
  }
  if (actualQty <= 0) {
    logMsg(`⚠️ 鋅幣不足，無法購買 ${def.name}。`);
    return false;
  }
  const cost = unitPrice * actualQty;
  state.gold -= cost;
  addItem(itemId, actualQty);
  logMsg(`🛒 購買了 ${def.name} x${actualQty}，花費 ${cost} 鋅幣。`);
  saveGame();
  return true;
}

function setAutoPotionTier(tier) { state.autoPotion.primary = tier; saveGame(); }
function setAutoPotionFallback(tier) { state.autoPotion.fallback = tier; saveGame(); }
function setAutoPotionEnabled(v) { state.autoPotion.enabled = !!v; saveGame(); }
function setAutoPotionThreshold(v) { state.autoPotion.hpThreshold = Math.max(10, Math.min(90, parseInt(v) || 50)); saveGame(); }

// 技能補血：HP%觸發門檻 / SP%下限保護（依技能各自設定）
function setAutoHealHpThreshold(skillId, v) {
  if (!state.autoHealConfig) state.autoHealConfig = {};
  if (!state.autoHealConfig[skillId]) state.autoHealConfig[skillId] = { hpThreshold: 70, spThreshold: 0 };
  state.autoHealConfig[skillId].hpThreshold = Math.max(1, Math.min(99, parseInt(v) || 70));
  saveGame();
}
function setAutoHealSpThreshold(skillId, v) {
  if (!state.autoHealConfig) state.autoHealConfig = {};
  if (!state.autoHealConfig[skillId]) state.autoHealConfig[skillId] = { hpThreshold: 70, spThreshold: 0 };
  state.autoHealConfig[skillId].spThreshold = Math.max(0, Math.min(100, parseInt(v) || 0));
  saveGame();
}
function setAutoBuyPotion(v) { state.autoBuyPotion = !!v; saveGame(); }

// 能量外套：勾選開關與SP%下限
function setEnergyCoatEnabled(v) { state.energyCoatEnabled = !!v; saveGame(); }
function setEnergyCoatSpFloor(v) { state.energyCoatSpFloorPct = Math.max(0, Math.min(100, parseInt(v) || 0)); saveGame(); }

function tickCooldowns() {
  Object.keys(state.cooldowns).forEach(k => {
    state.cooldowns[k] -= TICK_MS;
    if (state.cooldowns[k] <= 0) delete state.cooldowns[k];
  });
}
function tickBuffs() {
  state.buffs = state.buffs.filter(b => {
    b.msRemaining -= TICK_MS;
    return b.msRemaining > 0;
  });
  // buff 變動後重新計算所有衍生數值（心神凝聚等 DEX/AGI% buff 會影響 ATK/MATK/命中/迴避/攻速，
  // 光重算 ASPD 不夠，需要整個 recomputeDerived）
  recomputeDerived(false);
}

// ASPD 計算（每次 tick 重新計算，反映即時 buff）
// 使用武器 ASPD 查表（ro_aspd_data/aspd_weapon_base.json）
/* 弓系：官方對這幾類武器改用另一條素質公式（AGI 權重略低） */
const ASPD_BOW_LIKE = ['bow', 'instrument', 'whip', 'pistol', 'rifle', 'shotgun', 'gatling', 'grenade'];
// 雙持時左手武器對應的表格欄位
const ASPD_DUAL_KEY = { dagger: 'dual_dagger', sword1: 'dual_sword1', axe1: 'dual_axe1' };

function computeAspd() {
  // aspdFrom：進階二轉沿用本職的攻速表（官方轉生二轉的攻速跟原二轉完全相同）
  const tbl = ASPD_WEAPON_BASE[aspdJobKey(state.jobId)];
  const weapons = tbl ? tbl.weapons : null;
  const shieldTbl = tbl ? tbl.shield : null;

  // Step 1: 右手武器基礎值。查不到（職業不能拿這種武器、或沒資料）一律退回空手值
  const weaponId = getEquipBaseItemId('weapon');
  const rightCat = aspdCategoryOf(weaponId);
  const bare = (weapons && weapons.bare !== undefined) ? weapons.bare : 154;
  let rightValue = (weapons && weapons[rightCat] !== undefined) ? weapons[rightCat] : bare;

  // Step 2: 左手 —— 盾牌是負修正，副手武器則走雙持公式
  const offId = getEquipBaseItemId('shield');
  const offItem = offId ? ITEMS[offId] : null;
  const dualWield = !!(offItem && offItem.type === 'weapon' && canDualWield(state.jobId));
  let leftValue = 0;
  if (dualWield) {
    const dk = ASPD_DUAL_KEY[aspdCategoryOf(offId)];
    // 左手值查不到就用該武器的單手值，再不行就用右手值（官方雙持限單手武器）
    leftValue = (shieldTbl && dk && shieldTbl[dk] !== undefined) ? shieldTbl[dk]
              : ((weapons && weapons[aspdCategoryOf(offId)] !== undefined) ? weapons[aspdCategoryOf(offId)] : rightValue);
  } else if (offItem) {
    leftValue = (shieldTbl && shieldTbl.shield !== undefined) ? shieldTbl.shield : -5;
  }

  // Step 3: 素質加成。官方用「總 AGI/DEX」，recomputeDerived() 已把職業/裝備/卡片/被動/buff 都算進去
  const agi = (state._totalAgi != null ? state._totalAgi : state.stats.agi);
  const dex = (state._totalDex != null ? state._totalDex : state.stats.dex);
  const statBonus = ASPD_BOW_LIKE.includes(rightCat)
    ? Math.sqrt(Math.abs(agi * (10 - 1 / 400) + dex * 11 / 60))
    : Math.sqrt(Math.abs(agi * 1120 / 111 + dex * 11 / 60));

  // Step 4: BaseTemp
  let core;
  if (dualWield) {
    // 雙持不套盾牌值，左手武器用另一條公式折算
    core = rightValue + (leftValue - 194) / 4 + statBonus * 1.04518;
  } else if (rightValue >= 145) {
    // 高速武器：素質加成有邊際效應
    core = rightValue + statBonus * (1 - (rightValue - 144) / 50) + leftValue;
  } else {
    core = rightValue + statBonus + leftValue;
  }

  // Step 5: 技能/藥水攻速百分比
  let skillAspdPct = 0;
  let buffAspdFlat = 0;
  state.buffs.forEach(b => {
    if (b.type !== 'aspd') return;
    if (b.mult) skillAspdPct += (b.mult - 1);
    // 狂怒之槍那種「ASPD +N 點」的 buff（#58）。倍率那條走上面，兩者可以並存
    if (b.flatBonus) buffAspdFlat += b.flatBonus;
  });
  /* 光之盾的攻速懲罰（#66）：跟技能攻速走同一層相加。
     官方光之盾的減速就是跟長矛加速術那類同級的「技能攻速%」，
     所以兩個一起掛時是 +30% 與 −20% 相抵，不是各乘一次。 */
  if (state.defenderAspdPct) skillAspdPct -= state.defenderAspdPct / 100;
  // 操控樂器（#68）：裝備樂器時攻速 +1~10%，跟技能攻速走同一層
  if (state.songAspdPct) skillAspdPct += state.songAspdPct / 100;
  const afterSkill = 200 - (200 - core) * (1 - skillAspdPct);

  // Step 6: 裝備攻速百分比 + 固定值（含蒼鷹之眼等被動固定ASPD加成）
  // 卡片的攻速走這一層：官方把卡片跟裝備的攻速%放同一條乘算，跟技能/藥水那層是分開的
  let equipAspdPct = getCardBonus('aspdPct') / 100;
  let aspdFlatBonus = (state.passiveAspdFlat || 0) + getCardBonus('aspdFlat') + buffAspdFlat;
  EQUIP_SLOTS_ALL.forEach(slot => {
    const aspdItemId = getEquipBaseItemId(slot);
    const item = aspdItemId ? ITEMS[aspdItemId] : null;
    if (item) {
      if (item.aspdBonus) equipAspdPct += (item.aspdBonus - 1);
      if (item.aspdFlat) aspdFlatBonus += item.aspdFlat;
    }
  });
  const finalAspd = Math.floor(195 - (195 - afterSkill) * (1 - equipAspdPct) + aspdFlatBonus);

  // 官方上限：未滿100等 190，100等以上 193
  const cap = state.baseLevel >= 100 ? 193 : 190;
  state.aspd = Math.min(cap, Math.max(100, finalAspd));
  /* 刺客遺物 5 件的「攻速恆定 193」（#113）：直接頂到上限。
     寫成「頂到 cap」而不是寫死 193——99 級以下上限是 190，
     寫死會讓那段時間的角色拿到官方拿不到的攻速。 */
  if (state.buffs.some(b => b.type === 'aspdmax')) state.aspd = cap;
  state.attackInterval = getAttackInterval(state.aspd);
}
function buffMult(type) {
  let mult = 1;
  let flatBonus = 0;
  state.buffs.forEach(b => {
    if (b.type === type) {
      if (typeof b.mult === 'number' && !Number.isNaN(b.mult)) mult *= b.mult;
      if (b.flatBonus) flatBonus += b.flatBonus;
    }
  });
  return { mult, flatBonus };
}

// HIT類buff（例如速度激發、光獵）先前只推進state.buffs卻沒有任何地方讀取，此處統一補上消耗端
/* 玩家的有效命中。黑暗會讓它下降（官方 −25%），所以所有命中判定都吃得到。 */
function effectiveHitWithBuff() {
  return (state.hit + buffMult('hit').flatBonus) * (1 + playerAilPct('hitPct') / 100);
}

/* 物理技能的命中判定（#76）。使用者 2026-08-14 的規則：
   **ATK 技能一律要判定命中，除非技能自己寫 `alwaysHit: true`；MATK 技能才是必中。**
   所以 magic / magic_aoe / field_aoe_magic 那些走 MATK 的根本不呼叫這裡。

   以前每個 case 各寫一份，六處的內容還不完全一樣（有的忘了加命中修正）。
   併成一支之後，`alwaysHit` 只要在這裡認一次，全部的物理路徑就都吃得到。

   **`hitBonus` 不能無條件加**：這個欄位是多義的——狂擊寫的是「這一擊的命中修正」，
   但二刀連擊／武器研究／天使之賜福寫的是「常駐或 buff 的 HIT」，那三個在
   recomputeDerived 就已經加進 state.hit 了，這裡再加一次就是重複計算。
   所以狂擊維持寫死 id，新技能一律用 `hitBonusOnCast`（背刺、連續盾擊）。 */
function skillHits(sk, lv, monDef, inst) {
  if (!sk || sk.alwaysHit) return true;
  let hit = effectiveHitWithBuff();
  // 超音速投擲被動：音速投擲命中率修正 +90%
  if (sk.id === 'sonicblow' && state.hasSonicblowBoost) hit += 90;
  if (sk.id === 'bash' && sk.hitBonus) {
    hit += Array.isArray(sk.hitBonus) ? sk.hitBonus[lv - 1] : sk.hitBonus;
  }
  if (sk.hitBonusOnCast) {
    hit += Array.isArray(sk.hitBonusOnCast) ? sk.hitBonusOnCast[lv - 1] : sk.hitBonusOnCast;
  }
  return Math.random() * 100 <= hitChancePctVsMonster(hit, monDef, inst);
}
// 攻擊力的臨時修正：詛咒（×0.75）與挑釁（±N%）
function playerAtkMult() {
  return playerAilAtkMult() * (1 + pDebuff('atkPct') / 100);
}
/* 自動防禦（#22）：這一擊有沒有被完全擋下。只擋物理，跟「完全迴避」是兩件事——
   完全迴避看的是 LUK，這個是技能給的限時 buff。 */
/* 機率完全擋下物理攻擊。兩個來源各擲一次：
     自動防禦（#22）—— buff，卡片給的，有持續時間
     雙劍挌擋（#58）—— 領主騎士被動，常駐但要拿雙手劍
   分開擲而不是把機率相加，是因為官方本來就是兩個獨立的判定，
   相加會在兩者都高的時候直接爆到 100%。 */
/* 回傳**是哪個來源擋下的**（'autoguard' / 'parrying'）或 null。
   以前回 true/false 就夠用，但十字軍的退縮（#66）官方寫的是
   「以**自動防禦**成功防禦時，有 50% 機率使對方暈眩」——雙劍挌擋擋下的那次不算，
   所以呼叫端要分得出來。兩個呼叫點都只做真假判斷，字串一樣是 truthy，行為不變。 */
/* scope：'attack' 普攻／'skill' 怪物技能。
   沒寫 `blockScope` 的 buff（自動防禦、化學盾牌保護）兩種都擋，
   寫了的只擋自己那種——#77 的兩招剛好一人一半。 */
function playerBlocked(scope) {
  /* 化學盾牌保護（#72）帶自己的內部冷卻，所以 block 型 buff 要分成兩批：
     沒寫 `blockCdSec` 的（自動防禦）照舊每次都擲，
     寫了的先看冷卻好了沒、而且**只在擲中時才重新計時**——
     擲失敗也扣冷卻的話，20% 的實際發生率會被壓到 2% 左右（跟 #66 光之盾同一個坑）。 */
  const now = Date.now();
  let pct = 0;
  const timed = [];
  state.buffs.forEach(b => {
    if (b.type !== 'block' || !b.flatBonus) return;
    if (b.blockScope && scope && b.blockScope !== scope) return;
    if (!b.blockCdSec) { pct += b.flatBonus; return; }
    if (now >= (b.blockReadyAt || 0)) timed.push(b);
  });
  if (pct > 0 && Math.random() * 100 < pct) return 'autoguard';
  for (const b of timed) {
    if (Math.random() * 100 >= b.flatBonus) continue;
    b.blockReadyAt = now + b.blockCdSec * 1000;
    return 'autoguard';
  }
  const parry = state.parryingChance || 0;
  if (parry > 0 && Math.random() * 100 < parry) return 'parrying';
  return null;
}

/* 退縮（#66）：自動防禦擋下時，機率把對方震暈。
   官方是「再次使用時解除」的開關技能且 maxLv 0（未開放），
   使用者 2026-08-09 指定改成**被動、轉職自動獲得**。 */
function tryShrinkStun(mon, monDef, blockedBy) {
  if (blockedBy !== 'autoguard') return;
  if (!state.shrinkStunChance || !mon) return;
  if (Math.random() * 100 >= state.shrinkStunChance) return;
  applyStun(mon, state.shrinkStunSec || 1, true);
  logMsg(`💫 退縮！${monDef.name} 被盾牌震得站不穩。`);
}
/* 迴避的 buff 版本。以前 buff_flee 類技能會 push 一個 type:'flee' 的 buff，
   但迴避判定直接讀 state.flee，那個 buff 從來沒有人去讀——等於推了個空的。
   跟 effectiveHitWithBuff() 同樣的處理方式，在使用端套上去。 */
function effectiveFleeWithBuff() {
  const b = buffMult('flee');
  // 緩緩移動那批：迴避減的是**點數**（命中判定是差值制，百分比會被放大到離譜）
  return Math.round(state.flee * b.mult) + b.flatBonus + pDebuff('fleeFlat');
}

/* ---------------- 怪物 ---------------- */
function currentMap() { return MAPS.find(m => m.id === state.mapId); }

/* ---- BOSS 名單拆兩半（#147）----
   `MVP_MAP_DATA` 一直是「這張圖有哪些 BOSS 階級魔物」的混合名單，
   正牌 MVP 與迷你王混在一起，一個勾選同時決定兩種。使用者要分開：
   兩個模式各自勾選、各自 20%。

   兩份名單都從同一張表推導，不另外維護第二份資料——
   多一份就會有一份忘了更新，而那種錯只會表現成「某隻王再也不出現」。 */
function bossListOf(mapId, kind) {
  const list = (typeof MVP_MAP_DATA !== 'undefined' && MVP_MAP_DATA[mapId]) || [];
  return list.filter(id => {
    const m = MONSTERS[id];
    if (!m) return false;
    return kind === 'mvp' ? !!m.isMvp : !m.isMvp;
  });
}
// 這張圖、依目前勾選的兩個開關，實際會出現的 BOSS 名單（離線結算也讀這一支）
function activeBossLists(mapId) {
  const out = [];
  if (state.mvpMode) { const l = bossListOf(mapId, 'mvp'); if (l.length) out.push(l); }
  if (state.miniMode) { const l = bossListOf(mapId, 'mini'); if (l.length) out.push(l); }
  return out;
}

/* ---- 生怪速度（#146）----
   本作沒有「移動」這個維度，所以官方所有「移動速度上升」的效果一律換算成
   **生怪加速**（騎乘術的說明也是直接寫「生怪速度+25%」）。來源目前有四個，
   全部相乘，每一步都夾 100ms 下限——間隔太短會讓場上永遠是滿的，
   等於單方面拉高挨打量。

   抽成函式是為了讓角色分頁顯示同一個數字：以前這段只寫在 spawnMonster() 裡面，
   畫面上沒有任何地方看得到，玩家點了騎乘術也不知道到底有沒有變快。
   兩邊各算一次的話遲早會算出不一樣的值，所以共用這一支。 */
const SPAWN_BASE_MS = { empty: 500, some: 3000 };
function spawnSpeedSources() {
  const out = [];
  if (state.hasRiding) out.push({ name: '騎乘術／弓身彈影', pct: 33 });   // 500→375、3000→2250
  if (state.cardSpawnSpeedPct) out.push({ name: '卡片', pct: state.cardSpawnSpeedPct });
  const cb = buffMult('spawnspeed').mult;
  if (cb !== 1) out.push({ name: '手推車加速', pct: Math.round((cb - 1) * 100) });
  if (state.songSpawnSpeedPct) out.push({ name: '合奏', pct: state.songSpawnSpeedPct });
  const fm = farmMult('spawn');
  if (fm !== 1) out.push({ name: '打寶模式', pct: Math.round((1 / fm - 1) * 100) });
  return out;
}
// empty=true 代表場上一隻都沒有（補第一批的間隔比較短）
function spawnDelayMs(empty) {
  const ride = state.hasRiding;
  let delay = empty ? (ride ? 375 : SPAWN_BASE_MS.empty) : (ride ? 2250 : SPAWN_BASE_MS.some);
  const clamp = v => Math.max(100, Math.round(v));
  const spawnPct = state.cardSpawnSpeedPct || 0;
  if (spawnPct) delay = clamp(delay / (1 + spawnPct / 100));
  const cb = buffMult('spawnspeed').mult;
  if (cb !== 1) delay = clamp(delay / cb);
  if (state.songSpawnSpeedPct) delay = clamp(delay / (1 + state.songSpawnSpeedPct / 100));
  if (farmMult('spawn') !== 1) delay = clamp(delay * farmMult('spawn'));
  return delay;
}

function spawnMonster() {
  const map = currentMap();
  if (!map.monsters.length && !activeBossLists(map.id).length) {
    state.monsters = [];
    return;
  }
  if (!state.monsters) state.monsters = [];
  if (!state.encounterMode) state.encounterMode = 'melee';
  if (!state.lastSpawnTime) state.lastSpawnTime = Date.now();

  const maxMonsters = state.maxMonsters || MELEE_MAX_MONSTERS;
  // 近戰模式：0隻時0.5秒補一批、1隻以上時3秒補一批，每批 1~3 隻，場上上限 MELEE_MAX_MONSTERS
  if (state.encounterMode === 'melee') {
    if (state.monsters.length >= maxMonsters) return;
    const now = Date.now();
    // 生怪間隔的四個加速來源都在 spawnDelayMs() 裡（角色分頁顯示的是同一支）
    const delay = spawnDelayMs(state.monsters.length === 0);
    if (now - state.lastSpawnTime < delay) return;
    state.lastSpawnTime = now;
  }
  // 遠攻模式：維持原本邏輯（1隻怪，死後才生下一隻）
  else {
    if (state.monsters.length > 0) return;
  }

  const bossLists = activeBossLists(map.id);      // 已經照兩個開關過濾過（#147）
  /* 近戰模式一次生 1~3 隻（使用者 2026-08-16 指定）。遠攻模式照舊一次一隻。
     批量會被**剩餘空位**夾住，所以場上永遠不超過 maxMonsters。 */
  const room = Math.max(0, maxMonsters - state.monsters.length);
  const batch = state.encounterMode === 'melee'
    ? Math.min(room, 1 + Math.floor(Math.random() * MELEE_SPAWN_BATCH_MAX))
    : 1;

  for (let i = 0; i < batch; i++) {
    // MVP 帶小弟時會自己把空位填滿，所以每一輪都要重新確認還有沒有位置
    if (state.monsters.length >= maxMonsters) break;
    /* BOSS 抽選（#147）。MVP 與迷你王各自 20%、各自檢查「同類還活著沒」——
       兩邊都中的時候不是各生一隻（一輪只有一個空位），而是從中選一個。
       這樣任一邊單獨開啟時的機率跟以前一模一樣，兩邊都開也不會變成 40%。 */
    let defId;
    const hit = bossLists.filter(l =>
      !state.monsters.some(m => l.includes(m.defId)) && Math.random() * 100 < MVP_SPAWN_CHANCE_PCT);
    if (hit.length) {
      const l = hit[Math.floor(Math.random() * hit.length)];
      defId = l[Math.floor(Math.random() * l.length)];
    } else {
      defId = pickWeightedMonster(map.monsters);
    }
    const def = MONSTERS[defId];
    if (!def) continue; // 怪物不存在，跳過這一隻
    state.monsterIdCounter = (state.monsterIdCounter || 0) + 1;
    // 打寶模式的血量倍率是**生怪當下**算進去的（切換模式時 setFarmMode 會清場重生）
    const hp = Math.round(def.hp * farmMult('hp'));
    /* `spawnedAt`（#137）：頭目的擊殺耗時要從這裡量到死。
       量「出現到死」而不是「第一刀到死」是刻意的——中間被雜魚分掉的攻擊、
       喝水停頓、隊友放輔助的空檔，全部算進去才是真實的產出速度，
       而離線結算要的正是那個速度。 */
    state.monsters.push({ defId, hp, maxHp: hp, id: state.monsterIdCounter, spawnedAt: Date.now(), farmMode: farmMode() });
    applyDontForgetMe(state.monsters[state.monsters.length - 1]);
    codexRecordSeen(defId);
    /* 只有**正牌 MVP** 才帶小弟（#147）。以前是「在 MVP_MAP_DATA 裡就帶」，
       所以迷你王也會把場子填滿，訊息還印成「（MVP）」。 */
    if (def.isMvp) {
      logMsg(`⚠️ ${def.icon} ${def.name}（MVP）降臨了！`);
      summonBossSlaves(def);
    } else if (def.isBoss) {
      logMsg(`⚠️ ${def.icon} ${def.name}（迷你王）出現了！`);
    } else {
      logMsg(`一隻 ${def.icon} ${def.name} 出現了！`);
    }
  }
  state.monster = state.monsters[0];
}

/* 召喚小弟（#36 的最後一條）。

   官方 `NPC_SUMMONSLAVE` / `NPC_CALLSLAVE` / `NPC_SUMMONMONSTER` 共 127 條，
   做法是「BOSS 一出場就把周圍的小弟叫齊」。本作沒有位置概念，所以直接把
   **場上剩下的空位一次生滿**（上限仍是 `maxMonsters`，近戰模式 5 隻）——
   一次到位而不是逐隻慢慢補，才有「BOSS 帶著一群手下登場」的感覺。

   小弟從**該地圖的一般配怪表**抽，不從 MVP 表抽（不然會變成一次出兩隻 BOSS）。
   填完把 `lastSpawnTime` 推到現在，所以之後回到正常的 3 秒一隻，
   不會因為「剛才一次生了 4 隻」而讓節流計時錯亂。

   只在近戰模式有意義：遠攻模式 `maxMonsters` 是 1，填不進任何小弟——
   所以 BOSS 模式本身就擋在近戰模式（見 toggleMvpMode）。 */
function summonBossSlaves(bossDef) {
  const map = currentMap();
  if (!map || !(map.monsters || []).length) return;
  const max = state.maxMonsters || MELEE_MAX_MONSTERS;
  const slots = max - state.monsters.length;
  if (slots <= 0) return;
  const names = [];
  for (let i = 0; i < slots; i++) {
    const sid = pickWeightedMonster(map.monsters);
    const sdef = MONSTERS[sid];
    if (!sdef) continue;
    state.monsterIdCounter = (state.monsterIdCounter || 0) + 1;
    state.monsters.push({ defId: sid, hp: sdef.hp, maxHp: sdef.hp, id: state.monsterIdCounter, spawnedAt: Date.now() });
    applyDontForgetMe(state.monsters[state.monsters.length - 1]);
    codexRecordSeen(sid);
    names.push(sdef.icon + sdef.name);
  }
  if (!names.length) return;
  state.lastSpawnTime = Date.now();   // 填滿之後回到正常節流
  logMsg(`👥 ${bossDef.name} 召喚了手下：${names.join('、')}！`);
}

// 衝鋒攻擊：額外生成一隻怪
function spawnExtraMonster() {
  const map = currentMap();
  if (!map.monsters.length) return;
  if (!state.monsters) state.monsters = [];
  if (state.monsters.length >= state.maxMonsters) return;
  const defId = pickWeightedMonster(map.monsters);
  const def = MONSTERS[defId];
  if (!def) return;
  state.monsterIdCounter = (state.monsterIdCounter || 0) + 1;
  state.monsters.push({ defId, hp: def.hp, maxHp: def.hp, id: state.monsterIdCounter, spawnedAt: Date.now() });
  applyDontForgetMe(state.monsters[state.monsters.length - 1]);
  logMsg(`一隻 ${def.icon} ${def.name} 被衝鋒攻擊召喚了！`);
}

/* 追加傷害段（拳刃附加、二刀連擊、怒爆之火）的飄字。
   logMsg 那邊的飄字判斷只認「你…造成 N 點傷害」這種句型，這幾段的訊息格式不同，
   所以抓不到、怪物頭上一直沒有數字。與其去改訊息文字（那條規則很脆），
   在這裡直接叫飄字比較清楚。isCrit 由主攻擊那一次判定帶進來。 */
/* 官方普攻傷害鏈的前半段（傷害公式 C 案）。
   體型修正、屬性倍率、武器浮動這三個只作用在**武器 ATK**上，
   素質 ATK 與熟練度固定加成不吃這些修正，是在最後才加進去的。

   武器浮動改成以 1.0 為中心、擺動幅度依武器等級（±武器等級×5%）。
   官方的浮動是「武器 ATK 上下擺」，等級越高的武器擺得越大；
   以前是不分來源一律 0.85~1.15 乘在總傷害上，跟武器等級無關。

   浮動中心照參考計算機取 `1 + 總STR/200`（2026-08-03 由使用者決定改回計算機版本）。
   這一項單獨就讓整體傷害再 +11%，性質上比較接近「額外的 STR 收益」而不是浮動，
   而且 STR 已經在素質 ATK 賺過一次——這是刻意跟計算機對齊的選擇，不是漏算。
   總 STR 含裝備／卡片／職業加成（`state._totalStr`，在 recomputeDerived 算好）。

   回傳「還沒套 buff／暴擊／卡片增傷／DEF」的基礎傷害。 */
function weaponChainDamage(monDef, elemMult, roll, sk) {
  const wId = getEquipBaseItemId('weapon');
  const w = wId ? ITEMS[wId] : null;

  /* 技能可以往「武器 ATK」那一桶追加東西（#58 螺旋擊刺的武器重量），
     加在這裡而不是外掛一份固定傷害，是因為官方是把重量算進 ATK——
     所以它會跟武器 ATK 一起吃屬性、體型與武器浮動。 */
  let wpn = state._atkWeapon || 0;
  if (sk && sk.weaponWeightMult && w) {
    const k = Array.isArray(sk.weaponWeightMult) ? sk.weaponWeightMult[0] : sk.weaponWeightMult;
    /* **`ITEMS[*].weight` 存的是官方 item_db 的原始值，那是顯示值的 10 倍**
       （短劍 40＝遊戲內 4.0、騎士長矛 250＝25.0、紅藥水 7＝0.7）。
       官方螺旋擊刺的公式用的是**顯示值**，所以這裡要先除以 10，
       資料那邊才寫得下官方原本的係數 0.8。直接乘原始值會強 10 倍。 */
    wpn += ((w.weight || 0) / 10) * k;
  }
  /* 迴旋盾擊（#66）：官方「傷害會根據盾牌的精煉值和重量而增加」。
     跟上面的武器重量走同一桶、同一個 /10 換算（ITEMS 的 weight 是顯示值的 10 倍）。
     精煉是每階固定值，不吃 /10。 */
  if (sk && (sk.shieldWeightMult || sk.shieldRefineMult)) {
    const shId = getEquipBaseItemId('shield');
    const sh = shId ? ITEMS[shId] : null;
    if (sh) {
      if (sk.shieldWeightMult) wpn += ((sh.weight || 0) / 10) * sk.shieldWeightMult;
      if (sk.shieldRefineMult) wpn += getRefinementLevel('shield') * sk.shieldRefineMult;
    }
  }
  /* 致命塗毒（#59）：官方寫的是「**裝備ATK** ×280~400%」，指的就是武器那一桶，
     不是總 ATK。本作 #12 之後 ATK 早就拆成三桶，所以這個倍率天生對得上 `wpn`。
     乘在這裡而不是跟 `buffMult('atk')` 一起，差別很大：素質 ATK 與熟練度不跟著漲，
     刺客想吃滿這個技能就得去堆武器——官方的意圖正是如此。 */
  wpn *= buffMult('weaponatk').mult;

  const nonWpn = (state._atkStatus || 0) + (state._atkMastery || 0);

  const wLv = w ? (typeof getRefineWeaponLv === 'function' ? getRefineWeaponLv(w) : (w.weaponLv || 1)) : 1;

  const mid = 1 + (state._totalStr || 0) / 200;
  const swing = wLv * 0.05;
  // roll：true=鎖最大值（武器值最大化 buff）、'mid'=取中間值（產出估算用，不要隨機）、其餘=正常浮動
  const variance = roll === true ? (mid + swing)
    : roll === 'mid' ? mid
    : (mid - swing + Math.random() * swing * 2);

  // 螺旋擊刺那類「無視體型修正」的技能（#58）：只拿掉懲罰，加成照留，跟卡片的 ignoreSizePenalty 同一條規則
  const sizeMult = (sk && sk.ignoreSize) ? Math.max(1, getSizeMultiplier(monDef)) : getSizeMultiplier(monDef);
  /* ATK 類 buff（凶砍、神威祈福、狂怒之槍）搬到這裡（#58）。

     以前只寫在 playerAttack() 裡，所以那幾個 buff **只加強普通攻擊、對技能完全沒作用**。
     官方那類 buff 加的是 ATK 本身，物理技能的傷害公式吃的也是 ATK，兩邊都該吃到。
     做狂怒之槍（ATK×2）時撞到——領主騎士的傷害大半來自技能，不修的話這個技能等於半殘。
     放在這條鏈的最後、跟 playerAtkMult() 同一層，所以普攻與技能自動一致。 */
  /* 高階拳刃修練（#59）：官方是「以拳刃攻擊時**物理傷害**+12~20%」——
     傷害%而不是 ATK 固定值，所以乘在整條鏈的最後，普攻與物理技能都吃得到。
     武器條件在 recomputeDerived 就判掉了（沒拿拳刃時 physDmgPct 是 0）。 */
  const physPct = 1 + (state.physDmgPct || 0) / 100;
  // 詛咒 −25% 與挑釁 ±N%，整包 ATK 都吃
  return (wpn * variance * sizeMult * elemMult + nonWpn) * playerAtkMult() * buffMult('atk').mult * physPct;
}

/* 技能傷害的基底，跟普通攻擊走同一條官方鏈。

   以前技能是 `state.atk × 技能倍率 × 屬性 × 體型`——等於整包 ATK（含素質 ATK 與熟練度）
   都被體型／屬性修正一起乘。#12 只改了普通攻擊，所以同一個角色身上跑著兩套規則：
   普攻的體型懲罰只吃武器 ATK，技能卻吃全部。素質 ATK 佔比越高的職業偏差越大。

   物理技能改成 weaponChainDamage()（體型／屬性／武器浮動只作用在武器 ATK），
   技能倍率乘在整條鏈之後——官方就是這個順序。
   魔法技能沒有武器浮動也不吃體型，維持 MATK × 屬性。

   呼叫端要注意：改用本函式之後就不可以再自己乘一次 elemMult 或 getSizeMultiplier()。 */
function skillBaseDamage(useMag, monDef, elemMult, sk) {
  /* 龍知識（#71）：官方把物理與魔法分成兩欄（ATK +4~20% / MATK +2~10%）。
     物理那半走 `cardRaceDmgBonus.dragon`（cardTargetDmgMult 本來就在讀），
     魔法那半沒有現成的桶，掛在這裡——這是全專案唯一一個「知道自己在算魔法、
     手上又有 monDef」的地方，放別處都得再開一條平行的管線。 */
  if (useMag) {
    const dragon = (state.dragonMatkPct && monDef && monDef.race === 'dragon') ? state.dragonMatkPct : 0;
    return state.matk * elemMult * (1 + dragon / 100);
  }
  return weaponChainDamage(monDef, elemMult, state.buffs.some(b => b.type === 'maxroll'), sk);
}

function showExtraHitFloat(dmg, isCrit) {
  if (typeof showDamageFloat === 'function') showDamageFloat('-' + dmg, isCrit ? 'crit' : 'normal');
  if (typeof triggerMonsterHit === 'function') triggerMonsterHit(!!isCrit);
}

/* 一次普攻打出第二段時的命中音（拳刃附加傷害、二刀連擊）。

   **延後 0.1~0.3 秒**再放：兩段是同一個 tick 結算的，聲音疊在一起聽起來
   只是「一下比較大聲」而且很吵，錯開才聽得出來是兩下（使用者 2026-08-15 反映）。
   延遲取隨機值，連續攻擊時才不會變成整齊的雙拍。
   換身中（隊友在打）不出聲，比照 playAttackAnim 的處理。 */
const EXTRA_HIT_SFX_MIN_MS = 100, EXTRA_HIT_SFX_MAX_MS = 300;
function playExtraHitSound(isCrit) {
  if (typeof playHitSound !== 'function') return;
  const acting = _allyActing;   // setTimeout 跑到時早就換回來了，音量要當下決定
  const delay = EXTRA_HIT_SFX_MIN_MS + Math.random() * (EXTRA_HIT_SFX_MAX_MS - EXTRA_HIT_SFX_MIN_MS);
  setTimeout(() => {
    const prev = _allyActing;
    _allyActing = acting;       // 借旗標讓 playSfx 走隊友的音量
    try { playHitSound(isCrit); } catch (e) { /* 音效失敗不影響戰鬥 */ }
    _allyActing = prev;
  }, delay);
}

/* 回傳「這一擊有沒有真的打出去」。隊友的立繪動畫要看這個——
   第一版在呼叫前就把 `_swingAt` 蓋上去，弓箭手沒箭時只是揮空氣，
   畫面上照樣播攻擊動作但戰鬥訊息一行都沒有（使用者 2026-08-15 回報的正是這個）。 */
function playerAttack() {
  // playerAttack 有十幾個 return 點，包一層才不用逐一改成 return true
  return playerAttackInner() !== false;
}
function playerAttackInner() {
  if (!state.monsters || state.monsters.length === 0) return false;
  // 弓沒箭就打不出去（先擋在最前面，音效動畫都不放）
  if (needsAmmo() && !consumeAmmo()) {
    if (!state._noAmmoWarned) {
      logMsg('🏹 沒有箭矢，無法用弓攻擊！請到裝備分頁裝上箭矢，或去商店購買。');
      state._noAmmoWarned = true;
    }
    return false;
  }
  state._noAmmoWarned = false;
  /* 紙妖卡片：每次攻擊 SP ±N（官方寫的是消耗 1，所以資料是負值）。
     算在**揮擊**上不是命中上——官方是攻擊動作就扣，被閃過照樣扣。
     SP 不足時只是扣不到 0 以下，不會擋住攻擊。 */
  if (state.cardSpOnAttack) {
    state.sp = Math.max(0, Math.min(state.maxSp, state.sp + state.cardSpOnAttack));
  }
  /* 攻擊動畫（音效分兩種：被閃過放揮空、打中放命中，各自在下面觸發）。
     **動畫換身中不播**——隊友也是走這支 playerAttack()，不擋的話隊友每揮一下
     都會讓玩家的立繪播一次攻擊動作。音效則照播，音量走 allySfxVolume()。 */
  if (!_allyActing && typeof playAttackAnim === 'function') playAttackAnim();
  const target = state.monsters[0]; // 攻擊第一隻怪物
  const monDef = MONSTERS[target.defId];
  // 官方RO規則：普通攻擊一律使用物理ATK（不看職業），只有主動施放的技能才會用MATK
  // 之前用 job.matkMod > job.atkMod 判斷，導致法師/巫師/服事/祭司的普通攻擊誤用MATK計算

  // Calculate effective crit rate with buff
  const critBuff = buffMult('crit');
  // 卡片對特定種族的 CRI 加點（玩具士兵對動物+7 那一類），只在打到該種族時才算
  let raceCrit = (monDef.race && state.cardRaceCrit && state.cardRaceCrit[monDef.race]) || 0;
  // 茅膏菜卡片：遠程攻擊時 CRI+15，本作以裝弓為準
  if (state.cardRangedCritRate && isBowWeapon(getEquipBaseItemId('weapon'))) raceCrit += state.cardRangedCritRate;
  const effectiveCritRate = Math.min(100, state.critRate * critBuff.mult + critBuff.flatBonus + raceCrit);
  const isCrit = Math.random() * 100 < effectiveCritRate;
  if (!isCrit) {
    const hitPct = hitChancePctVsMonster(effectiveHitWithBuff(), monDef, target);
    if (Math.random() * 100 > hitPct) {
      logMsg(`你的攻擊被 ${monDef.name} 閃避了！`);
      // 揮空音效
      if (typeof playAttackSound === 'function') playAttackSound();
      // 攻擊 MISS 飄字（玩家頭上）
      if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
      return;
    }
  }

  /* ---- 官方傷害鏈（C 案）----
     以前是「總 ATK 一路乘上體型、屬性、浮動」，但官方那三個修正**只作用在武器 ATK**上，
     素質 ATK 與熟練度加成是在那之後才加進去的。差別在素質 ATK 約佔總 ATK 四成，
     舊寫法等於讓那四成也一起吃體型懲罰與屬性被剋的懲罰。 */
  const atkWeaponId = getEquipBaseItemId('weapon');
  const weapon = atkWeaponId ? ITEMS[atkWeaponId] : null;

  // 屬性相剋：武器屬性 vs 怪物屬性（弓由箭矢決定）
  let atkElement = (weapon && weapon.element) ? weapon.element : 'none';
  if (isBowWeapon(atkWeaponId)) {
    const ammo = getEquippedAmmo();
    if (ammo && ammo.element) atkElement = ammo.element;
  }
  if (state.buffs.some(b => b.type === 'holyweapon')) atkElement = 'holy';
  /* 賢者的屬性附加與肯貝特武器附魔（#71）：兩者推的是同一種 buff，
     所以這裡一條就夠。放在聖屬武器之後——後上的屬性覆蓋先上的。 */
  const eleWeapon = state.buffs.find(b => b.type === 'eleweapon' && b.element);
  if (eleWeapon) atkElement = eleWeapon.element;
  const elemMult = getElementMultiplierVsMonster(atkElement, monDef, target);
  if (elemMult !== 1) {
    const pctStr = Math.round(elemMult * 100);
    const tag = elemMult > 1 ? '💚 屬性克制！' : (elemMult < 1 && elemMult > 0 ? '💜 屬性被克…' : (elemMult === 0 ? '🚫 屬性免疫！' : ''));
    if (tag) logMsg(`${tag} ${ELEMENT_NAMES[atkElement]}攻 → ${ELEMENT_NAMES[monDef.element || 'none']}防 (${pctStr}%)`);
    if (typeof showElementFloat === 'function') showElementFloat(target.id, atkElement, elemMult);
  }

  const hasMaxRoll = state.buffs.some(b => b.type === 'maxroll');
  // ATK 類 buff 已經在 weaponChainDamage() 裡套過了（#58），這裡不能再乘一次
  let raw = weaponChainDamage(monDef, elemMult, hasMaxRoll);

  // 狂暴狀態：HP < 25% 時 ATK +32%
  if (state.hasBerserk && state.hp < state.maxHp * 0.25) {
    raw *= 1.32;
  }
  // 暴擊 1.5 倍，卡片的「暴擊時傷害增加N%」再乘上去（紙妖、無顱武士那類）
  if (isCrit) raw *= 1.5 * (1 + (state.cardCritDmgPct || 0) / 100);
  // 遠距離物理傷害加成：官方限定遠程武器，本作以弓為準（邪骸弓箭手卡片）
  if (state.cardRangedDmgPct && isBowWeapon(atkWeaponId)) {
    raw *= 1 + state.cardRangedDmgPct / 100;
  }

  // 天使之怒被動：冷卻好時下一次攻擊必定雙倍傷害
  if (state.hasAngelusProc && Date.now() >= (state.angelusReadyAt || 0)) {
    raw *= 2;
    state.angelusReadyAt = Date.now() + (state.angelusCooldownSec || 10) * 1000;
    logMsg('😠 天使之怒發動！本次傷害雙倍！', 'skill');   // 被動 → 技能欄（#100）
  }

  // 卡片增傷：對特定屬性/種族/體型的怪物額外增傷
  raw *= cardTargetDmgMult(monDef);
  // 屬性別的傷害 buff（致命塗毒的毒傷害 ×2）
  raw *= elementDmgMult(atkElement);
  // 異常狀態：睡眠中的目標受到的傷害增加（官方規則）
  raw *= ailDmgTakenMult(target);

  // Apply monster debuff (provoke reduces defense)
  // 異常狀態對防禦的修正（石化 +25%、中毒 −25%）跟破防 debuff 疊乘
  const ailDef = ailDefMult(target);
  /* 破防類減益（挑釁的 debuffDef、流氓的卸除盾牌／鎧甲）走 monDebuffDef()，
     跟技能那條路（defOf）共用同一支，兩邊看到的防禦值才會一致。 */
  const dcut = monDebuffDef(target);
  /* 無視物防（#136）。**普攻這條路以前完全沒吃到**：`physDefIgnorePct()` 只長在
     `defOf()` 裡，而 defOf 只有技能傷害在走，普攻是在這裡自己算防禦值的。
     結果是 #127 接上的那一整批「無視○○系防禦力」的武器、以及達納托斯卡片的
     「無視所有種族的防禦力」，對**普通攻擊一點作用都沒有**——而那批東西的
     定位全都是普攻流。實測達納托斯卡片對 DEF 314 的怪只有 1.07 倍，補上之後才對得起說明。 */
  const dig = Math.max(0, 1 - physDefIgnorePct(monDef) / 100);
  let monDefVal = Math.round(monDef.def * ailDef * dcut * dig);
  let monSoftVal = Math.round((monDef.defSoft || 0) * ailDef * dcut * dig);

  // 官方暴擊無視 DEF（也無視閃避）。以前暴擊照常吃減傷，等於只剩 1.5 倍那半邊效果，
  // 對高 DEF 的怪打起來跟普通攻擊差不了多少
  let dmg = (isCrit ? Math.max(1, Math.round(raw)) : mitigateDamage(raw, monDefVal, monSoftVal)) + raceFlatBonus(monDef);
  /* 刺客遺物 5 件（#113）：乘在**減傷之後**的最終傷害上。
     乘在 raw 上的話 10 倍會先被怪物防禦吃掉一大半，跟「10 倍傷害」這句話對不起來。
     放在 dpsTracker 前面，紀錄才是玩家實際打出去的數字。 */
  const relicMult = rollRelicDamageMult();
  if (relicMult > 1) {
    dmg = Math.round(dmg * relicMult);
    /* 2 倍那段有 10% 機率，等於每秒都會刷一行——技能欄還要放六合拳、阿修羅那些，
       會被洗掉。只報稀有的那兩段（5 倍以上），2 倍安靜生效。 */
    if (relicMult >= 5) logMsg(`🗡️ 遺物發動！本次傷害 ${relicMult} 倍！`, 'skill');
  }
  if (isCrit && !_dpsPaused && state && state.dpsTracker) state.dpsTracker.damage += dmg;

  /* 怪物身上的增益（#36）：自動防禦擋下整下、防禦型增益減傷、反射盾把傷害彈回來。
     只有近距離攻擊會被反射（官方 CR_REFLECTSHIELD 就是這樣）。 */
  const absorb = monsterAbsorb(target, dmg, !isBowWeapon(atkWeaponId));
  if (absorb.blocked) {
    logMsg(`🛡️ ${monDef.name} 擋下了你的攻擊！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('GUARD', 'miss');
    return;
  }
  dmg = absorb.dmg;
  target.hp -= dmg;
  logMsg(`你對 ${monDef.name} 造成 ${dmg} 點傷害${isCrit ? '（暴擊！無視閃避與防禦）' : ''}`);
  if (absorb.reflect > 0) takeReflectDamage(monDef, absorb.reflect);
  applyCardLeech(dmg);
  ailBreakOnDamage(target, monDef);   // 睡眠被打就醒
  /* 被動觸發的那一整排（#100）：訊息一律進**技能欄**（中間那格）。
     使用者指定「被動技能造成傷害顯示在中間視窗，左邊剔除」——左邊留給普攻本身
     與怪物的攻擊，被動的追擊、連段、偷錢、卸除全部搬到中間。
     被動打死怪時的擊殺與經驗訊息也跟著進技能欄，跟主動技能打死怪的行為一致
     （`castSkill()` 本來就整支包在 skill 欄裡）。 */
  withLogLane('skill', () => {
    tryCardAilments('attack', target);
    tryAutoSpells('attack', target);
    tryAttackBuffs('attack', target);
    tryOnAttackStrikes(target, monDef);  // 傷害增壓／巧打（#58）
    tryEdpProc(target);                  // 致命塗毒（#59）：目標中毒時才觸發
    tryMeltdown(target, monDef);         // 野蠻凶砍（#60）：削弱目標的攻防
    tryPriestProcs(target, monDef);      // 祭司（#95）：沉默之術
    tryPhysAoeStrikes(monDef);           // 黑暗瞬間（#59）：物理範圍追擊
    tryMagicCrasher(target, monDef);     // 魔擊術（#63）：MATK 傷害走物理防禦
    tryGanbantein();                     // 咖般塔音（#63）：帶著兩種礦石時全場暈眩
    trySongProcs(target, monDef);        // 詩人／舞孃（#68）：冷笑話、驚聲尖叫、不諧和音…
    tryRogueProcs(target, monDef);       // 流氓（#69）：偷錢、卸除四連、潛擊、脅持、緊密的約束
    tryMonkProcs(target, monDef);        // 武僧（#70）：吸氣、真劍百破道、浸透勁、彈指神通、發勁
    tryMonkCombo(target, monDef);        // 武僧（#70）：六合拳 → 連環全身掌 → 猛龍誇強 → 阿修羅霸凰拳
    trySageProcs(target, monDef);        // 賢者（#71）：自動念咒、念咒拆除、魔法效果解除、隨機技能、元素更換
    tryPaladinProcs(target, monDef);     // 聖殿十字軍（#74）：捨命攻擊的自傷追擊
    tryProfessorProcs(target, monDef);   // 智者（#76）：薄霧牆、心神互換、精神耗弱術、精神撼動
    tryTarotCard(target, monDef);        // 搞笑藝人／冷豔舞姬（#77）：命運的塔羅牌
    tryChampionProcs(target, monDef);    // 武術宗師（#79）：狂蓄氣、猛虎硬派山 → 伏虎拳 → 氣絕崩擊
  });
  /* 遺物的普攻效果（#113）。放在被動那一排之後、擊殺判定之前：
     濺射要能打死其他怪，而主目標的擊殺結算仍然由下面那段負責。 */
  tryRelicBlindProc();
  tryCardSplashProc(dmg, target);      // 巴風特卡片（#136）：普攻打全場
  tryRelicSplashProc(dmg, target);
  tryRelicAspdProc();
  tryRelicMonkGatling(target, monDef);
  tryRelicBlacksmithStrike(target);
  // 命中音效（暴擊改放 Critical.ogg）。隊友也會出聲，音量走 allySfxVolume()
  if (typeof playHitSound === 'function') playHitSound(isCrit);

  if (target.hp <= 0) {
    killMonster(monDef, target);
    return;
  }

  // 拳刃：普攻命中後附加一段傷害（本作 21%），獨立跳字、獨立放命中音效。
  // 暴擊與否跟著主攻擊那一次判定走（官方一次普攻只擲一次暴擊），
  // 所以 raw 裡已經含 ×1.5，這裡只要讓飄字與音效也用暴擊那一套。
  if (state._katarEquipped) {
    const katarDmg = mitigateDamage(raw * (KATAR_BONUS_DMG_PCT / 100), monDefVal, monSoftVal);
    target.hp -= katarDmg;
    logMsg(`🗡️ 拳刃附加了 ${katarDmg} 點傷害！${isCrit ? '（暴擊）' : ''}`);
    showExtraHitFloat(katarDmg, isCrit);
    playExtraHitSound(isCrit);
    if (target.hp <= 0) {
      killMonster(monDef, target);
      return;
    }
  }

  // 怒爆之火：普攻期間額外附加一段火屬性傷害
  const magnumBuff = state.buffs.find(b => b.type === 'magnumfire');
  if (magnumBuff) {
    const fireMult = getElementMultiplierVsMonster('fire', monDef, target);
    const bonusDmg = mitigateDamage(skillBaseDamage(false, monDef, fireMult) * magnumBuff.flatBonus, monDefVal, monSoftVal);
    target.hp -= bonusDmg;
    logMsg(`🔥 怒爆之火附加了 ${bonusDmg} 點火屬性傷害！`);
    // 這段是獨立的火屬性傷害，不吃主攻擊的暴擊
    showExtraHitFloat(bonusDmg, false);
    if (target.hp <= 0) {
      killMonster(monDef, target);
      return;
    }
  }

  /* 二刀連擊：技能版官方限定短劍才會觸發（拿拳刃／劍都不會動）。
     黑蛇卡片給的那份不受武器限制——那張卡本來就是給拿不了短劍的職業用的，
     而且卡片說明寫「習得二刀連擊後依技能等級決定機率」，所以兩者取等級高的那個。 */
  const daSkillLv = state.learnedSkills['doubleattack'] || 0;
  const daFromCard = !!state.hasSideWinderDoubleAttack;
  const daByWeapon = daSkillLv > 0 && isDaggerWeapon(atkWeaponId);
  const daLv = Math.max(daSkillLv, daFromCard ? 1 : 0);
  if (daLv > 0 && (daFromCard || daByWeapon)) {
    // 只靠卡片觸發時玩家可能根本不是盜賊系，findSkillById() 查不到，要直接翻技能表
    const daSkill = findSkillById('doubleattack') || JOB_TREE.thief.skills.find(s => s.id === 'doubleattack');
    const daChance = daSkill && daSkill.doubleAttackChance ? daSkill.doubleAttackChance[daLv - 1] : 7;
    if (Math.random() * 100 < daChance) {
      const daMult = daSkill && daSkill.mult ? daSkill.mult[daLv - 1] : 1.0;
      const daRaw = raw * daMult;
      const daDmg = mitigateDamage(daRaw, monDefVal, monSoftVal);
      target.hp -= daDmg;
      // 第二段跟第一段是同一次暴擊判定（daRaw 由 raw 推導，已含 ×1.5）
      logMsg(`⚔️ 二刀連擊！對 ${monDef.name} 造成 ${daDmg} 點傷害！${isCrit ? '（暴擊）' : ''}`);
      showExtraHitFloat(daDmg, isCrit);
      playExtraHitSound(isCrit);
      if (target.hp <= 0) {
        killMonster(monDef, target);
      }
    }
  }

  // 噴砂被動：攻擊時機率使敵人命中下降
  if (state.hasSandmanProc && state.monsters.includes(target) && Math.random() * 100 < state.sandmanProcChance) {
    target.debuffHit = state.sandmanHitDebuff;
    target.debuffHitEnd = Date.now() + state.sandmanDebuffDuration * 1000;
    logMsg(`💨 噴砂發動！${monDef.name} 的命中下降了！`);
  }

  // 大地之擊被動：裝備斧頭或鈍器攻擊時機率使敵人暈眩
  if (state.hasHammerfallProc && state.monsters.includes(target)) {
    // 原本靠 weaponType==='mace' 或名字有「斧」來認，會漏掉分類正確但名字沒斧字的武器；
    // 現在統一走 weaponCat 的分類表
    if (weaponReqMet('axemace')) {
      if (Math.random() * 100 < state.hammerfallSingleChance) {
        applyStun(target, state.hammerfallStunSec, true);
        logMsg(`💥 大地之擊發動！${monDef.name} 暈眩了！`);
      }
      if (Math.random() * 100 < state.hammerfallAoeChance) {
        state.monsters.forEach(m => applyStun(m, state.hammerfallStunSec, true));
        logMsg(`💥 大地之擊（全體）發動！所有敵人都暈眩了！`);
      }
    }
  }

  // 火柱攻擊被動：普攻時機率觸發範圍魔法傷害
  tryOnAttackAoeProc();

  // 塗毒：武器沾毒生效中，攻擊時機率使敵人中毒
  const ewLv = state.learnedSkills['enchantweapon'] || 0;
  if (ewLv > 0 && state.monsters.includes(target) && state.buffs.some(b => b.skillId === 'enchantweapon')) {
    const ewSkill = findSkillById('enchantweapon');
    const ewChance = ewSkill.procChance != null ? ewSkill.procChance : 20;
    if (Math.random() * 100 < ewChance) {
      const ewDmgPct = ewSkill.mult[ewLv - 1];
      applyPoisonDot(target, monDef, state.atk * ewDmgPct);
      logMsg(`☠️ 塗毒發動！${monDef.name} 中毒了！`);
    }
  }

  // 病毒散播被動：攻擊已中毒的敵人時，讓場上所有敵人一起中毒（10秒冷卻）
  if (state.hasVenomdustProc && target.poisonDotEnd && Date.now() >= (state.venomdustReadyAt || 0)) {
    state.venomdustReadyAt = Date.now() + state.venomdustCooldownSec * 1000;
    logMsg(`🦠 病毒散播發動！全場敵人陷入中毒！`);
    state.monsters.forEach(mon => {
      const mDef = MONSTERS[mon.defId];
      applyPoisonDot(mon, mDef, state.atk * state.venomdustDmgPct);
    });
  }

  // 毒性感染被動：攻擊已中毒的敵人時機率引爆全體（10秒冷卻）
  if (state.hasVenominfusionProc && target.poisonDotEnd && Date.now() >= (state.venominfusionReadyAt || 0) && Math.random() * 100 < state.venominfusionProcChance) {
    state.venominfusionReadyAt = Date.now() + state.venominfusionCooldownSec * 1000;
    logMsg(`💥 毒性感染引爆！`);
    for (let i = state.monsters.length - 1; i >= 0; i--) {
      const mon = state.monsters[i];
      const mDef = MONSTERS[mon.defId];
      const elemMult = getElementMultiplierVsMonster('poison', mDef, mon) * elementDmgMult('poison');
      const dmg = mitigateDamage(skillBaseDamage(false, mDef, elemMult) * state.venominfusionDmgMult, ...defOf(mDef));
      mon.hp -= dmg;
      logMsg(`  → 對 ${mDef.name} 造成 ${dmg} 點傷害！`);
      if (mon.hp <= 0) killMonster(mDef, mon);
    }
  }

  // 獵人陷阱被動：攻擊時各陷阱獨立判定觸發
  if (state.monsters.includes(target)) {
    tryTrapProcs(target, monDef);
  }

  // 閃電衝擊被動：普攻時依LUK機率額外觸發一次獵鷹單體攻擊
  const bbLv = state.learnedSkills['blitzbeat'] || 0;
  if (bbLv > 0 && state.monsters.includes(target)) {
    const luk = state.stats.luk || 1;
    const bbChance = Math.min(30, 5 + (luk - 1) * 25 / 119);
    if (Math.random() * 100 < bbChance) {
      const bbSkill = findSkillById('blitzbeat');
      const passiveMultVal = bbSkill.passiveMult[bbLv - 1];
      const bbElemMult = getElementMultiplierVsMonster(bbSkill.element || 'none', monDef, target);
      let bbDmg = mitigateDamage(skillBaseDamage(false, monDef, bbElemMult) * passiveMultVal, ...defOf(monDef));
      if (state.falconFlatBonus) bbDmg += state.falconFlatBonus;
      target.hp -= bbDmg;
      logMsg(`🦅 獵鷹突襲！對 ${monDef.name} 造成 ${bbDmg} 點傷害！`);
      if (target.hp <= 0) killMonster(monDef, target);
    }
  }
}

/* 怪物施放技能。取代那一次普通攻擊，走跟普攻同一條減傷鏈，
   差別在：帶技能倍率、可能帶屬性、可能對玩家掛異常狀態。

   本作的怪物沒有 MATK 資料，魔法類就用 ATK × 倍率 再多給 20%，
   並且**跳過迴避判定**（官方魔法無視閃避）。 */
function monsterCastSkill(mon, monDef, sk) {
  return withLogLane('skill', () => monsterCastSkillInner(mon, monDef, sk));
}
function monsterCastSkillInner(mon, monDef, sk) {
  const nameOf = () => `${monDef.name} 的「${MOB_SKILL_NAMES[sk.s] || sk.s}」`;

  /* 自我增益（#36）：不打人，替自己掛一個 buff。
     `buff` 是 { 鍵: 值 } 的表，`dur` 是持續秒數（工具那邊給預設）。 */
  if (sk.buff) {
    let any = false;
    for (const [k, v] of Object.entries(sk.buff)) {
      if (!MON_BUFF_KEYS.includes(k)) continue;
      monBuffAdd(mon, k, v, sk.dur || 30);
      any = true;
    }
    if (any) logMsg(`✨ ${nameOf()} 發動了！`);
    return;
  }

  /* 對玩家的臨時減益（#36）：挑釁、緩緩移動、永恆之光。
     不打人也不擲命中——官方這幾個是必中的狀態技能。 */
  if (sk.debuff) {
    const bits = [];
    for (const [k, v] of Object.entries(sk.debuff)) {
      if (!PLAYER_DEBUFF_KEYS.includes(k)) continue;
      pDebuffAdd(k, v, sk.dur || 20, !!sk.once);
      bits.push(`${PLAYER_DEBUFF_META[k].name} ${v > 0 ? '+' : ''}${v}${k === 'fleeFlat' ? '' : '%'}`);
    }
    if (bits.length) logMsg(`🔻 ${nameOf()}：${bits.join('、')}${sk.once ? '（只作用於下一擊）' : `（${sk.dur || 20}秒）`}`);
    return;
  }

  /* 解除增益（SA_DISPELL）：把玩家身上的 buff 清掉。
     護盾與異常狀態不動——前者是另一套資源、後者是負面效果，清掉等於幫玩家。 */
  if (sk.dispell) {
    const n = (state.buffs || []).length;
    if (n > 0) {
      state.buffs = [];
      recomputeDerived(false);
      logMsg(`🌀 ${nameOf()}：你身上的 ${n} 個增益被解除了！`);
    }
    return;
  }

  /* 回復類：不打人。官方 AL_HEAL 是**固定量**（看施法者的等級與 INT），
     不是最大HP的比例——寫成比例的話血越厚的怪補得越誇張。 */
  if (sk.heal) {
    const tgt = sk.healFriend ? lowestHpAlly(mon) : mon;
    if (!tgt) return;
    const tgtDef = MONSTERS[tgt.defId] || monDef;
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + monsterHealAmount(monDef, sk.lv));
    if (tgt.hp > before) {
      const who = sk.healFriend ? `${nameOf()} 替 ${tgtDef.name}` : nameOf();
      logMsg(`💚 ${who}：回復了 ${tgt.hp - before} 點HP！`);
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(tgt.id, '+' + (tgt.hp - before), 'heal');
    }
    return;
  }

  /* 黃金蟲卡片（使用者 2026-08-22 指定）：怪物技能**完全免疫傷害**，
     但隊友的增益/狀態技能也一併擋掉（官方「避免被施任何魔法包括治癒術」的近似）。
     放在命中判定之前——免疫是連打都不打的。 */
  if (state.cardMonSkillImmune) {
    logMsg(`🪲 黃金蟲卡片免疫了 ${nameOf()}！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('免疫', 'miss');
    return;
  }

  // 命中判定：魔法無視閃避，物理照常擲
  if (!sk.magic) {
    if (Math.random() * 100 < state.perfectDodge) {
      logMsg(`你完全迴避了 ${nameOf()}！`);
      if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
      return;
    }
    // 自動防禦（#22）：物理技能也擋，魔法不擋（官方自動防禦只擋物理）
    const blockedBy = playerBlocked('skill');
    if (blockedBy) {
      logMsg(`🛡️ 你擋下了 ${nameOf()}！`);
      if (typeof showPlayerFloat === 'function') showPlayerFloat('GUARD', 'miss');
      tryShrinkStun(mon, monDef, blockedBy);
      return;
    }
    // 光之盾（#66）：機率完全免除這一擊，跟自動防禦是各自獨立的兩道判定
    if (defenderNegates()) {
      logMsg(`🛡️ 光之盾完全擋下了 ${nameOf()}！`);
      if (typeof showPlayerFloat === 'function') showPlayerFloat('免傷', 'miss');
      return;
    }
    let hitDebuff = 0;
    const blindMult = ailHitMult(mon);
    // 同理：黑暗打折的是怪物的 HIT，fleeReq = 怪物HIT + 75，先剝掉偏移再折
  if (blindMult < 1) hitDebuff += Math.round(((monDef.fleeReq || monsterHitOf(monDef)) - REQ_FLEE_OFFSET) * (1 - blindMult));
    // 冰凍／睡眠中的玩家必定被打中
    if (!playerAlwaysHit()) {
      let dodgePct = dodgeChancePctFromMonster(effectiveFleeWithBuff(), monDef, hitDebuff);
      dodgePct = Math.max(0, dodgePct + playerAilPct('fleePct'));   // 黑暗讓玩家更難閃
      if (Math.random() * 100 < dodgePct) {
        logMsg(`你迴避了 ${nameOf()}！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
        return;
      }
    }
  }

  let dmg = 0;
  if (sk.mult > 0) {
    const el = sk.elem || monDef.element || 'none';
    /* 魔法反射（#17，蟻后卡片）：官方是把法術原樣彈回施法者，**玩家完全不受傷**。
       擲在傷害計算之前——反射掉的法術根本沒打到玩家，不該扣血也不該打斷睡眠。
       只擋魔法，物理走下面的 applyPlayerReflect（那個是「照比例彈一部分」，兩回事）。 */
    if (sk.magic && state.cardMagicReflectChance > 0
        && Math.random() * 100 < state.cardMagicReflectChance) {
      const back = Math.max(1, Math.round(monsterBaseAtk(monDef, undefined, mon) * sk.mult * 1.2
        * getElementMultiplierVsMonster(el, monDef, mon)));
      mon.hp -= back;
      if (!_dpsPaused && state && state.dpsTracker) state.dpsTracker.damage += back;
      logMsg(`🪞 魔法反射！${nameOf()} 被自己的法術打了 ${back} 點傷害。`);
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + back, 'normal');
      if (mon.hp <= 0) killMonster(monDef, mon);
      return;
    }
    let raw = monsterBaseAtk(monDef, undefined, mon) * sk.mult * (sk.magic ? 1.2 : 1);
    if (sk.magic) raw *= stripMult(mon, 'matk');   // 卸除頭盔（#69）
    raw *= ailAtkMult(mon);                                   // 詛咒讓怪物 ATK 下降
    // 防守側的屬性是玩家的鎧甲屬性（#17）。沒有鎧甲屬性卡時就是 none，行為跟以前一樣
    raw *= getElementMultiplier(el, state.playerElement || 'none');
    // 卡片的屬性/種族/體型減傷跟普攻共用同一組
    if (state.cardEleDmgReduce && state.cardEleDmgReduce[el]) raw *= (1 - state.cardEleDmgReduce[el]);
    if (monDef.race && state.cardRaceDmgReduce && state.cardRaceDmgReduce[monDef.race]) raw *= (1 - state.cardRaceDmgReduce[monDef.race]);
    raw *= cardFamilyDmgTakenMult(monDef);   // 妖道：從殭屍受到的傷害 +100%
    raw *= cardRaceDmgTakenMult(monDef);     // 天龍防具：受到龍族怪的傷害 -2%
    /* 魔法看魔防、物理看物防（#17）。**挑釁的 DEF 下降與狂暴的 DEF −55% 都只作用在物防**——
       官方那兩個削的就是 DEF 不是 MDEF，套到魔法上等於憑空多一份減傷／多一份懲罰。 */
    let hardDef, softDef;
    if (sk.magic) {
      /* 不夾 0：硬魔防為負是有意義的（見 mitigatePlayerIncoming 的註解）。
         霸體那類 buff 官方寫的是「DEF 與 MDEF 一起提升」，所以魔防這邊也吃同一個倍率。 */
      const mBuff = buffMult('def').mult;
      hardDef = state.mdefHard * mBuff; softDef = state.mdefSoft * mBuff;
    } else {
      [hardDef, softDef] = debuffedDef(state.defHard, state.defSoft);   // 挑釁：DEF 下降
      // 狂暴狀態：DEF -55%（硬軟一起打折）
      if (state.hasBerserk && state.hp < state.maxHp * 0.25) {
        hardDef = Math.round(hardDef * 0.45); softDef = Math.round(softDef * 0.45);
      }
    }
    // 睡眠 ×1.5 與永恆之光 ×2：官方是**最後**的傷害倍率，要在防禦之後乘。
    // 乘在防禦之前的話，軟防那一段是固定減值，會讓實際倍率大於寫出來的數字
    dmg = Math.max(1, Math.round(mitigatePlayerIncoming(raw, hardDef, softDef) * playerDmgTakenMult()));
    dmg = rejectSwordAbsorb(dmg, mon, monDef);  // 霸王魂（#79）
    /* 遺物免傷（#113）也要擋技能。只擋普攻的話，會放技能的怪身上
       「20% 免疫」等於不存在——而高等圖幾乎每隻怪都會放技能。 */
    {
      const by = relicNegatesHit();
      if (by) {
        logMsg(`${by}！完全免疫了 ${nameOf()}！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('免傷', 'miss');
        if (typeof showBuddhaShield === 'function' && by.indexOf('佛法') >= 0) showBuddhaShield();
        return;
      }
    }
    state.hp -= dmg;
    logMsg(`✨ ${nameOf()} 造成了 ${dmg} 點傷害！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('-' + dmg, 'normal');
    playerAilBreakOnDamage();
    pDebuffConsumeOnce('dmgTakenPct');
    // 吸血（NPC_BLOODDRAIN）：造成多少傷害就補自己多少
    if (sk.drainHp) {
      const before = mon.hp;
      mon.hp = Math.min(mon.maxHp, mon.hp + dmg);
      if (mon.hp > before) {
        logMsg(`🩸 ${monDef.name} 吸走了 ${mon.hp - before} 點HP！`);
        if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '+' + (mon.hp - before), 'heal');
      }
    }
    // 卡片反射（#17）：技能傷害也算，只要不是魔法
    if (!sk.magic) applyPlayerReflect(mon, monDef, dmg);
  } else {
    logMsg(`✨ ${nameOf()} 發動了！`);
  }

  /* 吸魔（NPC_ENERGYDRAIN）：抽玩家的 SP。官方是抽固定量，這裡按技能等級給。
     不吃防禦——SP 沒有防禦的概念。 */
  if (sk.drainSp) {
    const amt = Math.min(state.sp, 10 * (sk.lv || 1));
    if (amt > 0) {
      state.sp -= amt;
      logMsg(`💧 ${nameOf()}：你被抽走了 ${amt} 點SP！`);
    }
  }

  // 附加的異常狀態
  if (sk.ail) applyPlayerAilment(sk.ail);

  // 自爆：打完自己也死
  if (sk.suicide) {
    logMsg(`💥 ${monDef.name} 自爆了！`);
    mon.hp = 0;
    killMonster(monDef, mon);
  }

  if (state.hp <= 0) {
    state.hp = 0;
    if (tryAutoRevive()) return;
    onPlayerDown();
  }
}

// 官方技能代碼 → 看得懂的名字（只列會用到的，沒列到的直接顯示代碼）
const MOB_SKILL_NAMES = {
  // ---- #36 補的那批 ----
  KN_SPEARSTAB: '長矛突刺', CR_SHIELDCHARGE: '盾牌衝擊', CR_HOLYCROSS: '聖十字架',
  BS_HAMMERFALL: '重擊', AC_CHARGEARROW: '衝鋒箭', SN_SHARPSHOOTING: '銳利射擊',
  AM_DEMONSTRATION: '火焰噴射', NPC_RANDOMATTACK: '亂擊', NPC_DARKTHUNDER: '暗雷',
  NPC_EVILLAND: '邪惡之地', NPC_BLEEDING: '流血攻擊', NPC_SUICIDE: '自殺',
  WZ_SIGHTRASHER: '暴裂波', WZ_FROSTNOVA: '霜狼之息', MG_FIREWALL: '火焰之壁',
  TF_SPRINKLESAND: '噴砂', AS_VENOMDUST: '毒粉', PF_SPIDERWEB: '蜘蛛網',
  WZ_QUAGMIRE: '沼澤之地',
  NPC_BLOODDRAIN: '吸血', NPC_VAMPIRE_GIFT: '吸血鬼之禮', NPC_ENERGYDRAIN: '吸魔',
  NPC_MENTALBREAKER: '精神崩潰', SA_DISPELL: '魔法效果解除',
  NPC_POWERUP: '力量提升', NPC_AGIUP: '敏捷提升', AL_INCAGI: '加速術',
  BS_ADRENALINE: '腎上腺素', KN_TWOHANDQUICKEN: '雙手劍熟練', BS_MAXIMIZE: '武器完全瞄準',
  CR_AUTOGUARD: '自動防禦', NPC_KEEPING: '守護', MG_SAFETYWALL: '屏障',
  AL_PNEUMA: '神聖之光', NPC_DEFENDER: '防禦者', NPC_BARRIER: '結界',
  CR_REFLECTSHIELD: '反射盾', KN_AUTOCOUNTER: '反擊',
  // ---- 對玩家的臨時減益 ----
  SM_PROVOKE: '挑釁', AL_DECAGI: '緩緩移動', PR_LEXAETERNA: '永恆之光',
  NPC_STUNATTACK: '暈眩攻擊', NPC_CURSEATTACK: '詛咒攻擊', NPC_BLINDATTACK: '黑暗攻擊',
  NPC_SILENCEATTACK: '沉默攻擊', NPC_SLEEPATTACK: '催眠攻擊', NPC_PETRIFYATTACK: '石化攻擊',
  NPC_HALLUCINATION: '幻覺', NPC_CRITICALWOUND: '致命傷', NPC_POISON: '施毒', NPC_POISONATTACK: '毒屬性攻擊',
  TF_POISON: '施毒', NPC_WIDECURSE: '範圍詛咒', NPC_WIDESILENCE: '範圍沉默', NPC_WIDESTUN: '範圍暈眩',
  NPC_WIDESLEEP: '範圍催眠', NPC_WIDECONFUSE: '範圍混亂', NPC_WIDEBLEEDING: '範圍出血',
  MG_FROSTDIVER: '冰凍術', MG_STONECURSE: '石化術', PR_LEXDIVINA: '神聖懲罰',
  NPC_FIREATTACK: '火屬性攻擊', NPC_WATERATTACK: '水屬性攻擊', NPC_WINDATTACK: '風屬性攻擊',
  NPC_GROUNDATTACK: '地屬性攻擊', NPC_DARKNESSATTACK: '暗屬性攻擊', NPC_UNDEADATTACK: '不死屬性攻擊',
  NPC_HOLYATTACK: '聖屬性攻擊', NPC_TELEKINESISATTACK: '念屬性攻擊',
  MG_FIREBOLT: '火箭術', MG_FIREBALL: '火球術', MG_COLDBOLT: '冰箭術', MG_LIGHTNINGBOLT: '雷電術',
  MG_THUNDERSTORM: '雷爆術', MG_SOULSTRIKE: '聖靈召喚', MG_NAPALMBEAT: '心靈爆破',
  WZ_METEOR: '隕石術', WZ_FIREPILLAR: '火柱攻擊', WZ_WATERBALL: '水球術', WZ_JUPITEL: '朱庇特之雷',
  WZ_HEAVENDRIVE: '大地之怒', WZ_EARTHSPIKE: '地面尖刺', WZ_STORMGUST: '暴風雪',
  NPC_MAGICALATTACK: '魔法攻擊', NPC_DARKSTRIKE: '暗之攻擊', NPC_DARKBREATH: '暗之吐息',
  NPC_CRITICALSLASH: '致命一擊', NPC_COMBOATTACK: '連續攻擊', NPC_SPLASHATTACK: '範圍攻擊',
  NPC_PIERCINGATT: '貫穿攻擊', NPC_GUIDEDATTACK: '必中攻擊', NPC_RANGEATTACK: '遠距攻擊',
  NPC_PULSESTRIKE: '波動衝擊', NPC_SELFDESTRUCTION: '自爆',
  SM_BASH: '狂擊', SM_MAGNUM: '怒爆之火', AS_SONICBLOW: '音速投擲', KN_PIERCE: '刺穿',
  KN_BOWLINGBASH: '弓箭陣', KN_BRANDISHSPEAR: '騎乘攻擊', MO_EXTREMITYFIST: '阿修羅霸凰拳',
  LK_SPIRALPIERCE: '螺旋刺擊', AC_DOUBLE: '二連矢', AC_SHOWER: '箭雨', MC_MAMMONITE: '金錢攻擊',
  ASC_METEORASSAULT: '流星墜擊', NPC_WIDESOULDRAIN: '吸魂', NPC_FIREBREATH: '火之吐息',
  NPC_ICEBREATH: '冰之吐息', NPC_THUNDERBREATH: '雷之吐息', NPC_ACIDBREATH: '酸性吐息',
  AL_HEAL: '治癒術', AM_POTIONPITCHER: '藥水製造',
};

// 單一怪物攻擊
function monsterAttackSingle(mon) {
  const monDef = MONSTERS[mon.defId];

  /* 隊友承傷（使用者 2026-08-15 指定）：怪 60% 打玩家、40% 平分給未倒地的隊友。
     倒地的不列入分配，那份會自動退回玩家——不然隊友一死怪的攻擊就憑空少掉，
     變成「隊友死光反而比較安全」。
     只攔普通攻擊：怪物技能仍然一律打玩家（本作 1,536 筆怪物技能全是單體）。 */
  if (!mon.stunnedUntil || Date.now() >= mon.stunnedUntil) {
    const target = pickMonsterTarget();
    if (target) { monsterAttackAlly(mon, monDef, target); return; }
  }

  // 無法行動類的異常狀態（昏迷／冰凍／石化／睡眠／混亂）都寫在 stunnedUntil 上
  if (mon.stunnedUntil && Date.now() < mon.stunnedUntil) {
    const by = ailList(mon).filter(t => MON_AILMENTS[t].immobile)[0];
    const A = by ? MON_AILMENTS[by] : MON_AILMENTS.stun;
    logMsg(`${A.icon} ${monDef.name} 還在${A.name}中，無法攻擊！`);
    return;
  }

  // 怪物技能：擲中就用技能取代這一次普通攻擊
  const mSkill = monsterSkillFor(mon, monDef);
  if (mSkill) { monsterCastSkill(mon, monDef, mSkill); return; }

  if (Math.random() * 100 < state.perfectDodge) {
    logMsg(`你完全迴避了 ${monDef.name} 的攻擊！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
    return;
  }
  // 自動防禦（#22）：機率完全擋下。跟完全迴避分開顯示——一個是躲掉、一個是擋掉
  const blockedBy = playerBlocked('attack');
  if (blockedBy) {
    logMsg(`🛡️ 你擋下了 ${monDef.name} 的攻擊！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('GUARD', 'miss');
    tryShrinkStun(mon, monDef, blockedBy);
    return;
  }
  // 光之盾（#66）：機率完全免除這一擊
  if (defenderNegates()) {
    logMsg(`🛡️ 光之盾完全擋下了 ${monDef.name} 的攻擊！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('免傷', 'miss');
    return;
  }
  // 遺物免傷（#113）：騎士 20%／武僧 5%。跟光之盾同一類，所以放在一起
  {
    const by = relicNegatesHit();
    if (by) {
      logMsg(`${by}！完全免疫了 ${monDef.name} 的攻擊！`);
      if (typeof showPlayerFloat === 'function') showPlayerFloat('免傷', 'miss');
      if (typeof showBuddhaShield === 'function' && by.indexOf('佛法') >= 0) showBuddhaShield();
      return;
    }
  }
  // 噴砂被動造成的命中下降：等同降低這隻怪的fleeReq門檻，玩家更容易迴避
  let hitDebuff = 0;
  if (mon.debuffHit && mon.debuffHitEnd && Date.now() < mon.debuffHitEnd) {
    hitDebuff = mon.debuffHit;
  } else {
    delete mon.debuffHit;
    delete mon.debuffHitEnd;
  }
  // 黑暗：怪物命中下降，換算成同一個門檻扣減
  const blindMult = ailHitMult(mon);
  // 同理：黑暗打折的是怪物的 HIT，fleeReq = 怪物HIT + 75，先剝掉偏移再折
  if (blindMult < 1) hitDebuff += Math.round(((monDef.fleeReq || monsterHitOf(monDef)) - REQ_FLEE_OFFSET) * (1 - blindMult));
  const dodgePct = dodgeChancePctFromMonster(effectiveFleeWithBuff(), monDef, hitDebuff);
  if (Math.random() * 100 < dodgePct) {
    logMsg(`你迴避了 ${monDef.name} 的攻擊！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
    return;
  }

  // 後退迴避被動：被攻擊時機率完全免傷
  if (state.hasBackslideDodge && Math.random() * 100 < state.backslideDodgeChance) {
    logMsg(`💨 後退迴避發動！完全免疫了 ${monDef.name} 的攻擊！`);
    if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
    return;
  }

  // 毒性反彈被動：被毒屬性怪物攻擊時觸發反擊（10秒冷卻，目前遊戲無毒屬性怪物，暫無實際效果）
  if (state.hasPoisonReact && monDef.element === 'poison' && Date.now() >= (state.poisonReactReadyAt || 0)) {
    logMsg(`🛡️ 毒性反彈發動！完全迴避了 ${monDef.name} 的攻擊！`);
    const counterDmg = mitigateDamage(skillBaseDamage(false, monDef, 1) * state.poisonReactMult * elementDmgMult('poison'), ...defOf(monDef));
    mon.hp -= counterDmg;
    logMsg(`⚔️ 反擊造成 ${counterDmg} 點傷害！`);
    state.poisonReactReadyAt = Date.now() + state.poisonReactCooldownSec * 1000;
    if (mon.hp <= 0) {
      killMonster(monDef, mon);
    }
    return;
  }

  // 反擊被動：被攻擊時機率免傷+反擊必暴
  if (state.hasCounterAttack) {
    const counterChance = state.counterAttackChance || 15;
    if (Math.random() * 100 < counterChance) {
      logMsg(`🛡️ 反擊發動！完全迴避了 ${monDef.name} 的攻擊！`);
      const counterDmg = mitigateDamage(skillBaseDamage(false, monDef, 1) * 1.5, ...defOf(monDef));
      mon.hp -= counterDmg;
      logMsg(`⚔️ 反擊造成 ${counterDmg} 點傷害（暴擊）！`);
      if (mon.hp <= 0) {
        killMonster(monDef, mon);
      }
      return;
    }
  }

  let raw = monsterBaseAtk(monDef, undefined, mon);
  // 詛咒：怪物 ATK 下降
  raw *= ailAtkMult(mon);

  // 屬性相剋。防守側是玩家的鎧甲屬性（#17），沒插鎧甲屬性卡時是 none
  const elemMult = getElementMultiplier(monDef.element || 'none', state.playerElement || 'none');
  raw *= elemMult;

  // 強化火屬性：對火屬性/無屬性怪物攻擊的耐性
  const monAtkElement = monDef.element || 'none';
  if (monAtkElement === 'fire' && state.fireResistPct) raw *= (1 - state.fireResistPct / 100);
  if (monAtkElement === 'none' && state.neutralResistPct) raw *= (1 - state.neutralResistPct / 100);

  // 卡片種族減傷（例如畢帝特飛龍卡片：受到龍族傷害-30%）
  if (monDef.race && state.cardRaceDmgReduce && state.cardRaceDmgReduce[monDef.race]) {
    raw *= (1 - state.cardRaceDmgReduce[monDef.race]);
  }
  // 卡片屬性減傷（例如受到地屬性傷害-30%）
  if (state.cardEleDmgReduce && state.cardEleDmgReduce[monAtkElement]) {
    raw *= (1 - state.cardEleDmgReduce[monAtkElement]);
  }
  // 卡片體型減傷（獸牙怪卡片：受到中型魔物傷害-25%）
  if (monDef.size && state.cardSizeDmgReduce && state.cardSizeDmgReduce[monDef.size]) {
    raw *= (1 - state.cardSizeDmgReduce[monDef.size]);
  }
  // 卡片家族增傷（妖道卡片：從殭屍受到的傷害 +100%）
  raw *= cardFamilyDmgTakenMult(monDef);
  // 種族承傷（天龍防具：受到龍族怪的傷害 -2%）
  raw *= cardRaceDmgTakenMult(monDef);
  // 愛麗絲女僕卡片那種取捨型：對首領類大幅減傷，對一般怪反而增傷
  if (monDef.isBoss) {
    if (state.cardBossDmgTakenPct) raw *= (1 + state.cardBossDmgTakenPct / 100);
  } else if (state.cardNormalDmgTakenPct) {
    raw *= (1 + state.cardNormalDmgTakenPct / 100);
  }

  let [hardDef, softDef] = debuffedDef(state.defHard, state.defSoft);   // 挑釁：DEF 下降
  // 天使之護：官方效果限定對惡魔/不死種族攻擊者生效（裝備類加成 → 硬防）
  if (state.divineDefBonus && (monDef.race === 'demon' || monDef.race === 'undead')) {
    hardDef += state.divineDefBonus;
  }
  // 狂暴狀態：DEF -55%
  if (state.hasBerserk && state.hp < state.maxHp * 0.25) {
    hardDef = Math.round(hardDef * 0.45); softDef = Math.round(softDef * 0.45);
  }

  /* 睡眠 ×1.5 與永恆之光 ×2。這一段以前**只寫在技能那條路徑上**，普通攻擊完全沒吃，
     等於睡著的玩家被技能打會痛、被普攻打卻不會。
     位置在防禦之後：官方這類是最後的傷害倍率，乘在防禦之前的話軟防那段固定減值
     會讓實際倍率大於寫出來的數字（實測 ×2 會變成 ×2.5）。 */
  let dmg = Math.max(1, Math.round(mitigatePlayerIncoming(raw, hardDef, softDef) * playerDmgTakenMult()));
  dmg = rejectSwordAbsorb(dmg, mon, monDef);    // 霸王魂（#79）
  // 能量外套：啟動中減傷並消耗SP，SP%低於下限時暫停生效
  if (state.hasEnergyCoatUnlock && state.energyCoatEnabled) {
    const spPct = state.maxSp > 0 ? (state.sp / state.maxSp) * 100 : 0;
    if (spPct >= (state.energyCoatSpFloorPct || 0)) {
      dmg = Math.round(dmg * (1 - (state.energyCoatDmgReductionPct || 0) / 100));
      const spCost = Math.round(state.maxSp * ((state.energyCoatSpCostPct || 0) / 100));
      state.sp = Math.max(0, state.sp - spCost);
    }
  }
  // 護盾（霸邪之陣/暗之障壁）：吸收近距離物理傷害，直到耐久或次數耗盡
  dmg = absorbWithShields(state, dmg);
  state.hp -= dmg;
  // 同上：睡眠「被打就醒」以前也只寫在技能那條路徑，普攻打不醒
  playerAilBreakOnDamage();
  pDebuffConsumeOnce('dmgTakenPct');
  const berserkMsg = (state.hasBerserk && state.hp < state.maxHp * 0.25) ? '（狂暴中：ATK+32% DEF-55%）' : '';
  logMsg(`${monDef.name} 對你造成 ${dmg} 點傷害。${berserkMsg}`);
  // 卡片反射（#17）：彈回去的是扣完防禦與護盾之後的實際傷害
  applyPlayerReflect(mon, monDef, dmg);
  // 怪物傷害飄字（玩家頭上）
  if (typeof showPlayerFloat === 'function') showPlayerFloat('-' + dmg, 'element-bad');
  if (state.hp <= 0) {
    state.hp = 0;
    if (tryAutoRevive()) return;
    onPlayerDown();
    return;
  }

  // 緩速術被動：被攻擊時機率反制暈眩攻擊者
  if (state.hasOnHitStunProc && Date.now() >= (state.onHitStunReadyAt || 0) && Math.random() * 100 < state.onHitStunChance) {
    state.onHitStunReadyAt = Date.now() + state.onHitStunCooldownSec * 1000;
    applyStun(mon, state.onHitStunSec, true);
    logMsg(`💫 緩速術發動！${monDef.name} 暈眩了！`);
  }
  // 冰凍術/石化術：被攻擊時機率反制暈眩並造成魔法傷害
  tryMagicStunProcs(mon, monDef);
  // 火之獵殺：被攻擊時觸發範圍魔法傷害
  tryOnHitAoeProc();
  // 霜凍之術：被攻擊時觸發範圍魔法傷害+機率暈眩
  tryOnHitAoeStunProc();
  // 泥沼地：被攻擊時反制暈眩攻擊者
  tryOnHitStunProc2(mon, monDef);
  // 長矛刺擊：被攻擊時機率反擊
  trySpearCounterProc(mon, monDef);
  // 狂怒之槍：被攻擊時機率進入狂怒（#58）
  tryFrenzyProc();
  // 卡片的受擊反擊型異常狀態（惡魔女僕那一大類「受到物理傷害時讓敵人得到XX」）
  tryCardAilments('hit', mon);
  // 卡片自動念咒（受擊觸發）：放在最後，此時玩家確定還活著、傷害也結算完了
  tryAutoSpells('hit', mon);
}

/* ---------------- 圖鑑（收集追蹤） ----------------
   state.codex = {
     mon:  { 怪物id: 累計擊殺數 },
     seen: { 怪物id: 1 },          // 遭遇過就算發現，不一定要打倒
     item: { 道具id: 累計取得數 }
   }
   完成度的分母只算「玩家真的碰得到」的內容：掛在地圖上的怪、這些怪掉得到的道具、
   商店買得到的道具。資料表裡有 2000 多隻沒有出沒地圖的孤兒怪與兩萬多個沒有取得
   管道的道具，全部算進分母的話完成度永遠停在個位數，收集就失去意義。
------------------------------------------------- */
function ensureCodex() {
  if (!state.codex) state.codex = {};
  if (!state.codex.mon) state.codex.mon = {};
  if (!state.codex.seen) state.codex.seen = {};
  if (!state.codex.item) state.codex.item = {};
  if (!state.codex.maps) state.codex.maps = {};
  if (!state.codex.box) state.codex.box = {};   // 隱藏圖鑑：神秘箱開出過的道具
  return state.codex;
}
function codexRecordSeen(defId) {
  if (!state || !defId) return;
  ensureCodex().seen[defId] = 1;
}
function codexRecordKill(defId) {
  if (!state || !defId) return;
  const c = ensureCodex();
  c.seen[defId] = 1;
  c.mon[defId] = (c.mon[defId] || 0) + 1;
}
function codexRecordItem(itemId, qty) {
  if (!state || !itemId) return;
  const c = ensureCodex();
  c.item[itemId] = (c.item[itemId] || 0) + (qty || 1);
}
/* 隱藏圖鑑：只有「從神秘箱開出來」才算收集（挑戰用，買商店的不算）。 */
function codexRecordBox(itemId) {
  if (!state || !itemId) return;
  ensureCodex().box[itemId] = 1;
}
/* 隱藏圖鑑清單：神秘箱子／神秘紫箱的道具池（兩者同一池）。
   排序按筆畫外的名稱，讓分頁列表穩定。 */
let _boxCodexIds = null;
function getBoxCodexPool() {
  if (_boxCodexIds) return _boxCodexIds;
  _boxCodexIds = Object.keys(ITEMS).filter(boxEligible)
    .sort((a, b) => (ITEMS[a].name || '').localeCompare(ITEMS[b].name || '', 'zh-Hant'));
  return _boxCodexIds;
}
/* 卡冊限定卡：卡冊抽得到、但來源怪根本沒實裝（打不到）的卡片。
   這些也納入隱藏圖鑑讓玩家收集——來源只有卡冊。 */
let _albumOnlyCards = null;
function getAlbumOnlyCards() {
  if (_albumOnlyCards) return _albumOnlyCards;
  const drawable = Object.keys(CARDS).filter(k => ITEMS[k] && /卡片$/.test(CARDS[k].name));
  const farmable = new Set();
  Object.entries(MONSTER_CARD_DROPS || {}).forEach(([mon, cd]) => {
    if (MONSTERS[mon] && ITEMS[cd.card]) farmable.add(cd.card);
  });
  Object.values(MONSTERS).forEach(m => (m.drops || []).forEach(d => {
    if (d.item && CARDS[d.item]) farmable.add(d.item);
  }));
  _albumOnlyCards = drawable.filter(c => !farmable.has(c));
  return _albumOnlyCards;
}
/* 卡冊開出的卡若是「卡冊限定」也記進隱藏圖鑑 */
function codexRecordBoxCardIfAlbumOnly(cardId) {
  if (!state || !cardId) return;
  if (getAlbumOnlyCards().includes(cardId)) ensureCodex().box[cardId] = 1;
}

// 可收集清單是靜態資料算出來的，只算一次後快取
let _codexPoolCache = null;
function getCodexPool() {
  if (_codexPoolCache) return _codexPoolCache;
  const monSet = new Set();
  /* 不給經驗的怪是調校用的假人（目前只有測試波利），不進圖鑑。
     牠身上掛的掉落物也會跟著不進池——不然圖鑑會出現一件「查得到、但查不到去哪打」的死條目
     （短剑 [4] 就是唯一一件只有測試波利會掉的裝備）。 */
  MAPS.forEach(m => (m.monsters || []).forEach(e => {
    if (MONSTERS[e.id] && (MONSTERS[e.id].exp || 0) > 0) monSet.add(e.id);
  }));
  if (typeof MVP_MAP_DATA !== 'undefined') {
    Object.values(MVP_MAP_DATA).forEach(list => (list || []).forEach(id => { if (MONSTERS[id]) monSet.add(id); }));
  }
  const itemSet = new Set();
  monSet.forEach(id => {
    (MONSTERS[id].drops || []).forEach(d => { if (ITEMS[d.item]) itemSet.add(d.item); });
  });
  if (typeof MONSTER_CARD_DROPS !== 'undefined') {
    Object.entries(MONSTER_CARD_DROPS).forEach(([monId, cd]) => {
      if (monSet.has(monId) && cd && ITEMS[cd.card]) itemSet.add(cd.card);
    });
  }
  Object.values(NPC_SHOPS).forEach(shop => (shop.items || []).forEach(id => { if (ITEMS[id]) itemSet.add(id); }));
  POTION_TIERS.forEach(id => { if (ITEMS[id]) itemSet.add(id); });
  /* 遺物也是收藏品（#138）。它們不從掉落表來（頭目掉遺物券、券再去換），
     所以上面那幾圈一個都掃不到——圖鑑的「遺物」分類會是空的。
     取得方式在明細裡另外寫（見 ui.js 的 relicSourceHtml）。 */
  if (typeof RELIC_ITEMS !== 'undefined') {
    Object.keys(RELIC_ITEMS).forEach(id => { if (ITEMS[id]) itemSet.add(id); });
  }
  if (typeof RELIC_TICKET_ID !== 'undefined' && ITEMS[RELIC_TICKET_ID]) itemSet.add(RELIC_TICKET_ID);
  const cardSet = new Set([...itemSet].filter(id => CARDS[id]));
  _codexPoolCache = {
    monsters: [...monSet].sort((a, b) => (MONSTERS[a].level || 0) - (MONSTERS[b].level || 0)),
    items: [...itemSet].filter(id => !CARDS[id]),
    cards: [...cardSet]
  };
  return _codexPoolCache;
}

// 哪些怪會掉這個道具（圖鑑的「取得來源」欄用）
let _codexSourceCache = null;
function getItemSources(itemId) {
  if (!_codexSourceCache) {
    _codexSourceCache = {};
    getCodexPool().monsters.forEach(monId => {
      (MONSTERS[monId].drops || []).forEach(d => {
        (_codexSourceCache[d.item] = _codexSourceCache[d.item] || []).push({ mon: monId, chance: d.chance });
      });
      const cd = (typeof MONSTER_CARD_DROPS !== 'undefined') ? MONSTER_CARD_DROPS[monId] : null;
      if (cd) (_codexSourceCache[cd.card] = _codexSourceCache[cd.card] || []).push({ mon: monId, chance: cd.chance });
    });
  }
  const list = (_codexSourceCache[itemId] || []).slice();
  // 同一隻怪可能同時出現在 drops 與卡片表，取機率高的那筆就好
  const best = {};
  list.forEach(s => { if (!best[s.mon] || best[s.mon].chance < s.chance) best[s.mon] = s; });
  return Object.values(best).sort((a, b) => b.chance - a.chance);
}

/* 哪些地圖有這隻怪，**帶出現率**。

   以前這支只回傳地圖名字的陣列，圖鑑就只能列出一串名字。但一隻怪平均出現在
   3.4 張圖、最多的一隻出現在 32 張，而每張圖的權重從 5% 到 40% 都有——
   沒有出現率的話那串名字幫不上忙，玩家還是不知道該去哪張。

   出現率是 `weight / 該圖權重總和`，跟 spawnMonster() 抽怪用的是同一組數字。
   回傳照出現率由高到低排序，第一筆就是最容易遇到的地方。 */
/* 測試場那種調校用的圖不算「去處」。判斷條件是**怪物完全不給經驗**——
   全庫只有測試波利符合（HP 100 萬、exp 0），寫死地圖 id 反而容易漏。 */
function isCodexFarmable(mapObj) {
  const list = (mapObj && mapObj.monsters) || [];
  return list.some(e => MONSTERS[e.id] && (MONSTERS[e.id].exp || 0) > 0);
}
let _codexMapCache = null;
function getMonsterMaps(monId) {
  if (!_codexMapCache) {
    _codexMapCache = {};
    MAPS.forEach(m => {
      if (!isCodexFarmable(m)) return;
      const list = m.monsters || [];
      const total = list.reduce((a, e) => a + (e.weight || 0), 0);
      list.forEach(e => {
        (_codexMapCache[e.id] = _codexMapCache[e.id] || []).push({
          id: m.id, name: m.name,
          weight: e.weight || 0,
          pct: total > 0 ? (e.weight || 0) / total * 100 : 0,
        });
      });
    });
    /* MVP 的出沒地圖（#108）。MVP **不在** `MAPS[*].monsters` 裡——牠們住在
       `MVP_MAP_DATA[地圖id] = [BOSS id…]`，所以上面那圈一隻都掃不到，
       圖鑑的「出沒地圖」只能印「無（需開啟 BOSS 模式）」，玩家根本不知道要去哪找。

       機率照 spawnMonster() 的實際規則算：開了 BOSS 模式之後，每次補怪有 20%
       抽 MVP，再從該圖的 MVP 清單裡均分。標上 `mvp: true` 讓 UI 標示
       「要開 BOSS 模式」——沒開的話這一格永遠不會發生。 */
    if (typeof MVP_MAP_DATA !== 'undefined') {
      const byId = {};
      MAPS.forEach(m => { byId[m.id] = m; });
      Object.keys(MVP_MAP_DATA).forEach(mapId => {
        const m = byId[mapId];
        if (!m) return;
        const list = MVP_MAP_DATA[mapId] || [];
        if (!list.length) return;
        list.forEach(id => {
          if (!MONSTERS[id]) return;
          (_codexMapCache[id] = _codexMapCache[id] || []).push({
            id: m.id, name: m.name, weight: 0,
            pct: MVP_SPAWN_CHANCE_PCT / list.length,
            mvp: true,
          });
        });
      });
    }
    Object.values(_codexMapCache).forEach(a => a.sort((x, y) => y.pct - x.pct));
  }
  return _codexMapCache[monId] || [];
}

/* 「這個道具去哪裡打」——把 道具→掉落率→怪物→出現率→地圖 整條鏈接完。

   圖鑑以前列到「哪隻怪會掉」就停了，玩家還得自己再去查那隻怪在哪張圖。
   這裡直接攤平成一行一個去處，照**出現率**排序（使用者 2026-08-15 指定；
   另一個選項是照期望效率排，但那要把擊殺速度算進來，先不做）。 */
function getItemFarmSpots(itemId) {
  const out = [];
  getItemSources(itemId).forEach(s => {
    getMonsterMaps(s.mon).forEach(m => {
      out.push({ mapId: m.id, mapName: m.name, spawnPct: m.pct, mon: s.mon, dropChance: s.chance });
    });
    /* MVP 的出沒地圖**已經包含在 getMonsterMaps() 裡了**（#108 那次補的）。
       這裡以前還有一段自己再掃一次 MVP_MAP_DATA 的程式，是 #108 之前寫的，
       後來沒跟著拿掉——結果同時掛在一般配怪表與 MVP 名單上的怪
       （鴞嫋男爵那種）每張地圖會列兩行，一行普通一行 👑，看起來像資料錯了。 */
  });
  return out.sort((a, b) => b.spawnPct - a.spawnPct);
}

function getCodexProgress() {
  const pool = getCodexPool();
  const c = ensureCodex();
  const count = (ids, book) => ids.reduce((n, id) => n + (book[id] ? 1 : 0), 0);
  return {
    monsters: { found: count(pool.monsters, c.seen), killed: count(pool.monsters, c.mon), total: pool.monsters.length },
    items: { found: count(pool.items, c.item), total: pool.items.length },
    cards: { found: count(pool.cards, c.item), total: pool.cards.length }
  };
}

/* 以太礦石：只有 MVP（王）會掉，機率依王的等級分三段。
   兩種各自獨立擲骰，所以同一隻王有機會兩種都掉。 */
const ETHER_DROP_RATES = [
  { minLevel: 99, chance: 0.05 },
  { minLevel: 50, chance: 0.01 },
  { minLevel: 0,  chance: 0.001 }
];
function getEtherDropChance(monDef) {
  if (!monDef || !monDef.isBoss) return 0;
  const lv = monDef.level || 0;
  const tier = ETHER_DROP_RATES.find(t => lv >= t.minLevel);
  return tier ? tier.chance : 0;
}
/* 從掉落表裡挑一樣，**照各自的掉落率加權**（#109）。

   偷竊與貪婪本來是 `drops[Math.floor(Math.random() * drops.length)]`——**均分**，
   完全無視掉落率。虎王的掉落表有 11 項，虎王卡片的正常掉落率是 0.05%，
   均分之下被挑中的機率是 9.1%，**182 倍**；火靈原石（賣 1500）0.23% → 9.1%，40 倍。
   偷竊 Lv10 有 62% 觸發率，等於卡片的實際到手率變成正常掉落的一百多倍——
   使用者 2026-08-16 回報「偷竊獲得高價物的機率太高」就是這個。

   加權之後，稀有度的相對關係跟正常掉落一致：虎王卡片佔 0.05/135.5 ≈ 0.037%。 */
function pickWeightedDrop(drops) {
  const list = (drops || []).filter(d => d && d.item && d.chance > 0);
  if (!list.length) return null;
  const total = list.reduce((a, d) => a + d.chance, 0);
  let r = Math.random() * total;
  for (const d of list) { r -= d.chance; if (r <= 0) return d; }
  return list[list.length - 1];   // 浮點誤差的保險
}

function rollEtherDrop(monDef) {
  const chance = getEtherDropChance(monDef);
  if (chance <= 0) return;
  ['ether_oridecon', 'ether_elunium'].forEach(id => {
    if (Math.random() < chance) {
      addItem(id, 1);
      logMsg(`✨ MVP 掉落！獲得了 ${ITEMS[id].name}！`);
    }
  });
}

/* ---------------- 頭目擊殺紀錄（#137）----------------

   離線結算以前完全不會遇到 MVP：`computeOfflineProgress()` 的怪物池只有
   `map.monsters`，一整晚掛下來連一隻頭目都碰不到，BOSS 模式的獎勵等於離線拿不到。

   要補上就得回答一個問題：**這個角色到底打不打得動那隻頭目？**
   模擬算得出 DPS，但算不出「會不會被打死」——現在的離線抽樣裡怪物根本不還手。
   對雜魚無所謂，對 ATK 三千多、血量百萬起跳的 MVP 就是整件事的關鍵。

   所以改用一個模擬偽造不了的證據：**實際殺過**。
   `state.bossKills[怪物id] = { n, lastMs, bestMs, at }`
     n       殺過幾次（≥1 就是離線的通行證）
     lastMs  最近一次的擊殺耗時 → **離線用這個算**
     bestMs  歷史最快 → 圖鑑顯示用（使用者要求）

   離線用 lastMs 而不是 bestMs：使用者選的是「就讓它舊著，下次線上打一隻就更新」，
   最近一次反映的是現在的裝備，也不會被「某次帶滿隊友刷出的最佳紀錄」灌水。
   換裝變強之後紀錄會暫時偏慢，線上再打一隻就跟上——保守的方向錯了不會出事。

   耗時從**出現**量到死（monObj.spawnedAt），中間被雜魚分掉的攻擊、喝水、
   放輔助的空檔全部算進去。那才是真實產出速度，離線本來就該照那個給。 */
/* **一隻頭目要分三份紀錄**（普通／打寶／瘋狂）。

   打寶模式把怪的血量拉到 ×3、瘋狂 ×5，而血量是**生怪當下**算進去的，
   所以同一隻頭目在三種模式下的擊殺耗時差三到五倍。混成一份的話：
   用瘋狂模式的紀錄去算普通模式的離線 → 少給三倍；反過來 → 多給五倍。
   兩個方向都不對，後者還會變成刷法。

     state.bossKills[怪物id][模式] = { n, lastMs, bestMs, at }

   離線只認**當下這個模式**的紀錄：在瘋狂模式掛機，就得先在瘋狂模式殺過一次。 */
function ensureBossKills(st) {
  const s = st || state;
  if (!s.bossKills) s.bossKills = {};
  return s.bossKills;
}
/* 舊版（#137 初版）是一隻怪一份平鋪紀錄，沒有分模式。
   那份不知道是在哪個模式量的，一律歸到普通——三種模式裡普通最快，
   歸到它等於「之後在打寶模式掛機要重新量一次」，錯的方向是保守的那邊。 */
function migrateBossKills(st) {
  const log = (st && st.bossKills);
  if (!log) return;
  Object.keys(log).forEach(id => {
    const v = log[id];
    if (!v || typeof v !== 'object') { delete log[id]; return; }
    if (typeof v.lastMs === 'number' || typeof v.n === 'number') {
      log[id] = { [FARM_MODE_OFF]: v };
    }
  });
}
function bossKillRecord(monId, mode, st) {
  const s = st || state;
  const m = mode == null ? farmMode() : mode;
  const per = s && s.bossKills && s.bossKills[monId];
  return (per && per[m]) || null;
}
function recordBossKillTime(owner, monKey, def, monObj) {
  if (!owner || !def || !def.isBoss) return;
  const at = monObj && monObj.spawnedAt;
  if (!at) return;                      // 舊存檔留在場上的怪沒有這一格，跳過
  const ms = Date.now() - at;
  /* 下限擋掉不合理的紀錄：GM 秒殺、測試造出來的假怪、以及同一拍連續結算。
     沒有下限的話一次 0ms 的紀錄會讓離線變成無限刷。 */
  if (!(ms >= BOSS_KILL_MIN_MS)) return;
  /* 用**生怪當下**的模式，不是現在的模式：血量是那時候算進去的。
     切模式時 setFarmMode() 會清場重生，所以兩者其實一致，
     但把它記在怪身上就不必依賴那條不變式。 */
  const mode = monObj.farmMode == null ? farmMode() : monObj.farmMode;
  const log = ensureBossKills(owner);
  const per = log[monKey] || (log[monKey] = {});
  const cur = per[mode] || { n: 0, lastMs: 0, bestMs: 0, at: 0 };
  cur.n++;
  cur.lastMs = ms;
  cur.bestMs = cur.bestMs > 0 ? Math.min(cur.bestMs, ms) : ms;
  cur.at = Date.now();
  per[mode] = cur;
}
const BOSS_KILL_MIN_MS = 1000;

function killMonster(def, monObj) {
  /* 同一隻只能結算一次。

     #58 之後普攻的尾端多了幾個「打完再補一刀」的被動（傷害增壓／巧打／黑暗瞬間），
     那些函式自己會在目標歸零時呼叫 killMonster，回到 playerAttack 又有一段
     `if (target.hp <= 0) killMonster(...)`——同一隻怪被結算兩次，
     經驗、鋅幣、掉落、卡片、圖鑑全部發雙份。加一道旗子把它擋掉。 */
  if (monObj) {
    if (monObj._killed) return;
    monObj._killed = true;
  }
  // 查表一律用 MONSTERS 的 key，不要用 def.id：有 72 隻怪的 def.id 帶著去重時加上的底線
  // 後綴（例如 poring 的 def.id 是 'poring_'），拿 def.id 去查 MONSTER_CARD_DROPS 會落空，
  // 波利/綠棉蟲/小惡魔/耳語的卡片因此一直掉不出來。所有呼叫端都有傳 monObj，用它的 defId 最準。
  const monKey = (monObj && monObj.defId) || def.id;
  // 卡片的種族經驗加成（狂暴野豬那一組：擊殺該族經驗+10%，代價是被該族打得更痛）
  // 經驗值倍增（#68）跟卡片的種族經驗加成相乘
  const expMult = (1 + ((def.race && state.cardExpRace && state.cardExpRace[def.race]) || 0))
    * (1 + buffMult('exp').flatBonus / 100)
    /* 裝備的經驗值加成（快樂氣球 EXP+5%、艾咪斯可魯背包每+2 +1%）。過去只進表沒人讀。 */
    * (1 + getCardBonus('expAllPct') / 100);
  const gotExp = Math.round(def.exp * expMult * farmMult('exp'));
  const gotJobExp = Math.round(def.jobExp * expMult * farmMult('exp'));
  /* **隊友打死的怪，獎勵要記在玩家頭上。** 隊友是靠 withAlly() 換身跑
     playerAttack() 的，走到這裡時全域的 state 是隊友那份快照——不導回去的話
     經驗、鋅幣、掉落、圖鑑全部進了快照，玩家一毛都拿不到（實測過）。
     傭兵自己**額外**累積 20%（不從玩家那邊扣），退隊時進待領帳本。 */
  const acting = _allyActing;
  const owner = acting ? allyOwnerState() : state;
  recordBossKillTime(owner, monKey, def, monObj);
  /* 20% 記給**全隊未倒地的隊友**，不是只記給補刀的那一個。
     照補刀算的話，攻擊力低的隊友（祭司、鐵匠）永遠搶不到最後一擊——
     實測 300 隻全被鐵匠收走，祭司累積 0。他們是隊友不是承包商。 */
  (owner.allies || []).forEach(a => {
    if (!a || a._downed) return;
    a._pendingExp = (a._pendingExp || 0) + gotExp * ALLY_MERC_EXP_PCT / 100;
    a._pendingJobExp = (a._pendingJobExp || 0) + gotJobExp * ALLY_MERC_EXP_PCT / 100;
  });
  /* 擊殺與經驗一律走**戰鬥欄**（#100）。不指定的話會跟著當下的來源跑——
     主動技能打死的進技能欄、被動追擊打死的也進技能欄，同一批經驗訊息散在兩格裡。
     那是戰果不是技能說明，集中在左邊才看得出這一趟賺了多少。 */
  logMsg(`擊敗了 ${def.name}！獲得 ${gotExp} 經驗與 ${gotJobExp} 職業經驗。`,
    _allyActing ? 'ally' : 'main');   // 隊友補的刀還是留在隊友欄
  codexRecordKill(monKey);
  /* 打贏 MVP 的音效（#146）。只認正牌 MVP，迷你王不放——
     迷你王在 #147 之後是獨立的一類，出現頻率高得多，每隻都放會變成背景音。 */
  if (def.isMvp && !acting && typeof playEventSfx === 'function') playEventSfx('mvp');
  withOwner(() => gainExp(gotExp, gotJobExp));
  const goldGain = Math.round((3 + def.level * 1.4) * buffMult('gold').mult * farmMult('gold'));
  owner.gold += goldGain;
  if (state.dpsTracker) {
    const t = state.dpsTracker;
    t.kills++; t.exp += gotExp; t.jobExp += gotJobExp; t.gold += goldGain;
  }
  // 吸魂術（#63）：擊殺就回固定 SP，不分種族也不分擊殺方式
  if (state.spOnKillFlat) {
    state.sp = Math.min(state.maxSp, state.sp + state.spOnKillFlat);
  }
  // 卡片：近距離擊殺某種族回 SP（官方限定近戰，本作以「沒裝弓」為準）
  const spKill = (def.race && state.cardSpOnKillRace && state.cardSpOnKillRace[def.race]) || 0;
  if (spKill && !isBowWeapon(getEquipBaseItemId('weapon'))) {
    state.sp = Math.min(state.maxSp, state.sp + spKill);
  }
  /* 卡片：近距離物理擊殺時回固定 HP（七彩飛龍 100、殭屍屠戮者 50）。
     跟上面回 SP 那條同一個「近戰」判準——沒裝弓就算近戰。
     這批卡片的設計是「回復力歸零，改成靠擊殺回血」，所以是站著回不了血、
     打得動才活得下去，兩半要一起看（見 hpRegenPct）。 */
  const hpKill = state.cardHpOnMeleeKill || 0;
  if (hpKill && state.hp > 0 && !isBowWeapon(getEquipBaseItemId('weapon'))) {
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + hpKill);
    if (state.hp > before && typeof showPlayerFloat === 'function') showPlayerFloat('+' + (state.hp - before), 'heal');
  }
  /* 掉落率的打寶加成（#110）。夾在 1 以下：本來就 100% 的掉落乘上去沒有意義，
     而 >1 的機率會讓「稀有度」在偷竊那類加權計算裡失真。 */
  const dropMult = farmMult('drop') * (1 + getCardBonus('dropPct') / 100);   // 裝備掉寶率（快樂氣球+10%）
  (def.drops || []).forEach(d => {
    if (Math.random() < Math.min(1, d.chance * dropMult)) addItem(d.item, 1);
  });
  rollEtherDrop(def);
  rollRelicDrop(def);                    // 遺物（#113）：只有打寶模式會掉
  // 偷竊被動：擊敗怪物時機率額外掉落一份道具（照掉落率加權，見 pickWeightedDrop）
  if (state.stealChance && def.drops && def.drops.length > 0 && Math.random() * 100 < state.stealChance) {
    const stolen = pickWeightedDrop(def.drops);
    if (stolen) {
      addItem(stolen.item, 1);
      const stolenName = ITEMS[stolen.item] ? ITEMS[stolen.item].name : stolen.item;
      logMsg(`🗡️ 偷竊發動！額外獲得了 ${stolenName}！`);
    }
  }
  // 尋找礦石被動：擊敗怪物時機率額外獲得隨機屬性礦石（供屬性石製造使用）
  if (state.hasFindingOreProc && Math.random() * 100 < state.findingOreChance) {
    const orePool = ['boody_red', 'crystal_blue', 'wind_of_verdure', 'yellow_live'];
    const ore = orePool[Math.floor(Math.random() * orePool.length)];
    addItem(ore, 1);
    logMsg(`⛏️ 尋找礦石發動！額外獲得了 ${ITEMS[ore].name}！`);
  }
  // 貪婪被動：擊敗怪物時機率多獲得一份戰利品（跟偷竊同一套加權）
  if (state.hasGreedProc && def.drops && def.drops.length > 0 && Math.random() * 100 < state.greedChance) {
    const bonus = pickWeightedDrop(def.drops);
    if (bonus) {
      addItem(bonus.item, 1);
      const bonusName = ITEMS[bonus.item] ? ITEMS[bonus.item].name : bonus.item;
      logMsg(`💰 貪婪發動！額外獲得了 ${bonusName}！`);
    }
  }
  // 卡片附加掉落（箱子、料理、精煉素材那一批）
  tryCardKillDrops(def);
  // 卡片掉落
  const cardDrop = MONSTER_CARD_DROPS[monKey];
  if (cardDrop && Math.random() < cardDrop.chance) {
    addItem(cardDrop.card, 1);
    const card = CARDS[cardDrop.card];
    logMsg(`🃏 掉落了稀有的 ${card.name}！`);
  }
  // 從怪物列表中移除
  /* 屍體要從**玩家**那份 monsters 移除。
     `state.monsters = state.monsters.filter(...)` 是重新綁定屬性，換身期間綁到的是
     隊友快照的 `monsters`，玩家那邊的陣列原封不動——實測結果是隊友打死一隻之後，
     怪還掛在場上，隊友接著對屍體揮空（靠 `_killed` 旗標才沒發雙份獎勵）。 */
  const field = allyOwnerState();
  if (monObj && field.monsters) {
    field.monsters = field.monsters.filter(m => m.id !== monObj.id);
  } else if (field.monsters && field.monsters.length > 0) {
    field.monsters.shift();
  }
  field.monster = field.monsters && field.monsters.length > 0 ? field.monsters[0] : null;
  // 換身中：把新的陣列同步回隊友，不然牠這一輪剩下的揮擊還是打舊陣列
  if (_allyActing) { _allyActing.monsters = field.monsters; _allyActing.monster = field.monster; }
}

/* 死亡自動復活：復活術優先，若冷卻中或SP不足才輪到捨身取義。

   俄塞里斯卡片（#17）「復活時 HP 與 SP 全部恢復」只影響**這裡**。
   被抬回安全區那條路徑（onPlayerDown）本來就已經 HP/SP 全滿，
   官方那句話針對的正是「原地復活但只回一小截血」的復活術。 */
function tryAutoRevive() {
  const now = Date.now();
  const full = () => { state.hp = state.maxHp; state.sp = state.maxSp; };
  if (state.hasAutoRevive1 && now >= (state.autoRevive1ReadyAt || 0) && state.sp >= (state.autoRevive1SpCost || 0)) {
    state.sp -= (state.autoRevive1SpCost || 0);
    state.autoRevive1ReadyAt = now + state.autoRevive1CooldownSec * 1000;
    state.hp = Math.max(1, Math.round(state.maxHp * state.autoRevive1HpPct / 100));
    if (state.cardReviveFull) full();
    logMsg(`✨ 復活術發動！原地復活，恢復了${state.cardReviveFull ? '全部' : state.autoRevive1HpPct + '%'} HP！`);
    return true;
  }
  if (state.hasAutoRevive2 && now >= (state.autoRevive2ReadyAt || 0)) {
    state.autoRevive2ReadyAt = now + state.autoRevive2CooldownSec * 1000;
    state.hp = Math.max(1, Math.round(state.maxHp * state.autoRevive2HpPct / 100));
    if (state.cardReviveFull) full();
    logMsg(`✨ 捨身取義發動！原地復活，恢復了${state.cardReviveFull ? '全部' : state.autoRevive2HpPct + '%'} HP！`);
    return true;
  }
  /* 自己的兩條都不行時，換還站著的祭司隊友扶（#105）。
     技能寫的是「全隊有人倒下」，倒下的人是玩家時當然也算。 */
  for (const a of allyAliveList()) {
    if (!a.hasAutoRevive1 || now < (a.autoRevive1ReadyAt || 0)) continue;
    const cost = a.autoRevive1SpCost || 0;
    if (a.sp < cost) continue;
    a.sp -= cost;
    a.autoRevive1ReadyAt = now + a.autoRevive1CooldownSec * 1000;
    state.hp = Math.max(1, Math.round(state.maxHp * a.autoRevive1HpPct / 100));
    if (state.cardReviveFull) full();
    logMsg(`✨ 復活術發動（${a._allyName}）！扶起了你（HP ${a.autoRevive1HpPct}%）。`);
    return true;
  }
  // 牧師遺物是最後一道保險：自己的復活術與隊友的祭司都優先用掉（#113）
  if (tryRelicPriestRevive()) return true;
  return false;
}

function onPlayerDown() {
  state.deaths = (state.deaths || 0) + 1;
  logMsg(`⚠️ 你被擊倒了！正在返回安全地帶療傷……`);
  state.monster = null;
  state.monsters = [];
  // 找到該地區的安全區，沒有就去普隆德拉
  const curRegion = regionOf(state.mapId);
  let safeMap = null;
  if (curRegion) {
    for (const mid of curRegion.maps) {
      const m = MAPS.find(x => x.id === mid);
      if (m && m.monsters.length === 0) { safeMap = m.id; break; }
    }
  }
  if (!safeMap) safeMap = 'prontera'; // 兜底
  state.mapId = safeMap;
  reviveAlliesInTown();   // 被抬回城，隊友一起站起來（#83）
  resetRelicRevive();     // 牧師遺物的復活次數也一起回滿（#113）
  ensureCodex().maps[safeMap] = 1; // 被抬回城也算造訪過，這條路徑沒有經過 changeMap()
  state.hp = state.maxHp;
  state.sp = state.maxSp;
  state.attackAccumulator = 0;
  state.lastAttackTime = Date.now();
  recomputeDerived(false);
  logMsg('你恢復了意識，HP/SP 已全滿。');
  onTickUI();
  renderMapBackground();
  playMapMusic();
  if (typeof renderMapTab === 'function') renderMapTab();
}

/* ---------------- 經驗 / 升級 ----------------

   基礎等級上限與素質上限（#110／#111）。**轉了三轉才解鎖**——三轉本身是純外觀
   （沒有自己的技能，見 js/jobs.js 的 tier 3 區塊），它存在的意義就是這兩道門：

     基礎等級 99 → 200
     單項素質   99 → 130

   99 之後的每一級都要靠打寶模式才走得動——曲線就是照那個前提配的，
   見 data.js 的 expToNextBaseLevel()。 */
const BASE_LEVEL_CAP = 250;
const BASE_LEVEL_CAP_ADVANCED = 250;
const STAT_CAP = 99;
const STAT_CAP_ADVANCED = 130;
function isTier3(jobId) {
  const jd = JOB_TREE[jobId || (state && state.jobId)];
  return !!(jd && jd.tier >= 3);
}
function baseLevelCapOf(jobId) {
  const jd = JOB_TREE[jobId || (state && state.jobId)];
  const tier = jd?.tier ?? 0;
  if (tier >= 3) return BASE_LEVEL_CAP_ADVANCED;  // 3轉 250
  return 99;  // 1轉、2轉、進階二轉都 99
}
function statCapOf(jobId) {
  return isTier3(jobId) ? STAT_CAP_ADVANCED : STAT_CAP;
}

function gainExp(baseExp, jobExp) {
  /* 升級音效（#146）**整支只放一次**，不是每升一級放一次：
     離線回來可能一口氣升十幾級，一級一聲會疊成一串爆音。 */
  let leveled = false;
  state.baseExp += baseExp;
  const baseLevelCap = baseLevelCapOf();
  let need = expToNextBaseLevel(state.baseLevel);
  while (state.baseExp >= need && state.baseLevel < baseLevelCap) {
    leveled = true;
    state.baseExp -= need;
    state.baseLevel++;
    const gained = statPointsAtLevel(state.baseLevel);
    state.statPoints += gained;
    logMsg(`🎉 基礎等級提升到 ${state.baseLevel}！獲得 ${gained} 點屬性點。`);
    need = expToNextBaseLevel(state.baseLevel);
  }

  const job = currentJob();
  if (state.jobLevel < job.jobLevelMax) {
    state.jobExp += jobExp;
    // 職業經驗需求看階層（見 data.js 的 expToNextJobLevel）——一轉與二轉的曲線不同
    let jneed = expToNextJobLevel(state.jobLevel, job.tier);
    while (state.jobExp >= jneed && state.jobLevel < job.jobLevelMax) {
      state.jobExp -= jneed;
      state.jobLevel++;
      // 技能點歸入當前職業的點數池
      if (!state.jobSkillPoints) state.jobSkillPoints = {};
      if (!state.jobSkillPoints[state.jobId]) state.jobSkillPoints[state.jobId] = 0;
      state.jobSkillPoints[state.jobId]++;
      state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
      logMsg(`✨ 職業等級提升到 ${state.jobLevel}！獲得 1 點技能點（${currentJob().name}）。`);
      leveled = true;
      jneed = expToNextJobLevel(state.jobLevel, job.tier);
    }
    if (state.jobLevel >= job.jobLevelMax) { state.jobExp = 0; }
  }
  if (leveled && typeof playEventSfx === 'function') playEventSfx('levelup');
  recomputeDerived(false);
}

/* ================= 隊友（傭兵）系統 =================

   **隊友就是你自己其他存檔位的角色**，雇傭當下拷一份數值快照下來。
   快照制是整個設計最省事的地方：兩邊之後各玩各的，不必維護「這個角色現在
   被誰僱走了」的反向索引，也不會有同一個角色在兩處作戰的一致性問題。
   （參考專案 idle-lineage-class 是活連結，光是那份受僱登記就寫了約 200 行。）

   **戰鬥直接重用玩家那一套**：隊友快照本身就是一份完整的 `state`，
   `withAlly()` 把全域的 state 暫時換成它、跑 `playerAttack()`、再換回來。
   扣 SP、推 buff、進冷卻全部落在隊友自己身上，不會碰到主角。
   `recomputeDerived()` 是純計算（不存檔、不碰 UI），所以換身是安全的。

   換身有**兩個**必須處理的副作用：
     1. `state.monsters` 要跟主角共用同一個陣列，不然隊友打的是自己的空場
     2. 擊殺獎勵記在「當下的 state」上——隊友打死的怪，經驗金錢掉落會跑到
        隊友身上。用 `_allyActing` 旗標在 killMonster() 把它導回主角。
--------------------------------------------------------- */
const ALLY_MAX = 2;                       // 最多 2 名（使用者 2026-08-15 指定）
const ALLY_HIRE_PRICE_PER_LEVEL = 1000;   // 雇傭價 = 基礎等級 × 1000
const ALLY_REFRESH_DIVISOR = 3;           // 更新快照（不換人）只要三分之一
const ALLY_MERC_EXP_PCT = 20;             // 傭兵**額外**累積的經驗％（不從玩家那邊扣）
const ALLY_REVIVE_ITEM = 'leaf_of_yggdrasil';
const ALLY_DOWN_REVIVE_CD_SEC = 15;
const ALLY_MONSTER_TARGET_PLAYER_PCT = 60; // 怪 60% 打玩家，其餘平分給未倒地的隊友
const MERC_LEDGER_KEY = 'ro_idle_merc_ledger_v1';

/* 換身期間指向正在行動的隊友，平時是 null。
   killMonster() / addItem() 靠它把獎勵導回主角。 */
let _allyActing = null;
let _allyOwnerState = null;

/* 把 state 暫時換成某個隊友來跑 fn。saveGame() 在換身期間會自己跳過（見那邊的註解）。

   **收尾要還原成進來時的樣子，不能寫死 null（#105）**：這支是會巢狀呼叫的——
   祭司隊友放全體 buff 時，`shareBuffsWithAllies()` 會為了替另一位隊友重算衍生數值
   再 `withAlly()` 一次。內層寫死 `_allyActing = null` 的話，回到外層時旗標已經沒了：
   後半段的訊息會跑錯欄、獎勵導回錯人，而且 castSkill 尾端那次 `saveGame()`
   會失去保護，直接把隊友快照寫進玩家的存檔格。 */
function withAlly(ally, fn) {
  const saved = state;
  const savedActing = _allyActing;
  const savedOwner = _allyOwnerState;
  const savedMonsters = ally.monsters, savedMonster = ally.monster;
  ally.monsters = saved.monsters;      // 共用同一個場，隊友才打得到玩家面前的怪
  ally.monster = saved.monster;
  _allyActing = ally;
  // 巢狀時「真正的玩家」還是最外層那個，不是上一層的隊友
  _allyOwnerState = savedOwner || saved;
  /* 地圖也要跟著玩家（#109）。快照是整份複製過來的，`mapId` 停在**那個角色
     被存檔時所在的地圖**——通常是城鎮。換身期間 `isInTown()` 讀的就是這個欄位，
     所以 `wastesResourceInTown()` 會回「在城鎮，別浪費」，把隊友的加速術（吃 15 HP）、
     治癒術、場域類技能整批擋掉：實測祭司隊友放得出天使之賜福，加速術卻一次都放不出來。
     隊友本來就跟玩家在同一張圖，直接同步過去。 */
  ally.mapId = _allyOwnerState.mapId;
  state = ally;
  try { return fn(); } finally {
    state = saved;
    _allyActing = savedActing;
    _allyOwnerState = savedOwner;
    if (savedActing) {                 // 巢狀：把場的參考還原成內層進來前的樣子
      ally.monsters = savedMonsters;
      ally.monster = savedMonster;
    } else {
      ally.monsters = saved.monsters;  // 場的參考交還（存檔前由 saveGame 清掉）
      ally.monster = null;
    }
  }
}
// 換身中時的「真正的玩家」；沒換身就是 state 本身
function allyOwnerState() { return _allyOwnerState || state; }
// 用玩家的身分跑一段（換身中才有意義）
function withOwner(fn) {
  if (!_allyOwnerState) return fn();
  const cur = state;
  state = _allyOwnerState;
  try { return fn(); } finally { state = cur; }
}

/* 快照要瘦身：完整的 state 帶著背包、倉庫、圖鑑、成就，兩個隊友就會讓存檔爆掉。
   留下來的只有 recomputeDerived() 會讀的東西。 */
const ALLY_SNAPSHOT_DROP = ['inventory', 'warehouse', 'codex', 'achievements', 'log',
  'monsters', 'monster', 'dpsTracker', 'allies', 'autoSellItems', 'vendingItems'];
function buildAllySnapshot(raw, slot) {
  const ally = JSON.parse(JSON.stringify(raw));
  ALLY_SNAPSHOT_DROP.forEach(k => { delete ally[k]; });
  ally.inventory = [];                 // **必須是陣列**：state.inventory 全庫都當陣列用
  ally.buffs = []; ally.cooldowns = {};
  ally.monsters = null; ally.monster = null;
  ally.allies = [];
  ally._slot = String(slot);
  ally._allyName = raw.name || ('存檔' + slot);
  ally._downed = false;
  ally._reviveAt = 0;
  ally._atkAccum = 0;
  ally._lastAttackAt = 0;
  ally._pendingExp = 0;
  ally._pendingJobExp = 0;
  // 用玩家的 state 之外的一份 context 跑重算：換身進去算完再換回來
  const saved = state;
  state = ally;
  let ok = true;
  try { recomputeDerived(true); } catch (e) { ok = false; }
  state = saved;
  if (!ok) return null;
  ally.hp = ally.maxHp; ally.sp = ally.maxSp;
  return ally;
}

// 其他存檔格裡可以雇的角色
function allyHireCandidates() {
  const out = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (String(i) === String(currentSlot)) continue;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(getSlotKey(i)) || 'null'); } catch (e) { s = null; }
    if (!s || !s.jobId || !s.name) continue;
    const job = JOB_TREE[s.jobId];
    out.push({
      slot: String(i), name: s.name, jobId: s.jobId,
      jobName: job ? job.name : s.jobId, jobIcon: job ? job.icon : '❓',
      baseLevel: s.baseLevel || 1, jobLevel: s.jobLevel || 1,
      price: allyHirePrice(s.baseLevel || 1),
      hired: (state.allies || []).some(a => a && a._slot === String(i)),
    });
  }
  return out;
}
function allyHirePrice(level) { return Math.max(1000, (level || 1) * ALLY_HIRE_PRICE_PER_LEVEL); }
function allyList() { return state.allies || (state.allies = []); }
function allyAliveList() { return allyList().filter(a => a && !a._downed); }

function hireAlly(slot) {
  if (!inSafeZone()) { logMsg('⚠️ 只能在安全區雇傭隊友。'); return false; }
  const list = allyList();
  if (list.length >= ALLY_MAX) { logMsg(`⚠️ 隊友最多 ${ALLY_MAX} 名，請先讓一位退隊。`); return false; }
  if (list.some(a => a && a._slot === String(slot))) { logMsg('⚠️ 這位已經在隊上了。'); return false; }
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(getSlotKey(slot)) || 'null'); } catch (e) { raw = null; }
  if (!raw || !raw.jobId) { logMsg('⚠️ 那格存檔讀不到角色。'); return false; }
  const price = allyHirePrice(raw.baseLevel || 1);
  if (state.gold < price) { logMsg(`⚠️ 鋅幣不足，雇傭需要 ${price.toLocaleString()}。`); return false; }
  const ally = buildAllySnapshot(raw, slot);
  if (!ally) { logMsg('⚠️ 這個角色的資料算不出戰力，無法雇傭。'); return false; }
  state.gold -= price;
  list.push(ally);
  logMsg(`🤝 ${ally._allyName} 加入隊伍！（花費 ${price.toLocaleString()} 鋅幣）`);
  saveGame();
  return true;
}

/* 更新快照：同一個人，重新讀一次他現在的存檔。價錢三分之一。
   累積中的傭兵經驗要留著，不然更新一次就歸零。 */
function refreshAlly(slot) {
  if (!inSafeZone()) { logMsg('⚠️ 只能在安全區更新隊友。'); return false; }
  const list = allyList();
  const idx = list.findIndex(a => a && a._slot === String(slot));
  if (idx < 0) return false;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(getSlotKey(slot)) || 'null'); } catch (e) { raw = null; }
  if (!raw || !raw.jobId) { logMsg('⚠️ 那格存檔讀不到角色。'); return false; }
  const price = Math.ceil(allyHirePrice(raw.baseLevel || 1) / ALLY_REFRESH_DIVISOR);
  if (state.gold < price) { logMsg(`⚠️ 鋅幣不足，更新需要 ${price.toLocaleString()}。`); return false; }
  const fresh = buildAllySnapshot(raw, slot);
  if (!fresh) { logMsg('⚠️ 這個角色的資料算不出戰力。'); return false; }
  fresh._pendingExp = list[idx]._pendingExp || 0;
  fresh._pendingJobExp = list[idx]._pendingJobExp || 0;
  state.gold -= price;
  list[idx] = fresh;
  logMsg(`🔄 ${fresh._allyName} 的戰力已更新到最新狀態。（花費 ${price.toLocaleString()} 鋅幣）`);
  saveGame();
  return true;
}

// 退隊：把累積的傭兵經驗結進待領帳本，那格角色下次上線自動領取
function dismissAlly(slot) {
  const list = allyList();
  const idx = list.findIndex(a => a && a._slot === String(slot));
  if (idx < 0) return false;
  const ally = list[idx];
  mercLedgerAdd(ally._slot, ally._pendingExp || 0, ally._pendingJobExp || 0);
  list.splice(idx, 1);
  logMsg(`👋 ${ally._allyName} 離開了隊伍。`
    + ((ally._pendingExp || 0) > 0 ? `累積的 ${Math.round(ally._pendingExp).toLocaleString()} 經驗會在他自己上線時領取。` : ''));
  saveGame();
  return true;
}

/* ---- 傭兵待領帳本 ----
   **不直接寫別人的存檔格**。累積的經驗放在獨立的 key，那格角色下次
   loadGame() 時自己領走。直接改別人的存檔在多開時會互相蓋掉。 */
function mercLedgerRead() {
  try { return JSON.parse(localStorage.getItem(MERC_LEDGER_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function mercLedgerAdd(slot, baseExp, jobExp) {
  if (!(baseExp > 0) && !(jobExp > 0)) return;
  const led = mercLedgerRead();
  const cur = led[String(slot)] || { baseExp: 0, jobExp: 0 };
  cur.baseExp += Math.round(baseExp);
  cur.jobExp += Math.round(jobExp);
  led[String(slot)] = cur;
  try { localStorage.setItem(MERC_LEDGER_KEY, JSON.stringify(led)); } catch (e) { /* 略過 */ }
}
// 載入存檔時呼叫：把這格角色當傭兵賺到的經驗一次領走
function claimMercLedger() {
  const led = mercLedgerRead();
  const rec = led[String(currentSlot)];
  if (!rec || (!(rec.baseExp > 0) && !(rec.jobExp > 0))) return 0;
  delete led[String(currentSlot)];
  try { localStorage.setItem(MERC_LEDGER_KEY, JSON.stringify(led)); } catch (e) { /* 略過 */ }
  gainExp(rec.baseExp || 0, rec.jobExp || 0);
  logMsg(`📜 領取當傭兵期間累積的 ${Math.round(rec.baseExp || 0).toLocaleString()} 經驗與 ${Math.round(rec.jobExp || 0).toLocaleString()} 職業經驗。`);
  return rec.baseExp || 0;
}

/* ---- 隊友心跳 ----
   借慢心跳（每秒一次）跑，但攻擊次數照各自的攻擊間隔補齊，
   不然攻速再快也是一秒一下。 */
function alliesTick() {
  const list = allyList();
  if (!list.length || !state.monsters || !state.monsters.length) return;
  const now = Date.now();
  list.forEach(ally => {
    if (!ally) return;
    if (ally._downed) {
      /* 復活術（#95）優先：那是技能，不吃天地樹葉子也不必等倒地冷卻。
         冷卻中或 SP 不夠才輪到葉子那條路。 */
      if (!tryPriestReviveAlly(ally) && now >= (ally._reviveAt || 0)) tryAutoReviveAlly(ally);
      return;
    }
    tryAllyPotion(ally);        // 先喝水再打，免得這一輪就倒了
    tryAllySpPotion(ally);      // 藍水（#105）：要放技能就得有 SP
    ensureAllyAmmo(ally);       // 弓箭手隊友的箭由玩家供應
    /* 隊友的自動戰鬥（#105）。跟玩家跑的是**同兩支**函式，所以攻擊技能、
       輔助技能、SP 門檻、治癒術的 HP% 條件全部照玩家那套規則走，不另寫一份。

       跑在攻擊之前：先開 buff 再打，跟玩家的慢心跳順序一致。
       `withAlly` 期間 `saveGame()` 會自己跳過（見 saveGame 的註解）——
       castSkill 尾端就有一次，沒有那道保險這裡會把玩家的存檔蓋成隊友。 */
    try {
      withAlly(ally, () => {
        if (state.autoSkill) tryAutoCastSkill();
        tryAutoCastSupportSkills();
        /* 隊友自己掛上的場域效果也要跳（#131）。以前這段只長在 gameTick() 裡，
           而 gameTick 只跑玩家那一份——隊友祭司放的光耀之堂掛上去就沒人理，
           一跳都不會發生（放了完全沒作用，連他自己都沒回到血）。 */
        tickFieldEffects();
      });
    } catch (e) { console.error('隊友施法失敗', ally && ally._allyName, e); }
    if (ally._downed) return;   // 自傷類技能（聖十字審判、HP轉換）可能把自己放倒
    if (!ally._lastAttackAt) ally._lastAttackAt = now - 1000;
    ally._atkAccum = (ally._atkAccum || 0) + (now - ally._lastAttackAt);
    ally._lastAttackAt = now;
    const iv = Math.max(100, ally.attackInterval || 1000);
    let swings = 0;
    while (ally._atkAccum >= iv && swings < 20) {
      ally._atkAccum -= iv;
      swings++;
      if (!state.monsters.length) break;
      /* 一位隊友出錯不能拖垮其他人：例外從 withAlly 竄出來的話，
         forEach 會整個中斷，排在後面的隊友那一秒完全不會動。 */
      let hit = false;
      try { hit = withAlly(ally, () => playerAttack()); }
      catch (e) { console.error('隊友行動失敗', ally && ally._allyName, e); break; }
      // 真的打出去才給 UI 播動作（沒箭的弓箭手不該有攻擊動畫）
      if (hit) ally._swingAt = Date.now();
      if (ally._downed) break;
    }
  });
}

/* 弓箭手隊友要有箭才打得出去，而箭是**玩家供應**的（跟喝水同一個規則）。
   快照裡的 `equip.ammo` 是雇傭當下那個角色裝著的箭種，玩家背包不一定有；
   沒有的話就從玩家背包挑一種裝上。不處理的話畫面上一直播攻擊動作、
   戰鬥訊息卻只有「沒有箭矢」（使用者 2026-08-15 回報）。 */
function ensureAllyAmmo(ally) {
  if (!ally.equip) return;
  if (!isBowWeapon(ally.equip.weapon && ally.equip.weapon.item ? ally.equip.weapon.item : ally.equip.weapon)
      && !allyNeedsAmmo(ally)) return;
  const cur = ally.equip.ammo;
  if (cur && getItemQty(cur) > 0) return;
  const inv = state.inventory || [];
  const row = inv.find(r => !r.instanceId && isAmmoItem(r.item) && r.qty > 0);
  /* 玩家背包一種箭都沒有時**保留原本的箭種**（以前直接設成 null）。
     自動補箭要靠這個欄位才知道該買哪一種，設成 null 就沒有東西可買了。 */
  ally.equip.ammo = row ? row.item : (cur || ALLY_ARROW_FALLBACK);
}
function allyNeedsAmmo(ally) {
  const saved = state;
  state = ally;
  let need = false;
  try { need = needsAmmo(); } catch (e) { need = false; }
  state = saved;
  return need;
}

/* ---------------- 全體輔助技（#95）----------------

   祭司那七支寫著「全體」的輔助技（聖母之頌歌／幸運之頌歌／霸邪之陣／神威祈福／
   撒水祈福／聖之祈福／緩毒術）在技能資料上只是多一個 `party: true`。
   castSkill 那邊已經算出「這次施放新推了哪些 buff」，這裡把同一批複製給每位隊友。

   **複製而不是共用同一個物件**：兩邊的殘餘時間各自遞減，而且護盾類的 buff 會被
   打掉耐久——共用一個物件等於三個人合用一面盾，第一個人挨打就把全隊的盾磨光了。

   **隊友自己放的也算數（#105）**：以前這裡第一行是 `if (_allyActing) return;`，
   那是「隊友還不會施放技能」年代的保險絲。現在隊友跑完整的自動戰鬥，
   祭司隊友的聖母之頌歌當然要發給玩家與另一位隊友。
   不會無限廣播——這支只是**複製已經算好的 buff**，不會再觸發一次施放。 */
/* 對「隊上除了施術者以外的每個人」跑一段程式，期間 state 換成他們自己的（#131）。

   `shareBuffsWithAllies()` 只搬得動 buff 陣列，但有三支技能不是靠 buff 生效的：
     痊癒術   直接清 state.playerAil
     光耀之堂 每跳直接加 state.hp
     聖音     每跳隨機跑一個祝福函式，函式裡什麼都改

   這三支共通的解法是「**換身之後把同一段程式再跑一次**」——不必為了分享
   把它們全部改寫成 buff。換身的規則跟隊友自己戰鬥時同一套，所以
   `recomputeDerived()`、`logMsg()` 這些在裡面都會落在正確的人身上。

   倒地的人不算（跟 shareBuffsWithAllies 同一條規則）。 */
function forEachPartyMate(fn) {
  const actor = _allyActing;                  // null＝現在動的是玩家
  const owner = allyOwnerState();
  const mates = [];
  if (actor) mates.push(owner);
  (owner.allies || []).forEach(a => { if (a && !a._downed && a !== actor) mates.push(a); });
  mates.forEach(m => {
    if (m === owner) withOwner(() => fn(m));
    else withAlly(m, () => fn(m));
  });
  return mates;
}
// 顯示用：這些人在訊息裡怎麼稱呼
function partyMateNames(mates) {
  const owner = allyOwnerState();
  return mates.map(m => (m === owner ? '你' : m._allyName)).join('、');
}

function shareBuffsWithAllies(fresh, freshShields, sk) {
  if (!fresh.length && !freshShields.length) return;
  const caster = _allyActing;                 // null＝玩家自己放的
  const owner = allyOwnerState();             // 換身中時的「真正的玩家」
  /* 收 buff 的人＝全隊扣掉施術者自己（他那份在 castSkill 裡已經推好了）。
     隊友放的時候玩家也在收禮名單上，這就是以前少掉的那一半。 */
  const everyone = [];
  if (caster) everyone.push(owner);
  (owner.allies || []).forEach(a => { if (a && !a._downed && a !== caster) everyone.push(a); });
  /* 有些全體技**只對拿對武器的人生效**（#131）：官方的速度激發只讓隊上
     拿斧或鈍器的人加速，拿劍的站在旁邊也沒有用。施術者那邊已經被
     `requiresWeapon` 擋過一次了，這裡擋的是**收禮的人**。 */
  const gate = sk.partyRequiresWeapon;
  const targets = gate ? everyone.filter(tg => (tg === owner
    ? withOwner(() => weaponReqMet(gate))
    : withAlly(tg, () => weaponReqMet(gate)))) : everyone;
  if (!targets.length) return;
  const lv = skillLv(sk.id);
  targets.forEach(tg => {
    if (!Array.isArray(tg.buffs)) tg.buffs = [];
    if (!Array.isArray(tg.shields)) tg.shields = [];
    // 同一支技能重放時先清掉自己上一次推的，跟玩家那邊同一條規則
    tg.buffs = tg.buffs.filter(b => b.skillId !== sk.id);
    tg.shields = tg.shields.filter(sh => sh.id !== sk.id);
    /* 互斥組也要照做（#130）。演奏／舞蹈／合奏／元素領域同時只能開一個，
       施術者那邊 castSkill 會把同組的舊 buff 換掉，收禮的人這裡不做的話
       就會一路疊著——吹口哨換成刺客的黃昏，隊友身上會兩首歌同時在響。

       **不能只看 `b.exclusiveGroup`**：只有演奏那一類會把組別寫進 buff 物件，
       元素領域那批沒寫（施術者那邊是用別的規則換掉的）。所以兩條都查：
       buff 自己帶的組別，以及「推這個 buff 的技能」屬於哪一組。 */
    const grp = sk.exclusiveGroup;
    if (grp) {
      tg.buffs = tg.buffs.filter(b => {
        if (b.exclusiveGroup === grp) return false;
        const from = b.skillId && SKILLS[b.skillId];
        return !(from && from.exclusiveGroup === grp);
      });
    }
    fresh.forEach(b => tg.buffs.push(Object.assign({}, b)));
    /* 護盾的耐久要照**收禮那個人自己的** maxHp 重算——霸邪之陣寫的是「最大HP 的 12~30%」，
       照抄施術者那份的話，血薄的祭司會發給坦克一面只有自己血量三成的盾。 */
    freshShields.forEach(sh => {
      const cp = Array.isArray(sk.shieldCapacityPct) ? sk.shieldCapacityPct[lv - 1] : sk.shieldCapacityPct;
      const copy = Object.assign({}, sh);
      if (cp != null) copy.remainingHp = Math.round((tg.maxHp || 1) * cp / 100);
      tg.shields.push(copy);
    });
    /* 重算衍生數值。玩家那份要用**玩家的身分**跑（換身中就是 withOwner），
       隊友那份照舊換身進去；withAlly 是可以巢狀的（見它的註解）。 */
    if (tg === owner) withOwner(() => recomputeDerived(false));
    else withAlly(tg, () => recomputeDerived(false));
  });
  const names = targets.map(tg => (tg === owner ? '你' : tg._allyName)).join('、');
  pushCombatLog(`  → 「${sk.name}」同時給了 ${names}。`, 'ally');
}

/* 護盾抵擋（霸邪之陣／暗之障壁／冰刃之牆），回傳扣完之後還剩多少傷害。

   抽成獨立一支是因為隊友也會拿到霸邪之陣的盾（#95）——兩邊必須用**同一套**
   消耗規則（先過期再看耐久與次數、只吃第一面、破了就丟掉），
   不然「玩家的盾擋一次扣一次、隊友的盾永遠不破」這種事不會有人發現。 */
function absorbWithShields(holder, dmg, who, lane) {
  if (!holder.shields || !holder.shields.length) return dmg;
  const now = Date.now();
  holder.shields = holder.shields.filter(sh => now < sh.expiresAt && sh.remainingCharges > 0 && sh.remainingHp > 0);
  if (!holder.shields.length) return dmg;
  const sh = holder.shields[0];
  const absorbed = Math.min(dmg, sh.remainingHp);
  sh.remainingHp -= absorbed;
  sh.remainingCharges -= 1;
  const pre = who ? `${who} 的` : '';
  logMsg(`🛡️ ${pre}護盾抵擋了 ${absorbed} 點傷害！`, lane);
  if (sh.remainingCharges <= 0 || sh.remainingHp <= 0) {
    holder.shields.shift();
    logMsg(`🛡️ ${pre}護盾已破裂！`, lane);
  }
  return dmg - absorbed;
}

/* 隊友身上的 buff 也要倒數——`tickBuffs()` 只跑玩家那一份。

   **只在真的有東西過期時才重算衍生數值**：`recomputeDerived()` 是一千六百行的大函式，
   玩家已經每 100ms 跑一次，再乘上兩位隊友就是三倍成本。buff 沒變動時他們的數值
   也不會變，沒有必要重算。 */
function tickAllyBuffs() {
  allyList().forEach(ally => {
    if (!ally || !Array.isArray(ally.buffs) || !ally.buffs.length) return;
    const before = ally.buffs.length;
    ally.buffs = ally.buffs.filter(b => {
      b.msRemaining -= TICK_MS;
      return b.msRemaining > 0;
    });
    if (ally.buffs.length !== before) withAlly(ally, () => recomputeDerived(false));
  });
}

/* 隊友的冷卻也要倒數——`tickCooldowns()` 只跑玩家那一份，隊友的冷卻
   存的是 `ally.cooldowns`，沒人扣就永遠卡在原值，`skillReady()` 永遠 false，
   輔助技能只放得出第一發（每次雇傭一發），buff 時間到也不會補（#116）。 */
function tickAllyCooldowns() {
  allyList().forEach(ally => {
    if (!ally || !ally.cooldowns) return;
    Object.keys(ally.cooldowns).forEach(k => {
      ally.cooldowns[k] -= TICK_MS;
      if (ally.cooldowns[k] <= 0) delete ally.cooldowns[k];
    });
  });
}

/* ---------------- 隊伍支援技的施術者（#105）----------------

   復活術與治療術本來只認**玩家自己身上**的那一份：兩支都跑在玩家的 state 上、
   讀 `state.hasAutoRevive1` / `state.hasPartyAutoCure`。
   結果是「雇一個祭司當隊友，他的復活術與治療術完全不會作用」——
   使用者 2026-08-16 指定要讓隊友那份也算數。

   施術者名單 = 玩家 + 還站著的隊友。**倒地的隊友不能施術**（他自己都躺著了），
   所以復活術不會出現「倒地的祭司自己把自己扶起來」。
   冷卻與 SP 記在**各自身上**：兩個祭司就是兩份，這跟官方一樣是兩個人各放各的。 */
function partySupportCasters() {
  const out = [state];
  allyList().forEach(a => { if (a && !a._downed) out.push(a); });
  return out;
}
// 施術者的稱呼（玩家沒有 _allyName）
function casterName(c) { return c === state ? '你' : (c._allyName || '隊友'); }

/* 復活術（#95）：使用者指定改成「全隊有人倒下就自動扶起」。

   跟自己那半邊（`tryAutoRevive()`）**共用同一個冷卻與 SP 消耗**——官方就是同一支技能，
   分成兩份冷卻等於憑空多一次復活。回血量、SP 消耗、冷卻全部沿用技能表的原值。
   扶起隊友不吃天地樹葉子，也不必等倒地 15 秒的冷卻——那是葉子那條路的規則。 */
function tryPriestReviveAlly(ally) {
  if (!ally || !ally._downed) return false;
  const now = Date.now();
  // 玩家優先（他的技能等級通常最高），再輪到還站著的隊友
  for (const c of partySupportCasters()) {
    if (c === ally) continue;                       // 倒地的人不會出現在名單裡，保險
    if (!c.hasAutoRevive1) continue;
    if (now < (c.autoRevive1ReadyAt || 0)) continue;
    const cost = c.autoRevive1SpCost || 0;
    if (c.sp < cost) continue;
    c.sp -= cost;
    c.autoRevive1ReadyAt = now + c.autoRevive1CooldownSec * 1000;
    ally._downed = false;
    ally._reviveAt = 0;
    ally.hp = Math.max(1, Math.round(ally.maxHp * c.autoRevive1HpPct / 100));
    ally.sp = ally.maxSp;
    ally._atkAccum = 0; ally._lastAttackAt = 0;
    const by = c === state ? '' : `（${c._allyName}）`;
    logMsg(`✨ 復活術發動${by}！扶起了 ${ally._allyName}（HP ${c.autoRevive1HpPct}%）。`);
    return true;
  }
  return false;
}

/* 自動補隊友的箭（#93）。**不能靠玩家那支 `tryAutoBuyArrow()`**：那支第一行就問
   `needsAmmo()`，問的是玩家自己有沒有拿弓——玩家是騎士、隊友是獵人的時候永遠是 false，
   箭用完就再也不會補，隊友從此站著不動。

   買的是玩家的箭（隊友本來就吃玩家的補給），所以整支在玩家的 state 底下跑，
   不需要 withAlly。箭種以隊友身上那把弓配的為準；那種箭商店沒賣就退回鋼鐵箭矢
   （商店買得到的裡面 ATK 最高的一種）。 */
const ALLY_ARROW_FALLBACK = 'steel_arrow';
const AUTO_BUY_ALLY_ARROW_QTY = 500;
const AUTO_BUY_ALLY_ARROW_THRESHOLD = 50;
// 隊友身上那把弓現在配的箭種（沒有就用退路），UI 顯示存量也用這支
function allyAmmoId(ally) {
  const id = ally && ally.equip ? ally.equip.ammo : null;
  const def = id ? ITEMS[id] : null;
  return (def && def.buyPrice) ? id : ALLY_ARROW_FALLBACK;
}
function allyArrowUsers() {
  return allyList().filter(a => allyNeedsAmmo(a));
}
function tryAutoBuyAllyArrow() {
  if (!state.autoBuyAllyArrow) return;
  allyArrowUsers().forEach(ally => {
    const id = allyAmmoId(ally);
    const def = ITEMS[id];
    if (!def || !def.buyPrice) return;
    if (getItemQty(id) > AUTO_BUY_ALLY_ARROW_THRESHOLD) return;
    const unit = Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1)));
    if (state.gold < unit * AUTO_BUY_ALLY_ARROW_QTY) return;
    buyItem(id, AUTO_BUY_ALLY_ARROW_QTY);
  });
}
function setAutoBuyAllyArrow(v) { state.autoBuyAllyArrow = !!v; saveGame(); }

/* 隊友承傷。倒地的不列入分配，那 20% 要退回玩家——
   不然隊友一死怪的攻擊就憑空少掉，變成「死光反而安全」。
   十字軍犧牲：有該 buff 的隊友優先被攻擊（65%~80%）。 */
function pickMonsterTarget() {
  const alive = allyAliveList();
  if (!alive.length) return null;
  // 找有犧牲 buff 的隊友
  const devotionAlly = alive.find(a => {
    const b = (a.buffs || []).find(x => x.type === 'devotion' && (x.msRemaining || 0) > 0);
    return b ? b.targetPlayerPct : 0;
  });
  if (devotionAlly) {
    const b = devotionAlly.buffs.find(x => x.type === 'devotion');
    const pct = b ? b.targetPlayerPct : 75;
    if (Math.random() * 100 < pct) return devotionAlly;
  }
  // 基礎機率：打玩家 60%，其餘平分給隊友（含牧師遺物加成）
  if (Math.random() * 100 < relicPlayerTargetPct()) return null;
  return alive[Math.floor(Math.random() * alive.length)];
}

function allyTakeDamage(ally, dmg, sourceName) {
  ally.hp = Math.max(0, (ally.hp || 0) - Math.max(1, Math.round(dmg)));
  if (ally.hp <= 0 && !ally._downed) {
    ally._downed = true;
    ally._reviveAt = Date.now() + ALLY_DOWN_REVIVE_CD_SEC * 1000;
    logMsg(`💀 ${ally._allyName} 被${sourceName || '敵人'}擊倒了！`);
  }
  return dmg;
}

// 用天地樹葉子把倒地的隊友扶起來（自動購買由 tryAutoBuyReviveLeaf 負責補貨）
function reviveAlly(ally, silent) {
  if (!ally || !ally._downed) return false;
  if (getItemQty(ALLY_REVIVE_ITEM) < 1) {
    if (!silent) logMsg(`⚠️ 沒有${ITEMS[ALLY_REVIVE_ITEM].name}，無法扶起 ${ally._allyName}。`);
    return false;
  }
  removeItem(ALLY_REVIVE_ITEM, 1);
  ally._downed = false;
  ally.hp = Math.max(1, Math.round(ally.maxHp * 0.5));
  ally.sp = ally.maxSp;
  ally._atkAccum = 0; ally._lastAttackAt = 0;
  logMsg(`🍃 用${ITEMS[ALLY_REVIVE_ITEM].name}扶起了 ${ally._allyName}（HP 50%）。`);
  return true;
}
// 面板上那顆「扶起」用的：照存檔格找人
function reviveAllyBySlot(slot) {
  const a = allyList().find(x => x && x._slot === String(slot));
  if (!a) return false;
  const ok = reviveAlly(a);
  if (ok) saveGame();
  return ok;
}
function tryAutoReviveAlly(ally) {
  if (!state.autoReviveAlly) return false;
  return reviveAlly(ally, true);
}
// 回安全區時全隊免費滿血復活
function reviveAlliesInTown() {
  allyList().forEach(a => {
    if (!a) return;
    a._downed = false; a._reviveAt = 0;
    a.hp = a.maxHp; a.sp = a.maxSp;
    a._atkAccum = 0; a._lastAttackAt = 0;
  });
}
/* 隊友喝水：喝的是**玩家背包裡**的藥水（快照沒有自己的背包）。
   走跟玩家同一組 ITEMS 欄位（heal / healPct），但回的是隊友的 HP。
   `useItem()` 不能直接用——那支會把回復量算在當下的 state 上，
   而我們要的是「從玩家背包扣一瓶、補到隊友身上」。 */
const ALLY_POTION_FALLBACK = 'red_potion';
/* 隊友的自然回復（#105）。以前隊友的 HP/SP **完全不會自己回**——
   只有雇傭當下、被扶起、回城鎮這三個時機補滿，中間全靠灌藥水。
   SP 更慘：沒有藍水那條路，放完就是放完。
   使用者 2026-08-16 指定「給隊友自然回復」，直接借玩家那一支
   `passiveRegen()` 換身跑，公式與放置加速倍率完全一致，不另開一套。 */
function tickAllyRegen() {
  allyList().forEach(a => {
    if (!a || a._downed) return;
    try { withAlly(a, () => passiveRegen()); }
    catch (e) { console.error('隊友自然回復失敗', a && a._allyName, e); }
  });
}

function allyPotionHeal(def, ally) {
  let amt = 0;
  if (def.heal) amt += def.heal;
  if (def.healPct) amt += Math.round(ally.maxHp * def.healPct / 100);
  return amt;
}
function tryAllyPotion(ally) {
  const cfg = state.allyPotion || {};
  if (!cfg.enabled) return false;
  if (ally._downed) return false;
  const pct = (cfg.hpThreshold || 50) / 100;
  if (ally.hp >= ally.maxHp * pct) return false;
  const ids = [cfg.primary, cfg.fallback || ALLY_POTION_FALLBACK].filter(Boolean);
  for (const id of ids) {
    const def = ITEMS[id];
    if (!def) continue;
    if (getItemQty(id) <= 0 && state.autoBuyAllyPotion && def.buyPrice) {
      const unit = Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1)));
      if (state.gold >= unit * AUTO_BUY_QTY) buyItem(id, AUTO_BUY_QTY);
    }
    if (getItemQty(id) <= 0) continue;
    const amt = allyPotionHeal(def, ally);
    if (amt <= 0) continue;
    removeItem(id, 1);
    const before = ally.hp;
    ally.hp = Math.min(ally.maxHp, ally.hp + amt);
    pushCombatLog(`  → ${ally._allyName} 喝了${def.name}，回復 ${Math.round(ally.hp - before)} 點HP。`, 'ally');
    return true;
  }
  return false;
}
function setAllyPotionCfg(key, value) {
  if (!state.allyPotion) state.allyPotion = { enabled: true, primary: '', fallback: ALLY_POTION_FALLBACK, hpThreshold: 50 };
  state.allyPotion[key] = value;
  saveGame();
}
function setAutoBuyAllyPotion(v) { state.autoBuyAllyPotion = !!v; saveGame(); }

/* 隊友的藍水（#105）。隊友開始自己放技能之後 SP 就是消耗品了，
   結構完全比照上面的紅水：玩家背包供應、門檻可調、沒了自動買。 */
const ALLY_SP_POTION_FALLBACK = 'blue_potion';
const AUTO_BUY_ALLY_SP_QTY = 100;
function allyPotionSpRestore(def, ally) {
  let amt = 0;
  if (def.restoreSp) amt += def.restoreSp;
  if (def.restoreSpPct) amt += Math.round(ally.maxSp * def.restoreSpPct / 100);
  return amt;
}
function tryAllySpPotion(ally) {
  const cfg = state.allySpPotion || {};
  if (!cfg.enabled) return false;
  if (ally._downed) return false;
  const pct = (cfg.spThreshold || 30) / 100;
  if (ally.sp >= ally.maxSp * pct) return false;
  const ids = [cfg.primary, cfg.fallback || ALLY_SP_POTION_FALLBACK].filter(Boolean);
  for (const id of ids) {
    const def = ITEMS[id];
    if (!def) continue;
    if (getItemQty(id) <= 0 && state.autoBuyAllySpPotion && def.buyPrice) {
      const unit = Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1)));
      if (state.gold >= unit * AUTO_BUY_ALLY_SP_QTY) buyItem(id, AUTO_BUY_ALLY_SP_QTY);
    }
    if (getItemQty(id) <= 0) continue;
    const amt = allyPotionSpRestore(def, ally);
    if (amt <= 0) continue;
    removeItem(id, 1);
    const before = ally.sp;
    ally.sp = Math.min(ally.maxSp, ally.sp + amt);
    pushCombatLog(`  → ${ally._allyName} 喝了${def.name}，回復 ${Math.round(ally.sp - before)} 點SP。`, 'ally');
    return true;
  }
  return false;
}
function setAllySpPotionCfg(key, value) {
  if (!state.allySpPotion) state.allySpPotion = { enabled: true, primary: '', fallback: ALLY_SP_POTION_FALLBACK, spThreshold: 30 };
  state.allySpPotion[key] = value;
  saveGame();
}
function setAutoBuyAllySpPotion(v) { state.autoBuyAllySpPotion = !!v; saveGame(); }

// 自動購買天地樹葉子：抄 tryAutoBuyArrow 的形狀（低於門檻就補貨、錢不夠就安靜跳過）
const AUTO_BUY_LEAF_THRESHOLD = 2;
const AUTO_BUY_LEAF_QTY = 5;
function tryAutoBuyReviveLeaf() {
  if (!state.autoBuyReviveLeaf) return;
  if (!allyList().length) return;
  if (getItemQty(ALLY_REVIVE_ITEM) > AUTO_BUY_LEAF_THRESHOLD) return;
  const def = ITEMS[ALLY_REVIVE_ITEM];
  if (!def || !def.buyPrice) return;
  const unit = Math.max(1, Math.round(def.buyPrice * (state.shopDiscountMult || 1)));
  if (state.gold < unit * AUTO_BUY_LEAF_QTY) return;
  buyItem(ALLY_REVIVE_ITEM, AUTO_BUY_LEAF_QTY);
}
function setAutoBuyReviveLeaf(v) { state.autoBuyReviveLeaf = !!v; saveGame(); }
function setAutoReviveAlly(v) { state.autoReviveAlly = !!v; saveGame(); }

/* 怪打隊友。**跟玩家走完全同一組公式**：
     怪物攻擊力  monsterBaseAtk()      —— ATK×(0.8~1.2) + mobSTR + 等級，含怪自己的增益
     迴避        dodgeChancePctFromMonster(隊友FLEE, …)
     減傷        mitigatePlayerIncoming(raw, 隊友硬防, 隊友軟防)  —— 官方 (4000+DEF)/(4000+10DEF)

   第一版自己另外寫了一條 `raw × (1 − DEF/100) − 軟防`，跟玩家那條完全不同曲線，
   同一隻怪打玩家跟打隊友的數字對不起來（使用者 2026-08-15 反映「看不太懂」）。

   **刻意不套的**：玩家的完全迴避／格擋／反射／光之盾、以及卡片的種族／屬性／體型減傷。
   那些是玩家自己的裝備與被動，隊友有沒有要看他自己的快照——目前只吃
   隊友自己的 FLEE 與 DEF，其餘等第五階段（輔助共享）再談。 */
function monsterAttackAlly(mon, monDef, ally) {
  const dodge = dodgeChancePctFromMonster(ally.flee || 0, monDef, 0);
  if (Math.random() * 100 < dodge) {
    pushCombatLog(`  → ${ally._allyName} 迴避了 ${monDef.name} 的攻擊！`, 'ally');
    if (typeof renderLog === 'function') renderLog();
    return;
  }
  const raw = monsterBaseAtk(monDef, undefined, mon) * ailAtkMult(mon);
  /* 「至少 1 點」要**卡在護盾之前**——跟玩家那條路徑同一個順序。
     擺在後面的話護盾擋光了還是會扣 1 點血，盾等於白擋（實測隊友擋掉全部傷害
     仍然每下掉 1 滴血）。 */
  let dmg = Math.max(1, Math.round(mitigatePlayerIncoming(raw, ally.defHard || 0, ally.defSoft || 0)));
  // 霸邪之陣分給隊友的盾（#95）：跟玩家走完全同一套消耗規則
  dmg = absorbWithShields(ally, dmg, ally._allyName, 'ally');
  if (dmg > 0) allyTakeDamage(ally, dmg, monDef.name);
  pushCombatLog(`  → ${monDef.name} 攻擊 ${ally._allyName}，造成 ${dmg} 點傷害！`, 'ally');
  if (typeof renderLog === 'function') renderLog();
}

/* ---------------- GM 測試（只在安全區的面板上按得到）----------------
   經驗曲線改成 1/2/3 小時之後，要驗個高等的東西得先掛機半天，
   所以開兩個直接跳關的按鈕。**不是給玩家的功能**，按鈕本身
   由 renderGmPanel() 控制成只有在安全區才出現。
   等級走的是跟 gainExp() 同一條升級路徑（素質點照 statPointsAtLevel 給），
   直接把 baseLevel 設過去的話素質點會漏發。 */
const GM_LEVEL_STEP = 50;
const GM_GOLD_STEP = 1000000;
function gmAddLevels(n) {
  const cap = baseLevelCapOf();   // 進階二轉是 200（#110）
  let gained = 0, got = 0;
  const want = n || GM_LEVEL_STEP;
  while (gained < want && state.baseLevel < cap) {
    state.baseLevel++; gained++;
    got += statPointsAtLevel(state.baseLevel);
  }
  state.statPoints += got;
  state.baseExp = 0;
  recomputeDerived(true);
  state.hp = state.maxHp; state.sp = state.maxSp;
  logMsg(gained
    ? `🛠️ GM：基礎等級 +${gained} → ${state.baseLevel}，獲得 ${got} 點屬性點。`
    : `🛠️ GM：已經是最高等級 ${cap} 了。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return gained;
}
/* 職業等級直接拉滿（#98）。技能點走跟 gainExp() 同一條路徑——
   直接把 jobLevel 設過去的話技能點會漏發，那才是拉滿最想要的東西。 */
function gmMaxJobLevel() {
  const job = currentJob();
  const cap = job.jobLevelMax || 50;
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  let got = 0;
  while (state.jobLevel < cap) {
    state.jobLevel++;
    got++;
    state.jobSkillPoints[state.jobId] = (state.jobSkillPoints[state.jobId] || 0) + 1;
  }
  state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
  state.jobExp = 0;
  recomputeDerived(true);
  logMsg(`🛠️ GM：${job.name} 職業等級 → ${state.jobLevel}（+${got} 點技能點）。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return state.jobLevel;
}

function gmAddGold(n) {
  const amount = n || GM_GOLD_STEP;
  state.gold += amount;
  logMsg(`🛠️ GM：鋅幣 +${amount.toLocaleString()} → ${state.gold.toLocaleString()}。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return state.gold;
}
/* 測試用：一次拿 100 張遺物券。券換出來的是「指定套裝的隨機一件」，
   所以這一顆就能把兩套遺物都湊齊，不必真的去刷 0.1%。 */
const GM_RELIC_TICKETS = 100;
function gmAddRelicTickets(n) {
  const amount = n || GM_RELIC_TICKETS;
  addItem(RELIC_TICKET_ID, amount);
  logMsg(`🛠️ GM：遺物券 +${amount} → ${getItemQty(RELIC_TICKET_ID)} 張。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return getItemQty(RELIC_TICKET_ID);
}
/* 隱藏圖鑑（神秘箱挑戰）測試用：
   ① gmBoxCodexBatch(n) —— 把「還沒開出過」的池子道具**真的取得**進背包並記到隱藏圖鑑，
      一次一批（預設 100、上限 500），避免上萬件一次灌進來把瀏覽器弄掛。
      回傳剩餘件數；跑到回傳 0 就是全收集。
   ② gmUnlockHiddenCodex() —— 只把三大收集的圖鑑**記錄**灌滿（不發任何道具），
      純粹為了解鎖隱藏分頁來查看。 */
function gmBoxCodexBatch(n) {
  const batch = Math.min(Math.max(1, n || 100), 500);
  const c = ensureCodex();
  const missing = getBoxCodexPool().filter(id => !c.box[id]);
  if (!missing.length) {
    logMsg('🛠️ GM：隱藏圖鑑（神秘箱挑戰）已全收集，沒有剩餘。');
    saveGame();
    return 0;
  }
  const take = missing.slice(0, batch);
  take.forEach(id => { addItem(id, 1); codexRecordBox(id); });
  const remain = missing.length - take.length;
  logMsg(`🛠️ GM：隱藏圖鑑批次取得 ${take.length} 件（剩餘 ${remain}／總池 ${getBoxCodexPool().length}）。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return remain;
}
function gmUnlockHiddenCodex() {
  const pool = getCodexPool();
  const c = ensureCodex();
  pool.monsters.forEach(id => { c.seen[id] = 1; c.mon[id] = (c.mon[id] || 0) + 1; });
  pool.cards.forEach(id => { if (ITEMS[id]) c.item[id] = (c.item[id] || 0) + 1; });
  pool.items.forEach(id => { c.item[id] = (c.item[id] || 0) + 1; });
  const prog = getCodexProgress();
  logMsg(`🛠️ GM：三大收集記錄已灌滿（怪 ${prog.monsters.total}／卡 ${prog.cards.total}／道 ${prog.items.total}），隱藏圖鑑解鎖。`);
  saveGame();
  if (typeof renderAll === 'function') renderAll();
  return true;
}

/* ---------------- 屬性加點 ----------------
   兩條公式皆採用 RO 正式版對照表（巴哈姆特/RO Wiki 公開資料）換算：
     每級獲得素質點 = floor((等級-1)/5) + 3   （36~40級每級10點、41~45級每級11點...，與官方對照表一致）
     加點所需素質點 = 2 + floor((目前數值-1)/10)（1→2 花2點、10→11花2點、11→12花3點...與官方2~11/12~21...對照表一致）
------------------------------------------------- */
function statPointsAtLevel(level) {
  return Math.floor((level - 1) / 5) + 3;
}
/* 加點成本。100 以下是官方那條「每 10 點漲 1」（`floor((N−1)/10)+2`），
   **100 以上另有一張表**（使用者 2026-08-16 給的官方數字，#112）：

     現值 101~105 → 每點 16      現值 116~120 → 每點 28
     現值 106~110 → 每點 20      現值 121~125 → 每點 32
     現值 111~115 → 每點 24      現值 126~130 → 每點 36

   參數是「目前的素質值」，回傳的是**再加 1 點**要花多少——所以 current=100 走的
   還是舊公式（11 點），第一次吃到 16 是 101→102。
   接得上：舊公式在 91~100 這一段算出來就是 11，跟使用者給的「92~100 每點 11」一致。

   代價差距很大：單項 1→99 共 628 點，1→130 要 1,394 點（後面那 31 點就花掉 766 點，
   光是 121→130 就佔 304 點）。Lv200 一路升上來總共拿得到 4,497 點，
   剛好夠把**三項多一點**點到 130——所以 130 這條線本來就不是每項都點得滿，這是刻意的。 */
const STAT_COST_HIGH = [
  [105, 16], [110, 20], [115, 24], [120, 28], [125, 32], [130, 36],
];
function statPointCost(currentValue) {
  if (currentValue <= 100) return 2 + Math.floor((currentValue - 1) / 10);
  for (const [cap, cost] of STAT_COST_HIGH) if (currentValue <= cap) return cost;
  return STAT_COST_HIGH[STAT_COST_HIGH.length - 1][1];
}

/* ---- 素質洗點（#120）----
   收 10 萬鋅幣，把加過的點全部退回來重點。

   退幾點是**照當初實際花掉的算**，不是照現在的數值乘一個係數——
   加點成本是階梯式的（101 以上另一張表，見 statPointCost），
   用係數估會退多退少，退多了就是無限增點的漏洞。
   所以從 1 一路加到目前值，把每一階的成本加起來，那就是真正花掉的總額。 */
const STAT_RESET_COST_ZENY = 100000;
function statPointsSpentOn(value) {
  let total = 0;
  for (let v = 1; v < value; v++) total += statPointCost(v);
  return total;
}
function statResetRefund() {
  return BASE_STAT_KEYS.reduce((sum, k) => sum + statPointsSpentOn(state.stats[k] || 1), 0);
}
function statResetBlockReason() {
  if (state.gold < STAT_RESET_COST_ZENY) {
    return `鋅幣不足，需要 ${STAT_RESET_COST_ZENY.toLocaleString()}z。`;
  }
  if (statResetRefund() <= 0) return '你還沒有加過任何素質點。';
  return null;
}
function resetStats() {
  if (statResetBlockReason()) return false;
  const refund = statResetRefund();
  state.gold -= STAT_RESET_COST_ZENY;
  BASE_STAT_KEYS.forEach(k => { state.stats[k] = 1; });
  state.statPoints += refund;
  recomputeDerived(true);
  /* 素質歸零之後最大 HP/SP 會掉，目前值要跟著夾——
     不夾的話會出現 HP 12000/3000 這種畫面（而且回血邏輯會以為滿血） */
  state.hp = Math.min(state.hp, state.maxHp);
  state.sp = Math.min(state.sp, state.maxSp);
  logMsg(`🔄 素質洗點完成！退回 ${refund} 點素質點，花費 ${STAT_RESET_COST_ZENY.toLocaleString()}z。`);
  saveGame();
  return true;
}

function allocateStat(key) {
  const statCap = statCapOf();   // 三轉 130、其餘 99（#111）
  if (state.stats[key] >= statCap) return false;
  const cost = statPointCost(state.stats[key]);
  if (state.statPoints < cost) return false;
  state.stats[key]++;
  state.statPoints -= cost;
  recomputeDerived(false);
  saveGame();
  return true;
}

/* ---------------- 技能 ---------------- */
function levelUpSkill(skillId) {
  // 搜尋所有已解鎖職業的技能
  const sk = findSkillById(skillId);
  if (!sk) return false;
  if (sk.isQuest) return false;
  const currentLv = state.learnedSkills[skillId] || 0;
  if (currentLv >= sk.maxLv) return false;

  /* 前置技能檢查。`requires` 可以是一個 `{skillId, level}`，也可以是一個陣列——
     官方有不少技能是**兩個以上**的前置（智者的薄霧牆要風＋水兩個元素領域、
     速讀術要三個），寫成陣列才表達得出來。單一物件的舊寫法照舊，不用改既有的 48 筆。 */
  const reqList = sk.requires ? (Array.isArray(sk.requires) ? sk.requires : [sk.requires]) : [];
  for (const req of reqList) {
    if ((state.learnedSkills[req.skillId] || 0) >= req.level) continue;
    const reqSk = findSkillById(req.skillId);
    logMsg(`⚠️ 需要先學習「${reqSk ? reqSk.name : req.skillId}」Lv${req.level}！`);
    return false;
  }

  // 找出這個技能所屬的職業
  const skillJobId = findSkillJob(skillId);
  if (!skillJobId) return false;

  // 檢查該職業（含共用池的夥伴）的技能點是否足夠
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  let paidJob = spendSkillPoint(skillJobId);
  // 一轉借來的招（法師/服事）源池為 0 時，回退到現職的共用池，避免轉職後點了卻點不動
  if (!paidJob && skillJobId !== state.jobId) {
    const cur = JOB_TREE[state.jobId];
    if (cur && cur.borrowedFrom && cur.borrowedFrom[skillId]) {
      paidJob = spendSkillPoint(state.jobId);
    }
  }
  // 3轉多餘點可點1轉技能：若現職為3轉且該技能為血脈祖先，則從現職池扣點
  if (!paidJob && (JOB_TREE[state.jobId]?.tier || 0) >= 3) {
    let cur = JOB_TREE[state.jobId];
    let isAncestor = false;
    while (cur) { if (cur.id === skillJobId) { isAncestor = true; break; } cur = JOB_TREE[cur.parent]; }
    if (isAncestor) paidJob = spendSkillPoint(state.jobId);
  }
  if (!paidJob) {
    logMsg(`⚠️ ${JOB_TREE[skillJobId].name} 的技能點不足！`);
    return false;
  }

  state.learnedSkills[skillId] = currentLv + 1;
  state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
  logMsg(`${sk.name} 升級至 Lv${currentLv + 1}！（${JOB_TREE[paidJob].name} 技能點 -1）`);
  recomputeDerived(true);
  saveGame();
  return true;
}

/* ---------------- 二轉與進階二轉共用技能點池（#101） ----------------

   使用者 2026-08-15 指定：「職業2跟2.5 技能點應該是通用的 沒有限定只能點2或2.5」。

   進階二轉用 `borrowSkillsFrom` 把二轉的技能整份借過來，官方也是同一棵樹，
   但技能點是照職業分池的。分開的後果是**兩邊的點數會互相卡住**：
     · 二轉階段沒點完的點數 → 那些技能現在判給進階二轉（findSkillJob 現職優先），
       扣的是進階二轉的池子，二轉剩下的點數永遠花不掉
     · 進階二轉的點數 → 只花得動同一棵樹，但玩家想補二轉的招時看到的是「技能點 0」

   合併只發生在**花點數**的時候；發點數（earnedSkillPoints）照舊各算各的，
   所以 resetSkills() 的上限修復邏輯不受影響。 */
function skillPointPoolJobs(jobId) {
  const jd = JOB_TREE[jobId];
  if (!jd) return [jobId];
  const out = [jobId];
  /* 二轉 / 進階二轉 / 三轉是同一條線上的同一個池（#101、#111）。
     三轉沒有自己的技能，職業等級發的點數要花得掉就得併進來，
     不然轉了三轉之後每升一級都拿到一點永遠用不到的技能點。 */
  const lineage = j2 => {
    const out2 = [];
    let cur = JOB_TREE[j2];
    while (cur && cur.tier >= 2) { out2.push(cur.id); cur = JOB_TREE[cur.parent]; }
    return out2;
  };
  if (jd.tier >= 2) {
    lineage(jobId).forEach(id => { if (!out.includes(id)) out.push(id); });
    // 往下找：以這條線為母職的更高階職業也算同一個池
    Object.values(JOB_TREE).forEach(j => {
      if (j.tier > 2 && lineage(j.id).includes(jobId) && !out.includes(j.id)) out.push(j.id);
    });
  }
  // 3轉多餘點可點1轉技能：把整條血脈（含1轉/初心者）也併入
  if (jd.tier >= 3) {
    let cur = JOB_TREE[jd.parent];
    while (cur) { if (!out.includes(cur.id)) out.push(cur.id); cur = JOB_TREE[cur.parent]; }
  }
  return out;
}

// 這個職業實際可動用的技能點（含共用池）
function skillPointsAvailable(jobId) {
  const pts = state.jobSkillPoints || {};
  let avail = skillPointPoolJobs(jobId).reduce((n, j) => n + (pts[j] || 0), 0);
  // 3轉多餘點可點1轉：若查詢的是祖先職業且現職為3轉，回退顯示現職池
  if (avail === 0 && jobId !== state.jobId && (JOB_TREE[state.jobId]?.tier || 0) >= 3) {
    let cur = JOB_TREE[state.jobId];
    while (cur) {
      if (cur.id === jobId) { avail = skillPointPoolJobs(state.jobId).reduce((n, j) => n + (pts[j] || 0), 0); break; }
      cur = JOB_TREE[cur.parent];
    }
  }
  return avail;
}

/* 扣一點，回傳實際扣到哪個職業的池子（扣不到回 null）。
   先扣自己的、再扣夥伴的——這樣「先花完現在這個職業的點」的直覺不變。 */
function spendSkillPoint(jobId) {
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  for (const j of skillPointPoolJobs(jobId)) {
    if ((state.jobSkillPoints[j] || 0) > 0) { state.jobSkillPoints[j]--; return j; }
  }
  return null;
}

// 找出技能所屬的職業 ID
function findSkillJob(skillId) {
  /* 找「真正擁有這招」的職業——自己的技能才是自己的，借來的不算。

     舊版「現職優先」會把借來的招全判給最上層職業（修羅借走整條線、
     十字刺客借走刺客），導致一轉（服事/法師）的點被算進二轉的池子，
     重置後一轉那格歸零、一轉點數有卻點不動（#121 法師系同例）。
     改為先找真主（`borrowedFrom` 排除），找不到（超級新手借了未學職業）
     才退回現職/沿線掃描。 */
  const isOwn = j => (j.skills || []).some(s => s.id === skillId && !(j.borrowedFrom || {})[s.id]);
  const cur = JOB_TREE[state.jobId];
  if (cur && isOwn(cur)) return state.jobId;
  const allJobs = getAllLearnedJobs();
  for (const jobId of allJobs) {
    const job = JOB_TREE[jobId];
    if (!job) continue;
    if (isOwn(job)) return jobId;
  }
  for (const jobId of allJobs) {
    const job = JOB_TREE[jobId];
    if (!job) continue;
    if (job.skills.find(s => s.id === skillId)) return jobId;
  }
  return null;
}

/* 這個職業「應該」有多少技能點——技能點的唯一真相來源。

   來源只有兩個：職業等級每升 1 級給 1 點（所以是 jobLevel − 1），
   以及轉生時補給新手的那一筆（`rebirthSkillPoints()`，目前是 11 點）。

   會需要這支，是因為**轉生曾經把技能留在身上卻照樣發點**（見 doRebirth 的註解）：
   新手四個技能已經點滿 20 點了，又拿到 11 點，等於憑空多出 20 點。
   doRebirth 那邊已經修成「清空技能」，但**已經壞掉的存檔修不回來**——
   所以 resetSkills() 兼任修復入口：重置時算出上限，多的直接砍掉。

   **進階二轉取代二轉（#116）**：官方進階二轉是把二轉整個換掉（領主騎士取代騎士），
   不是「在騎士之上再疊一個」。沿線上同時有騎士與領主騎士時，騎士那 49 點
   （JOB50）就不該再算——不然滿級會 20+49+49+69=187，玩家重置時卻只拿得到
   lordknight 的 69 點，白白少掉騎士那筆。正確是 20（新手）+49（一轉）+
   69（進階二轉）=138，三轉再 +69=207。 */
function advancedReplacementOf(jobId) {
  const jd = JOB_TREE[jobId];
  if (!jd || jd.tier !== 2) return null;
  return getAllLearnedJobs().find(j => {
    const jj = JOB_TREE[j];
    return jj && jj.tier === 2.5 && jj.parent === jobId;
  }) || null;
}
function earnedSkillPoints(jobId) {
  // 這個二轉已被沿線上的進階二轉取代 → 它的點數由進階那格承接，不再單獨算
  if (advancedReplacementOf(jobId)) return 0;
  const lv = (jobId === state.jobId) ? state.jobLevel : ((state.jobLevelHistory || {})[jobId] || 0);
  let pts = Math.max(0, lv - 1);
  // 轉生後的新手多一筆，湊到「JOB10 時剛好點滿新手全部技能」
  if (jobId === 'novice' && (state.rebirthCount || 0) > 0) pts += rebirthSkillPoints();
  return pts;
}

function resetSkills() {
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  const allJobs = getAllLearnedJobs();
  let totalSpent = 0;
  let totalTrimmed = 0;

  /* 1) 收技能：每個技能 id 只算一次。任務技能（isQuest）是轉職直接送的 1 級、
     無法用點升級，重置要保留。其餘技能全部刪掉、算進返還點數。 */
  for (const skId of Object.keys(state.learnedSkills || {})) {
    const lv = state.learnedSkills[skId] || 0;
    if (lv <= 0) continue;
    const sk = findSkillById(skId);
    if (sk && sk.isQuest) continue;
    totalSpent += lv;
    delete state.learnedSkills[skId];
  }

  /* 2) 各池直接歸還到「應得」的量——earnedSkillPoints 是技能點的唯一真相來源
     （職業等級每級 1 點，轉生新手再補一筆）。

     不照「點花在哪個技能的池」去還：三轉修羅整份借走母職的技能（findSkillJob
     現職優先），同一招的點可能是從一轉或二轉的池花出去的，照技能歸還會跨池
     互搶、又被 cap 砍掉（#121）。改成分池重算後，**一轉（服事）應得 49、
     二轉線（champion+sura）應得 138**，互不侵蝕——修羅滿級重置後二轉技能點
     就是 138，服事就是 49。

     多出來的（舊 #116 重生 bug 的溢出）砍掉，少的補足，最後各池恰等於應得。 */
  const seenPools = new Set();
  for (const jobId of allJobs) {
    const pool = skillPointPoolJobs(jobId).filter(j => allJobs.includes(j)).sort();
    const key = pool.join(',');
    if (seenPools.has(key) || !pool.length) continue;
    seenPools.add(key);
    for (const j of pool) {
      const want = earnedSkillPoints(j);
      const have = state.jobSkillPoints[j] || 0;
      if (have > want) totalTrimmed += have - want;
      state.jobSkillPoints[j] = want;
    }
  }

  /* 3) 已經不在路線上的職業也要掃——pruneOtherJobLines 漏掉、或舊存檔殘留的池子
     都會被 skillPoints 加總進去，看起來就是「有點卻沒地方點」。 */
  Object.keys(state.jobSkillPoints).forEach(j => {
    if (allJobs.includes(j)) return;
    totalTrimmed += state.jobSkillPoints[j] || 0;
    delete state.jobSkillPoints[j];
  });

  state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
  logMsg(`技能已重置，返還 ${totalSpent} 點技能點。`);
  if (totalTrimmed > 0) {
    logMsg(`🧹 清除了 ${totalTrimmed} 點溢出的技能點（超過職業等級應得的上限）。`);
  }
  recomputeDerived(true);
  saveGame();
}

/* 補回被舊重置 bug 吃掉的技能點（#116）。

   舊版 resetSkills 對進階二轉／三轉會少還點數（騎士那 49 點被誤算進總量、
   又被各自的 earned 上限砍掉），導致玩家滿級只剩 69 點而不是 138（進階二轉）
   ／207（三轉）。這支在讀檔時跑一次：照**目前職業與 JOB 等級**算出該有的總點數，
   跟「池子剩點＋已投資在技能上的點」比較，少了就把差額補進目前職業的池子。

   只補差額、不砍多——多出來的（舊 bug 殘留的溢出）保持原樣，
   需要時再走「重置技能」由 resetSkills 收尾。 */
function repairSkillPointDeficit() {
  if (!state || !state.jobId) return 0;
  const allJobs = getAllLearnedJobs();
  if (!allJobs.length) return 0;
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  // 該有的總量：沿線上各職業 earned 加總（進階二轉取代二轉的規則已內建）
  let correct = 0;
  allJobs.forEach(j => { correct += earnedSkillPoints(j); });
  // 現有總量：池子剩點 + 已投資在技能上的點
  let have = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
  Object.keys(state.learnedSkills || {}).forEach(id => {
    const sk = findSkillById(id);
    if (sk && sk.isQuest) return;
    have += state.learnedSkills[id] || 0;
  });
  const deficit = correct - have;
  if (deficit <= 0) return 0;
  // 補進目前職業的池子
  state.jobSkillPoints[state.jobId] = (state.jobSkillPoints[state.jobId] || 0) + deficit;
  state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
  logMsg(`🔧 偵測到舊版重置少還 ${deficit} 點技能點，已補回（依職業等級應得 ${correct} 點）。`);
  return deficit;
}

/* 補回被舊重置 bug 刪掉的任務技能（#116）。
   舊版 resetSkills 連任務技能（isQuest，轉職自帶 1 級、無法用點升級）也一起刪了，
   而任務技能只在 doJobChange 補發、讀檔不會補，所以會永久消失、顯示 0 級。
   這支在讀檔時掃沿線上所有職業的任務技能，缺了／是 0 就補回 1 級。 */
function repairQuestSkills() {
  if (!state || !state.jobId) return 0;
  const allJobs = getAllLearnedJobs();
  if (!allJobs.length) return 0;
  if (!state.learnedSkills) state.learnedSkills = {};
  let fixed = 0;
  allJobs.forEach(jobId => {
    const job = JOB_TREE[jobId];
    if (!job || !job.skills) return;
    job.skills.forEach(sk => {
      if (!sk.isQuest) return;
      if (!state.learnedSkills[sk.id] || state.learnedSkills[sk.id] < 1) {
        state.learnedSkills[sk.id] = 1;
        fixed++;
        logMsg(`🔧 偵測到任務技能「${sk.name}」被舊版重置刪除，已補回 1 級。`);
      }
    });
  });
  return fixed;
}

// Keep old function name as alias for compatibility
function learnSkill(skillId) { return levelUpSkill(skillId); }

/* 技能冷卻的卡片修正（#17／#55）。

   本作技能瞬發，官方那一大批「變動施法時間 ±N%」在這裡沒有對應的維度。
   使用者決定**魔改成冷卻秒數增減**——兩者管的是同一件事（多久能放一次），
   而且是本作唯一擋得住施放頻率的東西。

     skillCdFlat              全技能 ±N 秒（劍魚 +1、迷幻之王 −1…）
     skillCdFlat_<技能id>     指名單一技能 ±N 秒（小雪怪的冰箭術、熔岩魔的火箭術）

   刻意用**秒數**不用百分比：官方那批寫的是百分比沒錯，但本作的冷卻從 1 秒到
   數十秒都有，一律打 25% 會讓長冷卻技能爽賺、短冷卻技能幾乎沒感覺。
   固定秒數對短冷卻技能的相對收益反而更大，跟「施法時間」的手感比較接近。

   **下限 0.5 秒**：冷卻減到 0 等於無限連發，任何一張減冷卻的卡都會變成必帶。 */
const MIN_COOLDOWN_MS = 500;
function effectiveCooldownMs(skillId, baseCdSec) {
  const base = (baseCdSec || 0) * 1000;
  if (base <= 0) return base;                       // 本來就沒有冷卻的技能不給它加上冷卻
  const delta = (getCardBonus('skillCdFlat') + getCardBonus('skillCdFlat_' + skillId)) * 1000;
  // 布萊奇之詩（#68）：冷卻 −N%。乘在固定值增減之後，跟 #55 那批卡片同一條路
  const pct = Math.max(0, 1 - buffMult('skillcd').flatBonus / 100);
  return Math.max(MIN_COOLDOWN_MS, (base + delta) * pct);
}

/* 攻擊時機率觸發臨時 buff（凡貝爾克 CRI+100、依斯拉施法時間-50% 等）。
   資料寫在 CARDS[x].onAttackBuff，跟 autoSpell/ailment 同一套格式：
     { on:'attack', chance:5, durSec:5, buffType:'crit', buffFlat:100, buffName:'...' }
   buffType 對應 buffMult() 的 type（crit/aspd/atk/flee/fixedcast 等）。
   觸發後推一個臨時 buff 到 state.buffs，到期自動還原。 */
function tryAttackBuffs(trigger, mon) {
  const list = state.cardAttackBuffs && state.cardAttackBuffs[trigger];
  if (!list || !list.length) return;
  for (const e of list) {
    if (Math.random() * 100 >= e.chance) continue;
    // 同名 buff 已在身上就不重複推
    if (state.buffs.some(b => b.buffName === e.buffName && b.msRemaining > 0)) continue;
    state.buffs.push({
      type: e.buffType, mult: 1, flatBonus: e.buffFlat,
      msRemaining: e.durSec * 1000, skillId: 'card_' + e.buffName,
    });
    recomputeDerived(false);
    logMsg(`✨ 「${e.buffName}」發動！持續 ${e.durSec} 秒。`);
  }
}

function skillReady(skillId) {
  return !state.cooldowns[skillId];
}

/* ---------------- 自動念咒 ----------------
   官方卡片有一大類是「攻擊時／受擊時，有一定機率自動施放某個技能」。
   資料寫在 CARDS[x].autoSpell（陣列，一張卡可以有多條）：

     autoSpell: [{ on: 'attack', skill: 'firebolt', lv: 5, chance: 5 }]

     on      'attack' 普通攻擊命中之後／'hit' 被怪物打到之後
     skill   技能 id，不必是本職業的、玩家也不必學過
     lv      施放等級（卡片寫幾級就幾級），會夾在該技能的 maxLv 內
     chance  觸發機率（%）

   施放走 castSkill(id, { free:true, forceLv }) ——不吃 SP/HP/鋅幣、不看武器限制、
   也不寫入冷卻，因為那些都是玩家自己的資源，不該被卡片的被動觸發消耗掉。
------------------------------------------------- */
function tryAutoSpells(trigger, mon) {
  const list = state.cardAutoSpells && state.cardAutoSpells[trigger];
  if (!list || !list.length) return;
  const melee = !isBowWeapon(getEquipBaseItemId('weapon'));
  for (const e of list) {
    // 官方寫「受到近距離物理傷害時」的那幾張（邪惡噬人花），判斷同 tryCardAilments
    if (e.melee && !melee) continue;
    if (Math.random() * 100 >= e.chance) continue;
    const sk = findSkillAnywhere(e.skill);
    if (!sk) continue;
    // 增益類已經在身上就別再放：自動念咒沒有冷卻與SP擋著，不擋的話護盾/buff 會無限疊。
    // 判斷方式跟 tryAutoCastSupportSkills() 一致，用 skillId 而不是 type。
    if (sk.type === 'buff_shield' && state.shields && state.shields.some(sh => sh.id === sk.id)) continue;
    if (state.buffs && state.buffs.some(b => b.skillId === sk.id)) continue;

    /* 「習得該技能到某等級時，改放高階版」（半龍人的火球術10、古鐘魔的自動防禦10、
       朽魔的泥沼地5、風魔巫師的雷鳴術10）。官方寫的是同一個技能升級，
       所以只調等級不換技能。 */
    let lv = e.lv;
    if (e.upgradeIf && skillLv(e.upgradeIf.skill) >= e.upgradeIf.lv) {
      lv = Math.max(1, Math.min(sk.maxLv || e.upgradeIf.toLv, e.upgradeIf.toLv));
    }
    /* 「依自身學習的等級觸發」（#138，雙發神弓）。官方少數幾件寫的不是固定等級，
       而是跟著玩家自己學到幾級。以前這一格是寫死的 `e.lv`，所以二連矢點滿 10 級
       也只會自動放 5 級——使用者回報的就是這件事。
       沒學過的時候退回 `e.lv`，不然非本職拿到那件裝備會完全沒效果。 */
    if (e.useLearnedLv) {
      const learned = skillLv(e.skill);
      if (learned > 0) lv = Math.min(sk.maxLv || learned, learned);
    }

    // 本作把火狩／泥沼地／冰凍術／天使之怒做成了被動（passiveStat），castSkill() 放不出來，
    // 改成直接套用那個被動原本的效果一次
    const ok = sk.type === 'passive'
      ? applyPassiveSkillOnce(sk, lv, trigger, mon)
      : castSkill(e.skill, { free: true, forceLv: lv });
    if (ok) logMsg(`🎴 自動念咒！${sk.name} Lv${lv} 發動！`);
  }
}

/* 把「做成被動」的技能當成一次性效果放出來。
   本作有幾個官方技能被實作成常駐被動（例：冰凍術是「被攻擊時機率凍結攻擊者」），
   卡片的自動念咒卻是要「主動放一次」，所以在這裡把該被動的效果抽出來單獨觸發。
   trigger='attack' 時目標是正在打的那隻怪，'hit' 時是打你的那隻。 */
function applyPassiveSkillOnce(sk, lv, trigger, mon) {
  const target = mon || (state.monsters && state.monsters[0]);
  const monDef = target ? MONSTERS[target.defId] : null;
  const pick = (f, d) => (Array.isArray(sk[f]) ? sk[f][lv - 1] : sk[f]) ?? d;

  switch (sk.passiveStat) {
    // 冰凍術：凍結目標並造成 MATK 比例的魔法傷害（跟 tryMagicStunProcs 同一套處理）
    case 'onHitMagicStunProc': {
      if (!target || !monDef) return false;
      applyStun(target, pick('stunSec', 10), true);
      target.frozenByProc = true;
      const elemMult = getElementMultiplierVsMonster(sk.element || 'none', monDef, target);
      const dmg = mitigateDamage(state.matk * pick('mult', 0.5) * elemMult, ...defOf(monDef, 1, true));
      target.hp -= dmg;
      logMsg(`❄️ ${monDef.name} 被凍結，並受到 ${dmg} 點魔法傷害！`);
      if (target.hp <= 0) killMonster(monDef, target);
      return true;
    }
    /* 沉默之術改成被動之後（#95），闇●神官卡片的「自動念咒沉默之術5」
       就落到這裡——照卡片原本的意思直接讓目標沉默，不然那張卡會變成空包彈。 */
    case 'onAttackSilenceProc': {
      if (!target || !monDef) return false;
      if (!applyAilment(target, monDef, 'silence', { sec: sk.silenceSec || 8 })) return false;
      logMsg(`🤐 ${monDef.name} 沉默了！`);
      return true;
    }
    // 泥沼地：暈眩目標
    case 'onHitStunProc2':
    case 'onHitStunProc': {
      if (!target || !monDef) return false;
      applyStun(target, pick('stunSec', 0.5), true);
      logMsg(`💫 ${monDef.name} 暈眩了！`);
      return true;
    }
    // 火狩：本作是常駐迴避加成，自動念咒版本給一段限時的等量加成
    case 'fleeFlat': {
      state.buffs.push({ type: 'flee', mult: 1, flatBonus: pick('mult', 10),
        msRemaining: (sk.autoSpellDurationSec || 20) * 1000, skillId: sk.id });
      return true;
    }
    // 天使之怒：讓「下一擊雙倍」立刻就緒
    case 'angelusProc': {
      state.hasAngelusProc = true;
      state.angelusReadyAt = 0;
      state.angelusCooldownSec = sk.angelusCooldownSec || 10;
      return true;
    }
    default:
      return false;
  }
}

/* 全域找技能：findSkillById() 只翻「已轉職過的職業」，自動念咒要放的是別的職業的技能
   （卡片不管你是什麼職業）。技能定義集中在 js/skills.js 的 SKILLS，直接查表就好。 */
function findSkillAnywhere(skillId) {
  return SKILLS[skillId] || null;
}

/* opts.free   ：自動念咒用。跳過「學過沒」「冷卻好沒」「武器對不對」「SP/HP/鋅幣夠不夠」，
                 也不寫入冷卻——那是玩家自己那份資源，不該被卡片的觸發吃掉。
   opts.forceLv：指定施放等級（卡片寫幾級就幾級，跟玩家學到幾級無關），會夾在 1~maxLv。 */
/* 技能施放：整段的訊息都算「技能」欄（見 withLogLane）。
   castSkill 有二十幾個 return 點，包在外層才不會漏掉任何一條路徑。 */
function castSkill(skillId, opts) {
  return withLogLane('skill', () => castSkillInner(skillId, opts));
}
function castSkillInner(skillId, opts) {
  const free = !!(opts && opts.free);
  const sk = free ? findSkillAnywhere(skillId) : findSkillForUse(skillId);
  if (!sk) return false;
  // 沉默：完全不能施放技能（連卡片的自動念咒也一起擋，官方沉默就是這樣）
  if (playerSilenced()) { if (!free) logMsg(`🤐 沉默中，無法施放「${sk.name}」！`); return false; }
  /* 黃金蟲卡片：官方「可避免被施任何魔法（包括治癒術在內）」——
     使用者指定連**隊友也不能幫忙上狀態**，所以增益/治療/狀態類技能全部放不出來。
     傷害型技能不受影響（那是打怪，不是「被施魔法」）。 */
  if (state.cardMonSkillImmune && !['damage', 'magic', 'magic_aoe', 'damage_aoe', 'damage_multi',
    'damage_multihit', 'dot', 'poison_proc', 'field_phys_aoe', 'field_magic_aoe', 'field_aoe_magic',
    'multi_dot_stun', 'special_charge', 'passive', 'stun_field'].includes(sk.type)) {
    logMsg(`🪲 黃金蟲卡片：無法被施放「${sk.name}」（含增益/治療/狀態）！`);
    return false;
  }
  let lv;
  if (opts && opts.forceLv) lv = Math.max(1, Math.min(sk.maxLv || opts.forceLv, opts.forceLv));
  else lv = skillLv(skillId);
  if (!lv) return false;
  if (!free && !skillReady(skillId)) return false;

  // 武器類型限定技能（雙手劍加速、音速投擲、長矛專用技…）：未裝備對應武器時無法施放
  if (!free && !weaponReqMet(sk.requiresWeapon)) {
    logMsg(`⚠️ 「${sk.name}」需要裝備${weaponReqName(sk.requiresWeapon)}才能施放！`);
    return false;
  }
  // 裝備欄位限定（十字軍的五個盾牌專用技）：跟武器限定各判各的，可以同時寫
  if (!free && !equipReqMet(sk.requiresEquip)) {
    logMsg(`⚠️ 「${sk.name}」需要裝備${equipReqName(sk.requiresEquip)}才能施放！`);
    return false;
  }
  /* 聖十字審判的保險（使用者 2026-08-09 指定）：HP 低於門檻就不放。
     官方是「消耗當前 HP 的 20% 再自傷一半」，放置遊戲會自動施放，
     沒有這道門檻等於掛機掛到一半自己把自己耗死。 */
  if (!free && sk.minHpPctToCast && state.hp < state.maxHp * sk.minHpPctToCast / 100) {
    return false;
  }

  const spCost = free ? 0 : skillSpCost(sk, lv);
  if (state.sp < spCost) return false;

  // 金錢攻擊：消耗鋅幣才能施放
  let zenyCost = 0;
  if (sk.zenyCost && !free) {
    zenyCost = Array.isArray(sk.zenyCost) ? sk.zenyCost[lv - 1] : sk.zenyCost;
    // 詭計的商術：降低指定技能的鋅幣消耗
    const zenyReductionPct = (state.zenyCostReductionPct && state.zenyCostReductionPct[sk.id]) || 0;
    if (zenyReductionPct) zenyCost = Math.round(zenyCost * (1 - zenyReductionPct / 100));
    if (state.gold < zenyCost) {
      logMsg(`⚠️ 鋅幣不足，無法施放「${sk.name}」！`);
      return false;
    }
  }

  // 加速術：消耗固定HP才能施放
  let hpCost = 0;
  if (sk.hpCost && !free) {
    hpCost = Array.isArray(sk.hpCost) ? sk.hpCost[lv - 1] : sk.hpCost;
    if (state.hp <= hpCost) {
      logMsg(`⚠️ HP不足，無法施放「${sk.name}」！`);
      return false;
    }
  }
  // 樂器攻擊／纏箭投擲（#68）：消耗箭矢。跟弓的普攻共用同一套彈藥系統
  if (sk.consumeAmmo && !free) {
    if (getAmmoCount() < sk.consumeAmmo) {
      logMsg(`⚠️ 箭矢不足，無法施放「${sk.name}」！`);
      return false;
    }
  }
  /* 賢者的礦石消耗（#71）：屬性附加吃靈碎片或靈礦石，元素領域吃藍色魔力礦石。
     這裡只**檢查**湊不湊得出來（背包 → 倉庫），真正扣除在各自的 case 裡，
     跟上面鋅幣／HP／箭矢那幾道守門同一個寫法。
     元素領域從別的領域切換過來時官方不消耗礦石，所以那種情況直接放行。 */
  if (sk.costItems && sk.costItems.length && !free
      && !(sk.type === 'buff_elementfield' && elementFieldActive())
      && !sageCanPay(sk.costItems, sk.costQty || 1)) {
    logMsg(`⚠️ 缺少${sk.costItems.map(id => getItemDisplayName(id)).join('或')}，無法施放「${sk.name}」！`);
    return false;
  }

  /* 聖十字審判：消耗的是**當前HP的百分比**，跟上面那個固定值是兩回事，可以並存。
     這一段是**通用的**——扣血與「HP 不足就放不出來」都在這裡做完了，
     個別 case 不可以再扣一次（#76 的 HP轉換第一版就是這樣扣了兩遍）。
     扣掉多少存進 hpPctCost，需要用到那個數字的 case 直接讀。 */
  let hpPctCost = 0;
  if (sk.hpCostPct && !free) {
    hpPctCost = Math.floor(state.hp * sk.hpCostPct / 100);
    if (state.hp <= hpPctCost) {
      logMsg(`⚠️ HP不足，無法施放「${sk.name}」！`);
      return false;
    }
    hpCost += hpPctCost;
  }

  const isHeal = sk.type === 'heal' || sk.type === 'heal_over_time';
  const isBuff = ['buff_atk', 'buff_auraflat', 'buff_meltdown', 'buff_windwalk', 'buff_sight', 'buff_matk', 'buff_basilica', 'buff_assumptio', 'buff_reflect', 'buff_providence', 'buff_spearquicken', 'buff_song', 'buff_ensemble', 'encore', 'debuff_aspd_aoe', 'debuff_def_aoe', 'buff_block', 'buff_def', 'buff_aspd', 'buff_flee', 'buff_gold', 'buff_crit', 'buff_maxroll', 'buff_blessing', 'buff_shield', 'buff_sprate', 'buff_lukflat', 'buff_holyweapon', 'buff_elearmor', 'buff_ailimmune', 'buff_angelus', 'buff_elementweapon', 'buff_elementfield', 'buff_chemical', 'debuff_def', 'debuff'].includes(sk.type);
  const needsMonster = ['damage', 'magic', 'dot', 'damage_multihit', 'damage_multi', 'debuff_def', 'debuff', 'special_charge', 'poison_proc', 'stun_field', 'multi_dot_stun', 'debuff_web'].includes(sk.type);
  if (needsMonster && (!state.monsters || state.monsters.length === 0)) return false;
  /* 易燃之網對 BOSS 無效（官方）。**要擋在扣 SP 之前**——寫在 case 裡用 break
     只是跳出 switch，SP 已經扣掉了而且函式還是回傳 true。 */
  if (sk.type === 'debuff_web') {
    const d0 = MONSTERS[state.monsters[0].defId];
    if (d0 && d0.isBoss) { logMsg('⚠️ 蜘蛛網對首領階級無效。'); return false; }
  }
  /* HP轉換：扣不到 1 點血就不給放。通用那段的條件是 `hp <= pctCost`，
     血剩 1 點時 pctCost 會是 0、於是 0 元換到 SP——照使用者「沒血不能放」的規則擋掉。 */
  if (sk.type === 'hp_convert' && !free && hpPctCost < 1) {
    logMsg(`⚠️ HP不足，無法施放「${sk.name}」！`);
    return false;
  }

  state.sp -= spCost;
  if (hpCost > 0) state.hp -= hpCost;
  if (sk.consumeAmmo && !free) for (let i = 0; i < sk.consumeAmmo; i++) consumeAmmo();
  if (zenyCost > 0) state.gold -= zenyCost;
  // 自動念咒不寫冷卻：那是玩家自己那份資源，不該被卡片的觸發吃掉
  if (!free) {
    const cd = Array.isArray(sk.cooldown) ? sk.cooldown[lv - 1] : sk.cooldown;
    state.cooldowns[skillId] = effectiveCooldownMs(skillId, cd);
  }
  /* 技能音效與特效：確定放得出來（SP/鋅幣/冷卻都過了）才出聲、才播圖。
     **特效**換身中不播（不該讓玩家的立繪擺出施放姿勢），**音效**照播。 */
  if (typeof playSkillSound === 'function') playSkillSound(sk, lv);
  if (!_allyActing && typeof showSkillCastEffect === 'function') showSkillCastEffect(sk, lv);

  /* 卡片對「特定技能」的傷害加成（火蜥蜴：隕石術+40%、小雪怪：冰箭術+25%…）。
     乘在 mult 上而不是傷害基底上：直接傷害的 case 都是算 基底 × mult，
     但場地類（隕石術）與持續傷害類（火焰之壁）是把 mult 存進 activeFieldEffects
     之後才結算的，只改基底會漏掉那些。乘 mult 才是唯一涵蓋全部的位置。 */
  const skillDmgPct = getCardBonus('skillDmg_' + sk.id);
  // 'magic_aoe'（例如火球術、雷爆術、光獵、怒雷強擊）先前漏判，導致誤用ATK而非MATK計算傷害
  // 傷害基底一律走 skillBaseDamage(useMag, 怪, 屬性倍率)，物理走官方武器鏈、魔法用 MATK
  const useMag = sk.type === 'magic' || sk.type === 'magic_aoe';

  // 屬性相剋：技能屬性 vs 怪物屬性
  const skElement = sk.element || 'none';
  /* 卡片的「某屬性**魔法**傷害 +N%」（無頭騾：水/聖魔法 +20%）。
     跟 eleDmg_ 是兩件不同的事——那個看的是**怪物的屬性**（打水屬性的怪 +N%），
     這個看的是**自己這一發的屬性**，而且只算魔法。放在 mult 上跟 skillDmg_ 同理。 */
  const magicElePct = useMag && skElement !== 'none' && skElement !== 'neutral'
    ? getCardBonus('magicEleDmg_' + skElement) : 0;
  /* 聖十字攻擊：官方「裝備雙手矛時傷害會變成雙倍」（#66）。
     乘進 mult 而不是另外算一份傷害，理由跟 skillDmg_ 那條完全一樣——
     mult 是唯一能同時涵蓋直接傷害與場地／持續傷害的位置。 */
  const twoHandSpear = (sk.twoHandSpearMult && aspdCategoryOf(getEquipBaseItemId('weapon')) === 'spear2')
    ? sk.twoHandSpearMult : 1;
  /* 背刺（#69）：官方「裝備弓傷害減半、裝備短劍造成 2 次傷害」。
     短劍那條寫成 ×2 而不是真的打兩次——本作的傷害飄字與命中判定都是一次一發，
     打兩次要改成 damage_multi，但那樣就吃不到 `damage` 分支的暴擊與卡片加成了。 */
  const wCat = aspdCategoryOf(getEquipBaseItemId('weapon'));
  const weaponSpecial = (sk.daggerMult && wCat === 'dagger') ? sk.daggerMult
    : (sk.bowMult && wCat === 'bow') ? sk.bowMult : 1;
  const mult = (Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult)
    * (1 + skillDmgPct / 100) * (1 + magicElePct / 100) * twoHandSpear * weaponSpecial;

  // 各 case 推 buff 時常忘了標 skillId，導致「同 type 就算已生效」的判斷把不同來源
  // 混為一談（例：喝了集中藥水後，雙手劍加速因為都是 type:'aspd' 而永遠不再自動施放）。
  /* 這裡統一在 switch 結束後補標，個別 case 不必再自己寫。

     記的是**施放前那批 buff 物件本身**而不是陣列長度：#68 的演奏／合奏技能會先
     把同一互斥組的舊 buff 撤掉再推新的，長度會先變短再變長，用索引切割會切錯位置
     ——實測是「暴擊 +10 被吃掉、暴擊傷害 +20% 留著」這種只掉一半的怪現象。 */
  const buffsBefore = new Set(state.buffs);
  // 護盾不走 state.buffs（自己一張 state.shields），全體分享要另外抓（#95）
  const shieldsBefore = new Set(state.shields || []);

  switch (sk.type) {
    case 'damage':
    case 'magic': {
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      // 命中判定：ATK 技能才需要，MATK 技能必中（#76）
      if (sk.type !== 'magic' && !skillHits(sk, lv, def, target)) {
        logMsg(`「${sk.name}」被 ${def.name} 閃避了！`);
        if (typeof playAttackSound === 'function') playAttackSound();   // 物理技能揮空
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
        break;
      }
      const elemMult = getElementMultiplierVsMonster(skElement, def, target);
      if (elemMult !== 1) {
        const pctStr = Math.round(elemMult * 100);
        const tag = elemMult > 1 ? '💚 屬性克制！' : (elemMult < 1 && elemMult > 0 ? '💜 屬性被克…' : (elemMult === 0 ? '🚫 屬性免疫！' : ''));
        if (tag) logMsg(`${tag} ${ELEMENT_NAMES[skElement]}攻 → ${ELEMENT_NAMES[def.element || 'none']}防 (${pctStr}%)`);
        if (typeof showElementFloat === 'function') showElementFloat(target.id, skElement, elemMult);
      }
      // 卡片屬性傷害加成
      const skEleDmgBonus = cardTargetDmgMult(def) - 1;
      let skillMult = mult;
      let faExtraFlat = 0;   // 獵鷹突擊：鋼製喙那份固定傷害，加在防禦之後
      // 超音速投擲被動：音速投擲傷害+90%
      if (sk.id === 'sonicblow' && state.hasSonicblowBoost) {
        skillMult *= 1.9;
      }
      /* 依基本等級／INT 遞增的技能（轉生術、心靈震波）。
         以前是寫死 `sk.id === 'turnundead'`，改成看欄位在不在——
         心靈震波官方也是「傷害隨基本等級與 INT 增加」，同一組欄位就夠用。 */
      if (sk.levelScaleMax || sk.intScaleMax) {
        const lvlBonusPct = (state.baseLevel / 99) * (sk.levelScaleMax || 0);
        const intBonusPct = (state.stats.int / 99) * (sk.intScaleMax || 0);
        skillMult *= (1 + lvlBonusPct / 100 + intBonusPct / 100);
      }
      /* 強酸火煙瓶投擲（#78）：官方「傷害隨目標的 VIT 增加」。
         本作怪物沒有 vit 欄位，用 defSoft 代替——軟防就是從 VIT 推導出來的。 */
      if (sk.targetSoftDefScale) {
        skillMult *= 1 + (def.defSoft || 0) * sk.targetSoftDefScale / 100;
      }
      // 聖靈召喚：對不死種族額外加成
      if (sk.id === 'soulstrike' && def.race === 'undead' && sk.undeadBonusPct) {
        const undeadPct = Array.isArray(sk.undeadBonusPct) ? sk.undeadBonusPct[lv - 1] : sk.undeadBonusPct;
        skillMult *= (1 + undeadPct / 100);
      }
      // 低血量加成（例如音速投擲：目標HP低於門檻時傷害加成）
      if (sk.lowHpThreshold && target.hp < target.maxHp * sk.lowHpThreshold) {
        skillMult *= sk.lowHpMult;
      }
      // 負重量上升：加成金錢攻擊／手推車攻擊／手推車終結技（#60 使用者指定也吃這個）
      if ((sk.id === 'mammonite' || sk.id === 'cartattack' || sk.id === 'ws_cartterm') && state.cartDmgBonusMult) {
        skillMult *= (1 + state.cartDmgBonusMult);
      }
      /* 獵鷹突擊（#61）：官方**沒有給 ATK% 欄位**——它的傷害是從閃電衝擊推導的
         （官方原文：「依技能等級、施展者的閃電衝擊傷害、鋼製喙等級和基本等級而增加」）。
         所以這裡 `sk.mult` 是**係數**不是倍率：拿閃電衝擊當前等級的倍率乘上去，
         鋼製喙的固定傷害也照同一個係數放大並加在防禦之後（跟閃電衝擊本體同一個位置）。
         結果是：把前置練滿，這招才會變強——官方的設計意圖就是這個。 */
      if (sk.id === 'sn_falconassault') {
        const bLv = state.learnedSkills['blitzbeat'] || 0;
        const bSk = SKILLS.blitzbeat;
        const bMult = (bLv && bSk) ? (bSk.mult[bLv - 1] || 0) : 0;
        skillMult *= bMult;
        faExtraFlat = (state.falconFlatBonus || 0) * (Array.isArray(sk.mult) ? sk.mult[lv - 1] : 1);
      }
      /* 螺旋擊刺（#58）：官方的傷害吃**武器重量**，而且無視體型修正。
         重量那份加在「武器 ATK」那一桶（`skillBaseDamage` → `weaponChainDamage` 的 wpn），
         所以它一樣會吃屬性與武器浮動——官方就是把重量算進 ATK，不是外掛一份固定傷害。 */
      /* 技能暴擊（#59 心靈震波）。

         本作的技能本來一律不暴擊——暴擊只寫在 playerAttack() 裡。
         官方心靈震波是特例：「以**暴擊率的一半**判定暴擊，而且暴擊加成也只有一半」。
         做成兩個欄位而不是寫死這支技能，之後別的技能要半暴擊直接填數字就好：
           critRateMult  暴擊率的倍率（0.5 ＝ 一半）
           critDmgMult   暴擊加成的倍率（0.5 ＝ 原本 +50% 變成 +25%）

         **刻意不讓技能暴擊無視 DEF**（普攻的暴擊是無視的，#12）。
         心靈震波 Lv10 是 ATK 1500%，再加無視防禦會直接蓋過所有其他技能；
         官方那條規則是給普攻用的，這裡只取「傷害倍率」那半邊。要改就改這一行。 */
      let skCrit = false;
      if (sk.critRateMult) {
        const critB = buffMult('crit');
        const rate = Math.min(100, (state.critRate * critB.mult + critB.flatBonus) * sk.critRateMult);
        skCrit = Math.random() * 100 < rate;
      }
      let critFactor = 1;
      if (skCrit) {
        const cdm = (typeof sk.critDmgMult === 'number') ? sk.critDmgMult : 1;
        // 普攻暴擊是 ×1.5（＝ +50%），這裡把「+50% 與卡片暴擊加成」一起打折
        critFactor = 1 + (0.5 + (state.cardCritDmgPct || 0) / 100) * cdm;
      }

      const dmg = mitigateDamage(
        skillBaseDamage(useMag, def, elemMult, sk) * skillMult * (1 + skEleDmgBonus)
          * elementDmgMult(skElement) * critFactor * ailDmgTakenMult(target),
        ...defOf(def, 1, useMag, target)) + raceFlatBonus(def) + faExtraFlat;
      target.hp -= dmg;
      // 單體技能以前完全不飄字（logMsg 的飄字規則只認「你…造成N點傷害」那種普攻句型）
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg, skCrit ? 'crit' : 'normal', useMag ? skElement : null);
      logMsg(`⚡ 「${sk.name}」Lv${lv} 造成 ${dmg} 點傷害！${skCrit ? '（暴擊！）' : ''}`);
      // 物理技能也是拿武器打的，命中一樣放武器的命中音（法術有自己的音效）
      if (sk.type !== 'magic' && typeof playHitSound === 'function') playHitSound();
      ailBreakOnDamage(target, def);   // 睡眠被打就醒
      // 卡片的「魔法攻擊時對敵人施以XX」
      if (useMag) tryCardAilments('magic', target);
      // 冰凍術/石化術：魔法傷害命中會提前喚醒被反制暈眩的目標
      if (sk.type === 'magic') wakeIfFrozen(target);
      // 雷鳴術：命中必定使目標暈眩
      if (sk.stunOnHit) {
        const stunSecHit = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
        applyStun(target, stunSecHit, true);
        logMsg(`💫 ${def.name} 被暈眩了！`);
      }
      // 攻擊弱點：狂擊命中時有機率使目標暈眩
      if (sk.id === 'bash' && state.hasBashStunProc && target.hp > 0 && Math.random() * 100 < state.bashStunProcChance) {
        applyStun(target, state.bashStunProcSec || 1, true);
        logMsg(`💫 攻擊弱點發動！${def.name} 暈眩了！`);
      }
      /* 技能附帶的異常狀態（#58 傷害增壓的出血、巧打的隨機減益）。
         `type` 可以寫成 'stun+blind+curse+bleed' 代表隨機挑一種，
         跟卡片的 `ailment` 是同一套寫法與同一支 applyAilment()。 */
      if (sk.inflict && target.hp > 0) {
        const ic = Array.isArray(sk.inflict.chance) ? sk.inflict.chance[lv - 1] : sk.inflict.chance;
        if (Math.random() * 100 < ic) {
          const pool = String(sk.inflict.type).split('+');
          applyAilment(target, def, pool[Math.floor(Math.random() * pool.length)]);
        }
      }
      // 衝鋒箭：命中時使敵人暈眩1~3秒（代表擊退）
      if (sk.id === 'chargearrow' && target.hp > 0) {
        const stunSec = 1 + Math.random() * 2;
        applyStun(target, stunSec, false);
        logMsg(`💫 ${def.name} 被擊退撞暈了，${stunSec.toFixed(1)}秒內無法攻擊！`);
      }
      if (target.hp <= 0) killMonster(def, target);
      break;
    }
    case 'damage_aoe':
    case 'magic_aoe': {
      // 範圍技：打全部怪物
      if (!state.monsters || state.monsters.length === 0) break;
      logMsg(`💥 「${sk.name}」Lv${lv} 範圍攻擊！`);
      // 聖十字審判的自傷（#66）用的是「單一目標的傷害」，不是全場加總——
      // 官方是同一發法術打到自己，怪多不會讓自傷變多
      let aoeTopDmg = 0;
      for (let i = state.monsters.length - 1; i >= 0; i--) {
        const mon = state.monsters[i];
        const monDef = MONSTERS[mon.defId];
        // 命中判定：ATK 範圍技對每隻怪各判一次，MATK 範圍技必中（#76）
        if (sk.type !== 'magic_aoe' && !skillHits(sk, lv, monDef, mon)) {
          pushCombatLog(`  → ${monDef.name} 閃避了！`);
          continue;
        }
        const monElemMult = getElementMultiplierVsMonster(skElement, monDef, mon);
        const monEleDmgBonus = cardTargetDmgMult(monDef) - 1;
        // 負重量上升：加成手推車攻擊傷害
        let aoeMult = mult;
        if (sk.id === 'cartattack' && state.cartDmgBonusMult) aoeMult *= (1 + state.cartDmgBonusMult);
        // 騎乘攻擊：依STR增加傷害（STR120封頂）
        if (sk.id === 'brandishspear') {
          const strScaleMax = Array.isArray(sk.strScaleMax) ? sk.strScaleMax[lv - 1] : (sk.strScaleMax || 100);
          const strBonusPct = Math.min(1, state.stats.str / 120) * (strScaleMax / 100);
          aoeMult *= (1 + strBonusPct);
        }
        /* 依基本等級／INT 遞增（跟單體分支同一組欄位，#61 銳利射擊要用）。 */
        if (sk.levelScaleMax || sk.intScaleMax) {
          const lvlPct = (state.baseLevel / 99) * (sk.levelScaleMax || 0);
          const intPct = (state.stats.int / 99) * (sk.intScaleMax || 0);
          aoeMult *= (1 + lvlPct / 100 + intPct / 100);
        }
        /* 範圍技的暴擊（#61 銳利射擊）。

           `critRateMult` / `critDmgMult` 是 #59 為心靈震波做的，但**只寫在單體分支**——
           銳利射擊是官方唯一會暴擊的範圍技，所以把同一組欄位搬過來，
           另外加一個 `critRateFlat`：官方寫的是「暴擊率 **+50**」，那是加法不是倍率。
           跟單體分支一樣**不讓它無視 DEF**（普攻的暴擊才無視，#12）。 */
        let aoeCrit = false;
        if (sk.critRateMult || sk.critRateFlat) {
          const cb = buffMult('crit');
          const own = state.critRate * cb.mult + cb.flatBonus;
          const rate = Math.min(100, own * (sk.critRateMult || 1) + (sk.critRateFlat || 0));
          aoeCrit = Math.random() * 100 < rate;
        }
        if (aoeCrit) {
          const cdm = (typeof sk.critDmgMult === 'number') ? sk.critDmgMult : 1;
          aoeMult *= 1 + (0.5 + (state.cardCritDmgPct || 0) / 100) * cdm;
        }
        let dmg = mitigateDamage(skillBaseDamage(useMag, monDef, monElemMult) * aoeMult * (1 + monEleDmgBonus) * ailDmgTakenMult(mon), ...defOf(monDef, 1, useMag, mon)) + raceFlatBonus(monDef);
        // 鋼製喙：閃電衝擊額外固定傷害（不受倍率影響）
        if (sk.id === 'blitzbeat' && state.falconFlatBonus) dmg += state.falconFlatBonus;
        if (dmg > aoeTopDmg) aoeTopDmg = dmg;
        mon.hp -= dmg;
        ailBreakOnDamage(mon, monDef);   // 睡眠被打就醒
        if (useMag) tryCardAilments('magic', mon);
        // 冰凍術/石化術：魔法傷害命中會提前喚醒被反制暈眩的目標
        if (sk.type === 'magic_aoe') wakeIfFrozen(mon);
        // 怒雷強擊：範圍技附加機率暈眩
        if (sk.stunChance) {
          const scLv = Array.isArray(sk.stunChance) ? sk.stunChance[lv - 1] : sk.stunChance;
          if (Math.random() * 100 < scLv) {
            const ssLv = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
            applyStun(mon, ssLv, true);
          }
        }
        // 技能附帶的異常狀態（#58 的 inflict，範圍分支以前沒接，#61 補上）
        if (sk.inflict && mon.hp > 0) {
          const ic = Array.isArray(sk.inflict.chance) ? sk.inflict.chance[lv - 1] : sk.inflict.chance;
          if (Math.random() * 100 < ic) {
            const pool = String(sk.inflict.type).split('+');
            applyAilment(mon, monDef, pool[Math.floor(Math.random() * pool.length)]);
          }
        }
        pushCombatLog(`  → 對 ${monDef.name} 造成 ${dmg} 點傷害！${aoeCrit ? '（暴擊）' : ''}`);
        if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg, aoeCrit ? 'crit' : 'normal', useMag ? skElement : null);
        if (mon.hp <= 0) killMonster(monDef, mon);
      }
      // 光獵：額外附加HIT加成buff
      if (sk.bonusHitBuff) {
        const hitBonus = Array.isArray(sk.bonusHitBuff) ? sk.bonusHitBuff[lv - 1] : sk.bonusHitBuff;
        const hitDur = Array.isArray(sk.bonusHitDuration) ? sk.bonusHitDuration[lv - 1] : sk.bonusHitDuration;
        state.buffs.push({ type: 'hit', mult: 1, flatBonus: hitBonus, msRemaining: hitDur * 1000 });
      }
      // 怒爆：附加一段時間內普攻額外火屬性傷害buff（重複施放時重新整理，不疊加）
      if (sk.buffPct) {
        const buffPct = Array.isArray(sk.buffPct) ? sk.buffPct[lv - 1] : sk.buffPct;
        const buffDur = Array.isArray(sk.buffDurationSec) ? sk.buffDurationSec[lv - 1] : sk.buffDurationSec;
        state.buffs = state.buffs.filter(b => b.type !== 'magnumfire');
        state.buffs.push({ type: 'magnumfire', flatBonus: buffPct / 100, msRemaining: buffDur * 1000 });
        logMsg(`🔥 「${sk.name}」發動，接下來${buffDur}秒內普攻附加額外火屬性傷害！`);
      }
      /* 聖十字審判：官方「自身亦會受到一半傷害」（#66）。
         使用者 2026-08-09 指定做出來，但**永遠留 1 HP**——放置遊戲會自動施放，
         讓它能打死自己等於逼玩家把技能關掉，那還不如不做。
         走 state.hp 直接扣而不是 takeDamage()：這是技能自己的代價，
         不該吃減傷、不該觸發反射、也不該被算成「被怪打到」。 */
      if (sk.selfDamagePct && aoeTopDmg > 0) {
        const self = Math.min(state.hp - 1, Math.max(0, Math.round(aoeTopDmg * sk.selfDamagePct / 100)));
        if (self > 0) {
          state.hp -= self;
          logMsg(`✝️ 神之審判也降在自己身上，受到 ${self} 點傷害。`);
          if (typeof showPlayerFloat === 'function') showPlayerFloat('-' + self, 'normal');
        }
      }
      if (typeof renderLog === 'function') renderLog();
      break;
    }
    case 'stun_field': {
      if (!state.monsters || state.monsters.length === 0) break;
      const stunSec = sk.stunSec || 1;
      if (sk.aoeFromLv && lv >= sk.aoeFromLv) {
        state.monsters.forEach(m => applyStun(m, stunSec, true));
        logMsg(`💫 「${sk.name}」Lv${lv} 發動，全體敵人暈眩了！`);
      } else {
        applyStun(state.monsters[0], stunSec, true);
        logMsg(`💫 「${sk.name}」Lv${lv} 發動，${MONSTERS[state.monsters[0].defId].name} 暈眩了！`);
      }
      break;
    }
    /* ---- #22 補上的四個新類型 ---- */
    // 冷笑話：不造成傷害，對全場敵人各擲一次異常狀態
    case 'ailment_aoe': {
      if (!state.monsters || state.monsters.length === 0) break;
      const chance = Array.isArray(sk.successChance) ? sk.successChance[lv - 1] : sk.successChance;
      let hitCount = 0;
      state.monsters.forEach(m => {
        if (Math.random() * 100 >= chance) return;
        // applyAilment 自己會處理免疫（冰凍對水屬性與不死族無效那類）
        if (applyAilment(m, MONSTERS[m.defId], sk.ailment)) hitCount++;
      });
      logMsg(`❄️ 「${sk.name}」Lv${lv} 發動！${hitCount > 0 ? `${hitCount} 隻敵人中招` : '沒有敵人中招'}。`);
      break;
    }
    // 自動防禦：機率完全擋下敵人的物理攻擊（讀取端在 monsterAttackSingle / monsterCastSkill）
    case 'buff_block': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const chance = Array.isArray(sk.blockChance) ? sk.blockChance[lv - 1] : sk.blockChance;
      state.buffs.push({ type: 'block', mult: 1, flatBonus: chance, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🛡️ 「${sk.name}」Lv${lv} 發動，${chance}% 機率完全擋下攻擊！`);
      break;
    }
    /* 魔法效果解除：清掉怪物身上的增益（#45 的 mon.mbuff）。
       只清增益，異常狀態不動——那是我方打上去的，清掉等於幫敵人。 */
    case 'dispel_aoe': {
      if (!state.monsters || state.monsters.length === 0) break;
      const targets = (sk.aoeFromLv && lv >= sk.aoeFromLv) ? state.monsters : [state.monsters[0]];
      let cleared = 0;
      targets.forEach(m => {
        const n = monBuffList(m).length;
        if (n > 0) { m.mbuff = {}; cleared += n; }
      });
      logMsg(cleared > 0
        ? `🌀 「${sk.name}」Lv${lv} 解除了敵人的 ${cleared} 個增益效果！`
        : `🌀 「${sk.name}」Lv${lv} 發動，但敵人身上沒有增益。`);
      break;
    }
    // 痊癒術：清掉玩家身上全部的異常狀態（#30 的 state.playerAil）
    case 'cure': {
      const clear = () => {
        const list = (typeof playerAilList === 'function') ? playerAilList() : [];
        state.playerAil = {};
        delete state.playerAilTick;
        return list;
      };
      const had = clear();
      /* 官方的痊癒術是對隊友施放的（#131）。這支不推 buff，所以 `party: true`
         那條路搬不動它——改成換身之後把同一段清除再跑一次。 */
      const cured = [];
      if (sk.party) {
        forEachPartyMate(mate => { if (clear().length) cured.push(mate); });
      }
      if (!had.length && !cured.length) { logMsg(`💊 「${sk.name}」Lv${lv} 發動，但隊上沒有人身上有異常狀態。`); break; }
      if (had.length) {
        logMsg(`💊 「${sk.name}」Lv${lv} 解除了：${had.map(t => PLAYER_AILMENTS[t].icon + PLAYER_AILMENTS[t].name).join('、')}`);
      }
      if (cured.length) pushCombatLog(`  → 「${sk.name}」也解除了 ${partyMateNames(cured)} 的異常狀態。`, 'ally');
      break;
    }

    case 'buff_blessing': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const statBonus = Array.isArray(sk.statBonus) ? sk.statBonus[lv - 1] : sk.statBonus;
      const hitBonus = Array.isArray(sk.hitBonus) ? sk.hitBonus[lv - 1] : sk.hitBonus;
      state.buffs.push({ type: 'blessing', strBonus: statBonus, intBonus: statBonus, dexBonus: statBonus, msRemaining: dur * 1000, skillId: sk.id });
      state.buffs.push({ type: 'hit', mult: 1, flatBonus: hitBonus, msRemaining: dur * 1000 });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動，STR/INT/DEX與HIT上升！`);
      break;
    }
    case 'buff_sprate': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'sprate', mult, msRemaining: dur * 1000 });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動，SP自然恢復速度上升！`);
      break;
    }
    case 'buff_lukflat': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const lukBonus = Array.isArray(sk.lukBonus) ? sk.lukBonus[lv - 1] : sk.lukBonus;
      state.buffs.push({ type: 'lukflat', mult: 1, flatBonus: lukBonus, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🍀 「${sk.name}」Lv${lv} 發動，LUK上升！`);
      break;
    }
    case 'buff_holyweapon': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'holyweapon', mult: 1, msRemaining: dur * 1000 });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動，武器暫時附加聖屬性！`);
      break;
    }
    /* 聖之祈福（#95）：全體的**防禦屬性**變成聖屬性——受到攻擊時算屬性相剋的那一邊，
       跟上面那個「武器附聖屬」是相反方向的兩件事。
       消費端是既有的 `state.playerElement`（recomputeDerived 讀 buff 蓋過卡片）。
       只留一個：換一個屬性就蓋掉前一個，跟賢者的屬性附加同一個規則。 */
    case 'buff_elearmor': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const el = sk.element || 'holy';
      state.buffs = state.buffs.filter(b => b.type !== 'elearmor');
      state.buffs.push({ type: 'elearmor', element: el, mult: 1, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動，防禦屬性變為${ELEMENT_NAMES[el] || el}屬性，持續 ${dur} 秒！`);
      break;
    }
    /* 天使之障壁（#97）：全體的物理防禦力 +% 與最大HP 固定值。
       拆成兩個既有的桶推出去——`def` 是 buffMult('def') 讀的倍率型，
       `maxhpflat` 是 recomputeDerived 在百分比之後才加的固定值。 */
    case 'buff_angelus': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const dp = Array.isArray(sk.defPct) ? sk.defPct[lv - 1] : sk.defPct;
      const hf = Array.isArray(sk.maxHpFlat) ? sk.maxHpFlat[lv - 1] : sk.maxHpFlat;
      state.buffs.push({ type: 'def', mult: 1 + dp / 100, msRemaining: dur * 1000, skillId: sk.id });
      state.buffs.push({ type: 'maxhpflat', mult: 1, flatBonus: hf, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🛡️ 「${sk.name}」Lv${lv} 發動，防禦力 +${dp}%、最大HP +${hf}，持續 ${dur} 秒！`);
      break;
    }
    /* 緩毒術（#95）：官方是「中毒的人暫停流失 HP」，使用者指定改成整段時間免疫中毒。
       走既有的 `state.ailResist`——那張表 100 以上就是完全免疫，applyPlayerAilment() 已經在讀。 */
    case 'buff_ailimmune': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const t = sk.ailType || 'poison';
      state.buffs = state.buffs.filter(b => !(b.type === 'ailimmune' && b.ailType === t));
      state.buffs.push({ type: 'ailimmune', ailType: t, mult: 1, msRemaining: dur * 1000, skillId: sk.id });
      // 身上已經中著的那一份先解掉，不然「免疫」要等現有的毒跑完才看得出來
      if (state.playerAil && state.playerAil[t]) delete state.playerAil[t];
      logMsg(`💊 「${sk.name}」Lv${lv} 發動，免疫${(PLAYER_AILMENTS[t] || {}).name || t}，持續 ${dur} 秒！`);
      break;
    }
    /* 屬性附加（#71）：武器變成該屬性，並讓該屬性的傷害 +1~5%。
       兩件事拆成兩個 buff 推出去，因為消費點本來就是兩個：
         eleweapon        playerAttack 決定攻擊屬性時讀（跟聖屬武器同一個位置）
         eledmg_<屬性>    elementDmgMult() 讀，普攻與技能都吃得到
       同一時間只留一個屬性附加——官方就是換一個蓋掉前一個。 */
    case 'buff_elementweapon': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const pct = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      const paid = sagePay(sk.costItems, 1, 0);
      state.buffs = state.buffs.filter(b => b.type !== 'eleweapon' && b.eleWeaponTag !== 1);
      state.buffs.push({ type: 'eleweapon', element: sk.element, mult: 1, msRemaining: dur * 1000, skillId: sk.id, eleWeaponTag: 1 });
      state.buffs.push({ type: 'eledmg_' + sk.element, mult: 1 + pct / 100, msRemaining: dur * 1000, skillId: sk.id, eleWeaponTag: 1 });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動（消耗${paid ? paid.label : '—'}），`
        + `武器變成${ELEMENT_NAMES[sk.element]}屬性、${ELEMENT_NAMES[sk.element]}屬性傷害 +${pct}%，持續 ${Math.round(dur / 60)} 分鐘。`);
      break;
    }
    /* 元素領域（#71）：官方是設在地上的 7×7 領域，本作沒有座標 → 自身領域 buff。
       **同時只能開一個**，但從別的領域切換過來不消耗礦石（官方就有這條）。
       之後開放隊友模式時這裡要改成全隊加成——官方是範圍內所有角色都吃。 */
    case 'buff_elementfield': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const pct = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      const switching = elementFieldActive();
      const paid = switching ? null : sagePay(sk.costItems, 1, 0);
      state.buffs = state.buffs.filter(b => b.eleFieldTag !== 1);
      const tag = { eleFieldTag: 1, skillId: sk.id };
      state.buffs.push(Object.assign({ type: 'eledmg_' + sk.element, mult: 1 + pct / 100, msRemaining: dur * 1000 }, tag));
      const bits = [`${ELEMENT_NAMES[sk.element]}屬性傷害 +${pct}%`];
      const push = (type, extra, label) => {
        state.buffs.push(Object.assign({ type, mult: 1, msRemaining: dur * 1000 }, extra, tag));
        bits.push(label);
      };
      const at = Array.isArray(sk.atkFlat) ? sk.atkFlat[lv - 1] : sk.atkFlat;
      if (at) { push('atkflat', { flatBonus: at }, `ATK +${at}`); push('matk', { mult: 1, flatBonus: at }, `MATK +${at}`); }
      const fl = Array.isArray(sk.fleeFlat) ? sk.fleeFlat[lv - 1] : sk.fleeFlat;
      if (fl) push('flee', { flatBonus: fl }, `迴避 +${fl}`);
      const df = Array.isArray(sk.defFlat) ? sk.defFlat[lv - 1] : sk.defFlat;
      if (df) push('defflat', { flatBonus: df }, `DEF +${df}`);
      const hp = Array.isArray(sk.maxHpPct) ? sk.maxHpPct[lv - 1] : sk.maxHpPct;
      // `maxhppct` 的消費端讀的是 **flatBonus**（百分比數字），不是 mult
      if (hp) push('maxhppct', { mult: 1, flatBonus: hp }, `最大HP +${hp}%`);
      logMsg(`🌐 「${sk.name}」Lv${lv} 展開（${switching ? '由其他領域切換，不消耗礦石' : '消耗' + (paid ? paid.label : '—')}）：`
        + `${bits.join('、')}，持續 ${Math.round(dur / 60)} 分鐘。`);
      break;
    }
    /* 火煙瓶投擲（#72）：官方是 3×3 的火焰地面，本作沒有座標 → 打場上全體。
       官方就是每 0.5 秒一跳，場域迴圈的補跳（見 tickFields 那段註解）讓它在
       1 秒心跳下也結算得完整。 */
    case 'field_phys_aoe': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const mult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      state.activeFieldEffects = (state.activeFieldEffects || []).filter(f => f.skillId !== sk.id);
      state.activeFieldEffects.push({
        kind: 'alchemy_strike', skillId: sk.id, skillLv: lv, name: sk.name, mult, aoe: true,
        element: sk.element || 'fire', tickIntervalSec: sk.tickSec || 0.5,
        nextTickAt: Date.now(), endsAt: Date.now() + dur * 1000,
      });
      logMsg(`🔥 「${sk.name}」Lv${lv} 布下火場：每 ${sk.tickSec || 0.5} 秒對全體造成 ATK ${Math.round(mult * 100)}% 傷害，持續 ${dur} 秒。`);
      break;
    }
    /* 生物調撥與生命體召喚（#72）：官方都是召喚實體，本作玩家側召喚是 0 行，
       使用者 2026-08-10 指定改成**定時自動攻擊的場域**。兩者共用這個 case，
       差別只在倍率、間隔、持續時間與有沒有附帶回血。 */
    case 'alchemy_summon': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const mult = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      state.activeFieldEffects = (state.activeFieldEffects || []).filter(f => f.skillId !== sk.id);
      state.activeFieldEffects.push({
        kind: 'alchemy_strike', skillId: sk.id, skillLv: lv, name: sk.name, mult, aoe: false,
        element: sk.element || 'neutral', healFlat: sk.healFlat || 0,
        tickIntervalSec: sk.tickSec || 3,
        nextTickAt: Date.now() + (sk.tickSec || 3) * 1000, endsAt: Date.now() + dur * 1000,
      });
      logMsg(`⚗️ 「${sk.name}」Lv${lv} 登場：每 ${sk.tickSec || 3} 秒造成 ATK ${Math.round(mult * 100)}% 傷害`
        + `${sk.healFlat ? `並回復 ${sk.healFlat} HP` : ''}，持續 ${Math.round(dur / 60)} 分鐘。`);
      break;
    }
    /* 氣泡蟲召喚（#72）：官方是放地雷、被打才自爆，傷害等於剩餘 HP 且無視防禦。
       本作不做召喚實體，只留自爆那一下：隨機挑 1~3 隻，各吃一發無視防禦的固定傷害。 */
    case 'bomb_random': {
      const flat = Math.round(Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult);
      const alive = (state.monsters || []).filter(m => m.hp > 0);
      if (!alive.length) return false;
      const n = Math.min(alive.length, 1 + Math.floor(Math.random() * 3));
      const pool = alive.slice();
      const picked = [];
      for (let i = 0; i < n && pool.length; i++) {
        picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      logMsg(`💣 「${sk.name}」Lv${lv} 引爆！${picked.length} 隻敵人被波及。`);
      picked.forEach(mon => {
        const md = MONSTERS[mon.defId];
        if (!md) return;
        mon.hp -= flat;                 // 官方寫的就是無視防禦，所以不走 mitigateDamage
        ailBreakOnDamage(mon, md);
        if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + flat, 'normal');
        pushCombatLog(`  → ${md.name} 承受 ${flat} 點無視防禦的傷害！`);
      });
      for (let i = state.monsters.length - 1; i >= 0; i--) {
        const mon = state.monsters[i];
        if (mon.hp <= 0) killMonster(MONSTERS[mon.defId], mon);
      }
      break;
    }
    /* 化學保護 ×4（#72）：官方是「使裝備不會被卸除或損壞」，
       本作裝備不會損壞、怪也不會卸除玩家裝備，所以那個效果沒有對象。
       使用者指定四個各換一種實際的防護，全部推成 buff——
       盾牌那個推的是既有的 `block`（自動防禦讀同一個），不另開消費點。 */
    case 'buff_chemical': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const v = Array.isArray(sk.mult) ? sk.mult[lv - 1] : sk.mult;
      state.buffs = state.buffs.filter(b => b.skillId !== sk.id);
      const push = (o) => state.buffs.push(Object.assign({ msRemaining: dur * 1000, skillId: sk.id }, o));
      let label = '';
      /* 所有化學武器保護（#78）：四個一次掛滿。數值直接讀那四個技能自己的定義，
         這樣改了單樣的平衡值，合體版會自動跟著走。 */
      if (sk.chemKind === 'all') {
        const src = ['am_cp_helm', 'am_cp_shield', 'am_cp_armor', 'am_cp_weapon'];
        const bits = [];
        src.forEach(id => {
          const c = SKILLS[id];
          if (!c) return;
          const clv = Math.max(1, Math.min(c.maxLv || 1, lv));
          const cv = Array.isArray(c.mult) ? c.mult[clv - 1] : c.mult;
          if (c.chemKind === 'def') { push({ type: 'defflat', mult: 1, flatBonus: cv }); bits.push(`DEF +${cv}`); }
          else if (c.chemKind === 'block') {
            const cd = Array.isArray(c.internalCooldown) ? c.internalCooldown[clv - 1] : (c.internalCooldown || 10);
            push({ type: 'block', mult: 1, flatBonus: cv, blockCdSec: cd });
            bits.push(`${cv}% 免傷`);
          } else if (c.chemKind === 'maxhp') { push({ type: 'maxhppct', mult: 1, flatBonus: cv }); bits.push(`最大HP +${cv}%`); }
          else if (c.chemKind === 'weaponatk') { push({ type: 'weaponatk', mult: 1 + cv / 100 }); bits.push(`武器ATK +${cv}%`); }
        });
        label = bits.join('／');
      }
      else if (sk.chemKind === 'def') { push({ type: 'defflat', mult: 1, flatBonus: v }); label = `DEF +${v}`; }
      else if (sk.chemKind === 'block') {
        const cd = Array.isArray(sk.internalCooldown) ? sk.internalCooldown[lv - 1] : (sk.internalCooldown || 10);
        push({ type: 'block', mult: 1, flatBonus: v, blockCdSec: cd });
        label = `被攻擊時 ${v}% 機率免傷（冷卻 ${cd} 秒）`;
      } else if (sk.chemKind === 'maxhp') { push({ type: 'maxhppct', mult: 1, flatBonus: v }); label = `最大HP +${v}%`; }
      else if (sk.chemKind === 'weaponatk') { push({ type: 'weaponatk', mult: 1 + v / 100 }); label = `武器ATK +${v}%`; }
      logMsg(`🧪 「${sk.name}」Lv${lv} 生效：${label}，持續 ${Math.round(dur / 60)} 分鐘。`);
      break;
    }
    /* 易燃之網（#76）：迴避 −50 走既有的 `debuffFlee` 桶（流氓的緊密的約束開的），
       火屬性加倍與燒網走 `webUntil`（判定在 getElementMultiplierVsMonster）。
       資源取用照賢者那條慣例：背包 → 倉庫 → 付錢。 */
    case 'debuff_web': {
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      const paid = sagePay(sk.costItems, 1, sk.goldFallback);
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const fl = Array.isArray(sk.fleeFlat) ? sk.fleeFlat[lv - 1] : sk.fleeFlat;
      target.debuffFlee = fl;
      target.debuffFleeEnd = Date.now() + dur * 1000;
      target.webUntil = Date.now() + dur * 1000;
      logMsg(`🕸️ 「${sk.name}」纏住了 ${def.name}：迴避 −${fl}，${dur} 秒內受火屬性傷害加倍（消耗${paid ? paid.label : '—'}）。`);
      break;
    }
    /* 免傷一次型的 buff（#77）。走既有的 `block` 桶：機率固定 100、帶內部冷卻，
       再加 `blockScope` 分成普攻與技能兩種。exclusiveGroup 由下面那段互斥處理統一收掉。 */
    case 'buff_block_timed': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const drain = Array.isArray(sk.spDrain) ? sk.spDrain[lv - 1] : (sk.spDrain || 0);
      /* 互斥組要自己收——那段邏輯住在 case 'buff_song' 裡面，不是共用的。
         合奏類（落花）與歌曲類（海羅默德）各一個，兩組之間互不排斥。 */
      const grp0 = sk.exclusiveGroup;
      const old = grp0 ? state.buffs.filter(b => b.exclusiveGroup === grp0) : [];
      if (old.length) {
        state.buffs = state.buffs.filter(b => b.exclusiveGroup !== grp0);
        const oldName = (SKILLS[old[0].skillId] || {}).name || '';
        if (oldName && old[0].skillId !== sk.id) logMsg(`🎵 停下了「${oldName}」，換上新的曲子。`);
      }
      state.buffs = state.buffs.filter(b => b.skillId !== sk.id);
      state.buffs.push({
        type: 'block', mult: 1, flatBonus: 100, skillId: sk.id,
        blockCdSec: sk.blockCdSec || 10, blockScope: sk.blockScope || null,
        exclusiveGroup: sk.exclusiveGroup,
        spDrain: drain, drainEverySec: sk.drainEverySec || 0,
        drainNextAt: drain ? Date.now() + (sk.drainEverySec || 10) * 1000 : 0,
        msRemaining: dur * 1000,
      });
      logMsg(`🎼 「${sk.name}」Lv${lv} 發動：${sk.blockScope === 'skill' ? '被技能打到' : '被普攻打到'}`
        + `時免傷一次（冷卻 ${sk.blockCdSec || 10} 秒），持續 ${dur} 秒。`);
      break;
    }
    /* 霸王魂（#79）：官方「抵擋怪物或劍類武器的攻擊」，本作怪物沒有武器種類欄位，
       使用者 2026-08-15 指定改成怪物攻擊全包。次數存在 buff 上，跟捨命攻擊同一種寫法。 */
    case 'buff_reject': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs = state.buffs.filter(b => b.skillId !== sk.id);
      state.buffs.push({
        type: 'reject', mult: 1, flatBonus: mult, skillId: sk.id,
        charges: sk.charges || 3, msRemaining: dur * 1000,
      });
      logMsg(`⚔️ 「${sk.name}」Lv${lv} 發動：${mult}% 機率半傷並反射，可擋 ${sk.charges || 3} 次。`);
      break;
    }
    // 雙倍投擲（#76）：機率存在 flatBonus，實際判定在 tryDoubleCast()
    case 'buff_doublecast': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs = state.buffs.filter(b => b.skillId !== sk.id);
      state.buffs.push({ type: 'doublecast', mult: 1, flatBonus: mult, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🔁 「${sk.name}」Lv${lv} 發動：三系箭術有 ${mult + (state.doubleCastBonusPct || 0)}% 機率連放兩次，持續 ${dur} 秒。`);
      break;
    }
    /* 犧牲 Devotion (CR_DEVOTION)：提高怪物攻擊自身的機率。
       存 targetPlayerPct 到 buff，怪物選目標時讀取。 */
    case 'buff_devotion': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const pct = Array.isArray(sk.targetPlayerPct) ? sk.targetPlayerPct[lv - 1] : sk.targetPlayerPct;
      state.buffs = state.buffs.filter(b => b.skillId !== sk.id);
      state.buffs.push({ type: 'devotion', mult: 1, skillId: sk.id, msRemaining: dur * 1000, targetPlayerPct: pct });
      logMsg(`🛡️ 「${sk.name}」Lv${lv} 發動：怪物攻擊自身機率 ${pct}%，持續 ${dur} 秒。`);
      break;
    }
    /* HP轉換（#76）：固定消耗 10% 最大HP，換到「消耗量 × 轉換率」的 SP。
       扣不起就不放——跟捨命攻擊同一條規則，自己的技能不該把自己弄死。 */
    case 'hp_convert': {
      // 血已經被通用的 hpCostPct 那段扣掉了，這裡只負責把它換成 SP
      const gain = Math.max(1, Math.floor(hpPctCost * mult / 100));
      const before = state.sp;
      state.sp = Math.min(state.maxSp, state.sp + gain);
      logMsg(`🔄 「${sk.name}」Lv${lv}：消耗 ${hpPctCost} HP，回復 ${state.sp - before} SP。`);
      break;
    }
    /* 捨命攻擊（#74）：不是加成，是**存 5 次觸發**。實際的自傷與傷害在
       tryPaladinProcs()，這裡只負責把次數掛上去。次數存在 buff 上而不是 state，
       是為了讓它跟著 buff 一起過期——時間到還沒用完的次數就作廢。 */
    case 'buff_sacrifice': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs = state.buffs.filter(b => b.skillId !== sk.id);
      state.buffs.push({
        type: 'sacrifice', mult: 1, skillId: sk.id, msRemaining: dur * 1000,
        charges: sk.charges || 5, hpCostPct: sk.hpCostPct || 9, dmgMult: mult,
      });
      logMsg(`🩸 「${sk.name}」Lv${lv} 發動！接下來 ${sk.charges || 5} 次普攻會燃燒自身的血。`);
      break;
    }
    /* 聖音（#74）：10 秒一跳的場域。官方的「期間不能動」拿掉了（放置遊戲不能有），
       其餘照官方——扣 HP/SP、擲機率、正面給自己負面給全場。效果表見 GOSPEL_*。 */
    case 'field_gospel': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const at = (k, d) => (Array.isArray(sk[k]) ? sk[k][lv - 1] : (sk[k] != null ? sk[k] : d));
      const tickSec = sk.tickSec || 10;
      if (!state.activeFieldEffects) state.activeFieldEffects = [];
      state.activeFieldEffects = state.activeFieldEffects.filter(f => f.skillId !== sk.id);
      state.activeFieldEffects.push({
        kind: 'gospel', skillId: sk.id, name: sk.name, party: !!sk.party,
        chance: at('chance', 55), hpDrain: at('hpDrain', 30), spDrain: at('spDrain', 20),
        // 第一跳就在施放的當下，不然玩家會覺得「放了什麼事都沒發生」
        tickIntervalSec: tickSec, nextTickAt: Date.now(), endsAt: Date.now() + dur * 1000,
      });
      logMsg(`🎼 「${sk.name}」Lv${lv} 發動！福音持續 ${dur} 秒。`);
      break;
    }
    case 'buff_shield': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const capacityPct = Array.isArray(sk.shieldCapacityPct) ? sk.shieldCapacityPct[lv - 1] : sk.shieldCapacityPct;
      const capacityFlat = Array.isArray(sk.shieldCapacityFlat) ? sk.shieldCapacityFlat[lv - 1] : sk.shieldCapacityFlat;
      const capacity = capacityFlat != null ? capacityFlat : Math.round(state.maxHp * ((capacityPct || 0) / 100));
      const charges = Array.isArray(sk.shieldCharges) ? sk.shieldCharges[lv - 1] : sk.shieldCharges;
      if (!state.shields) state.shields = [];
      state.shields.push({ id: sk.id, remainingHp: capacity, remainingCharges: charges, expiresAt: Date.now() + dur * 1000 });
      logMsg(`🛡️ 「${sk.name}」Lv${lv} 發動，護盾展開！（耐久${capacity}，可擋${charges}次）`);
      break;
    }
    /* 無視體型攻擊（#131）。官方是武器完全定義 Weapon Perfection：
       期間攻擊不再吃體型懲罰，神匠版本及於整隊。
       本作原本把它做成 passive 且**完全沒有效果**（技能說明自己寫著
       「暫時擱置、無實際效果」），這裡改成真的會動的限時強化。 */
    case 'buff_ignoresize': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'ignoresize', mult: 1, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🔨 「${sk.name}」Lv${lv} 發動！攻擊不再受體型影響，持續 ${dur} 秒。`);
      break;
    }
    case 'field_heal': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      // 光耀之堂那類的每跳回復，一樣吃治癒量加成（#64）
      const healAmt = Math.round((Array.isArray(sk.healPerTick) ? sk.healPerTick[lv - 1] : sk.healPerTick) * healOutputMult());
      const tickSec = sk.fieldTickIntervalSec || 1;
      if (!state.activeFieldEffects) state.activeFieldEffects = [];
      // party 的話每一跳也回給隊友（#131）。回復量記施術者的，跟官方的範圍治療一致
      state.activeFieldEffects.push({ kind: 'selfheal', name: sk.name, amount: healAmt, party: !!sk.party, tickIntervalSec: tickSec, nextTickAt: Date.now(), endsAt: Date.now() + dur * 1000 });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動！`);
      break;
    }
    case 'field_aoe_magic': {
      if (!state.monsters || state.monsters.length === 0) break;
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const tickSec = sk.fieldTickIntervalSec || 3;
      const stunChance = Array.isArray(sk.stunChance) ? sk.stunChance[lv - 1] : sk.stunChance;
      const stunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : sk.stunSec;
      if (!state.activeFieldEffects) state.activeFieldEffects = [];
      state.activeFieldEffects.push({ kind: 'aoe_holydmg', name: sk.name, mult, element: skElement || 'holy', stunChance, stunSec, tickIntervalSec: tickSec, nextTickAt: Date.now(), endsAt: Date.now() + dur * 1000 });
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動！`);
      break;
    }
    case 'multi_dot_stun': {
      if (!state.monsters || state.monsters.length === 0) break;
      const maxTargets = Array.isArray(sk.maxTargets) ? sk.maxTargets[lv - 1] : (sk.maxTargets || 1);
      const stunSec = Array.isArray(sk.stunSec) ? sk.stunSec[lv - 1] : (sk.stunSec || 1);
      const tickSec = Array.isArray(sk.tickIntervalSec) ? sk.tickIntervalSec[lv - 1] : (sk.tickIntervalSec || 1);
      const dotDur = Array.isArray(sk.dotDurationSec) ? sk.dotDurationSec[lv - 1] : (sk.dotDurationSec || 1);
      const targets = state.monsters.slice(0, maxTargets);
      const targetIds = targets.map(m => m.id);
      targets.forEach(m => applyStun(m, stunSec, true));
      if (!state.activeFieldEffects) state.activeFieldEffects = [];
      state.activeFieldEffects.push({ kind: 'multi_dot', name: sk.name, mult, element: skElement, targetIds, tickIntervalSec: tickSec, nextTickAt: Date.now() + tickSec * 1000, endsAt: Date.now() + dotDur * 1000 });
      logMsg(`🔥 「${sk.name}」Lv${lv} 發動！${targets.length}隻敵人暈眩了！`);
      break;
    }
    case 'dot': {
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      // 命中判定：中毒類技能屬於物理技能
      const dotHitPct = hitChancePctVsMonster(effectiveHitWithBuff(), def, target);
      if (Math.random() * 100 > dotHitPct) {
        logMsg(`「${sk.name}」被 ${def.name} 閃避了！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
        break;
      }
      const elemMult = getElementMultiplierVsMonster(skElement, def, target);
      const dotEleDmgBonus = cardTargetDmgMult(def) - 1;
      const dmg = mitigateDamage(skillBaseDamage(useMag, def, elemMult) * mult * (1 + dotEleDmgBonus) * ailDmgTakenMult(target), ...defOf(def, 0.6, false, target));
      target.hp -= dmg;
      logMsg(`☠️ 「${sk.name}」Lv${lv} 造成 ${dmg} 點持續傷害！`);
      if (target.hp <= 0) killMonster(def, target);
      break;
    }
    case 'poison_proc': {
      // 施毒：命中後造成固定傷害（不隨等級變化），另外骰一次中毒機率（依等級），中毒固定3秒不疊加
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      if (!skillHits(sk, lv, def, target)) {
        logMsg(`「${sk.name}」被 ${def.name} 閃避了！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
        break;
      }
      const elemMult = getElementMultiplierVsMonster(skElement, def, target);
      const dmg = mitigateDamage(skillBaseDamage(useMag, def, elemMult) * mult * ailDmgTakenMult(target), ...defOf(def, 1, false, target));
      target.hp -= dmg;
      logMsg(`⚡ 「${sk.name}」Lv${lv} 造成 ${dmg} 點傷害！`);
      if (target.hp <= 0) { killMonster(def, target); break; }
      const procChance = Array.isArray(sk.procChance) ? sk.procChance[lv - 1] : sk.procChance;
      if (Math.random() * 100 < procChance) {
        applyPoisonDot(target, def, skillBaseDamage(useMag, def, elemMult) * mult);
        logMsg(`☠️ ${def.name} 中毒了！`);
      }
      break;
    }
    case 'heal': {
      const amt = Math.round((state.stats.int + state.baseLevel) * mult * healOutputMult());
      state.hp = Math.min(state.maxHp, state.hp + amt);
      logMsg(`💚 「${sk.name}」Lv${lv} 恢復了 ${amt} 點HP。`);
      break;
    }
    case 'heal_over_time': {
      const amt = Math.round((state.stats.int + state.baseLevel) * mult * healOutputMult());
      state.hp = Math.min(state.maxHp, state.hp + amt);
      logMsg(`💫 「${sk.name}」Lv${lv} 持續恢復HP。`);
      break;
    }
    case 'buff_def': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'def', mult, msRemaining: dur * 1000 });
      logMsg(`🛡️ 「${sk.name}」Lv${lv} 發動，防禦力上升！`);
      break;
    }
    case 'buff_atk': {
      let dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      // 武器保有：凶砍持續時間+10%
      if (sk.id === 'overthrustbuff' && state.hiltBindingDurationBonus) dur *= (1 + state.hiltBindingDurationBonus);
      state.buffs.push({ type: 'atk', mult, msRemaining: dur * 1000, skillId: sk.id });
      /* `defMult`：官方有一批攻擊 buff 是「以防禦換攻擊」（集中攻擊 ATK+5~25%／DEF−5~25%）。
         代價跟效果推同一個持續時間，不然玩家可以只留好處。 */
      if (sk.defMult) {
        const dm = Array.isArray(sk.defMult) ? sk.defMult[lv - 1] : sk.defMult;
        state.buffs.push({ type: 'def', mult: dm, msRemaining: dur * 1000, skillId: sk.id });
        logMsg(`💪 「${sk.name}」Lv${lv} 發動，攻擊力上升、防禦力下降！`);
      } else {
        logMsg(`💪 「${sk.name}」Lv${lv} 發動，攻擊力上升！`);
      }
      recomputeDerived(false);
      break;
    }
    /* 野蠻凶砍（#60）：自身強化，期間普攻機率削弱目標。

       官方效果有兩半：打玩家時破壞武器／鎧甲、打怪物時降其物攻／物防。
       **前一半本作永久 N/A**（裝備不會損壞，#17 早就正式廢除過這一類），
       所以只做後一半，機率直接沿用官方那兩欄（武器損壞→降物攻、鎧甲損壞→降物防）。 */
    case 'buff_meltdown': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({
        type: 'meltdown', mult: 1, msRemaining: dur * 1000, skillId: sk.id,
        atkChance: Array.isArray(sk.atkBreakChance) ? sk.atkBreakChance[lv - 1] : (sk.atkBreakChance || 0),
        defChance: Array.isArray(sk.defBreakChance) ? sk.defBreakChance[lv - 1] : (sk.defBreakChance || 0),
        debuffMult: sk.debuffMult || 0.8,
        debuffSec: sk.debuffSec || 10,
      });
      logMsg(`🔥 「${sk.name}」Lv${lv} 發動！攻擊會削弱敵人的攻防，持續 ${dur} 秒。`);
      break;
    }
    /* 風之步（#61）：官方是自身與隊友的移速 +2~20%、FLEE +1~5。

       本作沒有移動也沒有隊友，移速那一半照既定慣例改成**生怪加速**——
       騎乘術、月夜貓卡片、手推車加速走的都是這個維度，這是第四個。
       生怪間隔有 100ms 下限，疊到底會撞地板，那是刻意的。 */
    case 'buff_windwalk': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const flee = Array.isArray(sk.fleeFlat) ? sk.fleeFlat[lv - 1] : (sk.fleeFlat || 0);
      state.buffs.push({ type: 'spawnspeed', mult, msRemaining: dur * 1000, skillId: sk.id });
      state.buffs.push({ type: 'flee', mult: 1, flatBonus: flee, msRemaining: dur * 1000, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`🌬️ 「${sk.name}」Lv${lv} 發動！生怪速度提升、迴避 +${flee}，持續 ${dur} 秒。`);
      break;
    }
    /* 神聖殿堂（#64）：聖屬性魔法傷害 +3~15%、對暗／不死屬性目標的物理傷害 +5~25%。
       兩半各推一個 buff：前者走 #59 的 `eledmg_<屬性>`，後者走新開的 `targetele`
       （消費端合進 `cardTargetDmgMult()`，八個物理傷害路徑一次接滿）。 */
    case 'buff_basilica': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const ms = dur * 1000;
      const phys = Array.isArray(sk.physPct) ? sk.physPct[lv - 1] : (sk.physPct || 0);
      state.buffs.push({ type: 'eledmg_holy', mult, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'targetele', mult: 1,
        elements: sk.targetElements || ['shadow', 'undead'],
        races: sk.targetRaces || ['undead'],
        pct: phys, msRemaining: ms, skillId: sk.id });
      logMsg(`⛪ 「${sk.name}」Lv${lv} 發動！聖屬性魔法 +${Math.round((mult - 1) * 100)}%、對暗／不死物理 +${phys}%，持續 ${dur} 秒。`);
      break;
    }
    /* 聖母之祈福（#64）：裝備DEF +50~250（固定值）、受到的治癒恢復量 +2~10%。
       DEF 那筆走 `def` buff 的 flatBonus（debuffedDef 只把它加在硬防上）。 */
    case 'buff_assumptio': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const ms = dur * 1000;
      const defFlat = Array.isArray(sk.defFlat) ? sk.defFlat[lv - 1] : (sk.defFlat || 0);
      state.buffs.push({ type: 'def', mult: 1, flatBonus: defFlat, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'healrecv', mult, msRemaining: ms, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`😇 「${sk.name}」Lv${lv} 發動！防禦 +${defFlat}、受到的治癒 +${Math.round((mult - 1) * 100)}%，持續 ${dur} 秒。`);
      break;
    }
    /* 魔力增幅（#63）：MATK +5~50%，持續 60 秒。
       消費端跟卡片的 `matkPct` 合在同一行（見 recomputeDerived 的註解），
       tickBuffs() 每個 tick 都重算，所以到期會自動還原。 */
    case 'buff_matk': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'matk', mult, msRemaining: dur * 1000, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`🔮 「${sk.name}」Lv${lv} 發動！魔法攻擊 +${Math.round((mult - 1) * 100)}%，持續 ${dur} 秒。`);
      break;
    }
    /* 狙殺瞄準（#61）：官方一個技能同時給四樣東西，所以一次推四個 buff、
       共用同一個 skillId 與持續時間（跟集中攻擊的 defMult 是同一個模式）。 */
    case 'buff_sight': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const ms = dur * 1000;
      const allStat = Array.isArray(sk.allStat) ? sk.allStat[lv - 1] : (sk.allStat || 0);
      const cri = Array.isArray(sk.critFlat) ? sk.critFlat[lv - 1] : (sk.critFlat || 0);
      const hit = Array.isArray(sk.hitFlat) ? sk.hitFlat[lv - 1] : (sk.hitFlat || 0);
      state.buffs.push({ type: 'allstat', mult: 1, flatBonus: allStat, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'atk', mult, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'crit', mult: 1, flatBonus: cri, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'hit', mult: 1, flatBonus: hit, msRemaining: ms, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`🎯 「${sk.name}」Lv${lv} 發動！全素質 +${allStat}、攻擊 +${Math.round((mult - 1) * 100)}%、暴擊 +${cri}、命中 +${hit}，持續 ${dur} 秒。`);
      break;
    }
    /* ---- 詩人／舞孃：演奏・舞蹈與合奏（#68）----

       兩個共通機制：

       **互斥組**（使用者 2026-08-09 指定）：官方每個演奏／舞蹈技能都寫著
       「無法與其它演奏技能效果重疊」。`exclusiveGroup: 'song'` 的技能同時只能開一個，
       `exclusiveGroup: 'ensemble'` 的合奏也只能開一個，但**兩組之間互不排斥**——
       所以可以「一個專用技 + 一個合奏」同時掛著。

       **合奏單人減半**：官方合奏要 9×9 內有一個異性的詩舞系隊員。本作沒有隊伍，
       所以單人放得出來但效果減半（`soloMult`）。日後開隊友模式時，
       兩個人各放一次就是兩份半效果疊起來＝官方的完整效果，資料不必改。 */
    case 'buff_song':
    case 'buff_ensemble': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const ms = dur * 1000;
      const grp = sk.exclusiveGroup || (sk.type === 'buff_ensemble' ? 'ensemble' : 'song');
      // 同一組的舊 buff 先撤掉（官方：無法與其它演奏／合奏技能重疊）
      const dropped = state.buffs.filter(b => b.exclusiveGroup === grp);
      if (dropped.length) {
        state.buffs = state.buffs.filter(b => b.exclusiveGroup !== grp);
        const oldName = (SKILLS[dropped[0].skillId] || {}).name || '';
        if (oldName && dropped[0].skillId !== sk.id) logMsg(`🎵 停下了「${oldName}」，換上新的曲子。`);
      }
      // 合奏單人只有一半效果
      const k = (sk.type === 'buff_ensemble') ? (sk.soloMult || 0.5) : 1;
      const at = (f, d) => {
        const raw = Array.isArray(sk[f]) ? sk[f][lv - 1] : (sk[f] != null ? sk[f] : d);
        return raw == null ? null : raw * k;
      };
      const push = (type, opts) => state.buffs.push(
        Object.assign({ type, mult: 1, msRemaining: ms, skillId: sk.id, exclusiveGroup: grp }, opts));

      const bits = [];
      const flat = [
        ['fleeFlat', 'flee', '迴避 +'], ['perfectDodgeFlat', 'perfectdodge', '完全迴避 +'],
        ['hitFlat', 'hit', '命中 +'], ['critFlat', 'crit', '暴擊 +'],
        ['critDmgPct', 'critdmg', '暴擊傷害 +%'], ['maxHpPct', 'maxhppct', '最大HP +%'],
        ['maxSpPct', 'maxsppct', '最大SP +%'], ['skillCdPct', 'skillcd', '技能冷卻 −%'],
        ['expPct', 'exp', '經驗值 +%'], ['atkFlat', 'atkflat', 'ATK +'],
        ['defFlat', 'defflat', 'DEF +'],
      ];
      flat.forEach(([f, type, label]) => {
        const v = at(f);
        if (v == null || v === 0) return;
        push(type, { flatBonus: v });
        bits.push(label.replace('+%', '+' + Math.round(v * 10) / 10 + '%')
          .replace('−%', '−' + Math.round(v * 10) / 10 + '%')
          .replace(/\+$/, '+' + Math.round(v * 10) / 10));
      });
      // SP 消耗是負向的，資料寫正數，這裡轉成負值推進去
      const spCut = at('spCostCutPct');
      if (spCut) { push('spcost', { flatBonus: -spCut }); bits.push(`技能SP消耗 −${Math.round(spCut * 10) / 10}%`); }
      // 攻速是倍率制
      const aspdPct = at('aspdPct');
      if (aspdPct) { push('aspd', { mult: 1 + aspdPct / 100 }); bits.push(`攻速 +${Math.round(aspdPct * 10) / 10}%`); }
      // 受到的治癒恢復量
      const healPct = at('healRecvPct');
      if (healPct) { push('healrecv', { mult: 1 + healPct / 100 }); bits.push(`治癒恢復量 +${Math.round(healPct * 10) / 10}%`); }
      // 四屬性耐性與異常狀態抗性（不死神齊格弗里德）
      const eleR = at('eleResistPct');
      if (eleR) { push('songelereduce', { flatBonus: eleR }); bits.push(`地水火風耐性 +${Math.round(eleR * 10) / 10}%`); }
      const ailR = at('ailResistPct');
      if (ailR) { push('songailresist', { flatBonus: ailR }); bits.push(`異常狀態抗性 +${Math.round(ailR * 10) / 10}%`); }
      // 魔力礦石消耗（觸媒之所）：單人版做成「機率不消耗」，減半才有意義
      const gem = at('gemFreeChance');
      if (gem) { push('gemfree', { flatBonus: gem }); bits.push(`魔力礦石 ${Math.round(gem)}% 機率不消耗`); }

      state.lastSongSkillId = sk.id;   // 安可要用
      recomputeDerived(false);
      const half = (sk.type === 'buff_ensemble') ? '（單人合奏，效果減半）' : '';
      logMsg(`🎶 「${sk.name}」Lv${lv}${half}：${bits.join('、') || '演奏中'}，持續 ${dur} 秒。`);
      break;
    }
    /* 安可：重放上一個演奏／舞蹈技能，只花一半 SP。
       SP 在上面就已經按本技能的 spCost 扣過了，這裡再補扣目標技能的一半。 */
    case 'encore': {
      const lastId = state.lastSongSkillId;
      const last = lastId ? SKILLS[lastId] : null;
      if (!last) { logMsg('⚠️ 還沒有演奏過任何曲子，安可沒有東西可以重放。'); break; }
      const lastLv = skillLv(lastId) || 1;
      const half = Math.floor(skillSpCost(last, lastLv) / 2);
      if (state.sp < half) { logMsg(`⚠️ SP 不足，無法安可「${last.name}」。`); break; }
      state.sp -= half;
      logMsg(`🎤 安可！再一次「${last.name}」（半價 ${half} SP）。`);
      castSkill(lastId, { free: true, forceLv: lastLv });
      break;
    }
    /* 勿忘我：官方只對敵方玩家有效，本作改成對怪物的攻速減益。
       跟野蠻凶砍的 debuffAtk 同一種寫法（值掛在怪物實體上、附到期時間）。 */
    case 'debuff_aspd_aoe': {
      if (!state.monsters || !state.monsters.length) break;
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const cut = Array.isArray(sk.aspdCutPct) ? sk.aspdCutPct[lv - 1] : sk.aspdCutPct;
      const grp = 'song';
      state.buffs = state.buffs.filter(b => b.exclusiveGroup !== grp);
      state.buffs.push({ type: 'dontforgetme', mult: 1, flatBonus: cut, msRemaining: dur * 1000, skillId: sk.id, exclusiveGroup: grp });
      state.monsters.forEach(mon => {
        mon.debuffAspd = Math.max(0.1, 1 - cut / 100);
        mon.debuffAspdEnd = Date.now() + dur * 1000;
      });
      state.lastSongSkillId = sk.id;
      logMsg(`🎶 「${sk.name}」Lv${lv}：場上敵人的攻擊速度 −${cut}%，持續 ${dur} 秒。`);
      break;
    }
    /* ---- 十字軍三個 buff（#66）---- */
    /* 反射盾：反射比率合進 applyPlayerReflect()，跟卡片的 reflectPct 相加。
       用 flatBonus 存百分比（跟 block 那個 buff 同一種寫法）。 */
    case 'buff_reflect': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const pct = Array.isArray(sk.reflectPct) ? sk.reflectPct[lv - 1] : sk.reflectPct;
      state.buffs.push({ type: 'reflect', mult: 1, flatBonus: pct, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🛡️ 「${sk.name}」Lv${lv} 發動！受到的近距離物理傷害反射 ${pct}%，持續 ${dur} 秒。`);
      break;
    }
    /* 神祐之光：聖屬性與惡魔種族減傷。數值存在 buff 上，
       recomputeDerived() 會把它併進 cardEleDmgReduce / cardRaceDmgReduce，
       所以八個消費點一次接滿——這裡只負責推 buff 並觸發一次重算。 */
    case 'buff_providence': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const pct = Array.isArray(sk.reducePct) ? sk.reducePct[lv - 1] : sk.reducePct;
      state.buffs.push({ type: 'providence', mult: 1, reducePct: pct, msRemaining: dur * 1000, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`✝️ 「${sk.name}」Lv${lv} 發動！受到的聖屬性與惡魔種族傷害 −${pct}%，持續 ${dur} 秒。`);
      break;
    }
    // 長矛加速術：攻速 + 暴擊 + 迴避三份，全部走既有的 buff 型別
    case 'buff_spearquicken': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const ms = dur * 1000;
      const cri = Array.isArray(sk.critFlat) ? sk.critFlat[lv - 1] : (sk.critFlat || 0);
      const fle = Array.isArray(sk.fleeFlat) ? sk.fleeFlat[lv - 1] : (sk.fleeFlat || 0);
      state.buffs.push({ type: 'aspd', mult, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'crit', mult: 1, flatBonus: cri, msRemaining: ms, skillId: sk.id });
      state.buffs.push({ type: 'flee', mult: 1, flatBonus: fle, msRemaining: ms, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`🔱 「${sk.name}」Lv${lv} 發動！攻速 +${Math.round((mult - 1) * 100)}%、暴擊 +${cri}、迴避 +${fle}，持續 ${dur} 秒。`);
      break;
    }
    /* 靈氣劍（#58）：每次攻擊與施放技能都附加固定傷害且無視防禦。
       使用者 2026-08-22 指定：固定傷害＝玩家等級 × perLevel[lv]。
       存成 `auraflat` 型的 buff，recomputeDerived 會收斂成 state.auraBladeFlat，
       實際加在 raceFlatBonus()——那是防禦之後才加的那一項。 */
    case 'buff_auraflat': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const perLv = Array.isArray(sk.perLevel) ? sk.perLevel[lv - 1] : (sk.perLevel || 0);
      const flat = Math.round((state.baseLevel || 1) * perLv);
      state.buffs.push({ type: 'auraflat', mult: 1, flatBonus: flat, msRemaining: dur * 1000, skillId: sk.id });
      recomputeDerived(false);
      logMsg(`✨ 「${sk.name}」Lv${lv} 發動，攻擊與技能附加 ${flat} 點（等級${state.baseLevel}×${perLv}）無視防禦的傷害，持續 ${dur} 秒！`);
      break;
    }
    case 'buff_aspd': {
      let dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      // 武器保有：速度激發持續時間+10%
      if (sk.id === 'adrenaline' && state.hiltBindingDurationBonus) dur *= (1 + state.hiltBindingDurationBonus);
      state.buffs.push({ type: 'aspd', mult, msRemaining: dur * 1000 });
      // 雙手劍加速額外加成：暴擊率+命中
      if (sk.bonusCrit) {
        const critBonus = Array.isArray(sk.bonusCrit) ? sk.bonusCrit[lv - 1] : sk.bonusCrit;
        state.buffs.push({ type: 'crit', mult: 1, flatBonus: critBonus, msRemaining: dur * 1000 });
      }
      if (sk.bonusHit) {
        const hitBonus = Array.isArray(sk.bonusHit) ? sk.bonusHit[lv - 1] : sk.bonusHit;
        state.buffs.push({ type: 'hit', mult: 1, flatBonus: hitBonus, msRemaining: dur * 1000 });
      }
      // 加速術：附加AGI固定加成
      if (sk.agiFlatBonus) {
        const agiBonus = Array.isArray(sk.agiFlatBonus) ? sk.agiFlatBonus[lv - 1] : sk.agiFlatBonus;
        state.buffs.push({ type: 'agiflat', mult: 1, flatBonus: agiBonus, msRemaining: dur * 1000, skillId: sk.id });
      }
      logMsg(`💨 「${sk.name}」Lv${lv} 發動，攻速上升！`);
      break;
    }
    case 'buff_maxroll': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'maxroll', mult: 1, msRemaining: dur * 1000 });
      logMsg(`⚒️ 「${sk.name}」Lv${lv} 發動，武器傷害浮動值最大化！`);
      break;
    }
    case 'damage_multihit': {
      // 怪物互擊：2段傷害，第二段打全部怪物
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      // 命中判定：整招視為一次判定，miss 時兩段都不生效
      if (!skillHits(sk, lv, def, target)) {
        logMsg(`「${sk.name}」被 ${def.name} 閃避了！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
        break;
      }
      const elemMult = getElementMultiplierVsMonster(skElement, def, target);
      const mhEleDmgBonus = cardTargetDmgMult(def) - 1;
      // 第一段：單體傷害
      const dmg1 = mitigateDamage(skillBaseDamage(useMag, def, elemMult) * mult * (1 + mhEleDmgBonus) * ailDmgTakenMult(target), ...defOf(def, 1, false, target)) + raceFlatBonus(def);
      target.hp -= dmg1;
      if (typeof showDamageFloatAt === 'function') showDamageFloatAt(target.id, '-' + dmg1, 'normal');
      logMsg(`⚡ 「${sk.name}」Lv${lv} 第一段對 ${def.name} 造成 ${dmg1} 點傷害！`);
      if (target.hp <= 0) killMonster(def, target);
      // 第二段：範圍傷害，打全部怪物
      const mult2 = Array.isArray(sk.mult2) ? sk.mult2[lv - 1] : sk.mult2;
      logMsg(`💥 「${sk.name}」Lv${lv} 第二段範圍攻擊！`);
      for (let i = state.monsters.length - 1; i >= 0; i--) {
        const mon = state.monsters[i];
        const monDef = MONSTERS[mon.defId];
        const monElemMult = getElementMultiplierVsMonster(skElement, monDef, mon);
        const mon2EleDmgBonus = cardTargetDmgMult(monDef) - 1;
        const dmg2 = mitigateDamage(skillBaseDamage(useMag, monDef, monElemMult) * mult2 * (1 + mon2EleDmgBonus) * ailDmgTakenMult(mon), ...defOf(monDef, 1, false, mon)) + raceFlatBonus(monDef);
        mon.hp -= dmg2;
        pushCombatLog(`  → 對 ${monDef.name} 造成 ${dmg2} 點範圍傷害！`);
        if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, '-' + dmg2, 'normal');
        if (mon.hp <= 0) killMonster(monDef, mon);
      }
      break;
    }
    case 'damage_multi': {
      // 連刺攻擊：依體型多段
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      // 命中判定：整招視為一次判定
      if (!skillHits(sk, lv, def, target)) {
        logMsg(`「${sk.name}」被 ${def.name} 閃避了！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
        break;
      }
      const elemMult = getElementMultiplierVsMonster(skElement, def, target);
      const multiEleDmgBonus = cardTargetDmgMult(def) - 1;
      const hits = Array.isArray(sk.hits) ? sk.hits[lv - 1] : (sk.hits || 1);
      let totalDmg = 0;
      for (let i = 0; i < hits; i++) {
        const dmg = mitigateDamage(skillBaseDamage(useMag, def, elemMult) * mult * (1 + multiEleDmgBonus) * ailDmgTakenMult(target), ...defOf(def, 1, false, target)) + raceFlatBonus(def);
        totalDmg += dmg;
        target.hp -= dmg;
        if (target.hp <= 0) break;
      }
      logMsg(`⚡ 「${sk.name}」Lv${lv} 造成 ${hits} 段攻擊，共 ${totalDmg} 點傷害！`);
      if (target.hp <= 0) killMonster(def, target);
      break;
    }
    case 'special_charge': {
      // 衝鋒攻擊：普攻一下 + 立即生成新怪
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const def = MONSTERS[target.defId];
      // 命中判定：miss 時不造成傷害，但衝鋒生怪效果仍然發動
      if (skillHits(sk, lv, def, target)) {
        const elemMult = getElementMultiplierVsMonster(skElement, def, target);
        const scEleDmgBonus = cardTargetDmgMult(def) - 1;
        const dmg = mitigateDamage(skillBaseDamage(useMag, def, elemMult) * mult * (1 + scEleDmgBonus) * ailDmgTakenMult(target), ...defOf(def, 1, false, target));
        target.hp -= dmg;
        logMsg(`⚡ 「${sk.name}」Lv${lv} 造成 ${dmg} 點傷害！`);
        if (target.hp <= 0) killMonster(def, target);
      } else {
        logMsg(`「${sk.name}」被 ${def.name} 閃避了！`);
        if (typeof showPlayerFloat === 'function') showPlayerFloat('MISS', 'miss');
      }
      // 立即生成新怪（不取代現有怪物）
      if (state.monsters && state.monsters.length < 5) {
        spawnExtraMonster();
        logMsg(`🐎 衝鋒攻擊生成了一隻新怪物！（場上 ${state.monsters.length}/5）`);
      }
      break;
    }
    case 'buff_flee': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'flee', mult, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🌫️ 「${sk.name}」Lv${lv} 發動，迴避上升！`);
      break;
    }
    case 'buff_poison': {
      // 塗毒：武器沾毒，生效期間攻擊有機率使敵人中毒（實際觸發在 playerAttack()）
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'poison', mult: 1, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`☠️ 「${sk.name}」Lv${lv} 發動，武器沾上了毒！`);
      break;
    }
    case 'buff_statpct': {
      // 心神凝聚：DEX/AGI 百分比加成（實際套用在 recomputeDerived()）
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'statpct', mult, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`🎯 「${sk.name}」Lv${lv} 發動，DEX/AGI提升 ${Math.round(mult * 100)}%！`);
      recomputeDerived(false);
      break;
    }
    case 'buff_flatstat': {
      // 大聲吶喊：STR/ATK 固定加成（實際套用在 recomputeDerived()），隊伍效果暫不支援
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const strBonus = Array.isArray(sk.strBonus) ? sk.strBonus[lv - 1] : (sk.strBonus || 0);
      const flatBonus = mult; // mult 存的是 ATK 固定加成
      state.buffs.push({ type: 'flatstat', mult: 1, strBonus, flatBonus, msRemaining: dur * 1000, skillId: sk.id });
      logMsg(`📢 「${sk.name}」Lv${lv} 發動，STR+${strBonus}、ATK+${flatBonus}！`);
      recomputeDerived(false);
      break;
    }
    case 'buff_gold': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'gold', mult, msRemaining: dur * 1000 });
      logMsg(`💰 「${sk.name}」Lv${lv} 發動，掉錢增加！`);
      break;
    }
    case 'buff_crit': {
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      state.buffs.push({ type: 'crit', mult, msRemaining: dur * 1000 });
      logMsg(`🎯 「${sk.name}」Lv${lv} 發動，暴擊率上升！`);
      break;
    }
    case 'debuff_def': {
      if (!state.monsters || state.monsters.length === 0) break;
      const target = state.monsters[0];
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      target.debuffDef = mult;
      target.debuffDefEnd = Date.now() + dur * 1000;
      logMsg(`🔥 「${sk.name}」Lv${lv} 發動，敵人防禦下降！`);
      break;
    }
    // 永遠的混沌（#68）：全體版的防禦下降。跟上面共用 mon.debuffDef，只是打全場
    case 'debuff_def_aoe': {
      if (!state.monsters || state.monsters.length === 0) break;
      const dur = Array.isArray(sk.duration) ? sk.duration[lv - 1] : sk.duration;
      const until = Date.now() + dur * 1000;
      state.monsters.forEach(mon => { mon.debuffDef = mult; mon.debuffDefEnd = until; });
      state.lastSongSkillId = sk.id;
      logMsg(`🎶 「${sk.name}」Lv${lv} 發動！場上敵人的防禦力 −${Math.round((1 - mult) * 100)}%，持續 ${dur} 秒。`);
      break;
    }
  }
  // 新推的 buff 一律掛上來源技能；同一個技能重放時先清掉自己的舊 buff，避免連點疊加
  {
    const fresh = state.buffs.filter(b => !buffsBefore.has(b));
    if (fresh.length) {
      fresh.forEach(b => { if (!b.skillId) b.skillId = sk.id; });
      // 只丟掉「施放前就在、而且也是這個技能推的」那些，順序原封不動
      state.buffs = state.buffs.filter(b => !(buffsBefore.has(b) && b.skillId === sk.id));
    }
    // 祭司那批「全體」輔助技（#95）：同一份 buff／護盾複製一份到每位隊友身上
    if (sk.party) {
      shareBuffsWithAllies(fresh, (state.shields || []).filter(sh => !shieldsBefore.has(sh)), sk);
    }
  }
  /* 雙倍投擲（#76）：整招都結算完了才複製，不然複製出來的那一發會插在
     傷害與擊殺判定中間。放在 saveGame 之前，複製那一發自己也會存一次。 */
  tryDoubleCast(sk, lv);
  /* 元素之劍那類的「魔法連鎖」（on:'chain'）：這招施放成功後觸發下一招。
     放在 saveGame 前面，連鎖那一發自己也會存一次。 */
  tryChainSpells(sk.id, lv);
  saveGame();
  return true;
}

/* 魔法連鎖（元素之劍）：autoSpell 條目寫 `on:'chain', after:'技能id'`，
   當 `after` 那招**成功施放**時按 chance 擲下一次。跟 tryAutoSpells 同一套
   資料格式與觸發管線（state.cardAutoSpells.chain），差別只在觸發點是
   「某招成功施放之後」而不是普攻/受擊。
   連鎖的每一環照陣列順序觸發——同一批裡有兩個 after 相同的條目時，
   先進先出，不會互相插隊。 */
function tryChainSpells(afterSkillId, afterLv) {
  const list = state.cardAutoSpells && state.cardAutoSpells.chain;
  if (!list || !list.length) return;
  const melee = !isBowWeapon(getEquipBaseItemId('weapon'));
  for (const e of list) {
    if (e.after !== afterSkillId) continue;
    if (e.melee && !melee) continue;
    if (Math.random() * 100 >= e.chance) continue;
    const sk = findSkillAnywhere(e.skill);
    if (!sk) continue;
    const ok = sk.type === 'passive'
      ? applyPassiveSkillOnce(sk, e.lv || 1, 'chain', state.monsters && state.monsters[0])
      : castSkill(e.skill, { free: true, forceLv: e.lv || 1 });
    if (ok) logMsg(`🎴 元素連鎖！${sk.name} Lv${e.lv || 1} 發動！`);
    // 連鎖成功就跳出：一環只接一發，下一環由那一發自己的 tryChainSpells 接手
    break;
  }
}

// 在城鎮安全區休息時，HP/SP每秒都會被townRestore()自動補滿：
// 此時自動施放會消耗HP的技能，或只對治療/場域/戰鬥才有意義的技能，
// 只會造成「扣了又馬上補回」的無謂消耗與畫面閃爍，故休息時應跳過
// 有怪物時不視為「城鎮休息」，允許施放
function wastesResourceInTown(sk, lv) {
  if (!isInTown()) return false;
  if (state.monsters && state.monsters.length > 0) return false;  // 有怪物時不阻擋
  const hpCostCheck = Array.isArray(sk.hpCost) ? sk.hpCost[lv - 1] : sk.hpCost;
  if (hpCostCheck > 0) return true;
  // #72 鍊金術士：火煙瓶投擲／生物調撥／生命體召喚／氣泡蟲召喚／化學保護都是「掛著讓它跑」的輔助
  return ['heal', 'heal_over_time', 'field_heal', 'field_aoe_magic', 'stun_field', 'multi_dot_stun', 'debuff_def', 'debuff',
    'field_phys_aoe', 'alchemy_summon', 'bomb_random', 'buff_chemical',
    // #74 聖殿十字軍：捨命攻擊燒自己的血、聖音每 10 秒扣 HP/SP，兩個在城鎮都是純浪費
    'buff_sacrifice', 'field_gospel', 'hp_convert', 'debuff_web'].includes(sk.type);
}

/* ---------------- 技能分類：自動戰鬥頁面與自動施放的唯一真相來源（#101） ----------------

   以前 ui.js 的自動戰鬥頁面自己抄了一份「攻擊類型」與「輔助類型」白名單，
   引擎這邊又抄了一份。**新職業的技能類型只要沒補進 ui.js 那份，畫面上就整組消失**——
   使用者 2026-08-15 回報「鍊金術士技能都沒出現在自動戰鬥頁面」，
   實際盤點少了 20 種類型：鍊金術士 8 個（火煙瓶投擲／氣泡蟲召喚／生物調撥／
   生命體召喚／化學保護 ×4）、吟遊詩人與舞孃整套歌謠、賢者的屬性附加與元素領域、
   教授、聖殿十字軍、小丑…引擎全部放得出來，只是勾不到。

   所以改成**只維護攻擊那份白名單**，其餘非被動一律算輔助——
   之後新增技能類型會自動出現在頁面上，不會再安靜地消失。 */
const SKILL_ATTACK_TYPES = ['damage', 'magic', 'dot', 'damage_multihit', 'damage_multi',
  'damage_aoe', 'magic_aoe', 'poison_proc', 'bomb_random'];
/* 場上沒怪就放不出效果的類型。castSkill() 是**先扣 SP／鋅幣再進 switch**，
   氣泡蟲召喚那種「沒怪就 return false」的 case 會白白吃掉 5,000 鋅幣，
   所以擋在自動施放這一層。 */
const SKILL_NEEDS_MONSTER_TYPES = SKILL_ATTACK_TYPES.concat(['debuff_def', 'debuff',
  'debuff_web', 'debuff_aspd_aoe', 'debuff_def_aoe', 'ailment_aoe', 'dispel_aoe',
  'field_phys_aoe', 'field_aoe_magic', 'multi_dot_stun', 'stun_field']);
function isAttackSkill(sk) { return !!sk && SKILL_ATTACK_TYPES.includes(sk.type); }
function isAutoSupportSkill(sk) { return !!sk && sk.type !== 'passive' && !isAttackSkill(sk); }
function skillNeedsMonster(sk) { return !!sk && SKILL_NEEDS_MONSTER_TYPES.includes(sk.type); }

function tryAutoCastSkill() {
  if (!state.autoSkillConfig) state.autoSkillConfig = { skillId: null, mode: 'once', spThreshold: 30, skillId2: null, spThreshold2: 50, monsterCount2: 2 };

  const config = state.autoSkillConfig;
  const spPct = (state.sp / state.maxSp) * 100;
  const monsterCount = state.monsters ? state.monsters.length : 0;

  /* 兩招都沒設定就什麼都不放（使用者 2026-08-15 指定）。

     這裡本來有一條「沒設定就自動撈第一個能放的技能」的回退。#100 把它限制成只撈
     攻擊技能，但使用者要的是**下拉選單選「不使用技能」就真的不要放**——
     商人一路上場的金錢攻擊與手推車攻擊都是這條回退自己跑出來的。
     技能一律以自動戰鬥頁面的設定為準，回退整條移除。 */
  if (!config.skillId && !config.skillId2) return;

  // 第一招：SP 達到門檻 + 有怪物就施放
  if (config.skillId) {
    const sk = findSkillForUse(config.skillId);
    if (sk) {
      const lv = skillLv(sk.id);
      if (lv && skillReady(sk.id) && weaponReqMet(sk.requiresWeapon) && equipReqMet(sk.requiresEquip)) {
        const spCost = skillSpCost(sk, lv);
        const isAttack = skillNeedsMonster(sk);
        if (state.sp >= spCost && spPct >= config.spThreshold && !wastesResourceInTown(sk, lv)) {
          if (!isAttack || monsterCount > 0) {
            castSkill(sk.id);
            return;
          }
        }
      }
    }
  }

  // 第二招：SP 達到門檻 + 怪物數量達到門檻才施放
  if (config.skillId2) {
    const sk2 = findSkillForUse(config.skillId2);
    if (sk2) {
      const lv2 = skillLv(sk2.id);
      if (lv2 && skillReady(sk2.id) && weaponReqMet(sk2.requiresWeapon) && equipReqMet(sk2.requiresEquip)) {
        const spCost2 = skillSpCost(sk2, lv2);
        if (state.sp >= spCost2 && spPct >= config.spThreshold2 && monsterCount >= config.monsterCount2 && !wastesResourceInTown(sk2, lv2)) {
          castSkill(sk2.id);
          return;
        }
      }
    }
  }
}

// 自動施放輔助技能
function tryAutoCastSupportSkills() {
  if (!state.autoSupportSkills) return;
  {
    for (const { sk, lv } of usableSkillEntries()) {
      if (!state.autoSupportSkills[sk.id]) continue;
      if (!skillReady(sk.id)) continue;
      if (!weaponReqMet(sk.requiresWeapon)) continue;
      if (!equipReqMet(sk.requiresEquip)) continue;
      if (wastesResourceInTown(sk, lv)) continue;

      const spCost = skillSpCost(sk, lv);
      if (state.sp < spCost) continue;

      /* 效果還在身上就不重放（等它消失後自動補）。以前這裡是一份 40 種類型的白名單，
         漏掉一種就會變成「每次冷卻好就重放一次」——生命體召喚持續 30 分鐘、冷卻 10 秒、
         一次 10 萬鋅幣，漏掉那種的代價是把錢包放乾。改成直接比**這個技能自己**留下的東西：

           · state.buffs         一般 buff（歌謠、化學保護、屬性附加…）
           · state.shields       護盾（暗之障壁、霸邪之陣）
           · activeFieldEffects  場域（火煙瓶投擲、生物調撥、生命體召喚、聖音）

         一律比 skillId，不比 type——攻速藥水與雙手劍加速同樣是 type:'aspd'，
         比 type 會讓藥水一喝下去就把技能擋掉 30 分鐘。
         沒有留下任何痕跡的（治癒術、減益、範圍魔法）不受影響，照舊每次冷卻好就放。 */
      if (state.buffs.some(b => b.skillId === sk.id)) continue;
      if (state.shields && state.shields.some(sh => sh.id === sk.id)) continue;
      if (state.activeFieldEffects && state.activeFieldEffects.some(f => f.skillId === sk.id)) continue;
      // 要有怪才放得出效果的（減益、場域、範圍傷害）：空場放出去只是白扣 SP 與鋅幣
      if (skillNeedsMonster(sk) && (!state.monsters || state.monsters.length === 0)) continue;
      // Heal 類：依技能自訂的HP%門檻觸發，並可設SP%下限保護
      if (sk.type === 'heal') {
        const healCfg = (state.autoHealConfig && state.autoHealConfig[sk.id]) || { hpThreshold: 70, spThreshold: 0 };
        if (state.hp > state.maxHp * ((healCfg.hpThreshold ?? 70) / 100)) continue;
        if (healCfg.spThreshold > 0 && state.sp < state.maxSp * (healCfg.spThreshold / 100)) continue;
      }

      castSkill(sk.id);
    }
  }

  // 偽裝連動：勾選了自動偽裝，且偽裝生效中時，自動施放無影之牙
  if (state.autoSupportSkills['cloaking']) {
    const cloakActive = state.buffs.some(b => b.type === 'flee' && b.skillId === 'cloaking');
    const gtLv = skillLv('grimtooth');
    if (cloakActive && gtLv && skillReady('grimtooth') && state.monsters && state.monsters.length > 0) {
      const gtSk = findSkillForUse('grimtooth');
      const gtCost = skillSpCost(gtSk, gtLv);
      if (state.sp >= gtCost) castSkill('grimtooth');
    }
  }
}

// 取得所有已解鎖職業的技能（用於自動施放）
function getAllLearnedJobs() {
  const jobs = [];
  let cur = state.jobId;
  while (cur) {
    jobs.unshift(cur);
    cur = JOB_TREE[cur].parent;
  }
  return jobs;
}

// 計算所有已轉職職業的 job bonus 總和（累計繼承）
function computeJobBonuses() {
  const allJobs = getAllLearnedJobs();
  const totals = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  for (const jobId of allJobs) {
    const jd = JOB_TREE[jobId];
    if (!jd || !jd.bonusLevels) continue;
    const jobLv = (jobId === state.jobId) ? state.jobLevel : (state.jobLevelHistory?.[jobId] || 0);
    for (const [stat, levels] of Object.entries(jd.bonusLevels)) {
      totals[stat] += levels.filter(lv => lv <= jobLv).length;
    }
  }
  return totals;
}

// 根據 ID 尋找技能（搜尋所有已解鎖職業）
function findSkillById(skillId) {
  const allJobs = getAllLearnedJobs();
  for (const jobId of allJobs) {
    const job = JOB_TREE[jobId];
    if (!job) continue;
    const sk = job.skills.find(s => s.id === skillId);
    if (sk) return sk;
  }
  return null;
}

/* ---------------- 職業路線清理（#56）----------------
   使用者的規則：**轉職／轉生之後只保留本系路線，其餘職業一律刪除。**

   先前的 `doJobChange()` 反過來——它刻意「保留所有已學技能」。在沒有轉生的年代
   那條規則碰不到，因為 `next` 只往下走，一個角色一輩子只會在一條線上。
   加了轉生之後就不一樣了：轉生回新手再選另一條線，兩條線的技能會同時掛在身上。

   判斷用的是**技能 id 的集合**不是職業 id：超級新手的 `borrowSkillsFrom` 在載入時
   就把六個一轉的技能整份併進自己的 `skills` 了，照職業 id 比對會把它們誤刪。 */
function jobLineSkillIds(jobId) {
  const ids = new Set();
  let cur = jobId;
  while (cur && JOB_TREE[cur]) {
    (JOB_TREE[cur].skills || []).forEach(sk => ids.add(sk.id));
    cur = JOB_TREE[cur].parent;
  }
  return ids;
}
function jobLineIds(jobId) {
  const ids = new Set();
  let cur = jobId;
  while (cur && JOB_TREE[cur]) { ids.add(cur); cur = JOB_TREE[cur].parent; }
  return ids;
}
/* 回傳「會被刪掉的東西」，不做任何修改——UI 拿它去寫確認視窗。 */
function jobPrunePreview(keepJobId) {
  const keepSkills = jobLineSkillIds(keepJobId);
  const keepJobs = jobLineIds(keepJobId);
  const skills = Object.keys(state.learnedSkills || {})
    .filter(id => !keepSkills.has(id) && state.learnedSkills[id] > 0);
  const jobs = Object.keys(state.jobLevelHistory || {}).filter(j => !keepJobs.has(j));
  let points = 0;
  Object.keys(state.jobSkillPoints || {}).forEach(j => {
    if (!keepJobs.has(j)) points += state.jobSkillPoints[j] || 0;
  });
  return { skills, jobs, points };
}
function pruneOtherJobLines(keepJobId) {
  const p = jobPrunePreview(keepJobId);
  p.skills.forEach(id => { delete state.learnedSkills[id]; });
  p.jobs.forEach(j => { delete state.jobLevelHistory[j]; });
  const keepJobs = jobLineIds(keepJobId);
  Object.keys(state.jobSkillPoints || {}).forEach(j => {
    if (!keepJobs.has(j)) delete state.jobSkillPoints[j];
  });
  state.skillPoints = Object.values(state.jobSkillPoints || {}).reduce((a, b) => a + b, 0);
  return p;
}

/* ---------------- 轉生（#56）----------------
   條件：基礎等級 99 ＋ 職業等級 50 ＋ 100 萬 zeny。
   效果：變回新手，素質全部歸 1 並給 100 點素質點，另外補技能點。

   **素質是歸零重加不是保留再送 100 點**：官方轉生就是重置再給 100 點的
   轉生加成，保留 Lv99 的素質再送 100 點會直接壞掉平衡。

   **技能點的數字是算出來的不是寫死的**：新手四個技能滿級要 20 點，
   職業等級 1→10 自然拿到 9 點，所以補 11 點，剛好「滿級時點得滿」。
   之後若動了新手技能表，這裡自動跟著變。

   **每隻角色只能轉生一次，而且路線鎖死**：轉生的用意是把本職練得更強
   （劍士→騎士→**領主騎士**），不是拿來體驗別的職業。所以 `doRebirth()` 會把
   轉生前走過的職業鏈存進 `state.rebirthPath`，之後 `canJobChange()` 只放行
   那條路上的下一站，走完再接 `nextLocked` 的進階二轉。 */
const REBIRTH_REQ = { baseLevel: 99, jobLevel: 50, zeny: 1000000 };
const REBIRTH_STAT_POINTS = 100;
const REBIRTH_MAX = 1;   // 每隻角色只能轉生一次
/* 轉生後的 HP/SP 加成。官方轉生職就是 +25%，而且「轉生過」就有——
   不必等轉到進階二轉，高等劍士／高等巫師那段中途職業同樣吃得到（見 recomputeDerived）。 */
const TRANSCENDENT_HPSP_MULT = 1.25;

function rebirthSkillPoints() {
  const n = JOB_TREE.novice;
  const need = (n.skills || []).reduce((a, sk) => a + (sk.isQuest ? 0 : (sk.maxLv || 1)), 0);
  const fromLevels = Math.max(0, (n.jobLevelMax || 1) - 1);
  return Math.max(0, need - fromLevels);
}

// 目前這張圖是不是安全區（沒有配怪的圖就是城鎮）。轉生祭壇只開在安全區
function inSafeZone() {
  const m = currentMap();
  return !!m && (m.monsters || []).length === 0;
}

// 擋住轉生的理由（沒有就回 null）。UI 直接顯示這句話，不必自己拼條件
function rebirthBlockReason() {
  if ((state.rebirthCount || 0) >= REBIRTH_MAX) return '每隻角色只能轉生一次。';
  if (state.jobId === 'novice') return '你已經是新手了。';
  if (!inSafeZone()) return '要在安全區（城鎮）才能轉生。';
  if (state.baseLevel < REBIRTH_REQ.baseLevel) return `基礎等級要達到 ${REBIRTH_REQ.baseLevel}（目前 ${state.baseLevel}）。`;
  if (state.jobLevel < REBIRTH_REQ.jobLevel) return `職業等級要達到 ${REBIRTH_REQ.jobLevel}（目前 ${state.jobLevel}）。`;
  if (state.gold < REBIRTH_REQ.zeny) return `需要 ${REBIRTH_REQ.zeny.toLocaleString()}z（目前 ${Math.floor(state.gold).toLocaleString()}z）。`;
  return null;
}
function canRebirth() { return rebirthBlockReason() === null; }

/* 轉生後的下一站。轉生的用意是**把本職練得更強**，不是換一個職業體驗，
   所以路線被鎖死：轉生前走過哪條線，轉生後就只能照原樣重走一次，
   走完再往上接進階二轉（`nextLocked`）。

   `nextLocked` 目前指向的六個進階二轉還沒進 `JOB_TREE`，
   所以這裡回傳的 id 會查不到職業、`canJobChange()` 自然擋下來——
   等那六個職業補進資料就會**自動接上**，不必再改這裡。 */
/* 轉生後那條路線長什麼樣。

   **進階二轉「取代」原本的二轉**（使用者 2026-08-09 決定），不是接在後面：
     轉生前  新手 → 劍士 → 騎士
     轉生後  新手 → 劍士 → **領主騎士**
   官方轉生就是這個形狀（高等劍士直接轉領主騎士，不會再當一次騎士），
   而且「再走一次一模一樣的二轉、然後才拿到獎勵」對玩家是純粹的重複勞動。

   做法是把 `rebirthPath` 裡的二轉換成它的 `nextLocked[0]`。
   一轉那一段照舊——那是真的要重走的，職業加成與技能都從那裡長出來。 */
function rebirthLine() {
  if (!state.rebirthPath || !state.rebirthPath.length) return null;
  const out = ['novice'];
  state.rebirthPath.forEach(j => {
    const jd = JOB_TREE[j] || {};
    const up = (jd.tier === 2 && jd.nextLocked && jd.nextLocked[0]) ? jd.nextLocked[0] : null;
    out.push(up && JOB_TREE[up] ? up : j);
  });
  return out;
}

function rebirthPathNext() {
  const line = rebirthLine();
  if (!line) return null;
  const i = line.indexOf(state.jobId);
  const jd = JOB_TREE[state.jobId];
  /* 還在原路上 → 下一站就是路上的下一個。
     已經走完（回到騎士）或**走得比原路更遠**（已經轉成領主騎士）→ 交給 nextLocked。
     `i < 0` 那條以前直接回 null，等於「一轉成進階二轉，鎖就悄悄解除了」——
     目前因為進階二轉的 next 是空的所以沒出事，但三轉一補進來就會破洞。 */
  if (i >= 0 && i + 1 < line.length) return line[i + 1];
  return (jd && jd.nextLocked && jd.nextLocked[0]) || null;
}

function doRebirth() {
  const blocked = rebirthBlockReason();
  if (blocked) { logMsg('⚠️ ' + blocked); return false; }

  state.gold -= REBIRTH_REQ.zeny;
  state.rebirthCount = (state.rebirthCount || 0) + 1;
  // 記下原本走的那條線（不含新手），轉生後只能照這條路重走
  state.rebirthPath = getAllLearnedJobs().filter(j => j !== 'novice');

  /* 全身裝備先卸下（含插著的卡片，`returnEquipToInventory` 會整件帶回背包）。

     不是為了懲罰，是因為**轉生後那些裝備一件都穿不上**——等級歸 1、職業變新手，
     職業限定與等級限定會全部擋下來。留在身上會變成「穿著卻不合法」的狀態：
     加成照算、但脫下來就再也穿不回去。與其讓玩家自己去發現，不如轉生時一次卸乾淨。
     （另一個選項是「要求玩家先全部卸下才准轉生」，那只是把同樣的工作丟回給玩家。） */
  const unequipped = [];
  EQUIP_SLOTS_ALL.forEach(slot => {
    if (!state.equip[slot]) return;
    const id = getEquipBaseItemId(slot);
    returnEquipToInventory(slot);
    if (ITEMS[id]) unequipped.push(ITEMS[id].name);
  });
  if (unequipped.length) {
    logMsg(`🎒 轉生前卸下了 ${unequipped.length} 件裝備（已放回背包）。`);
  }

  // 等級與經驗歸零
  state.baseLevel = 1; state.baseExp = 0;
  state.jobLevel = 1; state.jobExp = 0;
  state.jobId = 'novice';

  // 素質歸 1，發 100 點轉生素質點
  STAT_KEYS.forEach(k => { state.stats[k] = 1; });
  state.statPoints = REBIRTH_STAT_POINTS;

  /* 技能與職業紀錄：轉生後路線只剩新手，其餘全部清掉（跟轉職同一條規則）。
     jobSkillPoints 直接重設，不沿用舊職業殘留的點數池。 */
  state.jobLevelHistory = {};
  state.jobSkillPoints = {};
  pruneOtherJobLines('novice');
  /* 技能**全部**清掉，包含新手自己的那四個。

     以前只走 pruneOtherJobLines('novice')，而新手在保留的路線上，
     所以四個技能原封不動留著（已經投了 20 點），然後又發 11 點下去——
     那 11 點加上重練 JOB1→10 的 9 點共 20 點，全部無處可花，就是使用者看到的溢出。
     轉生的定位是「重新來過再走一次」，技能當然要跟等級、素質一起歸零。
     舊存檔的溢出點請走「重置技能」修（resetSkills 會把超過上限的砍掉）。 */
  state.learnedSkills = {};
  const bonusSp = rebirthSkillPoints();
  state.jobSkillPoints.novice = (state.jobSkillPoints.novice || 0) + bonusSp;
  state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);

  // 新手的任務技能照樣自動習得（跟轉職同一段邏輯）
  (JOB_TREE.novice.skills || []).forEach(sk => {
    if (sk.isQuest && !state.learnedSkills[sk.id]) state.learnedSkills[sk.id] = 1;
  });

  state.buffs = [];
  state.shields = [];
  state.playerAil = {};
  state.pdebuff = {};
  recomputeDerived(true);
  state.hp = state.maxHp; state.sp = state.maxSp;

  logMsg(`🌟 轉生完成！這是你的第 ${state.rebirthCount} 次轉生。`);
  logMsg(`　　獲得 ${REBIRTH_STAT_POINTS} 點素質點與 ${bonusSp} 點新手技能點（滿級時剛好點滿新手全部技能）。`);
  if (typeof updatePlayerSprite === 'function') updatePlayerSprite();
  saveGame();
  return true;
}

/* ---------------- 轉職 ----------------
   轉職一律只能往下走（`next`），而且**轉生過的角色連分岔都沒有**——
   只放行 `state.rebirthPath` 記下的那條原路。 */
function canJobChange(targetId) {
  const job = currentJob();
  const locked = rebirthPathNext();
  if (locked !== null && targetId !== locked) return false;
  // 進階二轉走 nextLocked，不在 next 裡，所以鎖定路線命中時不再檢查 next
  if (targetId !== locked && !job.next.includes(targetId)) return false;
  const target = JOB_TREE[targetId];
  if (!target) return false;                // 進階二轉還沒進資料時安全擋下
  // 性別鎖（#68 詩人／舞孃）：官方就是依性別二選一
  if (target.genderLock && (state.gender || 'male') !== target.genderLock) return false;
  // 基本條件：等級夠
  // 1轉／2轉／進階二轉只要求 JOB 滿級；只有 3轉 額外要求基礎等級（LV99）
  if (state.jobLevel < job.jobLevelMax) return false;
  if ((target.tier >= 3) && state.baseLevel < target.baseLevelReq) return false;
  // 技能點檢查：當前職業的技能點必須花完
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  if ((state.jobSkillPoints[state.jobId] || 0) > 0) return false;
  return true;
}
// 轉生鎖住路線之後，這個職業之所以不能選的理由（給 UI 顯示用）
function jobLockReason(targetId) {
  const locked = rebirthPathNext();
  if (locked === null || targetId === locked) return null;
  return `轉生後只能重走原本的路線，下一站是「${(JOB_TREE[locked] || {}).name || locked}」。`;
}

/* 轉不了職的**具體**理由（給職業樹逐格顯示用）。

   以前職業樹只有「能轉」與「不能轉」兩種狀態，不能轉的時候整格是空的——
   玩家看到的就是「按了沒反應」。轉生之後樹上只剩自己那三格，這件事更明顯：
   畫面上只有一條路，而那條路點不動，看起來就像壞掉。
   實際上擋住的原因通常很單純（差一級、技能點還沒花完），寫出來就好。 */
function jobChangeBlockReason(targetId) {
  const job = currentJob();
  const target = JOB_TREE[targetId];
  if (!target) return '這個職業還沒實作。';
  if (state.jobId === targetId) return null;

  const locked = jobLockReason(targetId);
  if (locked) return locked;

  // 性別鎖（#68）：擋得最早，因為這條再怎麼練都解不開
  if (target.genderLock && (state.gender || 'male') !== target.genderLock) {
    return `這個職業只有${target.genderLock === 'male' ? '男性' : '女性'}角色能轉。`;
  }

  // 不在路線上（沒轉生過的一般情況）
  const lockedNext = rebirthPathNext();
  if (targetId !== lockedNext && !job.next.includes(targetId)) {
    return `要先成為「${(JOB_TREE[target.parent] || {}).name || target.parent}」。`;
  }
  if (state.jobLevel < job.jobLevelMax) {
    return `職業等級要滿 ${job.jobLevelMax}（目前 ${state.jobLevel}）。`;
  }
  // 只有 3轉 才要求基礎等級；1/2/進階二轉只看 JOB 滿級
  if ((target.tier >= 3) && state.baseLevel < target.baseLevelReq) {
    return `基礎等級要達到 ${target.baseLevelReq}（目前 ${state.baseLevel}）。`;
  }
  const left = (state.jobSkillPoints || {})[state.jobId] || 0;
  if (left > 0) {
    return `還有 ${left} 點技能點沒用完。`;
  }
  return null;
}

/* 轉職就自動獲得、不吃技能點的被動（`autoGrant: true`）。

   跟既有的 `isQuest` 是兩件事：任務技能官方要跑任務才拿得到，這些是
   「官方 maxLv 0 或未開放、本作改成職業自帶的小被動」（十字軍的退縮、
   詩人的陣痛之聲、舞孃的眨眼之誘）。它們不該佔技能點——**沒有人會為了
   1 秒暈眩去花點數**，做成要點的話等於做了個沒人點的技能。

   除了轉職時發，讀檔時也補發一次：技能是後來才加的，
   已經轉好職的存檔不補就永遠拿不到。 */
function grantAutoSkills(verbose) {
  const job = currentJob();
  if (!job || !job.skills) return 0;
  if (!state.learnedSkills) state.learnedSkills = {};
  let n = 0;
  job.skills.forEach(sk => {
    if (!sk.autoGrant || state.learnedSkills[sk.id]) return;
    state.learnedSkills[sk.id] = sk.maxLv || 1;
    n++;
    if (verbose) logMsg(`✨ 自動獲得職業被動：${sk.name}！`);
  });
  return n;
}

function doJobChange(targetId) {
  if (!canJobChange(targetId)) return false;
  const target = JOB_TREE[targetId];
  // 新手第一次轉職（轉生後不重發）：判斷要在 jobId 被換掉之前做
  const fromNovice = state.jobId === 'novice' && (state.rebirthCount || 0) === 0;

  // 檢查當前職業的技能點是否已全部花完
  if (!state.jobSkillPoints) state.jobSkillPoints = {};
  const currentJobPoints = state.jobSkillPoints[state.jobId] || 0;
  if (currentJobPoints > 0) {
    logMsg(`⚠️ 你還有 ${currentJobPoints} 點 ${currentJob().name} 的技能點未使用，請先用完再轉職！`);
    return false;
  }

  // 存舊職業的 jobLevel（職業加成跨職業繼承）
  if (!state.jobLevelHistory) state.jobLevelHistory = {};
  state.jobLevelHistory[state.jobId] = state.jobLevel;

  state.jobId = targetId;
  state.jobLevel = 1;
  state.jobExp = 0;

  if (!state.jobSkillPoints[targetId]) state.jobSkillPoints[targetId] = 0;

  /* 只保留本系路線，其餘職業的技能／技能點／職業紀錄一律刪除（#56）。
     以前這裡是反過來的——刻意「保留所有已學技能」。那條規則在沒有轉生的年代
     碰不到（`next` 只往下走，一輩子只在一條線上），加了轉生就會讓兩條線的技能
     同時掛在身上。UI 會先用 jobPrunePreview() 把要刪的東西列給玩家確認。 */
  const pruned = pruneOtherJobLines(targetId);
  if (pruned.skills.length || pruned.points) {
    logMsg(`🧹 離開原本的路線：清除了 ${pruned.skills.length} 個技能`
      + (pruned.points ? `與 ${pruned.points} 點未使用的技能點` : '') + '。');
  }

  // 自動習得新職業的任務技能
  target.skills.forEach(sk => {
    if (sk.isQuest && !state.learnedSkills[sk.id]) {
      state.learnedSkills[sk.id] = 1;
      logMsg(`自動習得任務技能：${sk.name}！`);
    }
  });
  grantAutoSkills(true);

  recomputeDerived(true);
  logMsg(`🎊 恭喜！你轉職成為「${target.icon} ${target.name}」！`);
  /* 新手第一次轉職禮：紅水 300 人人有；弓箭手多 1000 鋼鐵箭矢，
     其他職業折現 1 萬鋅幣。轉生後重轉不發。 */
  if (fromNovice) {
    addItem('red_potion', 300);
    if (targetId === 'archer') {
      addItem('steel_arrow', 1000);
      logMsg('🎁 新手轉職禮：紅色藥水 ×300、鋼鐵箭矢 ×1000！');
    } else {
      state.gold += 10000;
      logMsg('🎁 新手轉職禮：紅色藥水 ×300、鋅幣 10,000！');
    }
  }
  if (typeof updatePlayerSprite === 'function') updatePlayerSprite();
  saveGame();
  return true;
}

/* ---------------- 道具 / 裝備 ---------------- */

/* ---------------- NPC 商店系統 ---------------- */
/* 基於 ro_npcshop_data，剔除不存在的物品 */
const NPC_SHOPS = {
  weapon: {
    name: '武器商人',
    icon: '⚔️',
    items: ['knife', 'cutter', 'main_gauche', 'dirk', 'dagger', 'stiletto', 'gladius', 'damascus', 'cinquedea', 'kindling_dagger', 'obsidian_dagger', 'item_1249', 'jujube_dagger', 'coward', 'sword', 'falchion', 'blade', 'lapier', 'tsurugi', 'haedonggum', 'saber', 'slayer', 'bastard_sword', 'two_hand_sword', 'broad_sword', 'spear', 'pike', 'lance', 'guisarme', 'glaive', 'halberd', 'axe', 'battle_axe', 'hammer', 'buster', 'two_handed_axe', 'club', 'mace', 'smasher', 'flail', 'morning_star', 'sword_mace', 'chain', 'stunner', 'bow', 'composite_bow', 'great_bow', 'cross_bow', 'arbalest', 'kakkung', 'hunter_bow', 'repeting_cross_bow', 'waghnakh', 'knuckle_duster', 'hora', 'fist', 'claw', 'finger', 'violin', 'mandolin', 'lute', 'guitar', 'harp', 'guh_moon_goh',
      // 樂器／鞭子／法杖的低階線：官方商店同一家武器商人賣的就是這條線
      'cello', 'contabass', 'electronic_guitar',
      'rope', 'rope_', 'line', 'line_', 'wire', 'wire_', 'lariat', 'tail', 'tail_', 'whip', 'whip_', 'rante', 'rante_',
      'rod', 'rod_', 'wand', 'wand_', 'staff', 'staff_', 'survival_rod', 'survival_rod_', 'survival_rod2', 'survival_rod2_', 'arc_wand', 'arc_wand_',
      // 拳刃：刺客專用，官方商店賣的就是這條線
      'jur', 'jur_', 'katar', 'katar_', 'jamadhar', 'jamadhar_',
      // 箭矢：弓箭手系列的消耗品，跟弓放同一家店
      'arrow', 'iron_arrow', 'steel_arrow', 'silver_arrow', 'fire_arrow', 'crystal_arrow', 'arrow_of_wind', 'stone_arrow'],
    getItems() {
      return this.items.filter(id => {
        const item = ITEMS[id];
        if (!item) return false;
        if (item.reqLevel && state.baseLevel < item.reqLevel) return false;
        return true;
      });
    }
  },
  item: {
    name: '道具商人',
    icon: '🧪',
    // 補HP藥水、精煉材料、攻速藥水；SP 只賣藍水（1000z），其餘回SP道具靠打怪掉
    items: ['red_potion', 'orange_potion', 'yellow_potion', 'white_potion',
            'blue_potion',
            'refine_stone',
            'center_potion', 'awakening_potion', 'berserk_potion',
            // 未解封的卡冊：500 萬一本，開出卡冊再開出卡片。純粹是給後期消耗金錢的玩法
            'sealed_card_album', 'leaf_of_yggdrasil'],
    getItems() {
      return this.items.filter(id => ITEMS[id]);
    }
  },
  armor: {
    name: '防具商人',
    icon: '🛡️',
    items: ['flu_mask', 'granpa_beard', 'hood', 'muffler', 'manteau', 'novice_manteau', 'cotton_shirt', 'leather_jacket', 'adventure_suit', 'mantle', 'coat', 'padded_armor', 'chain_mail', 'plate_armor', 'silk_robe', 'scapulare', 'saint_robe', 'wooden_mail', 'tights', 'silver_robe', 'thief_clothes', 'wedding_dress', 'novice_breast', 'full_plate_armor', 'guard', 'buckler', 'shield', 'mirror_shield', 'novice_shield', 'arm_guard', 'sandals', 'shoes', 'boots', 'grave', 'novice_shoes', 'rosary', 'skul_ring', 'flower_ring', 'diamond_ring', 'belt', 'novice_armlet', 'wedding_veil', 'ribbon', 'bandana', 'biretta', 'hat', 'turban', 'cap', 'helm', 'gemmed_sallet', 'circlet', 'super_novice_hat', 'fedora', 'sunglasses', 'glasses', 'item_2205', 'eye_bandage', 'one_eyed_glass', 'luxury_sunglasses', 'spinning_eyes', 'goggle', 'blue_coif'],
    getItems() {
      return this.items.filter(id => {
        const item = ITEMS[id];
        if (!item) return false;
        if (item.reqLevel && state.baseLevel < item.reqLevel) return false;
        return true;
      });
    }
  }
};

/* 箭矢**全部**上架（#139，使用者要求）。

   上面那一行手寫的只有 8 種，而遊戲裡有 26 種——屬性箭（影子、無形、鐵鏽）、
   異常狀態箭（昏迷、冰凍、睡眠、寧靜、詛咒、毒）、高階箭（神之金屬、破魔、精靈）
   全都買不到，弓箭手想換屬性只能等它掉。

   **用 type 掃而不是再手抄一份清單**：之後加新箭矢會自動上架，不會再出現
   「資料裡有、商店沒有」這種只有玩家會發現的落差。寫進 `items` 而不是只在
   getItems() 裡加，是因為圖鑑的「商店販售」那一行讀的是 `items`。 */
(function stockAllArrows() {
  const list = NPC_SHOPS.weapon.items;
  const has = new Set(list);
  Object.keys(ITEMS).forEach(id => {
    if (ITEMS[id].type !== 'ammo' || has.has(id)) return;
    list.push(id);
    has.add(id);
  });
})();

// NPC 商店開在地圖分頁裡（只有安全區的地圖才會有入口），不再有獨立的 NPC 分頁
function openNpcShop(shopId) {
  const shop = NPC_SHOPS[shopId];
  if (!shop) return;
  if (!isInTown()) return;
  const items = shop.getItems();
  const el = document.getElementById('tab-map');
  if (!el) return;

  // Group items by type
  const grouped = {};
  items.forEach(id => {
    const item = ITEMS[id];
    let category = '其他';
    if (item.type === 'weapon') {
      const cat = item.weaponCat || item.weaponType || 'sword';
      const typeNames = { dagger: '短劍', sword: '劍', tsword: '雙手劍', bow: '弓', rod: '法杖', mace: '鈍器', katar: '拳刃', spear: '長矛', knuckle: '拳套', instrument: '樂器', whip: '鞭子' };
      category = typeNames[cat] || cat;
    } else if (item.type === 'armor') {
      const armorType = item.armorType || 'cloth';
      const typeNames = { cloth: '衣服', leather: '皮甲', shield: '盾牌', garment: '披風', footgear: '鞋子', accessory: '飾品' };
      category = typeNames[armorType] || armorType;
    } else if (item.type === 'ammo') {
      category = '箭矢';        // 26 種全上架（#139），不分一組會全部掉進「其他」
    } else if (item.aspdPct) {
      category = '攻速藥水';
    } else if (item.restoreSp) {
      category = 'SP 回復';
    } else if (item.heal) {
      category = 'HP 回復';
    } else if (REFINEMENT_MATERIALS[id]) {
      category = '精煉材料';
    }
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(id);
  });

  let html = `<div class="npc-shop">
    <div class="npc-shop-header">
      <button class="btn-small" onclick="renderMapTab()">← 返回地圖</button>
      <h3 class="panel-title">${shop.icon} ${shop.name}</h3>
    </div>`;

  Object.keys(grouped).forEach(category => {
    html += `<div class="shop-category">
      <h4 class="shop-category-title">${category}</h4>
      <div class="shop-items">`;
    grouped[category].forEach(id => {
      const item = ITEMS[id];
      const qty = getItemQty(id);
      const canAfford = state.gold >= item.buyPrice;
      html += `<div class="shop-row ${canAfford ? '' : 'shop-cannot-afford'}">
        <div class="shop-item-info">
          <span class="shop-item-icon">${item.icon}</span>
          <div class="shop-item-details">
            <span class="shop-item-name">${item.name}${item.element ? ' ' + ELEMENT_ICONS[item.element] : ''}</span>
            <span class="shop-item-stats">${item.atk ? 'ATK ' + item.atk : ''}${item.matk ? 'MATK ' + item.matk : ''}${item.def ? 'DEF ' + item.def : ''}${item.element ? ' [' + ELEMENT_NAMES[item.element] + ']' : ''}</span>
          </div>
        </div>
        <div class="shop-item-actions">
          <span class="shop-item-price">${item.buyPrice} 💰</span>
          <span class="shop-item-owned">持有 ${qty}</span>
          <input type="number" class="shop-buy-qty" id="shop-qty-${id}" value="1" min="1" max="9999"
            style="width:52px;padding:2px 4px;" onkeydown="if(event.key==='Enter'){buyItemFromShop('${id}','${shopId}');}">
          <button class="btn-small" ${canAfford ? '' : 'disabled'} onclick="buyItemFromShop('${id}','${shopId}');">購買</button>
        </div>
      </div>`;
    });
    html += '</div></div>';
  });

  html += '</div>';
  el.innerHTML = html;
}

/* ---------------- 城鎮恢復 ---------------- */
function isInTown() {
  const map = currentMap();
  return map && map.monsters.length === 0;
}

/* ---- 回最近的安全區（#120）----
   優先找**目前這一區**的安全區；這一區沒有就回普隆德拉。
   跟 onPlayerDown() 被抬回城走的是同一套判斷，只是那邊是被動觸發。 */
const FALLBACK_SAFE_MAP = 'prontera';
function nearestSafeMapId() {
  const region = typeof regionOf === 'function' ? regionOf(state.mapId) : null;
  if (region) {
    for (const mid of region.maps) {
      const m = MAPS.find(x => x.id === mid);
      if (m && (m.monsters || []).length === 0) return mid;
    }
  }
  return MAPS.find(x => x.id === FALLBACK_SAFE_MAP) ? FALLBACK_SAFE_MAP : null;
}
function goNearestSafeZone() {
  const id = nearestSafeMapId();
  if (!id) return false;
  if (state.mapId === id) {
    logMsg('🏠 你已經在安全區了。');
    return false;
  }
  return changeMap(id);
}

function townRestore() {
  if (!isInTown()) return;
  if (state.hp < state.maxHp || state.sp < state.maxSp) {
    state.hp = state.maxHp;
    state.sp = state.maxSp;
    logMsg('🏠 你在城鎮中休息，HP 與 SP 已完全恢復！');
  }
}
// 註：背包裡「個體裝備」是獨立一行（帶 instanceId），跟普通堆疊分開；
// 所有按 itemId 找堆疊的地方都要排除個體行，否則會誤動到那一件獨立裝備。
/* 掉落一律進**玩家**的背包。隊友是靠 withAlly() 換身跑攻擊的，
   不導回去的話牠打死的怪掉的東西會進快照的空背包，等於憑空消失。
   在這裡攔一次，勝過在 killMonster 的每個掉落分支各攔一次。 */
function addItem(itemId, qty) {
  const inv = allyOwnerState();
  const row = inv.inventory.find(r => r.item === itemId && !r.instanceId);
  if (row) row.qty += qty; else inv.inventory.push({ item: itemId, qty });
  withOwner(() => codexRecordItem(itemId, qty));
}
function removeItem(itemId, qty) {
  const owner = allyOwnerState();          // 換身中也扣玩家的（見 getItemQty）
  if (!Array.isArray(owner.inventory)) return false;
  const row = owner.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!row) return false;
  row.qty -= qty;
  if (row.qty <= 0) owner.inventory = owner.inventory.filter(r => !(r.item === itemId && !r.instanceId));
  return true;
}
/* 一次開完手上所有同款箱子（#143）。

   一個一個點：50 個箱子＝50 次點擊 + 50 行紀錄，卡冊那條鏈（未解封 → 卡冊 → 卡片）
   更是要點三輪。這裡把「抽」跟「寫紀錄」拆開：抽照樣一個一個抽（每次都是獨立的機率，
   不能用倍數近似），但紀錄合併成一份清單，不然戰鬥紀錄會被洗掉幾百行。

   稀有的（MVP／迷你王卡、售價 5 萬以上）還是各自列一行——那是開箱子的重點，
   混在「共 37 種」裡面等於沒看到。 */
const BOX_OPEN_ALL_MAX = 999;              // 一次最多開這麼多，避免手滑卡住畫面
const BOX_OPEN_CHUNK = 50;                 // 每批開這麼多就讓出主執行緒（玩家回報一次開太多會當掉）
const BOX_OPEN_CHUNK_DELAY_MS = 30;        // 批次之間的間隔：讓瀏覽器真的有空檔重繪，低階機也撐得住
/* 分批開箱（保守版）：每 BOX_OPEN_CHUNK 個就讓出主執行緒，批次間再隔
   BOX_OPEN_CHUNK_DELAY_MS——setTimeout 0 在某些瀏覽器會被併進同一個影格，
   間隔拉開才保證畫面有真的呼吸空間。同步一口氣開完幾百個後，
   renderInventoryTab() 要重建兩千多列背包 HTML，凍結就發生在那裡。
   每批都 saveGame()：中途關掉分頁也不會丟進度。 */
function openAllBoxesAsync(itemId, onDone) {
  const def = ITEMS[itemId];
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!def || !def.boxOpen || !row || row.qty < 1) return false;
  const total = Math.min(row.qty, BOX_OPEN_ALL_MAX);
  let openedTotal = 0;
  const savedLog = logMsg;
  let running = false;
  const step = () => {
    if (openedTotal >= total) {
      logMsg = savedLog;
      logMsg(`📦 ${def.name} 全部開完，共 ${openedTotal} 個。`);
      if (typeof onDone === 'function') onDone();
      return;
    }
    if (running) return;               // 保險絲：上一批還沒跑完不疊下一批
    running = true;
    // 批次內靜音：中間的彙總訊息丟掉，只留最後一筆
    logMsg = () => {};
    let opened = 0;
    try { opened = openAllBoxes(itemId); }
    catch (e) { console.error('開箱失敗', e); }
    finally { logMsg = savedLog; running = false; }
    openedTotal += opened;
    // 開不出東西（池空/數量異常）就停，避免空轉
    if (opened <= 0) {
      logMsg(`📦 ${def.name} 開了 ${openedTotal} 個後停止。`);
      if (typeof onDone === 'function') onDone();
      return;
    }
    setTimeout(step, BOX_OPEN_CHUNK_DELAY_MS);
  };
  logMsg(`📦 開始開啟 ${def.name}（最多 ${total} 個，每 ${BOX_OPEN_CHUNK} 個一批）……`);
  setTimeout(step, BOX_OPEN_CHUNK_DELAY_MS);
  return true;
}
function openAllBoxes(itemId) {
  const def = ITEMS[itemId];
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!def || !def.boxOpen || !row || row.qty < 1) return 0;
  const pool = boxPool(def.boxOpen);
  if (!pool || !pool.ids.length) { logMsg(`⚠️ ${def.name} 打不開（道具池是空的）。`); return 0; }

  const n = Math.min(row.qty, BOX_OPEN_ALL_MAX);
  const got = {};                           // itemId → 數量
  const rare = [];
  for (let i = 0; i < n; i++) {
    const id = drawFromBox(def.boxOpen);
    if (!id) break;
    got[id] = (got[id] || 0) + 1;
    const kind = CARDS[id] ? bossCardKind(id) : null;
    if (kind === 'mvp') rare.push(`👑👑 MVP 卡片！${CARDS[id].name}`);
    else if (kind === 'miniBoss') rare.push(`👑 迷你王卡片！${CARDS[id].name}`);
    else if ((ITEMS[id].sell || 0) >= 50000) rare.push(`🎊🎊 大獎！${ITEMS[id].name}（${ITEMS[id].sell.toLocaleString()}z）`);
  }
  const opened = Object.values(got).reduce((a, b) => a + b, 0);
  if (!opened) return 0;
  removeItem(itemId, opened);
  let worth = 0;
  Object.entries(got).forEach(([id, q]) => {
    addItem(id, q);
    if (def.boxOpen === 'any' || def.boxOpen === 'violet') codexRecordBox(id);
    if (def.boxOpen === 'card' || def.boxOpen === 'cardFlat' || String(def.boxOpen).indexOf('card_') === 0) codexRecordBoxCardIfAlbumOnly(id);
    worth += (ITEMS[id].sell || 0) * q;
  });

  logMsg(`📦 一次開啟 ${opened} 個${def.name}，開出 ${Object.keys(got).length} 種道具（總售價 ${worth.toLocaleString()}z）。`);
  rare.slice(0, 10).forEach(txt => logMsg(txt));
  if (rare.length > 10) logMsg(`　…另外還有 ${rare.length - 10} 件稀有道具。`);
  if (row.qty > opened) logMsg(`　（一次最多開 ${BOX_OPEN_ALL_MAX} 個，還剩 ${row.qty - opened} 個。）`);
  saveGame();
  return opened;
}

function useItem(itemId) {
  const def = ITEMS[itemId];
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!def || !row) return false;
  if (def.type === 'consumable' || def.type === 'material') {
    /* 天地樹葉子（#83）：扶起倒地的隊友。沒有人倒地就不消耗——
       這條要放在最前面，因為它沒有 heal/restoreSp 那些欄位，
       走到下面會被當成「沒有可以使用的效果」擋掉。 */
    if (def.reviveAlly) {
      const down = allyList().find(a => a && a._downed);
      if (!down) { logMsg('⚠️ 目前沒有倒地的隊友。'); return false; }
      const ok = reviveAlly(down);
      if (ok) saveGame();
      return ok;
    }
    /* 箱子：開出一件隨機道具。裝備一律進背包不自動穿，
       不然抽到武器會把身上那把換掉（而且個體化裝備的插卡會跟著消失）。 */
    if (def.boxOpen) {
      const got = drawFromBox(def.boxOpen);
      if (!got) { logMsg(`⚠️ ${def.name} 打不開（道具池是空的）。`); return false; }
      removeItem(itemId, 1);
      addItem(got, 1);
      if (def.boxOpen === 'any' || def.boxOpen === 'violet') codexRecordBox(got);
      if (def.boxOpen === 'card' || def.boxOpen === 'cardFlat' || String(def.boxOpen).indexOf('card_') === 0) codexRecordBoxCardIfAlbumOnly(got);
      const g = ITEMS[got];
      // 卡片跟高價道具各自有自己的「中大獎」提示
      const kind = CARDS[got] ? bossCardKind(got) : null;
      const rare = kind === 'mvp' || kind === 'miniBoss' || (g.sell || 0) >= 50000;
      const tag = kind === 'mvp' ? '👑👑 MVP 卡片！' : kind === 'miniBoss' ? '👑 迷你王卡片！'
        : rare ? '🎊🎊 大獎！' : '📦';
      const price = (!CARDS[got] && g.sell >= 500) ? `（售價 ${g.sell.toLocaleString()}z）` : '';
      logMsg(`${tag} 打開 ${def.name}，獲得了 ${g.name}${price}！`);
      saveGame();
      return true;
    }
    /* 四種屬性抵抗藥水（#72）：本作原本是完全沒有效果的雜物道具。
       使用者 2026-08-10 指定綁在配藥的等級上——Lv5 火／Lv6 水／Lv7 地／Lv8 風，
       沒點到就用不了（官方這四瓶本來就是鍊金術士配出來的東西）。
       減傷併進 `cardEleDmgReduce`，那桶已經有八個消費者。 */
    if (def.eleResist) {
      const need = ELE_RESIST_PHARMACY_LV[def.eleResist.element];
      if ((state.pharmacyLv || 0) < need) {
        logMsg(`⚠️ ${def.name}：需要配藥 Lv${need} 才能使用。`);
        return false;
      }
      removeItem(itemId, 1);
      state.buffs = state.buffs.filter(b => b.skillId !== 'resist_' + def.eleResist.element);
      state.buffs.push({
        type: 'eleresist', element: def.eleResist.element, mult: 1,
        reducePct: def.eleResist.pct, msRemaining: def.eleResist.sec * 1000,
        skillId: 'resist_' + def.eleResist.element,
      });
      recomputeDerived(false);
      logMsg(`🧪 使用了 ${def.name}，${ELEMENT_NAMES[def.eleResist.element]}屬性傷害 −${def.eleResist.pct}%，持續 ${Math.round(def.eleResist.sec / 60)} 分鐘。`);
      saveGame();
      return true;
    }
    // 攻速藥水：不是回復類，直接掛一個 aspd buff。先擋職業/等級限制
    if (def.aspdPct) {
      const block = getAspdPotionBlockReason(itemId);
      if (block) { logMsg(`⚠️ ${def.name}：${block}。`); return false; }
      const dur = def.aspdDuration || 1800;
      // 同類型只留一個，避免疊到爆
      state.buffs = state.buffs.filter(b => b.type !== 'aspd' || !b.fromPotion);
      state.buffs.push({ type: 'aspd', mult: 1 + def.aspdPct / 100, msRemaining: dur * 1000, fromPotion: true });
      removeItem(itemId, 1);
      recomputeDerived(false);
      logMsg(`🧪 使用了 ${def.name}，攻速 +${def.aspdPct}%（${Math.round(dur / 60)} 分鐘）。`);
      saveGame();
      return true;
    }
    // HP 與 SP 要各自判斷：蜂蜜／蜂膠／天地樹果實這類是兩種都回，不能用 else if
    let healed = false;
    // 百分比回復（官方的 percentheal，例：巧克力球 HP/SP 各 10%）。
    // 這類不吃「快速恢復／禪心」那種道具效果加成——官方就是照最大值算的。
    if (def.healPct) {
      state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * def.healPct / 100));
      healed = true;
    }
    if (def.restoreSpPct) {
      state.sp = Math.min(state.maxSp, state.sp + Math.round(state.maxSp * def.restoreSpPct / 100));
      healed = true;
    }
    if (def.heal) {
      /* 快速恢復（技能）是所有 HP 道具通吃的加成；
         卡片那批（啤酒企鵝的果汁 +50%、雪怪的冰淇淋 +100%）是**指定道具**才生效，
         所以另外查一張 道具id → 加成% 的表，兩者相加。 */
      const perItemPct = (state.itemHealBonus && state.itemHealBonus[itemId]) || 0;
      const boostedHeal = Math.round(def.heal * (1 + ((state.hpItemEffectBonusPct || 0) + perItemPct) / 100));
      state.hp = Math.min(state.maxHp, state.hp + boostedHeal);
      healed = true;
    }
    if (def.restoreSp) {
      // 禪心：SP恢復道具效果+10%~100%
      const boosted = Math.round(def.restoreSp * (1 + (state.spItemEffectBonusPct || 0) / 100));
      state.sp = Math.min(state.maxSp, state.sp + boosted);
      healed = true;
    }
    /* 沒有任何結構化效果就**不要消耗掉**。

       這裡以前是「desc 出現『恢復\d+』就照抄數字，只出現『恢復』兩字就固定回 50 HP」。
       `ITEMS` 有 18,845 個 consumable/material 沒有回復欄位，其中 502 個 desc 帶「恢復」，
       而數字規則命中的 182 個**幾乎全是卡片**（「擊殺昆蟲系魔物時 SP 可恢復5」）——
       等於把一張卡片吃掉換 5 點 HP。剩下 18,343 個連字樣都沒有的，
       舊碼一樣走到最後的 removeItem()，用一次就無聲蒸發。
       真正會回血的食材已由 tools/backfill_item_heal.js 從官方 item_db 補上 heal/restoreSp。 */
    if (!healed) {
      logMsg(`⚠️ ${def.name} 沒有可以使用的效果。`);
      return false;
    }
    removeItem(itemId, 1);
    logMsg(`使用了 ${def.name}。`);
    saveGame();
    return true;
  }
  if (def.type === 'weapon' || def.type === 'armor') {
    equipItem(itemId);
    return true;
  }
  return false;
}
// 決定某個道具會裝到哪個欄位；equipItem（普通堆疊）跟 equipInstance（個體裝備）共用同一套判斷
function resolveEquipSlotFor(itemId) {
  const def = ITEMS[itemId];
  if (!def) return null;

  let slot;
  if (def.type === 'weapon') {
    if (isTwoHanded(itemId)) {
      slot = 'weapon';
    } else if (!state.equip.weapon) {
      slot = 'weapon';
    } else if (canDualWield(state.jobId) && !isTwoHanded(getEquipBaseItemId('weapon'))) {
      // 主手已有單手武器，且職業支援雙持 → 放入左手（副手武器）
      slot = 'shield';
    } else {
      slot = 'weapon';
    }
  } else if (def.type === 'armor') {
    switch (def.armorType) {
      case 'headgear': {
        // 根據物品描述中的「位置」決定頭部欄位（兼容簡繁體）
        const pos = def.desc || '';
        const hasTop = pos.includes('頭上');
        const hasMid = pos.includes('頭中');
        const hasBot = pos.includes('頭下');
        if (hasTop && !hasMid && !hasBot) slot = 'head_top';
        else if (hasMid && !hasTop && !hasBot) slot = 'head_mid';
        else if (hasBot && !hasTop && !hasMid) slot = 'head_bottom';
        else if (hasTop && hasMid && !hasBot) { slot = !state.equip.head_top ? 'head_top' : 'head_mid'; }
        else if (hasMid && hasBot && !hasTop) { slot = !state.equip.head_mid ? 'head_mid' : 'head_bottom'; }
        else if (hasTop && hasMid && hasBot) {
          if (!state.equip.head_top) slot = 'head_top';
          else if (!state.equip.head_mid) slot = 'head_mid';
          else if (!state.equip.head_bottom) slot = 'head_bottom';
          else slot = 'head_top';
        }
        else slot = 'head_top';
        break;
      }
      case 'shield': slot = 'shield'; break;
      case 'garment': slot = 'garment'; break;
      case 'footgear': slot = 'footgear'; break;
      case 'accessory':
        if (!state.equip.accessory1) slot = 'accessory1';
        else if (!state.equip.accessory2) slot = 'accessory2';
        else slot = 'accessory1';
        break;
      default: slot = 'armor'; break;
    }
  } else {
    return null;
  }
  return slot;
}

// 檢查攻速藥水是否可用（依道具 reqJob / reqLevel 判斷）
function getAspdPotionBlockReason(itemId) {
  const def = ITEMS[itemId];
  if (!def) return '道具不存在';
  if (def.reqLevel && state.baseLevel < def.reqLevel) return `需要等級 ${def.reqLevel}`;
  if (def.reqJob && def.reqJob.length) {
    const chain = getAllLearnedJobs();
    if (!chain.some(j => def.reqJob.includes(j))) {
      return `${currentJob().name}無法使用此藥水`;
    }
  }
  return null;
}
function aspdPotionBlockReason(itemId){ return getAspdPotionBlockReason(itemId); }

/* ---------------- 裝備限制 ----------------
   兩道關卡：
   1. reqJob（道具自己寫的職業限制）—— 用整條職業鏈比對，二轉能穿一轉的裝備
   2. 官方攻速表 —— 表裡沒有這種武器分類就是這個職業不能拿
      （初心者表裡沒有 bow → 新手不能拿弓；法師只有 dagger/rod → 不能拿劍與弓）
   還有等級限制 reqLevel。回傳 null 表示可以裝，否則回傳擋下來的原因。
------------------------------------------------- */
function equipBlockReason(itemId) {
  const d = ITEMS[itemId];
  if (!d) return '道具不存在。';
  const reqLv = d.reqLevel ? Math.min(d.reqLevel, 200) : 0;
  if (reqLv && state.baseLevel < reqLv) {
    return `需要基本等級 ${reqLv}（目前 ${state.baseLevel}）。`;
  }
  if (d.reqJob && d.reqJob.length) {
    const chain = getAllLearnedJobs();
    if (!chain.some(j => d.reqJob.includes(j))) {
      return `${currentJob().name}無法裝備這件道具。`;
    }
  }
  if (d.type === 'weapon' && !jobCanUseWeapon(state.jobId, itemId)) {
    // WEAPON_TYPE_LABELS 定義在 ui.js，引擎單獨跑（測試）時可能不存在
    const label = (typeof WEAPON_TYPE_LABELS !== 'undefined' && WEAPON_TYPE_LABELS[d.weaponType]) || '這類武器';
    return `${currentJob().name}不能使用${label}。`;
  }
  return null;
}

// 裝備前的共通檢查與讓位處理；回傳 false 表示不能裝
function prepareEquipSlot(slot, itemId) {
  // 雙手武器：裝備時自動卸下左手欄位（盾牌或副手武器）
  if (slot === 'weapon' && isTwoHanded(itemId) && state.equip.shield) {
    const offName = getItemDisplayName(getEquipBaseItemId('shield'));
    returnEquipToInventory('shield');
    logMsg(`雙手武器無法搭配左手裝備，卸下了 ${offName}。`);
  }
  // 左手欄位：如果目前武器是雙手武器，無法裝備
  if (slot === 'shield' && isTwoHanded(getEquipBaseItemId('weapon'))) {
    logMsg(`⚠️ 雙手武器無法搭配盾牌！`);
    return false;
  }
  return true;
}

/* ---------------- 裝備比較 ----------------
   換上這一件之後 ATK/DEF 等等會變成多少。

   作法是「暫時穿上去、重算、讀數字、還原」，而不是自己加減裝備欄位——
   因為精煉加成、卡片加成、條件式加成（#19）、素質衍生的 ATK 全都繞在
   recomputeDerived() 裡，手算一定會跟實際打出來的數字對不上。
   recomputeDerived(false) 除了把 HP/SP 夾回上限之外沒有其他副作用
   （不寫存檔、不寫訊息、不重繪），HP/SP 這裡自己備份還原。

   itemId 給普通堆疊裝備，instanceId 給精煉／插卡過的個體裝備（兩者擇一）。
   回傳 null 代表這件穿不上（職業／等級擋住，或根本不是裝備）。 */
const EQUIP_PREVIEW_FIELDS = [
  ['atk', 'ATK'], ['matk', 'MATK'], ['def', 'DEF'],
  ['maxHp', '最大HP'], ['maxSp', '最大SP'],
  ['hit', '命中'], ['flee', '迴避'], ['critRate', '暴擊率'], ['aspd', '攻速'],
];
function previewEquipDelta(itemId, instanceId) {
  if (!state) return null;
  if (instanceId) {
    const inst = state.instances && state.instances[instanceId];
    if (!inst) return null;
    itemId = inst.item;
  }
  const def = ITEMS[itemId];
  if (!def || (def.type !== 'weapon' && def.type !== 'armor')) return null;
  if (equipBlockReason(itemId)) return null;
  const slot = resolveEquipSlotFor(itemId);
  if (!slot) return null;

  const snap = () => {
    const o = {};
    EQUIP_PREVIEW_FIELDS.forEach(([k]) => { o[k] = state[k]; });
    return o;
  };
  const before = snap();
  const savedEquip = Object.assign({}, state.equip);
  const savedHp = state.hp, savedSp = state.sp;

  let after;
  try {
    state.equip[slot] = instanceId || itemId;
    // 雙手武器會佔掉左手，比較時也要把盾牌拿下來，不然會多算一份盾的 DEF
    if (slot === 'weapon' && isTwoHanded(itemId)) state.equip.shield = null;
    recomputeDerived(false);
    after = snap();
  } finally {
    state.equip = savedEquip;
    state.hp = savedHp; state.sp = savedSp;
    recomputeDerived(false);
    state.hp = savedHp; state.sp = savedSp;
  }

  const changes = EQUIP_PREVIEW_FIELDS
    .map(([k, label]) => ({ key: k, label, before: before[k] || 0, after: after[k] || 0 }))
    .map(c => Object.assign(c, { delta: Math.round(c.after) - Math.round(c.before) }))
    .filter(c => c.delta !== 0);
  return { slot, changes };
}

function equipItem(itemId) {
  const def = ITEMS[itemId];
  if (!def) return false;
  const block = equipBlockReason(itemId);
  if (block) { logMsg(`⚠️ ${block}`); return false; }
  const slot = resolveEquipSlotFor(itemId);
  if (!slot) return false;
  if (!prepareEquipSlot(slot, itemId)) return false;

  removeItem(itemId, 1);
  const hadOldWeapon = !!state.equip[slot] && slot === 'weapon';
  returnEquipToInventory(slot);   // 原本穿的那件（不管普通或個體）連同它的精煉/卡片一起回背包
  if (hadOldWeapon) {
    const had = state.buffs.some(b => b.type === 'eleweapon');
    state.buffs = state.buffs.filter(b => b.type !== 'eleweapon');
    if (had) logMsg('🔮 更換武器，舊的肯貝特附魔/屬性附加已解除。');
  }
  state.equip[slot] = itemId;
  recomputeDerived(false);
  logMsg(`裝備了 ${def.name}。`);
  // 換上弓／樂器／鞭時順手把箭種挑好，不用等下一次心跳（#129）
  if (slot === 'weapon') ensurePlayerAmmo();
  saveGame();
  return true;
}

 // 裝備背包裡的個體裝備（精煉過或插過卡的那一件）
function equipInstance(instanceId) {
  const inst = state.instances && state.instances[instanceId];
  if (!inst) return false;
  if (state.inventory.findIndex(r => r.instanceId === instanceId) === -1) return false;
  const itemId = inst.item;
  const def = ITEMS[itemId];
  if (!def) return false;
  const block = equipBlockReason(itemId);
  if (block) { logMsg(`⚠️ ${block}`); return false; }
  const slot = resolveEquipSlotFor(itemId);
  if (!slot) return false;
  if (!prepareEquipSlot(slot, itemId)) return false;

  // 讓位可能動到背包，重新定位這一行再移除
  const idx = state.inventory.findIndex(r => r.instanceId === instanceId);
  if (idx !== -1) state.inventory.splice(idx, 1);
  const hadOldWeapon2 = !!state.equip[slot] && slot === 'weapon';
  returnEquipToInventory(slot);
  if (hadOldWeapon2) {
    const had = state.buffs.some(b => b.type === 'eleweapon');
    state.buffs = state.buffs.filter(b => b.type !== 'eleweapon');
    if (had) logMsg('🔮 更換武器，舊的肯貝特附魔/屬性附加已解除。');
  }
  state.equip[slot] = instanceId;
  recomputeDerived(false);
  logMsg(`裝備了 ${describeInstance(inst)}。`);
  saveGame();
  return true;
}

function unequipItem(slotKey) {
  if (!state.equip[slotKey]) return false;
  const baseItemId = getEquipBaseItemId(slotKey);
  const def = ITEMS[baseItemId];
  // 插著卡也能正常卸下——卡片是跟著這一件裝備走的，會一起回到背包，不會變成孤兒
  returnEquipToInventory(slotKey);
  if (slotKey === 'weapon') {
    const had = state.buffs.some(b => b.type === 'eleweapon');
    state.buffs = state.buffs.filter(b => b.type !== 'eleweapon');
    if (had) logMsg('🔮 武器已卸下，肯貝特武器附魔/屬性附加效果已解除。');
  }
  recomputeDerived(false);
  logMsg(`卸下了 ${def ? def.name : '裝備'}。`);
  saveGame();
  return true;
}

/* ---------------- 原石合成 ----------------
   神之金屬原石 ×5 → 神之金屬、鋁原石 ×5 → 鋁。免費，隨時可做。
------------------------------------------------- */
function canSynthesizeOre(key) {
  const r = ORE_SYNTHESIS[key];
  return !!r && getItemQty(r.from) >= r.need;
}
function synthesizeOre(key) {
  const r = ORE_SYNTHESIS[key];
  if (!r) return false;
  if (getItemQty(r.from) < r.need) {
    logMsg(`⚠️ ${ITEMS[r.from].name} 不足 ${r.need} 個。`);
    return false;
  }
  removeItem(r.from, r.need);
  addItem(r.to, 1);
  logMsg(`⚒️ ${ITEMS[r.from].name} ×${r.need} 合成出 ${ITEMS[r.to].name} ×1！`);
  saveGame();
  return true;
}
/* 一次把湊得滿的份數全部合成（#148）。

   原石是五個換一個，掛機一晚回來動輒好幾百個——一次一次點要點六十下，
   而且每點一次都寫一行紀錄，戰鬥紀錄整頁被推走。
   所以這裡**先算好份數再一次結算**，訊息只留一行。
   除不盡的餘數留在背包裡，不會被吞掉。 */
function synthesizeOreAll(key) {
  const r = ORE_SYNTHESIS[key];
  if (!r) return 0;
  const n = Math.floor(getItemQty(r.from) / r.need);
  if (n < 1) {
    logMsg(`⚠️ ${ITEMS[r.from].name} 不足 ${r.need} 個。`);
    return 0;
  }
  removeItem(r.from, n * r.need);
  addItem(r.to, n);
  logMsg(`⚒️ ${ITEMS[r.from].name} ×${n * r.need} 合成出 ${ITEMS[r.to].name} ×${n}！`);
  saveGame();
  return n;
}

/* ---------------- 裝備精煉 ---------------- */
// 注意：操作對象是「裝備欄位」，精煉結果掛在那一件裝備的個體紀錄上，跟背包裡同名的其他份無關
function refineItem(slotKey, materialType) {
  const itemId = getEquipBaseItemId(slotKey);
  if (!itemId) return false;
  const currentLevel = getRefinementLevel(slotKey);
  if (currentLevel >= REFINEMENT_MAX) {
    logMsg(`⚠️ ${ITEMS[itemId].name} 已達最大精煉等級 +${REFINEMENT_MAX}！`);
    return false;
  }

  const item = ITEMS[itemId];
  const isArmor = item.type === 'armor';
  const weaponLv = isArmor ? 0 : getRefineWeaponLv(item);

  // 檢查材料是否適用
  const mat = REFINEMENT_MATERIALS[materialType];
  if (!mat) { logMsg('⚠️ 無效的精煉材料。'); return false; }
  if (isArmor && !mat.usableArmor) { logMsg(`⚠️ ${mat.name} 不能用於防具精煉。`); return false; }
  if (!isArmor && !mat.usableWeaponLv.includes(weaponLv)) {
    logMsg(`⚠️ ${mat.name} 不能用於 Lv${weaponLv} 武器精煉。`);
    return false;
  }

  // 檢查材料庫存
  const invRow = state.inventory.find(r => r.item === mat.id && !r.instanceId);
  if (!invRow || invRow.qty < 1) {
    logMsg(`⚠️ 你沒有 ${mat.name}。`);
    return false;
  }

  const cost = getRefinementCost(currentLevel);
  if (state.gold < cost) {
    logMsg(`⚠️ 鋅幣不足，精煉需要 ${cost.toLocaleString()} 鋅幣。`);
    return false;
  }

  // 扣除材料和費用
  removeItem(mat.id, 1);
  state.gold -= cost;

  /* 計算成功率。

     武器精煉（#60）是本作第一個「玩家技能改動系統參數」的技能——
     精煉系統本來完全封閉（只看精煉度、武器等級、材料），這裡開一個口子。
     官方那條「不必跑去找 NPC」的價值本作天生沒有（本來就是在裝備分頁自己按），
     所以只留成功率加成：使用者指定 Lv10 給 +10%。
     加在最後而不是乘上去，官方那 +0.5%/級也是加法。 */
  const successRate = Math.min(100,
    getRefinementSuccessRate(currentLevel, weaponLv, materialType) + (state.refineBonusPct || 0));
  const safeLevel = getRefinementSafeLevel(weaponLv, isArmor);
  const inst = state.instances[getOrCreateEquipInstance(slotKey)];

  if (Math.random() * 100 < successRate) {
    // 成功
    inst.refine = currentLevel + 1;
    logMsg(`🔨 精煉成功！${item.name} 提升至 +${currentLevel + 1}！`);
    if (typeof playEventSfx === 'function') playEventSfx('refine');
    recomputeDerived(false);
    saveGame();
    return true;
  } else {
    // 失敗
    const penalty = getRefinementFailPenalty(materialType);
    if (penalty === 'none') {
      // 以太礦石：無懲罰
      logMsg(`💥 精煉失敗！${item.name} 維持 +${currentLevel}。${mat.name}保護了裝備！`);
    } else if (currentLevel >= safeLevel) {
      // 安全等級以上：降3級或損壞
      if (currentLevel > 3) {
        inst.refine = Math.max(0, currentLevel - 3);
        logMsg(`💥 精煉失敗！${item.name} 降至 +${Math.max(0, currentLevel - 3)}…`);
      } else {
        // +3 以下直接損壞
        inst.refine = 0;
        logMsg(`💥 精煉失敗！${item.name} 損壞了！`);
      }
    } else {
      // 安全等級以下：不降級
      logMsg(`💥 精煉失敗！${item.name} 維持 +${currentLevel}。`);
    }
    maybeDeinstanceSlot(slotKey);
    recomputeDerived(false);
    saveGame();
    return false;
  }
}

// 注意：精煉度掛在裝備欄位（透過個體紀錄），參數是 slotKey 不是 itemId
function getRefinementLevel(slot) {
  const inst = getEquipInstance(slot);
  return inst ? (inst.refine || 0) : 0;
}

/* ---------------- 怪物卡片系統 ----------------
   state.equippedCards = { 裝備欄位: [卡片id, ...] }
   一個欄位可以插多張卡，張數上限по該件裝備自己的 slots 欄位（武器常見 1~3 孔）。
   卡片資料的 slot 欄位決定它能插在哪些欄位，對照表見 CARD_SLOT_TARGETS。
------------------------------------------------- */

// 卡片的 slot → 允許插入的裝備欄位
const CARD_SLOT_TARGETS = {
  weapon: ['weapon'],
  armor: ['armor'],
  shield: ['shield'],
  headgear: ['head_top', 'head_mid', 'head_bottom'],
  garment: ['garment'],
  footgear: ['footgear'],
  accessory: ['accessory1', 'accessory2'],
  any: ['weapon', 'head_top', 'head_mid', 'head_bottom', 'armor', 'shield', 'garment', 'footgear', 'accessory1', 'accessory2']
};
const EQUIP_SLOT_NAMES = {
  weapon: '武器', head_top: '頭上', head_mid: '頭中', head_bottom: '頭下', armor: '身體',
  shield: '左手', garment: '披風', footgear: '鞋子', accessory1: '飾品1', accessory2: '飾品2'
};

function cardFitsSlot(card, equipSlot) {
  const targets = CARD_SLOT_TARGETS[card.slot] || CARD_SLOT_TARGETS.any;
  return targets.includes(equipSlot);
}
function cardSlotLabel(card) {
  const targets = CARD_SLOT_TARGETS[card.slot] || CARD_SLOT_TARGETS.any;
  if (card.slot === 'any') return '任意部位';
  return targets.map(t => EQUIP_SLOT_NAMES[t] || t).join('／');
}

// 取得某欄位已插的卡片陣列（卡片存在該件裝備的個體紀錄裡，跟著裝備走）
function getEquippedCards(slot) {
  const inst = getEquipInstance(slot);
  return (inst && inst.cards) ? inst.cards : [];
}
// 舊介面：回傳第一張，仍有呼叫端在用
function getEquippedCard(slot) {
  const list = getEquippedCards(slot);
  return list.length ? list[0] : null;
}
// 全身已插的卡片，攤平成一維
function allEquippedCards() {
  const out = [];
  EQUIP_SLOTS_ALL.forEach(slot => {
    getEquippedCards(slot).forEach(id => { if (id) out.push(id); });
  });
  return out;
}
// 個體裝備的顯示字串：「+7 短劍 [3]（🃏波利卡片、瘋兔卡片）」
function describeInstance(inst) {
  if (!inst) return '';
  const name = getItemDisplayName(inst.item);
  const ref = inst.refine > 0 ? `+${inst.refine} ` : '';
  const cards = (inst.cards && inst.cards.length)
    ? `（🃏${inst.cards.map(id => CARDS[id] ? CARDS[id].name : id).join('、')}）` : '';
  return `${ref}${name}${cards}`;
}

function insertCard(equipSlot, cardId) {
  const card = CARDS[cardId];
  if (!card) return false;

  // 卡片本身不會被個體化，只找普通堆疊
  const invRow = state.inventory.find(r => r.item === cardId && !r.instanceId);
  if (!invRow || invRow.qty < 1) {
    logMsg(`⚠️ 你沒有這張卡片。`);
    return false;
  }
  const baseItemId = getEquipBaseItemId(equipSlot);
  if (!baseItemId) {
    logMsg(`⚠️ 該欄位沒有裝備。`);
    return false;
  }
  // 卡片只能插在資料指定的部位
  if (!cardFitsSlot(card, equipSlot)) {
    logMsg(`⚠️ ${card.name} 只能插在${cardSlotLabel(card)}。`);
    return false;
  }

  // 插卡數量上限 = 該件裝備自己的孔數
  const maxSlots = getEquipCardSlots(equipSlot);
  if (maxSlots <= 0) {
    logMsg(`⚠️ ${ITEMS[baseItemId].name} 沒有卡片插槽。`);
    return false;
  }
  const cur = getEquippedCards(equipSlot);
  if (cur.length >= maxSlots) {
    logMsg(`⚠️ ${ITEMS[baseItemId].name} 的 ${maxSlots} 個插槽已經滿了。`);
    return false;
  }

  removeItem(cardId, 1);
  const inst = state.instances[getOrCreateEquipInstance(equipSlot)];
  if (!inst.cards) inst.cards = [];
  inst.cards.push(cardId);
  logMsg(`🃏 將 ${card.name} 插入了${ITEMS[baseItemId].name}（${inst.cards.length}/${maxSlots}）！`);
  recomputeDerived(false);
  saveGame();
  return true;
}

/* 拔卡：卡片可以取回，但裝備會在拆卸過程中損毀。
   這是刻意的取捨——沒有代價的話插卡就變成隨時可換的免費設定，
   卡片的選擇也就不成為決定。呼叫端必須自己先跟玩家確認。 */
// 拆「身上穿著」那件的卡：裝備連同精煉度一起銷毀，卡片全部取回。cardIndex 已無意義（一律全取回），保留參數只為相容舊呼叫。
function removeCard(equipSlot, cardIndex) {
  const ref = state.equip[equipSlot];
  const inst = getEquipInstance(equipSlot);
  const cur = getEquippedCards(equipSlot);
  if (!cur.length) {
    logMsg(`⚠️ 該欄位沒有插卡片。`);
    return false;
  }
  const equipName = ITEMS[inst.item] ? ITEMS[inst.item].name : '裝備';
  cur.forEach(id => { if (CARDS[id]) addItem(id, 1); });
  const names = cur.map(id => CARDS[id] ? CARDS[id].name : id).join('、');

  state.equip[equipSlot] = null;
  delete state.instances[ref];
  logMsg(`💥 ${equipName} 在拆卸過程中損毀了！取回了 ${names}。`);
  recomputeDerived(false);
  saveGame();
  return true;
}

// 拆「背包裡」那件個體裝備的卡：同樣是銷毀裝備換回卡片
function destroyInstanceForCards(instanceId) {
  const idx = state.inventory.findIndex(r => r.instanceId === instanceId);
  const inst = state.instances && state.instances[instanceId];
  if (idx === -1 || !inst) return false;
  const cur = inst.cards || [];
  if (!cur.length) {
    logMsg(`⚠️ 這件裝備沒有插卡片。`);
    return false;
  }
  const equipName = ITEMS[inst.item] ? ITEMS[inst.item].name : '裝備';
  cur.forEach(id => { if (CARDS[id]) addItem(id, 1); });
  const names = cur.map(id => CARDS[id] ? CARDS[id].name : id).join('、');

  state.inventory.splice(idx, 1);
  delete state.instances[instanceId];
  logMsg(`💥 ${equipName} 在拆卸過程中損毀了！取回了 ${names}。`);
  recomputeDerived(false);
  saveGame();
  return true;
}

/* 卡片吸血／吸SP：赤蒼蠅（3%機率吸傷害的15%成HP）、德古拉伯爵（10%機率吸5%成SP）。
   兩張都寫「物理攻擊時」，所以只掛在普通攻擊命中之後，技能傷害不觸發。 */
function applyCardLeech(dmg) {
  if (!dmg || dmg <= 0) return;
  if (state.cardLifeStealChance && Math.random() * 100 < state.cardLifeStealChance) {
    const heal = Math.max(1, Math.round(dmg * state.cardLifeStealPct / 100));
    state.hp = Math.min(state.maxHp, state.hp + heal);
    logMsg(`🩸 吸血發動！回復了 ${heal} 點HP。`);
  }
  if (state.cardSpStealChance && Math.random() * 100 < state.cardSpStealChance) {
    const gain = Math.max(1, Math.round(dmg * state.cardSpStealPct / 100));
    state.sp = Math.min(state.maxSp, state.sp + gain);
    logMsg(`💧 吸取魔力發動！回復了 ${gain} 點SP。`);
  }
}

/* 技能實際要花多少 SP：查表拿到該等級的基礎消耗後，套上卡片的 SP 消耗增減。
   自動施放與手動施放都走這裡，否則會出現「判斷夠不夠時算一套、實際扣款算另一套」。 */
function skillSpCost(sk, lv) {
  if (!sk) return 0;
  const base = Array.isArray(sk.spCost)
    ? (sk.spCost[lv - 1] ?? sk.spCost[sk.spCost.length - 1] ?? 0)
    : (sk.spCost || 0);
  // 卡片的增減與魔力減免（#64，一律是負值）相加後一起套用
  const pct = ((state && state.cardSpCostPct) || 0) + ((state && state.skillSpCostPct) || 0)
    + buffMult('spcost').flatBonus;   // 為您服務／臨機應變（#68）
  const flat = sk ? (getCardBonus('spCost_' + sk.id) || 0) : 0;
  if (!pct && !flat) return base;
  return Math.max(0, Math.round(base * (1 + pct / 100) + flat));
}

/* 治癒量倍率（#64）。

   兩個來源：冥想（被動，`state.healBonusPct`）與聖母之祈福（buff，「受到的治癒恢復量 +N%」）。
   本作沒有隊友，所以「受到的」就是自己受到的，兩者相乘。
   注意 `hpItemEffectBonusPct` 是**道具**專用（禪心給的），跟治癒術是兩回事，不要混。 */
function healOutputMult() {
  const passive = 1 + ((state.healBonusPct || 0) / 100);
  return passive * buffMult('healrecv').mult;
}

/* ---------------- 條件式裝備加成 ----------------
   卡片的條件效果（精煉幾階以上、某職業裝備時、跟某張卡一起裝備時）與裝備套裝，
   判斷式是同一個形狀：「看全身裝備狀態，成立就加一組數值」。所以共用同一套評估器。

   資料格式：
     CARDS[x].bonus      無條件加成
     CARDS[x].condBonus  [{ when: {...}, bonus: {...} }]     條件成立才加
     CARDS[x].perRefine  { str: 1 }                          依「卡片插的那件裝備」的精煉階數倍增
     EQUIP_SETS[y]       { items: [...], bonus: {...} }       全套穿齊才加

   when 支援的條件：
     refineMin / refineMax  宿主裝備的精煉階數（卡片專用，套裝用 refineOf）
     jobLine                職業血脈，例如 'thief' 代表盜賊系列（含刺客、流氓…）
     withCards              需要同時裝備的其他卡片（陣列，全部都要有）
     withItems              需要同時裝備的其他道具
     statMin                加點素質門檻，例 { vit: 77 }（不含裝備加成）
------------------------------------------------- */

/* 目前身上有什麼：一次算好，條件判斷全部拿這個查 */
function buildLoadout() {
  const slots = {};
  const cardHosts = {};          // cardId → [{slot, refine, itemId}]（同一張卡可能插在兩件裝備上）
  const cards = new Set();
  const items = new Set();
  EQUIP_SLOTS_ALL.forEach(slot => {
    const itemId = getEquipBaseItemId(slot);
    if (!itemId) return;
    const inst = getEquipInstance(slot);
    const refine = (inst && inst.refine) || 0;
    const list = (inst && inst.cards) ? inst.cards.filter(Boolean) : [];
    slots[slot] = { itemId, refine, cards: list };
    items.add(itemId);
    list.forEach(cid => {
      cards.add(cid);
      (cardHosts[cid] = cardHosts[cid] || []).push({ slot, refine, itemId });
    });
  });
  let jobLine = [];
  try { jobLine = getAllLearnedJobs(); } catch (e) { jobLine = []; }
  /* 目前裝備的箭矢也要進 loadout：箭矢配對效果（大地之弓＋地靈箭矢那類）
     的 when.ammo 判斷要查這裡。 */
  const ammo = getEquippedAmmoId() || null;
  return { slots, cardHosts, cards, items, ammo, jobLine: new Set(jobLine) };
}

/* 條件成立與否。host 是「這張卡插在哪一件裝備上」，套裝沒有宿主就傳 null */
function condMet(when, host, lo) {
  if (!when) return true;
  if (when.refineMin != null && !(host && host.refine >= when.refineMin)) return false;
  if (when.refineMax != null && !(host && host.refine <= when.refineMax)) return false;
  if (when.jobLine && !lo.jobLine.has(when.jobLine)) return false;
  /* `jobIs` 看的是**目前的職業本身**，不是血脈。官方有一批卡片寫「初學者或超級初學者
     裝備時」，用 jobLine 判斷會永遠成立——每個職業的血脈都從初學者開始。 */
  if (when.jobIs && !(Array.isArray(when.jobIs) ? when.jobIs.includes(state.jobId) : state.jobId === when.jobIs)) return false;
  if (when.weaponReq && !weaponReqMet(when.weaponReq)) return false;
  if (when.withCards && !when.withCards.every(c => lo.cards.has(c))) return false;
  if (when.withItems && !when.withItems.every(i => lo.items.has(i))) return false;
  /* withAnyItem：陣列中**任一件**有裝就算成立（官方同一件裝備常有無孔/有孔兩個 id，
     「與XX一起裝備」應該兩種都算——沙漠雙劍那次踩過同一個坑）。 */
  if (when.withAnyItem && !when.withAnyItem.some(i => lo.items.has(i))) return false;
  /* when.ammo：目前裝備的箭矢（陣列＝任一種都算）。箭矢不在裝備欄、
     buildLoadout() 特別帶了 `ammo` 欄位出來——大地之弓＋地靈箭矢那類配對用。 */
  if (when.ammo) {
    const need = Array.isArray(when.ammo) ? when.ammo : [when.ammo];
    if (!lo.ammo || !need.includes(lo.ammo)) return false;
  }
  /* when.refineSumMin / refineSumOf：多件裝備的精煉值**合計**門檻
     （時光超越者斗篷+戰靴「精煉值總和為22以上」）。
     refineSumOf 是裝備 id 陣列，只算身上有的那些件。 */
  if (when.refineSumMin != null) {
    const of = when.refineSumOf || [];
    let sum = 0;
    of.forEach(i => { const s = lo.slots && Object.values(lo.slots).find(d => d && d.itemId === i); if (s) sum += s.refine || 0; });
    if (sum < when.refineSumMin) return false;
  }
  /* when.statSumMin：多素質**合計**門檻（時光戰靴「淨STR108以上」那類是單項，
     用 statMin；這裡提供合計版給「ALL State+2」之類的衍生判斷用）。 */
  if (when.statSumMin != null && when.statSumOf) {
    const sum = when.statSumOf.reduce((s, k) => s + ((state.stats || {})[k] || 0), 0);
    if (sum < when.statSumMin) return false;
  }
  /* 素質門檻（官方寫「VIT77以上」「純粹AGI90以上」那種）。
     這裡看的是**加點的基礎素質**，不含裝備加成——官方的「純粹」就是這個意思，
     而且加成表是在 recomputeDerived() 裡算的，拿總素質判斷會變成循環相依。 */
  if (when.statMin) {
    for (const [k, v] of Object.entries(when.statMin)) {
      if ((state.stats[k] || 0) < v) return false;
    }
  }
  // statMax 是 statMin 的反面（官方「INT20以下時」那種）。同樣看加點的基礎素質
  if (when.statMax) {
    for (const [k, v] of Object.entries(when.statMax)) {
      if ((state.stats[k] || 0) > v) return false;
    }
  }
  return true;
}

function mergeBonus(target, bonus, scale) {
  if (!bonus) return;
  for (const [k, v] of Object.entries(bonus)) target[k] = (target[k] || 0) + v * (scale == null ? 1 : scale);
}

/* 全身裝備提供的加成總表（卡片無條件 + 卡片條件式 + 依精煉倍增 + 套裝）。
   同一份簽章不變就直接回快取，戰鬥迴圈每次揮擊都會查到這裡。 */
let _gearBonusCache = null;
let _gearBonusKey = '';
let _activeSets = [];
function effectiveGearBonuses() {
  const lo = buildLoadout();
  /* 簽章要涵蓋**每一個 condMet() 看得到的東西**，不然條件式加成會卡在舊值。
     加點素質原本沒進簽章，所以 `statMin` / `statMax` 那幾張卡（雙子星-S58 的
     AGI90／VIT80、鬼娃樹的 INT20 以下）只有在換裝或轉職時才會重算——
     單純加點不會生效。這是這一輪做 statMax 時才發現的既有 bug。
     素質只有加點時會變（一次 recomputeDerived），不是每一擊都在動，成本可以忽略。 */
  const key = EQUIP_SLOTS_ALL.map(s => {
    const d = lo.slots[s];
    return d ? `${d.itemId}+${d.refine}[${d.cards.join(',')}]` : '-';
  }).join('|') + '#' + state.jobId
    + '#' + BASE_STAT_KEYS.map(k => (state.stats && state.stats[k]) || 0).join(',')
    /* 箭矢也要進簽章：when.ammo 的配對加成（大地之弓＋地靈箭矢）換箭要重算 */
    + '#' + (lo.ammo || '-')
    /* 遺物也要進簽章，否則換遺物不會重算——條件式加成卡在舊值那個坑（見上面）
       在這裡會變成「拔掉整套遺物，加成還在」。 */
    + '#' + (typeof RELIC_SLOTS === 'undefined' ? '' :
      RELIC_SLOTS.map(s => relicsOf()[s] || '-').join(','));
  if (_gearBonusCache && _gearBonusKey === key) return _gearBonusCache;

  const total = {};
  const sets = [];
  /* 裝備**本身**的特效（#127）。這張表以前只吃「卡片 + 套裝 + 遺物」，
     裝備自己只有 str/atk/def 那幾格平鋪數值進得來——官方描述裡的
     「對人型系傷害+5%」「無視植物系防禦」「暴擊時傷害+15%」全部只印在說明上，
     沒有任何程式讀它（使用者 2026-08-21 回報的那 587 筆就是這件事）。

     用的是**跟卡片完全同一套 key**（raceDmg_* / eleDmg_* / skillDmg_* …），
     所以不必新增任何機制，接上線就有。條件式（精煉、職業）也一併沿用。 */
  EQUIP_SLOTS_ALL.forEach(slot => {
    const d = lo.slots[slot];
    const def = d && ITEMS[d.itemId];
    if (!def) return;
    const host = { slot, refine: d.refine, itemId: d.itemId };
    mergeBonus(total, def.bonus);
    /* 頂層 hpPct/spPct：官方「MHP+N%」過去被轉檔成平面 hp/sp（等於只加 N 點），
       修正資料後改用這兩個鍵，這裡併進總表讓百分比乘區吃到。 */
    if (def.hpPct != null || def.spPct != null) mergeBonus(total, { hpPct: def.hpPct || 0, spPct: def.spPct || 0 });
    /* 平鋪的特殊鍵（perBaseLv10_atk 等）也要進總表——getCardBonus() 會按前綴解析。
       只挑底線開頭的鍵，避免把 atk/def 那些平鋪數值重複算一次。 */
    for (const [k, v] of Object.entries(def)) {
      if (/^per(BaseLv1|BaseLv10|BaseLv15|BaseLv210|JobLv10|Stat|Skill)_/.test(k) && typeof v === 'number') total[k] = (total[k] || 0) + v;
      if (k.startsWith('spCost_') && typeof v === 'number') total[k] = (total[k] || 0) + v;
    }
    if (def.perRefine) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.perRefine, r);
    }
    /* perRefineSquare：官方「ATK增加至(精煉*精煉)」＝精煉²。cap 同樣支援。
       緋紅色系列（ATK增加至精煉*精煉，套用至精煉+15）就是這條。 */
    if (def.perRefineSquare) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.perRefineSquare, r * r);
    }
    /* per2Refine：官方「精煉每+2時 ○○+1」（海鷹召喚者的攻速）＝floor(精煉/2)。 */
    if (def.per2Refine) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.per2Refine, Math.floor(r / 2));
    }
    /* per2RefineExtra：同一件裝備第二組「每+2」效果（時光超越者斗篷的
       ATK%1/MATK%1/遠距1%/CRI3/暴傷1 與既有那組並存）。 */
    if (def.per2RefineExtra) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.per2RefineExtra, Math.floor(r / 2));
    }
    /* per3Refine：官方「精煉每+3時 ○○」（時光超越者-LT 的 B 階級）＝floor(精煉/3)。 */
    if (def.per3Refine) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.per3Refine, Math.floor(r / 3));
    }
    /* per4Refine：官方「每精煉+4 ○○」（時光超越者斗篷）＝floor(精煉/4)。 */
    if (def.per4Refine) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.per4Refine, Math.floor(r / 4));
    }
    /* per5Refine：官方「精煉每+5時 ○○」（狸貓變身樹葉-LT）＝floor(精煉/5)。 */
    if (def.per5Refine) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.per5Refine, Math.floor(r / 5));
    }
    /* 緋紅色的 MATK 版：全額與半額（(精煉*精煉)/2）兩種 */
    if (def.perRefineSquareMatk) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.perRefineSquareMatk, r * r);
    }
    if (def.perRefineSquareMatkHalf) {
      const r = def.perRefineCap != null ? Math.min(d.refine, def.perRefineCap) : d.refine;
      mergeBonus(total, def.perRefineSquareMatkHalf, r * r / 2);
    }
    (def.condBonus || []).forEach(cb => { if (condMet(cb.when, host, lo)) mergeBonus(total, cb.bonus); });
  });
  lo.cards.forEach(cardId => {
    const card = CARDS[cardId];
    if (!card) return;
    // 同一張卡插在兩件裝備上就算兩份，跟官方一致
    (lo.cardHosts[cardId] || []).forEach(host => {
      mergeBonus(total, card.bonus);
      /* perRefineCap：官方少數幾張明講「加成只套用到精煉+N 為止」
         （彩妝皮影魔的魔法反射率只算到 +10）。沒寫 cap 的照舊不設上限。 */
      if (card.perRefine) {
        const r = card.perRefineCap != null ? Math.min(host.refine, card.perRefineCap) : host.refine;
        mergeBonus(total, card.perRefine, r);
      }
      (card.condBonus || []).forEach((cb, ci) => {
        if (!condMet(cb.when, host, lo)) return;
        /* 卡片版「宿主精煉每+N」：bonus 鍵名 perNRefine_<目標>
           （天堂鳥卡：魔法師系列 精煉每+3 INT+1 → {per3Refine_int:1}）。
           值 × floor(宿主精煉/N) 併入總表；原始鍵本身不進表。 */
        const effBonus = {};
        let hasPerRefine = false;
        for (const [bk, bv] of Object.entries(cb.bonus || {})) {
          const pm = /^per(\d+)Refine_(.+)$/.exec(bk);
          if (pm) {
            const tgt = {};
            tgt[pm[2]] = bv * Math.floor(((host && host.refine) || 0) / +pm[1]);
            mergeBonus(total, tgt);
            hasPerRefine = true;
          } else effBonus[bk] = bv;
        }
        if (Object.keys(effBonus).length || !hasPerRefine) mergeBonus(total, cb.bonus ? effBonus : cb.bonus);
        /* 卡片套裝（#134）。官方的「五張一組」沒有獨立的資料表——整組的效果就寫在
            其中一張主卡的說明欄裡，所以本作也是掛在那張卡的 condBonus 上。
            標了 setName 的讓它跟 EQUIP_SETS 一樣進「生效中的套裝」那一排：
            玩家回報「烏龜套卡沒有實裝」時，加成其實只是**看不到**，畫面上沒有任何
            回饋能證明它生效了。同一張卡插在兩件裝備上時 id 會重複，所以要去重。 */
        if (!cb.setName) return;
        const sid = 'cardset_' + cardId + '_' + ci;
        if (!sets.some(s => s.id === sid)) sets.push({ id: sid, name: cb.setName, bonus: cb.bonus });
      });
    });
  });
  if (typeof EQUIP_SETS !== 'undefined') {
    /* 成員寫成陣列代表「這幾件任一件都算」。同一件官方裝備在本作常有無孔／有孔
       兩個 id（魔法外套 / 魔法外套[1]），不支援的話玩家拿到有孔版反而湊不成套。 */
    const hasMember = m => Array.isArray(m) ? m.some(i => lo.items.has(i)) : lo.items.has(m);
    const slotOfMember = m => EQUIP_SLOTS_ALL.find(s => lo.slots[s] &&
      (Array.isArray(m) ? m.includes(lo.slots[s].itemId) : lo.slots[s].itemId === m));
    for (const [setId, def] of Object.entries(EQUIP_SETS)) {
      if (!def.items || !def.items.every(hasMember)) continue;
      if (def.when && !condMet(def.when, null, lo)) continue;
    mergeBonus(total, def.bonus);
      if (def.perRefine && def.perRefine.of) {
        const slot = slotOfMember(def.perRefine.of);
        if (slot) mergeBonus(total, def.perRefine.bonus, lo.slots[slot].refine);
      }
      sets.push({ id: setId, name: def.name, bonus: def.bonus });
    }
  }
  /* 遺物（#113）：併進同一張總表，所有既有的消費端不必知道加成是哪來的。
     沒有 bonus 只有 proc 的那一段（5 件）在這裡是空的，旗標另外在
     recomputeDerived 裡設。 */
  activeRelicTiers().forEach(({ set, tier }) => {
    mergeBonus(total, tier.bonus);
    sets.push({ id: 'relic_' + set.id + '_' + tier.need, name: `${set.name} ${tier.need} 件`, bonus: tier.bonus });
  });

  _gearBonusKey = key;
  _activeSets = sets;
  _gearBonusCache = total;
  return total;
}
function activeEquipSets() { effectiveGearBonuses(); return _activeSets; }

/* ---------------- 遺物（#113）----------------
   資料在 js/relics.js。這裡只做四件事：欄位、計件、加成、掉落。

   計件的定義是「身上有幾件**同一套**的遺物」。因為八個欄位一格一個部位，
   同一套不可能重複，所以直接數就行，不必像席琳那樣去重。
------------------------------------------------- */
function emptyRelicSlots() {
  const o = {};
  if (typeof RELIC_SLOTS !== 'undefined') RELIC_SLOTS.forEach(s => { o[s] = null; });
  return o;
}
/* 換身中（withAlly）一律看玩家的遺物：隊友沒有自己的遺物欄，
   不導回去的話牠們會拿到空表，套裝效果在隊友身上憑空消失。 */
function relicsOf() {
  const st = allyOwnerState() || state;
  return (st && st.relics) || {};
}
/* { setId: 件數 } */
function relicSetCounts() {
  const out = {};
  if (typeof RELIC_SLOTS === 'undefined') return out;
  const worn = relicsOf();
  RELIC_SLOTS.forEach(slot => {
    const d = RELIC_ITEMS[worn[slot]];
    if (d && d.type === 'relic') out[d.relicSet] = (out[d.relicSet] || 0) + 1;
  });
  return out;
}
/* 目前生效的段數：[{ setId, set, tier, count }]。畫面與加成共用這一支 */
function activeRelicTiers() {
  const out = [];
  if (typeof RELIC_SETS === 'undefined') return out;
  Object.entries(relicSetCounts()).forEach(([setId, n]) => {
    const set = RELIC_SETS[setId];
    if (!set) return;
    set.tiers.forEach(tier => { if (n >= tier.need) out.push({ setId, set, tier, count: n }); });
  });
  return out;
}
/* 裝備／卸下。遺物不進 resolveEquipSlotFor，所以不會跟一般裝備搶欄位 */
function equipRelic(itemId) {
  const d = RELIC_ITEMS[itemId];
  if (!d || d.type !== 'relic') return false;
  if (!state.relics) state.relics = emptyRelicSlots();
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!row || row.qty < 1) return false;
  const slot = d.relicSlot;
  const cur = state.relics[slot];
  if (cur === itemId) return false;
  removeItem(itemId, 1);
  if (cur) addItem(cur, 1);            // 原本那件退回背包，不沒收
  state.relics[slot] = itemId;
  recomputeDerived(true);
  logMsg(`🏺 裝上了 ${d.name}。`);
  saveGame();
  return true;
}
function unequipRelic(slot) {
  if (!state.relics || !state.relics[slot]) return false;
  const itemId = state.relics[slot];
  state.relics[slot] = null;
  addItem(itemId, 1);
  recomputeDerived(true);
  logMsg(`🏺 卸下了 ${RELIC_ITEMS[itemId].name}。`);
  saveGame();
  return true;
}

/* ---- 掉落 ----
   只有打寶模式會掉，**瘋狂不加成**（使用者指定）。遺物與遺物券各自獨立擲一次，
   所以同一隻怪有可能兩樣都給。 */
function rollRelicDrop(def) {
  if (typeof RELIC_PIECE_IDS === 'undefined' || !RELIC_PIECE_IDS.length) return;
  if (!farmMode()) return;
  // 頭目照等級分段（#127），一般怪一律 RELIC_DROP_PCT_NORMAL
  const pct = (def && def.isBoss) ? relicBossDropPct(def.level) : RELIC_DROP_PCT_NORMAL;
  if (Math.random() * 100 < pct) {
    const id = RELIC_PIECE_IDS[Math.floor(Math.random() * RELIC_PIECE_IDS.length)];
    addItem(id, 1);
    logMsg(`🏺 掉落了 ${RELIC_ITEMS[id].name}！`);
  }
  if (Math.random() * 100 < pct) {
    addItem(RELIC_TICKET_ID, 1);
    logMsg('🎫 掉落了 遺物券！');
  }
}

/* ---- 遺物券 ----
   背包裡的遺物 10 件換 1 張。**從數量最多的那一種開始扣**——
   這樣「只有一份」的珍稀部位自然被留到最後，玩家不必先手動鎖定。 */
function relicSpareTotal() {
  if (!state || !Array.isArray(state.inventory)) return 0;
  return state.inventory.reduce((n, r) => {
    const d = RELIC_ITEMS[r.item];
    return d && d.type === 'relic' && !r.instanceId ? n + r.qty : n;
  }, 0);
}
function exchangeRelicTicket() {
  if (relicSpareTotal() < RELIC_TICKET_COST) {
    logMsg(`🎫 背包裡的遺物不足 ${RELIC_TICKET_COST} 件，換不了券。`);
    return false;
  }
  let left = RELIC_TICKET_COST;
  while (left > 0) {
    const rows = state.inventory.filter(r => {
      const d = RELIC_ITEMS[r.item];
      return d && d.type === 'relic' && !r.instanceId && r.qty > 0;
    }).sort((a, b) => b.qty - a.qty);
    if (!rows.length) return false;      // relicSpareTotal 已經擋過，理論上到不了
    const take = Math.min(left, rows[0].qty);
    removeItem(rows[0].item, take);
    left -= take;
  }
  addItem(RELIC_TICKET_ID, 1);
  logMsg(`🎫 用 ${RELIC_TICKET_COST} 件遺物換到了 1 張遺物券。`);
  saveGame();
  return true;
}
/* ---- 5 件的特殊效果 ----
   三支都由 playerAttackInner() 在**命中之後**呼叫，全部只作用於普通攻擊。
   技能不吃這些效果，這是兩套遺物共同的設計前提（見 relics.js 的說明）。 */

/* 刺客：互斥的倍率階梯。由高倍率往低比對，中了就停，所以 10/5/2 三段不會疊。
   期望值 ×1.39（0.01×10 + 0.05×5 + 0.10×2 + 0.84×1）。 */
function rollRelicDamageMult() {
  const p = state.relicProcs || {};
  if (p.assassin) {
    const r = Math.random() * 100;
    let acc = 0;
    for (const step of RELIC_PROC_ASSASSIN.ladder) {
      acc += step.chance;
      if (r < acc) return step.mult;
    }
  }
  /* 法師 5 件的第三條（#148）：10% 機率兩倍傷害。
     跟刺客那條梯子共用同一個出口是安全的——兩套的 5 件不可能同時成立
     （八個遺物欄位放不下兩個五件套），所以永遠不會互相疊乘。 */
  if (p.mage && Math.random() * 100 < RELIC_PROC_MAGE.doubleChance) return RELIC_PROC_MAGE.doubleMult;
  return 1;
}
/* 刺客：攻速恆定。走 buff 陣列，recomputeDerived 的 ASPD 上限那行讀它。
   重複觸發是**刷新**不是疊加——疊加會讓高攻速角色把持續時間堆到永久。 */
function tryRelicAspdProc() {
  if (!state.relicProcs || !state.relicProcs.assassin) return;
  if (Math.random() * 100 >= RELIC_PROC_ASSASSIN.aspdChance) return;
  const ms = RELIC_PROC_ASSASSIN.aspdSec * 1000;
  const cur = state.buffs.find(b => b.type === 'aspdmax');
  if (cur) { cur.msRemaining = Math.max(cur.msRemaining || 0, ms); return; }
  state.buffs.push({ type: 'aspdmax', name: '完美的潛行', icon: '🗡️', msRemaining: ms });
  recomputeDerived(true);
  logMsg(`🗡️ 完美的潛行！攻速恆定 ${RELIC_PROC_ASSASSIN.aspdValue}，持續 ${RELIC_PROC_ASSASSIN.aspdSec} 秒。`, 'skill');
}
/* 法師：全場黑暗。外層一次判定，中了之後**每隻怪各自再擲一次**——
   使用者指定的「全場敵人 50% 判定黑暗」是後面這一層。 */
function tryRelicBlindProc() {
  if (!state.relicProcs || !state.relicProcs.mage) return;
  if (!state.monsters || !state.monsters.length) return;
  if (Math.random() * 100 >= RELIC_PROC_MAGE.blindChance) return;
  let n = 0;
  state.monsters.forEach(mon => {
    if (mon.hp <= 0) return;
    if (Math.random() * 100 >= RELIC_PROC_MAGE.blindPerMonster) return;
    const md = MONSTERS[mon.defId];
    if (md && applyAilment(mon, md, 'blind')) n++;
  });
  if (n > 0) logMsg(`🔮 閃光術！${n} 隻敵人陷入黑暗。`, 'skill');
}
/* 法師：普攻改打全體。把**已經算好的最終傷害**複製到其他怪身上。

   三條規則是刻意的，少一條就會爆炸：
     1. 不重擲命中與暴擊——否則五隻怪等於五次暴擊骰
     2. 濺射不再觸發濺射，也不觸發任何 on-attack 被動與卡片 proc
        （tryCardAilments 那一整排只在主目標身上跑）
     3. 走 monsters 的**快照**迭代：killMonster 是用 filter 重新綁定陣列的，
        邊殺邊讀活陣列會漏怪 */
function applySplashDamage(dmg, mainTarget) {
  const list = state.monsters.slice();
  let n = 0;
  list.forEach(mon => {
    if (mon === mainTarget || mon.hp <= 0) return;
    const md = MONSTERS[mon.defId];
    if (!md) return;
    mon.hp -= dmg;
    ailBreakOnDamage(mon, md);
    n++;
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, dmg, false);
    if (mon.hp <= 0) killMonster(md, mon);
  });
  return n;
}
function tryRelicSplashProc(dmg, mainTarget) {
  if (!state.relicProcs || !state.relicProcs.mage) return;
  if (!state.monsters || state.monsters.length < 2) return;
  if (Math.random() * 100 >= RELIC_PROC_MAGE.splashChance) return;
  const n = applySplashDamage(dmg, mainTarget);
  if (n > 0) logMsg(`🔮 閃光術擴散！額外打中 ${n} 隻敵人，各 ${dmg} 點傷害。`, 'skill');
}
/* 巴風特卡片（#136）：普通攻擊變成濺射。

   官方寫的是「除技能外的普通物理攻擊的範圍是 9 格」，代價是 HIT−10。
   本作沒有格子，就照字面取「普攻打到場上每一隻」——這是那張卡**唯一**的好處，
   之前只實作了 HIT−10 那半邊，等於一張純扣屬性的卡（使用者回報「沒有效果」）。

   跟遺物的濺射共用同一支，所以那三條規則（不重擲命中暴擊、濺射不再觸發濺射、
   走快照迭代）自動沿用。差別只有：遺物是 30% 機率，這張卡是**每一擊都會**——
   官方的 9 格範圍不是機率性的。 */
function tryCardSplashProc(dmg, mainTarget) {
  if (!state.cardSplashAttack) return;
  if (!state.monsters || state.monsters.length < 2) return;
  const n = applySplashDamage(dmg, mainTarget);
  if (n > 0) logMsg(`💥 攻擊範圍擴散！額外打中 ${n} 隻敵人，各 ${dmg} 點傷害。`);
}

/* ---- 騎士／武僧：被打時完全免傷 ----
   跟光之盾（defenderNegates）同一類，所以掛在同一個插入點；
   怪物技能那條路徑也要擋，不然「20% 免疫」在會放技能的怪身上等於不存在。 */
function relicNegatesHit() {
  const p = state.relicProcs || {};
  if (p.knight && Math.random() * 100 < RELIC_PROC_KNIGHT.immuneChance) return '🛡️ 騎士遺物';
  /* 武僧的免疫從 5% 提到 10%，但加上 1 秒冷卻（#148）。
     沒有冷卻的機率免疫在挨連打時是純粹的機率疊加——一波五隻怪各打一下
     就有四成機率至少免掉一發；加了冷卻之後同一秒內最多免一下。 */
  if (p.monk && Date.now() >= (state.relicMonkImmuneReadyAt || 0)
      && Math.random() * 100 < RELIC_PROC_MONK.immuneChance) {
    state.relicMonkImmuneReadyAt = Date.now() + RELIC_PROC_MONK.immuneCooldownSec * 1000;
    return '📿 佛法無邊';
  }
  return null;
}

/* ---- 武僧：加特林 ----
   固定傷害＝**不吃怪物防禦**，所以 CD 是唯一的節流閥（見 relics.js 的說明）。
   飄字跳一排「-1」是純特效，傷害仍然一次結算——真的打 3600 次會把迴圈跑爆。 */
function tryRelicMonkGatling(target, monDef) {
  if (!state.relicProcs || !state.relicProcs.monk) return;
  const now = Date.now();
  if (now < (state.relicMonkReadyAt || 0)) return;
  if (Math.random() * 100 >= RELIC_PROC_MONK.procChance) return;
  state.relicMonkReadyAt = now + RELIC_PROC_MONK.cooldownSec * 1000;
  /* 3600 是固定值，等級一高就形同虛設，所以在它之上再追加
     ATK 100% + MATK 100%（#148），讓這一發跟著角色成長。
     整包一樣**不吃怪物防禦**——這條的節流閥從頭到尾都是那 1 秒冷卻。 */
  const dmg = RELIC_PROC_MONK.fixedDamage
    + Math.round((state.atk || 0) * RELIC_PROC_MONK.atkPct / 100)
    + Math.round((state.matk || 0) * RELIC_PROC_MONK.matkPct / 100);
  target.hp -= dmg;
  ailBreakOnDamage(target, monDef);
  if (typeof showGatlingFloats === 'function') showGatlingFloats(target.id, RELIC_PROC_MONK.gatlingHits);
  logMsg(`👊 南無加特林菩薩！造成 ${dmg} 點固定傷害。`, 'skill');
  if (target.hp <= 0) killMonster(monDef, target);
}

/* ---- 鐵匠：定時護盾 ----
   走既有的 state.shields（霸邪之陣那套），消耗規則完全共用——
   另開一套「遺物專用護盾」等於要把 absorbWithShields 的四條規則再寫一遍。
   remainingCharges 給很大是因為這面盾是**耐久制**不是次數制：
   5000 點打完就破，不管挨了幾下。 */
function tickRelicShield() {
  if (!state.relicProcs || !state.relicProcs.blacksmith) return;
  const now = Date.now();
  if (now < (state.relicShieldReadyAt || 0)) return;
  if (!state.shields) state.shields = [];
  if (state.shields.some(sh => sh.id === 'relic_bs')) return;   // 上一面還沒破就不補
  state.relicShieldReadyAt = now + RELIC_PROC_BLACKSMITH.shieldCooldownSec * 1000;
  state.shields.push({
    id: 'relic_bs', remainingHp: RELIC_PROC_BLACKSMITH.shieldHp,
    remainingCharges: 9999, expiresAt: now + 999999 * 1000,
  });
}

/* ---- 鐵匠：普攻追打 ----
   ATK100%+MATK100% 是刻意的雙傷害（使用者確認）：遺物不限職業，
   純物理、純魔法、混合三種 build 都吃得到其中一半以上。
   走一般的物理減傷（mitigateDamage），不是固定傷害。 */
function tryRelicBlacksmithStrike(mainTarget) {
  if (!state.relicProcs || !state.relicProcs.blacksmith) return;
  if (!state.monsters || !state.monsters.length) return;
  if (Math.random() * 100 >= RELIC_PROC_BLACKSMITH.procChance) return;
  const pool = state.monsters.filter(m => m.hp > 0);
  if (!pool.length) return;
  const base = (state.atk || 0) * RELIC_PROC_BLACKSMITH.atkPct / 100
    + (state.matk || 0) * RELIC_PROC_BLACKSMITH.matkPct / 100;
  // 隨機挑 N 隻（不重複）。場上不足 N 隻就打幾隻算幾隻，不重複打同一隻
  const picks = pool.slice();
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = picks[i]; picks[i] = picks[j]; picks[j] = t;
  }
  const targets = picks.slice(0, RELIC_PROC_BLACKSMITH.targets);
  let hit = 0;
  targets.forEach(mon => {
    const md = MONSTERS[mon.defId];
    if (!md || mon.hp <= 0) return;
    const dmg = mitigateDamage(base, ...defOf(md));
    mon.hp -= dmg;
    ailBreakOnDamage(mon, md);
    hit++;
    if (typeof showDamageFloatAt === 'function') showDamageFloatAt(mon.id, dmg, false);
    if (mon.hp <= 0) killMonster(md, mon);
  });
  if (hit > 0) logMsg(`⚙️ 鐵匠遺物！射穿了 ${hit} 名敵人。`, 'skill');
}

/* ---- 牧師：自動復活 ----
   3 次用完要**換圖**才回滿（見 changeMap）。只靠 CD 的話，
   3 分鐘一到就等於無限次，「3 次」這個數字就沒有意義了。
   接在 tryAutoRevive() 的最後：自己的復活術與隊友的祭司都優先，
   遺物是最後一道保險。 */
function tryRelicPriestRevive() {
  if (!state.relicProcs || !state.relicProcs.priest) return false;
  const now = Date.now();
  if (state.relicReviveUsed == null) state.relicReviveUsed = 0;
  if (state.relicReviveUsed >= RELIC_PROC_PRIEST.charges) return false;
  if (now < (state.relicReviveReadyAt || 0)) return false;
  state.relicReviveUsed++;
  state.relicReviveReadyAt = now + RELIC_PROC_PRIEST.cooldownSec * 1000;
  state.hp = Math.max(1, Math.round(state.maxHp * RELIC_PROC_PRIEST.reviveHpPct / 100));
  const left = RELIC_PROC_PRIEST.charges - state.relicReviveUsed;
  logMsg(`✝️ 牧師遺物！原地復活（HP ${RELIC_PROC_PRIEST.reviveHpPct}%），還剩 ${left} 次。`);
  return true;
}
/* 換圖回滿次數。死亡被抬回安全區也會經過這裡 */
function resetRelicRevive() {
  state.relicReviveUsed = 0;
  state.relicReviveReadyAt = 0;
}
function getDevotionTargetPct() {
  const b = state.buffs.find(x => x.type === 'devotion' && (x.msRemaining || 0) > 0);
  return b ? b.targetPlayerPct : 0;
}
/* 回傳「怪打玩家」的基礎機率：60% + 牧師遺物（隊友的犧牲在 pickMonsterTarget 處理） */
function relicPlayerTargetPct() {
  const extraRelic = (state.relicProcs && state.relicProcs.priest_taunt) ? RELIC_PROC_PRIEST.takeDamagePct : 0;
  return Math.min(100, ALLY_MONSTER_TARGET_PLAYER_PCT + extraRelic);
}

/* 遺物商人：1 張券換「指定套裝」的隨機一件。指定套裝是這張券唯一的價值——
   直接掉落是全套裝隨機，湊特定一套全靠這裡 */
function redeemRelicTicket(setId) {
  const pool = relicPieceIdsOfSet(setId);
  if (!pool.length) return false;
  if (getItemQty(RELIC_TICKET_ID) < 1) {
    logMsg('🎫 你沒有遺物券。');
    return false;
  }
  removeItem(RELIC_TICKET_ID, 1);
  const id = pool[Math.floor(Math.random() * pool.length)];
  addItem(id, 1);
  logMsg(`🏺 遺物商人給了你 ${RELIC_ITEMS[id].name}。`);
  saveGame();
  return true;
}

const BASE_STAT_KEYS = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
function getCardBonus(stat) {
  const all = effectiveGearBonuses();
  let total = all[stat] || 0;
  /* perBaseLv10_<目標>（緋紅色系列）：官方「角色等級 70 以上，BaseLv 每上升 10 時 ATK+5」。
     看的是**基礎等級**，70 級起算——不足 70 不生效。 */
  for (const k in all) {
    if (!k.startsWith('perBaseLv10_')) continue;
    const target = k.slice('perBaseLv10_'.length);
    if (target !== stat) continue;
    if ((state.baseLevel || 0) < 70) continue;
    total += Math.floor((state.baseLevel - 70) / 10 + 1) * all[k];
  }
  /* perBaseLv15_<目標>（成長型武器系列）：官方「BaseLv 每+15時 MATK+3（上限為Lv195）」。
     desc 沒寫起算門檻，從 Lv1 起算、封頂 195（195/15＝13 層）。 */
  for (const k in all) {
    if (!k.startsWith('perBaseLv15_')) continue;
    const target = k.slice('perBaseLv15_'.length);
    if (target !== stat) continue;
    total += Math.floor(Math.min(state.baseLevel || 0, 195) / 15) * all[k];
  }
  /* perBaseLv1_<目標>： BaseLv每+1時…（翡翠戒指） */
  for (const k in all) {
    if (!k.startsWith('perBaseLv1_')) continue;
    const target = k.slice('perBaseLv1_'.length);
    if (target !== stat) continue;
    total += (state.baseLevel || 0) * all[k];
  }
  /* perBaseLv210_<目標>： BaseLv210以上時…（狸貓變身樹葉-LT） */
  for (const k in all) {
    if (!k.startsWith('perBaseLv210_')) continue;
    const target = k.slice('perBaseLv210_'.length);
    if (target !== stat) continue;
    if ((state.baseLevel || 0) < 210) continue;
    total += all[k];
  }
  /* perStat_<來源>_<每N點>_<目標>：官方「純粹XX每N時 ○○+M」。
      來源限六項素質（看**加點的基礎值**，不含裝備／卡片／技能——官方的「純粹」），
      目標可以是任何加成鍵（atk/matk/critRate/critDmgPct/hit/aspdPct/eleReduce_none…）。
      原本只支援目標＝六項素質，賭徒之印那批（CRI/ATK/MATK 隨 LUK 成長）補齊時放寬。 */
  for (const k in all) {
    if (!k.startsWith('perStat_')) continue;
    const parts = k.split('_');            // perStat, from, per, to(可含底線)
    if (parts[1] == null || parts[2] == null) continue;
    const to = parts.slice(3).join('_');
    if (to !== stat) continue;
    const base = (state.stats && state.stats[parts[1]]) || 0;
    total += Math.floor(base / (+parts[2] || 1)) * all[k];
  }
  /* perSkill_<技能ID>_<每N級>_<目標>： 習得等級每+N時…（翡翠戒指） */
  for (const k in all) {
    if (!k.startsWith('perSkill_')) continue;
    const rest = k.slice('perSkill_'.length);
    const parts = rest.split('_');
    if (parts.length < 3) continue;
    const to = parts.pop();
    const per = parts.pop();
    const skillId = parts.join('_');
    if (to !== stat) continue;
    const lv = (state.learnedSkills && state.learnedSkills[skillId]) || 0;
    total += Math.floor(lv / (+per || 1)) * all[k];
  }
  if (!BASE_STAT_KEYS.includes(stat)) return total;
  // All State+N（古埃及王卡片）：六項素質一起加
  if (all.allStat) total += all.allStat;
  return total;
}
/* ---------------- 道具鎖定 ----------------
   鎖定只擋「會讓道具消失」的操作：賣出、全部賣出、自動販賣、露天商店。
   存倉庫不擋——東西還在，取得回來，鎖定的用意是防手滑賣掉珍品，不是禁止搬動。
------------------------------------------------- */
function isItemLocked(itemId) {
  return !!(state.lockedItems && state.lockedItems[itemId]);
}
function toggleItemLock(itemId) {
  if (!state.lockedItems) state.lockedItems = {};
  if (state.lockedItems[itemId]) {
    delete state.lockedItems[itemId];
    logMsg(`🔓 已解除 ${getItemDisplayName(itemId)} 的鎖定。`);
  } else {
    state.lockedItems[itemId] = 1;
    logMsg(`🔒 已鎖定 ${getItemDisplayName(itemId)}，不會被賣出或自動販賣。`);
    // 鎖定時順手從自動販賣清單移除，免得兩個設定互相矛盾
    if (state.autoSellConfig && state.autoSellConfig.items) {
      state.autoSellConfig.items = state.autoSellConfig.items.filter(id => id !== itemId);
    }
  }
  saveGame();
  return true;
}

function sellItem(itemId, qty) {
  const def = ITEMS[itemId];
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!def || !row || row.qty < qty) return false;
  /* 遺物賣價是 0，賣掉等於**免費銷毀**（#115）。
     多的遺物有兩個正當出路：換遺物券、或存倉庫躲開換券的扣除，
     賣出不在其中——擋掉，免得手滑把湊了幾十小時的部位變成 0 鋅幣。 */
  if (def.type === 'relic') {
    logMsg(`🏺 ${def.name} 賣不掉。多的遺物請拿去換遺物券，要留的存倉庫。`);
    return false;
  }
  if (isItemLocked(itemId)) {
    logMsg(`🔒 ${def.name} 已鎖定，無法賣出。請先解除鎖定。`);
    return false;
  }
  removeItem(itemId, qty);
  const unitPrice = Math.round(def.sell * (state.shopOverchargeMult || 1));
  const total = unitPrice * qty;
  state.gold += total;
  logMsg(`賣出 ${def.name} x${qty}，獲得 ${total} 鋅幣。`);
  saveGame();
  return true;
}
function sellItemAll(itemId) {
  const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
  if (!row || row.qty < 1) return false;
  return sellItem(itemId, row.qty);
}
// 賣掉背包裡一件個體裝備；插在上面的卡片會跟著消失（要留卡請先用「拆卸取回卡片」）
function sellItemInstance(instanceId) {
  const idx = state.inventory.findIndex(r => r.instanceId === instanceId);
  const inst = state.instances && state.instances[instanceId];
  if (idx === -1 || !inst) return false;
  const def = ITEMS[inst.item];
  if (!def) return false;
  if (isItemLocked(inst.item)) {
    logMsg(`🔒 ${def.name} 已鎖定，無法賣出。請先解除鎖定。`);
    return false;
  }
  const label = describeInstance(inst);
  state.inventory.splice(idx, 1);
  delete state.instances[instanceId];
  const price = Math.round(def.sell * (state.shopOverchargeMult || 1));
  state.gold += price;
  logMsg(`賣出 ${label}，獲得 ${price} 鋅幣。`);
  saveGame();
  return true;
}

/* ---------------- 自動販賣：玩家勾選的道具，每30秒(或手動)自動以原價賣出全部 ---------------- */
const AUTO_SELL_INTERVAL_MS = 30 * 1000;
function toggleAutoSellItem(itemId) {
  if (!state.autoSellConfig) state.autoSellConfig = { enabled: false, items: [] };
  const idx = state.autoSellConfig.items.indexOf(itemId);
  if (idx >= 0) state.autoSellConfig.items.splice(idx, 1);
  else {
    if (isItemLocked(itemId)) {
      logMsg(`🔒 ${getItemDisplayName(itemId)} 已鎖定，無法加入自動販賣。`);
      return;
    }
    state.autoSellConfig.items.push(itemId);
  }
  saveGame();
}
function setAutoSellEnabled(v) {
  if (!state.autoSellConfig) state.autoSellConfig = { enabled: false, items: [] };
  state.autoSellConfig.enabled = !!v;
  state.autoSellReadyAt = Date.now() + AUTO_SELL_INTERVAL_MS;
  saveGame();
}
/* ---- 從別的存檔抄一份自動販賣清單（#140） ----

   清單維持「每個角色一份」：補師要留的紅水，打手是純粹的負重。共用會互相打架。
   但新角色從零開始一項一項點太累，而多數人只是想把主力那份搬過來，
   所以不改成共用，只加一條「抄過來」的路。

   抄之前要過濾三種東西，不然抄完的清單看起來有效、實際上是壞的：
     · 本作已經沒有的 id（舊存檔留下的）——永遠賣不掉，只是佔位
     · 賣不掉的（sell <= 0、遺物）——同上
     · **這個角色鎖定的道具**——鎖定是角色自己的設定，
       不能因為別人的清單裡有就被拖進去賣（賣出那一步雖然也會擋，
       但清單上看得到卻永遠不賣，比直接不收更難懂） */
function autoSellSyncCandidates() {
  const out = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (String(i) === String(currentSlot)) continue;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(getSlotKey(i)) || 'null'); } catch (e) { s = null; }
    if (!s || !s.jobId || !s.name) continue;
    const job = JOB_TREE[s.jobId];
    const items = (s.autoSellConfig && Array.isArray(s.autoSellConfig.items)) ? s.autoSellConfig.items : [];
    out.push({
      slot: String(i), name: s.name, jobId: s.jobId,
      jobName: job ? job.name : s.jobId, jobIcon: job ? job.icon : '❓',
      baseLevel: s.baseLevel || 1,
      count: items.filter(id => ITEMS[id]).length,
    });
  }
  return out;
}
// 讀那一格的清單，濾成「這個角色現在真的能用」的 id
function readAutoSellList(slot) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(getSlotKey(slot)) || 'null'); } catch (e) { s = null; }
  const raw = (s && s.autoSellConfig && Array.isArray(s.autoSellConfig.items)) ? s.autoSellConfig.items : [];
  const items = []; let locked = 0, dropped = 0;
  raw.forEach(id => {
    const def = ITEMS[id];
    if (!def || def.type === 'relic' || !(def.sell > 0)) { dropped++; return; }
    if (isItemLocked(id)) { locked++; return; }
    if (items.indexOf(id) < 0) items.push(id);
  });
  return { ok: !!s, items, locked, dropped };
}
// mode: 'replace' 整份換掉／'merge' 併進現有清單（不動原本已選的）
function syncAutoSellFrom(slot, mode) {
  const r = readAutoSellList(slot);
  if (!r.ok) { logMsg('⚠️ 那格存檔讀不到資料。'); return false; }
  if (!state.autoSellConfig) state.autoSellConfig = { enabled: false, items: [] };
  const before = state.autoSellConfig.items.slice();
  const next = mode === 'merge'
    ? before.concat(r.items.filter(id => before.indexOf(id) < 0))
    : r.items.slice();
  state.autoSellConfig.items = next;
  const added = next.filter(id => before.indexOf(id) < 0).length;
  const removed = before.filter(id => next.indexOf(id) < 0).length;
  logMsg(`🏷️ 自動販賣清單已${mode === 'merge' ? '合併' : '覆蓋'}：共 ${next.length} 種`
    + `（新增 ${added}、移除 ${removed}）`
    + (r.locked ? `，跳過 ${r.locked} 種已鎖定` : '')
    + (r.dropped ? `，略過 ${r.dropped} 種無效` : ''));
  saveGame();
  return true;
}

// 立即執行一次自動販賣（不受30秒週期限制，並重新計時）
function runAutoSellNow() {
  const sold = autoSellSelectedItems();
  state.autoSellReadyAt = Date.now() + AUTO_SELL_INTERVAL_MS;
  saveGame();
  return sold;
}
function autoSellSelectedItems() {
  if (!state.autoSellConfig || !state.autoSellConfig.items || state.autoSellConfig.items.length === 0) return false;
  let soldAny = false;
  let totalGold = 0;
  state.autoSellConfig.items.forEach(itemId => {
    const def = ITEMS[itemId];
    const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
    if (!def || !row || row.qty < 1) return;
    if (def.type === 'relic') return;   // 遺物賣不掉（見 sellItem）
    if (isItemLocked(itemId)) return;   // 鎖定的道具自動販賣一律跳過
    const qty = row.qty;
    removeItem(itemId, qty);
    const price = Math.round(def.sell * (state.shopOverchargeMult || 1)) * qty;
    state.gold += price;
    totalGold += price;
    soldAny = true;
  });
  if (soldAny) logMsg(`🏷️ 自動販賣賣出了選定道具，獲得 ${totalGold} 鋅幣！`);
  return soldAny;
}
function tryAutoSell() {
  if (!state.autoSellConfig) state.autoSellConfig = { enabled: false, items: [] };
  if (!state.autoSellConfig.enabled) return;
  const readyAt = state.autoSellReadyAt || 0;
  if (Date.now() < readyAt) return;
  state.autoSellReadyAt = Date.now() + AUTO_SELL_INTERVAL_MS;
  if (autoSellSelectedItems()) saveGame();
}

/* ---------------- 露天商店：選定道具後自動定時以倍率販售 ---------------- */
function setVendingItems(itemIds) {
  state.vendingConfig = { items: (itemIds || []).slice(0, 3) };
  saveGame();
}
function tryAutoVending() {
  /* **走職業鏈，不能只認 `merchant`**（#149）。轉職到鐵匠／神匠／鍊金／創造者
     之後 jobId 就變了，同一個角色會突然「不是商人」，露天商店整個消失——
     玩家回報「找不到露天商店的入口」時人在神匠。
     這跟 isBlacksmithLine() 當初踩到的是同一個坑。 */
  if (!jobLineHas(state.jobId, 'merchant')) return;
  if (!state.learnedSkills || !state.learnedSkills['vending']) return;
  if (!state.vendingConfig || !state.vendingConfig.items || state.vendingConfig.items.length === 0) return;
  const readyAt = state.vendingReadyAt || 0;
  if (Date.now() < readyAt) return;

  const sk = findSkillById('vending');
  const cdSec = sk.internalCooldown || 60;
  const sellMult = sk.sellMultiplier || 10;
  state.vendingReadyAt = Date.now() + cdSec * 1000;

  let soldAny = false;
  state.vendingConfig.items.forEach(itemId => {
    const def = ITEMS[itemId];
    const row = state.inventory.find(r => r.item === itemId && !r.instanceId);
    if (!def || !row || row.qty < 1) return;
    if (def.type === 'relic') return;   // 遺物賣不掉（見 sellItem）
    if (isItemLocked(itemId)) return;   // 鎖定的道具露天商店也不賣
    removeItem(itemId, 1);
    const price = Math.round(def.sell * sellMult);
    state.gold += price;
    logMsg(`🏪 露天商店賣出了 ${def.name}，獲得 ${price} 鋅幣！`);
    soldAny = true;
  });
  if (soldAny) saveGame();
}

/* ---------------- 鐵匠鍛造系統 ---------------- */
const CRAFT_SUBTYPE_MATERIALS = {
  dagger:   { iron: 3, steel: 1 },
  sword1h:  { iron: 5, steel: 2 },
  sword2h:  { iron: 8, steel: 3 },
  axe1h:    { iron: 5, steel: 2 },
  axe2h:    { iron: 8, steel: 3 },
  knuckle:  { iron: 4, steel: 1 },
  mace:     { iron: 5, steel: 2 },
  spear1h:  { iron: 6, steel: 2 },
  spear2h:  { iron: 9, steel: 3 },
};
const CRAFT_SUBTYPE_CATEGORY = {
  dagger: 'dagger', sword1h: 'sword', sword2h: 'sword', axe1h: 'axe', axe2h: 'axe',
  knuckle: 'knuckle', mace: 'mace', spear1h: 'spear', spear2h: 'spear',
};
const CRAFT_ELEMENT_STONE = { wind: 'gemstone_wind', water: 'gemstone_water', fire: 'gemstone_fire', earth: 'gemstone_earth' };
const CRAFT_ZENY_COST = 10000;
const CRAFT_CATEGORY_NAMES = { dagger: '短劍', sword: '劍', axe: '斧頭', knuckle: '拳套', mace: '鈍器', spear: '長矛' };
const CRAFT_SUBTYPE_NAMES = { dagger: '短劍', sword1h: '單手劍', sword2h: '雙手劍', axe1h: '單手斧頭', axe2h: '雙手斧頭', knuckle: '拳套', mace: '鈍器', spear1h: '單手長矛', spear2h: '雙手長矛' };
const CRAFT_ELEMENT_NAMES = { wind: '風', water: '水', fire: '火', earth: '地' };

// 鍛造成功率：基礎15% + DEX(滿120給+20%) + LUK(滿120給+10%) + 神之金屬研究加成
function getCraftingSuccessChance() {
  const dexBonus = Math.min(20, (state.stats.dex || 0) / 120 * 20);
  const lukBonus = Math.min(10, (state.stats.luk || 0) / 120 * 10);
  return 15 + dexBonus + lukBonus + (state.craftBonusPct || 0);
}

/* 這個職業算不算鐵匠。**不能只認 `blacksmith`**——轉職到神匠（whitesmith）之後
   jobId 就變了，同一個角色會突然不算鐵匠，鍛造出來的武器前綴掉回「鐵匠」。
   走 parent 鏈（jobLineHas 在 data.js），之後再加鐵匠線的三轉也不必動這裡。 */
function isBlacksmithLine(jobId) { return jobLineHas(jobId, 'blacksmith'); }

// 掃描帳號內所有存檔欄位，找出鐵匠角色名字：剛好1位就用他的名字，2位以上顯示「某人」
function getAccountBlacksmithName() {
  const names = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(getSlotKey(i));
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (s && isBlacksmithLine(s.jobId) && s.name) names.push(s.name);
    } catch (e) { /* 忽略壞檔 */ }
  }
  if (names.length === 0) return '鐵匠';
  if (names.length === 1) return names[0];
  return '某人';
}

// 取得道具顯示名稱：鐵匠鍛造武器會自動加上「XX製作的」前綴
function getItemDisplayName(itemId) {
  const def = ITEMS[itemId];
  if (!def) return itemId;
  if (typeof itemId !== 'string' || !itemId.startsWith('crafted_')) return def.name;
  return getAccountBlacksmithName() + '製作的' + def.name;
}

function craftWeapon(subtype, element) {
  const category = CRAFT_SUBTYPE_CATEGORY[subtype];
  if (!category || !state.unlockedCraftCategories.includes(category)) {
    logMsg('⚠️ 尚未學會這個鍛造技能！');
    return false;
  }
  const stoneId = CRAFT_ELEMENT_STONE[element];
  const mat = CRAFT_SUBTYPE_MATERIALS[subtype];
  if (!stoneId || !mat) return false;

  if (getItemQty('iron') < mat.iron || getItemQty('steel') < mat.steel || getItemQty(stoneId) < 1) {
    logMsg('⚠️ 材料不足，無法鍛造！');
    return false;
  }
  if (state.gold < CRAFT_ZENY_COST) {
    logMsg('⚠️ 鋅幣不足，無法鍛造！');
    return false;
  }

  // 消耗材料（不論成功與否）
  removeItem('iron', mat.iron);
  removeItem('steel', mat.steel);
  removeItem(stoneId, 1);
  state.gold -= CRAFT_ZENY_COST;

  const chance = getCraftingSuccessChance();
  const success = Math.random() * 100 < chance;
  if (success) {
    const itemId = 'crafted_' + subtype + '_' + element;
    addItem(itemId, 1);
    logMsg(`🔨 鍛造成功！獲得了 ${getItemDisplayName(itemId)}！`);
  } else {
    logMsg('🔨 鍛造失敗了……材料已經消耗。');
  }
  saveGame();
  return success;
}

/* ---------------- 原料鍛造（鐵/鋼/屬性原石）---------------- */
const MATERIAL_CRAFT_ZENY_COST = 500;
const MATERIAL_CRAFT_SUCCESS_CHANCE = 50;
const MATERIAL_CRAFT_RECIPES = {
  iron:        { unlockCategory: 'iron',  consume: [{ item: 'iron_ore', qty: 1 }],                              result: 'iron' },
  steel:       { unlockCategory: 'steel', consume: [{ item: 'iron', qty: 5 }, { item: 'coal', qty: 1 }],        result: 'steel' },
  stone_fire:  { unlockCategory: 'stone', consume: [{ item: 'boody_red', qty: 10 }],                            result: 'gemstone_fire' },
  stone_water: { unlockCategory: 'stone', consume: [{ item: 'crystal_blue', qty: 10 }],                         result: 'gemstone_water' },
  stone_wind:  { unlockCategory: 'stone', consume: [{ item: 'wind_of_verdure', qty: 10 }],                      result: 'gemstone_wind' },
  stone_earth: { unlockCategory: 'stone', consume: [{ item: 'yellow_live', qty: 10 }],                          result: 'gemstone_earth' },
  /* 毒液製作（#59）：官方的七種材料一項不減，成功率 25%（使用者指定，官方是吃 DEX/LUK 的浮動值）。

     七種材料**全部拿得到**：毒牙（青蛇/毒蛇/黑蛇）、仙人掌刺（摩卡）、蜂針（蜂兵/毒黃蜂）、
     毒魔菇芽孢（黑菇/紅菇/魔菇）、卡勒波迪藥水（紅菇/消防魔）、空瓶（波利那一票）都靠打怪，
     **只有菠色克藥水是道具商人賣的**（3,000z）——本作沒有任何怪掉它。
     官方那條「失敗扣最大HP 25%」沒做：本作鍛造是在城鎮面板上按的，扣血只會逼玩家先補滿再按。 */
  poison_bottle: {
    unlockCategory: 'poison',
    consume: [
      { item: 'posionous_canine', qty: 1 },   // 毒牙
      { item: 'cactus_needle', qty: 1 },      // 仙人掌刺
      { item: 'bee_sting', qty: 1 },          // 蜂針
      { item: 'poison_spore', qty: 1 },       // 毒魔菇芽孢
      { item: 'karvodailnirol', qty: 1 },     // 卡勒波迪藥水
      { item: 'berserk_potion', qty: 1 },     // 菠色克藥水（商店買）
      { item: 'empty_bottle', qty: 1 },       // 空瓶
    ],
    result: 'poison_bottle',
    chance: 25,
  },
};

// 這道配方的成功率／花費（沒寫就用原料鍛造的通用值）
function materialCraftChance(recipe) { return (recipe && typeof recipe.chance === 'number') ? recipe.chance : MATERIAL_CRAFT_SUCCESS_CHANCE; }
function materialCraftCost(recipe) { return (recipe && typeof recipe.zeny === 'number') ? recipe.zeny : MATERIAL_CRAFT_ZENY_COST; }

function craftMaterial(kind) {
  const recipe = MATERIAL_CRAFT_RECIPES[kind];
  if (!recipe) return false;
  if (!state.unlockedMaterialCrafts.includes(recipe.unlockCategory)) {
    logMsg('⚠️ 尚未學會這個鍛造技能！');
    return false;
  }
  for (const c of recipe.consume) {
    if (getItemQty(c.item) < c.qty) {
      logMsg('⚠️ 材料不足，無法鍛造！');
      return false;
    }
  }
  const cost = materialCraftCost(recipe);
  if (state.gold < cost) {
    logMsg('⚠️ 鋅幣不足，無法鍛造！');
    return false;
  }

  // 消耗材料（不論成功與否）
  recipe.consume.forEach(c => removeItem(c.item, c.qty));
  state.gold -= cost;

  const success = Math.random() * 100 < materialCraftChance(recipe);
  if (success) {
    addItem(recipe.result, 1);
    logMsg(`🔨 鍛造成功！獲得了 ${ITEMS[recipe.result].name}！`);
  } else {
    logMsg('🔨 鍛造失敗了……材料已經消耗。');
  }
  saveGame();
  return success;
}

/* ---------------- 地圖切換 ---------------- */
function changeMap(mapId) {
  const map = MAPS.find(m => m.id === mapId);
  if (!map) return false;
  state.mapId = mapId;
  // 回安全區全隊免費滿血復活（#83）——不然倒地的隊友只能靠天地樹葉子
  if ((map.monsters || []).length === 0) reviveAlliesInTown();
  ensureCodex().maps[mapId] = 1; // 探索成就用
  resetRelicRevive();            // 牧師遺物的復活次數換圖回滿（#113）
  state.monsters = [];
  state.monster = null;
  logMsg(`前往「${map.name}」。`);
  spawnMonster();
  saveGame();
  return true;
}

/* ---------------- MVP／迷你王 模式切換 ----------------

   **MVP 只能在近戰模式開啟**（使用者 2026-08-09 指定）。理由是召喚小弟：
   MVP 一出場就把場上空位填滿，而遠攻模式的 `maxMonsters` 是 1，
   一隻小弟都放不下——開了等於只有 MVP 沒有隨從，跟設計意圖不符。

   **迷你王沒有這個限制**（#147）：牠不帶小弟，遠攻模式一隻也放得下。 */
function mvpModeBlockReason() {
  if ((state.encounterMode || 'melee') !== 'melee') return 'MVP 模式只能在近戰模式開啟（遠攻模式場上只有 1 隻，放不下 MVP 的手下）。';
  const map = currentMap();
  if (!map || !bossListOf(map.id, 'mvp').length) return '這張地圖沒有 MVP。';
  return null;
}
function miniModeBlockReason() {
  const map = currentMap();
  if (!map || !bossListOf(map.id, 'mini').length) return '這張地圖沒有迷你王。';
  return null;
}
function toggleMiniMode(enabled) {
  if (enabled) {
    const blocked = miniModeBlockReason();
    if (blocked) { logMsg('⚠️ ' + blocked); state.miniMode = false; saveGame(); return false; }
  }
  state.miniMode = enabled;
  logMsg(enabled ? '👺 迷你王模式已開啟，迷你王可能隨時出現！' : '迷你王模式已關閉。');
  saveGame();
  return true;
}
function toggleMvpMode(enabled) {
  if (enabled) {
    const blocked = mvpModeBlockReason();
    if (blocked) { logMsg('⚠️ ' + blocked); state.mvpMode = false; saveGame(); return false; }
  }
  state.mvpMode = enabled;
  logMsg(enabled ? '🎯 MVP 模式已開啟，MVP 可能隨時降臨（並會帶著手下一起出現）！' : 'MVP 模式已關閉。');
  saveGame();
  return true;
}

/* ---------------- 存讀檔 ---------------- */
let lastSaveTs = 0;
function saveGameThrottled() {
  if (Date.now() - lastSaveTs > 5000) saveGame();
}
function saveGame() {
  if (!state) return;
  /* 換身期間（withAlly）**絕對不能存**（#105）：那時候的 `state` 是隊友快照，
     存下去等於把玩家的存檔格整個換成隊友——名字、職業、等級、背包全部變成他的。

     `withAlly()` 的註解本來就寫著「不要在 fn 裡呼叫 saveGame()」，但那是靠自律，
     而隊友跑的是**同一支 `playerAttack()`**：裡面的 `tryAutoSpells()` 打到卡片的
     自動念咒就會 `castSkill()`，castSkill 尾端有 saveGame()。
     實測隊友裝一張牛蛙卡（普攻機率放毒刃），普攻五下就把玩家的角色蓋掉了。

     隊友的狀態不會因此漏存：隊友快照住在 `state.allies` 裡，
     換回玩家之後的任何一次正常存檔都會把它一起寫進去。 */
  if (_allyActing) return;
  try {
    state.lastActiveAt = Date.now();
    /* 隊友快照跟主角**共用**同一個 state.monsters 陣列（withAlly 塞的），
       直接序列化會把整場怪重複存兩份，而且讀檔後會變成三份互不相干的場。 */
    (state.allies || []).forEach(a => { if (a) { a.monsters = null; a.monster = null; } });
    localStorage.setItem(getSlotKey(currentSlot), JSON.stringify(state));
    lastSaveTs = Date.now();
  } catch (e) { /* 儲存失敗時靜默略過，不中斷遊戲 */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(getSlotKey(currentSlot));
    if (!raw) return false;
    state = JSON.parse(raw);
    if (!state.lastActiveAt) state.lastActiveAt = Date.now();
    if (!state.autoPotion) state.autoPotion = { enabled: true, primary: '', fallback: 'red_potion', hpThreshold: 50 };
    if (typeof state.autoPotion.hpThreshold !== 'number') state.autoPotion.hpThreshold = 50;
    // 舊版 tier 欄位遷移
    if (state.autoPotion.tier && !state.autoPotion.fallback) {
      state.autoPotion.fallback = state.autoPotion.tier;
      delete state.autoPotion.tier;
    }
    if (typeof state.autoBuyPotion !== 'boolean') state.autoBuyPotion = true;
    if (typeof state.autoBuyArrow !== 'boolean') state.autoBuyArrow = true;
    // 隊友（#83）：舊存檔沒有這些欄位
    if (!Array.isArray(state.allies)) state.allies = [];
    state.allies.forEach(a => { if (a) { a.monsters = null; a.monster = null; a._lastAttackAt = 0; } });
    if (typeof state.autoBuyReviveLeaf !== 'boolean') state.autoBuyReviveLeaf = true;
    if (typeof state.autoReviveAlly !== 'boolean') state.autoReviveAlly = true;
    if (!state.allyPotion) state.allyPotion = { enabled: true, primary: '', fallback: ALLY_POTION_FALLBACK, hpThreshold: 50 };
    if (typeof state.autoBuyAllyPotion !== 'boolean') state.autoBuyAllyPotion = true;
    /* 迷你王模式（#147）：以前 mvpMode 一個開關同時管 MVP 與迷你王，
       所以本來開著 BOSS 模式的人，遷移後兩個都要開——不然他們會突然
       「迷你王再也不出現了」，而畫面上看不出是為什麼。 */
    if (typeof state.miniMode !== 'boolean') state.miniMode = !!state.mvpMode;
    // 打寶模式（#110）：舊存檔補 0（關閉）；不是進階二轉的話一律關掉
    if (typeof state.farmMode !== 'number') state.farmMode = 0;
    if (state.farmMode && !farmModeUnlocked()) state.farmMode = 0;
    // 隊友藍水（#105）：舊存檔補上預設，不然隊友放完技能就再也沒 SP
    if (!state.allySpPotion) state.allySpPotion = { enabled: true, primary: '', fallback: ALLY_SP_POTION_FALLBACK, spThreshold: 30 };
    if (typeof state.autoBuyAllySpPotion !== 'boolean') state.autoBuyAllySpPotion = true;
    if (typeof state.autoBuyAllyArrow !== 'boolean') state.autoBuyAllyArrow = true;
    if (typeof state.allySfxRatio !== 'number') state.allySfxRatio = 0.5;
    if (typeof state.allySfxOff !== 'boolean') state.allySfxOff = false;
    if (typeof state.spriteScalePct !== 'number') state.spriteScalePct = 100;
    if (typeof state.skillSpriteScalePct !== 'number') state.skillSpriteScalePct = 85;
    if (!state.autoSpPotion) state.autoSpPotion = { enabled: false, primary: '', fallback: 'blue_potion', spThreshold: 30 };
    if (typeof state.autoSpPotion.spThreshold !== 'number') state.autoSpPotion.spThreshold = 30;
    if (typeof state.autoBuySpPotion !== 'boolean') state.autoBuySpPotion = false;
    if (!state.autoAspdPotion) state.autoAspdPotion = { enabled: false, items: [] };
    if (!Array.isArray(state.autoAspdPotion.items)) state.autoAspdPotion.items = [];
    if (typeof state.autoBuyAspdPotion !== 'boolean') state.autoBuyAspdPotion = false;
    if (typeof state.muted !== 'boolean') state.muted = false;
    // 舊存檔沒有 DPS 統計，補一份空的（從讀檔當下開始算）
    if (!state.dpsTracker || typeof state.dpsTracker.damage !== 'number') {
      state.dpsTracker = { since: Date.now(), damage: 0, exp: 0, jobExp: 0, gold: 0, kills: 0 };
    }
    // 圖鑑遷移：舊存檔沒有紀錄，至少把背包/裝備裡現有的東西補登為「已取得」，
    // 免得老角色開圖鑑看到一片空白
    if (!state.codex) {
      state.codex = { mon: {}, seen: {}, item: {}, maps: {} };
      (state.inventory || []).forEach(r => { state.codex.item[r.item] = r.qty; });
      Object.values(state.equip || {}).forEach(id => { if (id) state.codex.item[id] = state.codex.item[id] || 1; });
      allEquippedCards().forEach(id => { state.codex.item[id] = state.codex.item[id] || 1; });
    }
    if (!state.codex.maps) state.codex.maps = {};
    if (state.mapId) state.codex.maps[state.mapId] = 1; // 至少把現在站的地圖算進去
    if (typeof state.deaths !== 'number') state.deaths = 0;
    if (!state.achievements) state.achievements = { done: {}, points: 0 };
    if (!state.lockedItems) state.lockedItems = {};
    if (!state.autoSkillConfig) state.autoSkillConfig = { skillId: null, mode: 'once', spThreshold: 30, skillId2: null, spThreshold2: 50, monsterCount2: 2 };
    if (!state.autoSkillConfig.skillId2) state.autoSkillConfig.skillId2 = null;
    if (!state.autoSkillConfig.spThreshold2) state.autoSkillConfig.spThreshold2 = 50;
    if (!state.autoSkillConfig.monsterCount2) state.autoSkillConfig.monsterCount2 = 2;
    if (!state.autoSupportSkills) state.autoSupportSkills = {};
    if (!state.autoHealConfig) state.autoHealConfig = {};
    // 多怪物系統遷移
    if (!state.monsters) state.monsters = [];
    if (!state.maxMonsters) state.maxMonsters = MELEE_MAX_MONSTERS;
    if (!state.monsterIdCounter) state.monsterIdCounter = 0;
    if (!state.encounterMode) state.encounterMode = 'melee';
    if (!state.lastSpawnTime) state.lastSpawnTime = 0;
    if (!state.bossKills) state.bossKills = {};   // 頭目擊殺紀錄（#137）：舊存檔沒有這格
    migrateBossKills(state);                      // 初版沒分打寶模式，搬到「普通」那一格
    // 如果舊存檔有 state.monster 但沒有 state.monsters，遷移過來
    if (state.monster && state.monsters.length === 0) {
      state.monsters = [state.monster];
      state.monster = state.monsters[0];
    }
    // 技能點遷移：如果沒有 jobSkillPoints，從全域 skillPoints 初始化
    if (!state.jobSkillPoints) {
      state.jobSkillPoints = {};
      if (state.skillPoints > 0) {
        state.jobSkillPoints[state.jobId] = state.skillPoints;
      }
    }
    // 同步全域技能點
    state.skillPoints = Object.values(state.jobSkillPoints).reduce((a, b) => a + b, 0);
    if (!state.lastAttackTime) state.lastAttackTime = Date.now();
    state.lastAttackTime = Date.now(); // 防止離線時間差造成爆量攻擊
    if (!state.attackAccumulator) state.attackAccumulator = 0;
    state.attackAccumulator = 0;

    // Migration: add new equip slots if missing
    if (!state.equip) state.equip = {};
    if (!state.equip.head_top) state.equip.head_top = null;
    if (!state.equip.head_mid) state.equip.head_mid = null;
    if (!state.equip.head_bottom) state.equip.head_bottom = null;
    if (!state.equip.shield) state.equip.shield = null;
    if (!state.equip.garment) state.equip.garment = null;
    if (!state.equip.footgear) state.equip.footgear = null;
    if (!state.equip.accessory1) state.equip.accessory1 = null;
    if (!state.equip.accessory2) state.equip.accessory2 = null;
    if (!state.equip.ammo) state.equip.ammo = null;
    if (!state.equipSkin) state.equipSkin = 'grid';
    /* 遺物欄（#113）。舊存檔沒有這個欄位，補成八格空的；
       已經有的話只補缺少的格子，不要整個覆蓋掉玩家穿好的遺物。 */
    if (!state.relics) state.relics = emptyRelicSlots();
    RELIC_SLOTS.forEach(s => { if (state.relics[s] === undefined) state.relics[s] = null; });
    if (!state.refinement) state.refinement = {};
    if (!state.equippedCards) state.equippedCards = {};
    if (!state.instances) state.instances = {};
    // 卡片改成一欄位多張後，舊存檔的單張字串要正規化成陣列；
    // 順便丟掉插在不合法部位的卡（早期沒有部位檢查，可能插錯地方），卡片退回背包不沒收
    Object.keys(state.equippedCards).forEach(slot => {
      const v = state.equippedCards[slot];
      if (!v) { delete state.equippedCards[slot]; return; }
      let list = Array.isArray(v) ? v.slice() : [v];
      const kept = [];
      list.forEach(id => {
        const card = CARDS[id];
        if (!card) return;                                   // 卡片已不存在
        if (!cardFitsSlot(card, slot)) { addItem(id, 1); return; }
        kept.push(id);
      });
      const max = state.equip[slot] ? getEquipCardSlots(slot) : 0;
      while (kept.length > max) addItem(kept.pop(), 1);       // 超過孔數的退回背包
      if (kept.length) state.equippedCards[slot] = kept; else delete state.equippedCards[slot];
    });
    /* Migration（#98）：服事四支技能的 id 改成官方的。以前的 id 跟名字錯開一格，
       讀程式碼時對不上（`blessing` 裝的是加速術、`cure` 裝的是天使之淚）。

       這是一個**環**（blessing→increaseagi→…→cure），所以要另建一份再換掉，
       不能就地改——就地改會讓先換的那支被後換的蓋掉。

       **只搬真的還是舊式 id 的存檔**：這支在每次 loadGame 都會執行，而新版
       `blessing`（天使之賜福）、`cure`（治療術）本身就是合法 id。無條件再跑一次
       會把它們併進 `increaseagi`／`holywater`，技能點憑空消失。舊式存檔**必定**
       含 `aquabenedicta`／`curestatus`（新式存檔不會有），用這兩個 key 當指標，
       沒有就整段跳過，順便避免重複搬。 */
    (function migrateAcolyteSkillIds() {
      const MAP = { blessing: 'increaseagi', aquabenedicta: 'blessing',
        cure: 'holywater', curestatus: 'cure' };
      const conv = id => (id && MAP[id]) || id;
      const remapObj = o => {
        if (!o) return o;
        const out = {};
        Object.keys(o).forEach(k => { out[conv(k)] = o[k]; });
        return out;
      };
      const isOldFormat = st => {
        if (!st || !st.learnedSkills) return false;
        return st.learnedSkills['aquabenedicta'] != null || st.learnedSkills['curestatus'] != null;
      };
      const fix = st => {
        if (!st || !isOldFormat(st)) return;
        st.learnedSkills = remapObj(st.learnedSkills);
        st.cooldowns = remapObj(st.cooldowns);
        st.autoSupportSkills = remapObj(st.autoSupportSkills);
        if (st.plagiarismSkillId) st.plagiarismSkillId = conv(st.plagiarismSkillId);
        if (st.autoSkillConfig) {
          st.autoSkillConfig.skillId = conv(st.autoSkillConfig.skillId);
          st.autoSkillConfig.skillId2 = conv(st.autoSkillConfig.skillId2);
        }
      };
      fix(state);
      (state.allies || []).forEach(fix);     // 隊友快照裡也有一份自己的技能表
    })();
    // Migration：舊存檔的精煉度掛在itemId、卡片掛在欄位，改成掛在「那一件裝備」的個體紀錄上
    (function migrateEquipToInstances() {
      let n = 0;
      EQUIP_SLOTS_ALL.forEach(slot => {
        const cur = state.equip[slot];
        if (!cur || state.instances[cur]) return;   // 空欄位或已經是個體
        const legacyRefine = state.refinement[cur] || 0;
        const legacyCards = state.equippedCards[slot] || [];
        if (legacyRefine > 0 || legacyCards.length) {
          const id = cur + '#mig' + Date.now() + '_' + (n++);
          state.instances[id] = { item: cur, refine: legacyRefine, cards: legacyCards.slice() };
          state.equip[slot] = id;
          delete state.equippedCards[slot];
        }
      });
    })();

    // Migration: convert old boolean learnedSkills to level format
    if (state.learnedSkills) {
      Object.keys(state.learnedSkills).forEach(k => {
        if (state.learnedSkills[k] === true) {
          state.learnedSkills[k] = 1; // convert boolean to level 1
        }
      });
    }

    // Migration: 清理不存在的怪物引用
    if (state.monsters && state.monsters.length > 0) {
      state.monsters = state.monsters.filter(m => MONSTERS[m.defId]);
      if (state.monsters.length === 0) {
        state.monster = null;
      } else {
        state.monster = state.monsters[0];
      }
    }
    if (state.monster && !MONSTERS[state.monster.defId]) {
      state.monster = null;
      state.monsters = [];
    }

    // 舊存檔補發轉職自帶的被動（技能是後來才加的，不補就永遠拿不到）
    if (typeof grantAutoSkills === 'function') grantAutoSkills(false);
    // 補回舊版重置 bug 吃掉的進階二轉／三轉技能點（#116）
    repairSkillPointDeficit();
    // 補回被舊版重置刪掉的任務技能（轉職自帶 1 級，讀檔不會自己補）
    repairQuestSkills();
    recomputeDerived(false);
    // 這個角色被別人當傭兵帶出去賺的經驗，上線時一次領走（#83）
    claimMercLedger();
    return true;
  } catch (e) {
    console.error('loadGame error:', e);
    return false;
  }
}

/* ---------------- 離線掛機結算 ----------------
   回傳結算摘要（若離線時間太短則回傳 null），並直接把結果套用到 state 上。
------------------------------------------------- */
/* minMs：低於這個時間就不結算（省下抽樣成本）。預設是開遊戲讀檔用的 30 秒門檻。

   切分頁那條路（#135）會傳一個小很多的值：使用者描述的情境正是「頻繁切換畫面」，
   沿用 30 秒的話每次切走 20 秒就完全沒有收益——主迴圈已經停了，那段時間會憑空蒸發，
   比修之前還糟。彈窗與紀錄另有自己的門檻，在 deliverOfflineResult() 那邊擋。 */
function computeOfflineProgress(minMs) {
  if (!state) return null;
  const gate = minMs == null ? OFFLINE_MIN_MS : minMs;
  const rawElapsed = Date.now() - (state.lastActiveAt || Date.now());
  const elapsedMs = Math.min(rawElapsed, OFFLINE_CAP_MS);
  if (elapsedMs < gate) { state.lastActiveAt = Date.now(); return null; }
  const elapsedSec = Math.floor(elapsedMs / 1000);

  const map = currentMap();
  const pool = map.monsters; // [{id, weight}]

  if (!pool.length) {
    // 城鎮安全區：沒有怪物可打，離線期間只是安穩休息，沒有戰鬥收穫
    state.lastActiveAt = Date.now();
    saveGame();
    return { elapsedMs, elapsedSec, expGained: 0, jobExpGained: 0, goldGained: 0, itemsGained: [], baseLevelUps: 0, jobLevelUps: 0, kills: 0, safeTown: true, allyCount: 0, mapName: map.name, bossKills: 0, bossList: [] };
  }

  const totalWeight = pool.reduce((s, m) => s + m.weight, 0);
  const wAvg = (getter) => {
    let total = 0;
    let weightSum = 0;
    pool.forEach(m => {
      const mon = MONSTERS[m.id];
      if (mon) {
        total += getter(mon) * m.weight;
        weightSum += m.weight;
      }
    });
    return weightSum > 0 ? total / weightSum : 0;
  };
  const avgHp = wAvg(m => m.hp || 100);
  const avgDef = wAvg(m => m.def || 0);
  const avgSoftDef = wAvg(m => m.defSoft || 0);
  const avgExp = wAvg(m => m.exp || 1);
  const avgJobExp = wAvg(m => m.jobExp || 1);
  const avgLevel = wAvg(m => m.level || 1);
  /* 打寶模式（#145）。以前整份離線結算完全沒有讀它——三種模式跑出來的
     經驗、鋅幣、掉落一模一樣，等於開了打寶去掛機是白開的。

     三邊要一起改才會自洽：怪的血量在線上是 spawnMonster() 當場乘上去的，
     抽樣這裡是自己造假怪、直接用平均血量，所以要自己乘；
     經驗與鋅幣是結算時乘；掉落率是每次擊殺時乘。
     只補其中一邊會更糟——只加掉落倍率的話，瘋狂模式的擊殺數本來就多算五倍，
     兩個乘起來會變成線上的二十五倍。

     怪物的防禦與攻擊不用管：那兩個是在傷害計算當下乘的，
     抽樣走的是真正的 playerAttack()，本來就吃得到。 */
  const farmHp = avgHp * farmMult('hp');

  // 離線掛機估算：快照後跑 3 秒真實戰鬥外推（方法A），含 MATK/物攻、技能、冷卻、SP
  const sampleSec = 3;
  const atkInterval = state.attackInterval || 500;
  const sampleAttacks = Math.max(12, Math.ceil(sampleSec * 1000 / atkInterval));
  // 快照需還原的狀態（攻擊會改 buff/sp/冷卻/怪物/背包箭矢）
  const _snap = {
    buffs: state.buffs.map(b => ({...b})),
    sp: state.sp,
    cooldowns: {...(state.cooldowns||{})},
    songProcReadyAt: {...(state.songProcReadyAt||{})},
    monsters: state.monsters ? state.monsters.map(m=>({...m})) : [],
    inventory: state.inventory.map(r=>({...r})),
    equipAmmo: state.equip.ammo,
    attackInterval: state.attackInterval,
  };
  const _origLog = logMsg;
  // 抽樣期間靜音日誌與 DPS，避免刷屏與污染實測
  logMsg = () => {};
  _dpsPaused = true;
  // 用平均怪當假怪，跑真實 playerAttack 循環
  const avgMonId = pool[0] ? pool[0].id : null;
  const avgMonDef = avgMonId ? MONSTERS[avgMonId] : null;
  // 保底：若地圖池無有效怪，用平均屬性造一隻假怪
  if (!state.monsters || state.monsters.length === 0) {
    state.monsters = [{ defId: avgMonId || 'poring', hp: farmHp, maxHp: farmHp, id: 999999 }];
  } else {
    // 暫用平均血量覆蓋第一隻，確保抽樣穩定（打寶模式的加成要含進去）
    state.monsters[0].hp = farmHp;
    state.monsters[0].maxHp = farmHp;
  }
  /* 隊友也要一起抽樣（#135）。

     以前這個迴圈只跑 `playerAttack()`，所以離線收益等於**單人的收益**——
     隊友打的那一份完全沒算進去。玩家是輔助職（祭司帶輸出隊友）時，
     離線回來的經驗趨近於 0，這就是使用者回報的「組隊直接沒經驗」。

     隊友走的是跟線上 `alliesTick()` 同一條路：`withAlly()` 換身跑同一支
     `playerAttack()`，所以技能、SP、箭矢、卡片觸發全部照他們自己的數值算。
     每輪迴圈代表 `atkInterval` 毫秒，用累積器換算各自該揮幾刀——
     隊友的攻速跟玩家不同，一輪一刀會把快的算太少、慢的算太多。

     倒地的隊友不算：線上 `alliesTick()` 也是直接 return。 */
  const sampleAllies = (state.allies || []).filter(a => a && !a._downed);
  const _allySnap = sampleAllies.map(a => ({
    a,
    buffs: (a.buffs || []).map(b => ({ ...b })),
    sp: a.sp,
    cooldowns: { ...(a.cooldowns || {}) },
    atkAccum: a._atkAccum,
    lastAttackAt: a._lastAttackAt,
    ammo: a.equip && a.equip.ammo,
    hp: a.hp,
    downed: a._downed,
    // 抽樣期間打死的怪也會記傭兵經驗，那是 3 秒的量；外推那份等一下才發
    pendingExp: a._pendingExp,
    pendingJobExp: a._pendingJobExp,
  }));
  const allyAccum = sampleAllies.map(() => 0);

  let sampleKills = 0;
  let sampleDamage = 0;
  /* 一刀打完的結算：擊殺就補一隻同血量的假怪，否則累計實際造成的傷害。
     抽成閉包是因為現在**一輪裡有好幾個人揮刀**（玩家 + 每位隊友），
     每一刀都要各自結算——不然某一刀把怪打死之後，排在後面的人會對空氣揮拳。 */
  const resolveSwing = (monBefore, hadMon) => {
    if (state.monsters.length < hadMon || (state.monsters[0] && state.monsters[0].hp <= 0)) {
      sampleKills++;
      sampleDamage += monBefore;
      if (state.monsters.length === 0) state.monsters = [{ defId: avgMonId || 'poring', hp: farmHp, maxHp: farmHp, id: 999999 }];
      else state.monsters[0].hp = farmHp;
    } else if (state.monsters[0]) {
      const dealt = monBefore - state.monsters[0].hp;
      if (dealt > 0) sampleDamage += dealt;
    }
  };

  for (let i = 0; i < sampleAttacks; i++) {
    // tick buff 3 秒內的到期（每刀按 attackInterval 推進）
    if (state.buffs.length) {
      state.buffs.forEach(b => { if (b.msRemaining) b.msRemaining -= atkInterval; });
      state.buffs = state.buffs.filter(b => !b.msRemaining || b.msRemaining > 0);
    }
    // 冷卻也按時間推進（簡化：直接減 attackInterval）
    for (const k in state.cooldowns) {
      state.cooldowns[k] = Math.max(0, (state.cooldowns[k]||0) - atkInterval);
      if (state.cooldowns[k] === 0) delete state.cooldowns[k];
    }
    // 真實攻擊（含技能、MATK/物攻自動分流）— 先試自動施放再普攻，與線上 tick 一致
    {
      const monBefore = state.monsters[0] ? state.monsters[0].hp : avgHp;
      const hadMon = state.monsters.length;
      if (state.autoSkill) tryAutoCastSkill();
      tryAutoCastSupportSkills();
      playerAttack();
      resolveSwing(monBefore, hadMon);
    }
    // 隊友：各自按攻擊間隔補刀，順序跟線上 alliesTick() 一致
    sampleAllies.forEach((ally, ai) => {
      if (ally._downed) return;
      allyAccum[ai] += atkInterval;
      const iv = Math.max(100, ally.attackInterval || 1000);
      let swings = 0;
      while (allyAccum[ai] >= iv && swings < 20) {
        allyAccum[ai] -= iv;
        swings++;
        const monBefore = state.monsters[0] ? state.monsters[0].hp : avgHp;
        const hadMon = state.monsters.length;
        /* 一位隊友出錯不能拖垮整份結算：例外從 withAlly 竄出來的話，
           forEach 會整個中斷，後面的隊友那一輪完全不會動（跟 alliesTick 同一條保險）。 */
        try {
          withAlly(ally, () => {
            if (state.autoSkill) tryAutoCastSkill();
            tryAutoCastSupportSkills();
            playerAttack();
          });
        } catch (e) { break; }
        resolveSwing(monBefore, hadMon);
        if (ally._downed) break;
      }
    });
    // 箭矢耗盡自動換下一種（與線上一致）
    if (needsAmmo() && getAmmoCount() === 0) {
      const nxt = state.inventory.find(r => !r.instanceId && isAmmoItem(r.item) && r.qty > 0);
      if (nxt) state.equip.ammo = nxt.item;
    }
  }
  // 隊友的抽樣痕跡要還原，否則切一次分頁就把他們的 SP 與冷卻真的扣掉了
  _allySnap.forEach(s => {
    s.a.buffs = s.buffs;
    s.a.sp = s.sp;
    s.a.cooldowns = s.cooldowns;
    s.a._atkAccum = s.atkAccum;
    s.a._lastAttackAt = s.lastAttackAt;
    s.a.hp = s.hp;
    s.a._downed = s.downed;
    s.a._pendingExp = s.pendingExp;
    s.a._pendingJobExp = s.pendingJobExp;
    if (s.a.equip) s.a.equip.ammo = s.ammo;
  });
  // 也可用傷害外推，避免隨機擊殺數為 0 時的 0/0
  const killsPerSecByDamage = sampleDamage / farmHp / sampleSec;
  const killsPerSecByCount = sampleKills / sampleSec;
  let killsPerSec = Math.max(killsPerSecByDamage, killsPerSecByCount);
  // 保底：若抽樣期間因閃避/未命中導致 0 傷害，退回舊公式保底避免離線 0 收益
  if (!killsPerSec || !isFinite(killsPerSec)) {
    const raw = state.atk;
    const critFactor = 1 + (state.critRate / 100) * 0.5;
    const avgFlee2 = 80 + avgLevel * 4;
    const avgHitPct2 = hitChancePct(effectiveHitWithBuff(), avgFlee2) / 100;
    const dmgPerAttack2 = mitigateDamage(raw * critFactor, avgDef, avgSoftDef) * avgHitPct2;
    killsPerSec = dmgPerAttack2 / farmHp;
  }
  // 還原快照
  state.buffs = _snap.buffs;
  state.sp = _snap.sp;
  state.cooldowns = _snap.cooldowns;
  state.songProcReadyAt = _snap.songProcReadyAt;
  state.monsters = _snap.monsters;
  state.inventory = _snap.inventory;
  state.equip.ammo = _snap.equipAmmo;
  logMsg = _origLog;
  _dpsPaused = false;
  /* ---- 頭目（#137，2026-08-22 改為方案A：逐隻模擬線上循環）----

     線上的規則（spawnMonster）：每次補怪（≤3 秒一次）擲 MVP_SPAWN_CHANCE_PCT，
     中了就生一隻名單裡的頭目，場上有同類頭目時不重生。頭目死後下一批再擲——
     所以頭目的期望速率是 1/(殺耗時+15s)，跟「殲滅速度」直接掛鉤。

     舊版離線把 20% 解讀成「頭目佔總時間的上限」，又再 ÷ 名單長度，
     結果只有線上的 1/2~1/63（殺越慢落差越大），玩家回報「離線 MVP 差很多」就是這條。

     新版照線上同一個循環逐隻模擬：
       · 每 BOSS_ROLL_SEC 秒擲一次 20%，中了就從名單抽一隻（等機率）
       · 查該頭目在當下打寶模式的實測耗時（bossKillRecord），沒殺過就跳過換下一輪
         ——抽到打不動的，那段時間本來就是白耗，跟線上一致
       · 殺得動的照耗時結算隻數，直到 24 小時的時間用完
     效能：24h ≈ 5,760 次擲骰、~1,150 隻，每隻都是 O(1) 查表，總計 < 10ms。 */
  const bossGained = [];
  let bossKills = 0;
  const BOSS_ROLL_SEC = 3;   // 跟線上補怪週期一致（場上有怪時 3 秒/批）
  if (typeof MVP_MAP_DATA !== 'undefined') {
    const lists = activeBossLists(map.id);
    const bossPool = lists.length
      ? [].concat.apply([], lists).filter(id => MONSTERS[id])
      : [];
    if (bossPool.length) {
      // 殺得動的頭目先過濾出來：擲中了卻沒紀錄的，那一輪時間照樣損失（跟線上抽到打不動的一樣）
      // 2026-08-31 改為 bestMs（最佳紀錄）避免一次 28 分異常值拖垮離線
      const killable = bossPool.filter(id => {
        const rec = bossKillRecord(id, farmMode());
        return rec && rec.n > 0 && (rec.bestMs || rec.lastMs) >= BOSS_KILL_MIN_MS;
      });
      const rolls = Math.floor(elapsedSec / BOSS_ROLL_SEC);
      for (let i = 0; i < rolls; i++) {
        if (Math.random() * 100 >= MVP_SPAWN_CHANCE_PCT) continue;
        // 等機率抽：先從殺得動的抽；全都殺不動時，這一輪照樣損失
        const pickFrom = killable.length ? killable : bossPool;
        const id = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        if (!killable.includes(id)) continue;   // 抽到殺不動的 → 白耗一輪
        const rec = bossKillRecord(id, farmMode());
        const killSec = (rec.bestMs || rec.lastMs) / 1000;
        const n = BOSS_ROLL_SEC / killSec;      // 這一輪 3 秒能殺幾隻（可為小數）
        if (!(n > 0)) continue;
        const exist = bossGained.find(b => b.id === id);
        if (exist) exist.kills += n;
        else bossGained.push({ id, kills: n });
        bossKills += n;
      }
    }
  }
  // 頭目佔掉的時間不能同時拿去打雜魚，兩邊的時間預算要加得起來
  const normalShare = bossKills > 0 ? 1 - MVP_SPAWN_CHANCE_PCT / 100 : 1;
  const totalKills = killsPerSec * elapsedSec * normalShare;

  /* 經驗與鋅幣要跟線上 killMonster() 同一條式子（#145）：
       經驗 = def.exp × 卡片的種族經驗加成 × 打寶倍率
       鋅幣 = (3 + 等級 × 1.4) × 打寶倍率
     以前這裡兩個倍率都沒乘，瘋狂模式掛一整晚拿到的跟不開打寶一樣多。
     種族經驗加成照怪物出沒權重取平均——池子裡混著好幾個種族，
     只認第一隻的種族會讓「專打某族」的卡片被高估。 */
  const expMult = 1 + (buffMult('exp').flatBonus || 0) / 100;
  const raceExpOf = def => 1 + ((def && def.race && state.cardExpRace && state.cardExpRace[def.race]) || 0);
  const avgRaceExp = wAvg(m => raceExpOf(m));
  const expFarm = farmMult('exp') * expMult * avgRaceExp;
  const goldFarm = farmMult('gold');
  let expGained = Math.round(avgExp * totalKills * expFarm);
  let jobExpGained = Math.round(avgJobExp * totalKills * expFarm);
  let goldGained = Math.round((3 + avgLevel * 1.4) * totalKills * goldFarm);
  bossGained.forEach(b => {
    const bd = MONSTERS[b.id];
    const bm = farmMult('exp') * expMult * raceExpOf(bd);
    expGained += Math.round((bd.exp || 0) * b.kills * bm);
    jobExpGained += Math.round((bd.jobExp || 0) * b.kills * bm);
    goldGained += Math.round((3 + (bd.level || 0) * 1.4) * b.kills * goldFarm);
  });

  /* 掉落物期望值（依真實怪物密度權重計算每次擊殺的期望掉落機率）。

     這一段以前只算 `def.drops`，於是**線上擊殺時會發生的其他事全都不會發生**：
     卡片掉落、卡片／裝備的附加掉落（邪惡箱那一批）、偷竊、貪婪、尋找礦石、
     打寶模式的掉落倍率。玩家回報「邪惡箱卡片離線沒有效果」就是這一條，
     但同一個洞底下躺著的是一整排——連**一般怪的卡片**離線都掉不出來
     （之前只補了頭目那半邊）。

     全部走同一張 dropAgg：那張表的單位是「每次擊殺的期望件數」，
     最後統一乘上 totalKills，所以只要把各自的期望值加進來就好。 */
  const dropMult = farmMult('drop') * (1 + getCardBonus('dropPct') / 100);   // 裝備掉寶率（快樂氣球+10%）
  const dropAgg = {};
  const addExp2 = (id, n) => { if (n > 0 && ITEMS[id]) dropAgg[id] = (dropAgg[id] || 0) + n; };
  /* 加權掉落表的期望分佈：偷竊與貪婪都是「照掉落率加權抽一件」（pickWeightedDrop），
     所以每一件被抽中的機率是 該件掉落率 ÷ 全部掉落率之和——
     不是它自己的掉落率。抄成掉落率的話稀有物會被高估好幾個數量級。 */
  const weightedShare = (drops, out) => {
    const list = (drops || []).filter(d => d && d.item && d.chance > 0);
    const total = list.reduce((a, d) => a + d.chance, 0);
    if (!total) return;
    list.forEach(d => { out[d.item] = (out[d.item] || 0) + d.chance / total; });
  };
  const stealRate = (state.stealChance || 0) / 100;
  const greedRate = (state.hasGreedProc ? (state.greedChance || 0) : 0) / 100;
  const oreRate = (state.hasFindingOreProc ? (state.findingOreChance || 0) : 0) / 100;
  const raceShare = {};                    // 種族 → 出沒權重佔比（卡片附加掉落要用）
  pool.forEach(m => {
    const def = MONSTERS[m.id];
    if (!def) return; // 跳過不存在的怪物
    const spawnShare = m.weight / totalWeight;
    if (def.race) raceShare[def.race] = (raceShare[def.race] || 0) + spawnShare;
    (def.drops || []).forEach(d => {
      // 打寶模式的掉落倍率跟線上同樣夾在 1 以下（本來就 100% 的乘上去沒有意義）
      addExp2(d.item, Math.min(1, d.chance * dropMult) * spawnShare);
    });
    // 一般怪的卡片：線上走 MONSTER_CARD_DROPS，離線以前整條漏掉
    const cd = (typeof MONSTER_CARD_DROPS !== 'undefined') ? MONSTER_CARD_DROPS[m.id] : null;
    if (cd && cd.card) addExp2(cd.card, cd.chance * spawnShare);
    // 偷竊／貪婪：各自機率發動一次，發動後照掉落率加權抽一件
    if (stealRate || greedRate) {
      const share = {};
      weightedShare(def.drops, share);
      Object.entries(share).forEach(([id, p]) => addExp2(id, p * (stealRate + greedRate) * spawnShare));
    }
  });
  // 尋找礦石：跟種族無關，四種礦石均分
  if (oreRate) {
    const ores = ['boody_red', 'crystal_blue', 'wind_of_verdure', 'yellow_live'];
    ores.forEach(id => addExp2(id, oreRate / ores.length));
  }
  /* 卡片／裝備的附加掉落（邪惡箱卡片那一批，#145）。
     `state.cardKillDrops` 是 recomputeDerived 整理好的清單，跟線上
     tryCardKillDrops() 讀的是同一份，所以裝備上的（廚刀掉肉、獸人弓掉鋼鐵箭）
     也一起涵蓋。限定種族的要照那個種族在這張圖的出沒佔比打折。 */
  let killDropZenyPerKill = 0;      // 一般怪：每次擊殺的期望鋅幣
  let bossZeny = 0;                 // 頭目：直接就是總額
  (state.cardKillDrops || []).forEach(e => {
    const hitShare = e.race ? (raceShare[e.race] || 0) : 1;
    const rate = (e.chance / 100) * hitShare;
    if (!(rate > 0)) return;
    if (e.zeny) { killDropZenyPerKill += e.zeny * rate; return; }
    const list = e.pool ? itemPool(e.pool) : e.items;
    if (!list || !list.length) return;
    list.forEach(id => addExp2(id, rate / list.length));   // 候選裡隨機挑一個
  });
  /* 頭目的掉落也照期望值發（#137）。跟雜魚共用同一張 dropAgg：
     那張表是「每次擊殺的期望掉落機率」，頭目的除數是牠自己的擊殺數而不是 totalKills，
     所以直接把 `掉落率 × 該頭目的擊殺數` 加進去，單位一致。
     卡片走 MONSTER_CARD_DROPS 那條的也要補，不然頭目卡片離線永遠掉不出來。 */
  const bossDropAgg = {};
  const addBoss = (id, n) => { if (n > 0 && ITEMS[id]) bossDropAgg[id] = (bossDropAgg[id] || 0) + n; };
  bossGained.forEach(b => {
    const bd = MONSTERS[b.id];
    (bd.drops || []).forEach(d => addBoss(d.item, Math.min(1, d.chance * dropMult) * b.kills));
    const cd = (typeof MONSTER_CARD_DROPS !== 'undefined') ? MONSTER_CARD_DROPS[b.id] : null;
    if (cd && cd.card) addBoss(cd.card, cd.chance * b.kills);
    /* 以太礦石（#145）：只有頭目會掉，一次擲兩顆各自判定。
       離線以前完全沒有這一段——打了一整晚頭目卻一顆以太都沒有。 */
    const eth = getEtherDropChance(bd);
    if (eth > 0) ['ether_oridecon', 'ether_elunium'].forEach(id => addBoss(id, eth * b.kills));
    // 頭目也吃偷竊／貪婪／卡片附加掉落，跟雜魚同一條規則
    if (stealRate || greedRate) {
      const share = {};
      weightedShare(bd.drops, share);
      Object.entries(share).forEach(([id, pr]) => addBoss(id, pr * (stealRate + greedRate) * b.kills));
    }
    (state.cardKillDrops || []).forEach(e => {
      if (e.race && bd.race !== e.race) return;
      const rate = e.chance / 100;
      if (e.zeny) { bossZeny += e.zeny * rate * b.kills; return; }
      const list = e.pool ? itemPool(e.pool) : e.items;
      if (!list || !list.length) return;
      list.forEach(id => addBoss(id, rate * b.kills / list.length));
    });
  });
  /* 遺物（#145）：只有打寶模式會掉，一般怪固定機率、頭目照等級分段，
     而且碎片與遺物券是**各擲一次**。離線以前一件都不會掉，
     等於開著打寶掛機一整晚，遺物進度完全沒有推進。 */
  if (farmMode() && typeof RELIC_PIECE_IDS !== 'undefined' && RELIC_PIECE_IDS.length) {
    const normPct = RELIC_DROP_PCT_NORMAL / 100;      // 每次擊殺的機率
    RELIC_PIECE_IDS.forEach(id => addExp2(id, normPct / RELIC_PIECE_IDS.length));
    addExp2(RELIC_TICKET_ID, normPct);
    bossGained.forEach(b => {
      const bd = MONSTERS[b.id];
      const pct = relicBossDropPct(bd.level) / 100;
      if (!(pct > 0)) return;
      RELIC_PIECE_IDS.forEach(id => addBoss(id, pct * b.kills / RELIC_PIECE_IDS.length));
      addBoss(RELIC_TICKET_ID, pct * b.kills);
    });
  }
  // 藍鼠那種「擊殺掉錢」的卡片：期望值一次補進鋅幣
  goldGained += Math.round(killDropZenyPerKill * totalKills + bossZeny);

  const itemsGained = [];
  /* 雜魚與頭目是兩張表，但同一樣東西可能兩邊都掉（蘋果那種）。
     收穫清單要**併成一列**，不然畫面上會看到「蘋果 x4」跟「蘋果 x2」並排。 */
  const gainedIdx = {};
  const rollQty = expected => {
    let qty = Math.floor(expected);
    if (Math.random() < (expected - qty)) qty++;
    return qty;
  };
  const grant = (itemId, qty) => {
    if (!(qty > 0) || !ITEMS[itemId]) return;
    addItem(itemId, qty);
    const i = gainedIdx[itemId];
    if (i === undefined) { gainedIdx[itemId] = itemsGained.length; itemsGained.push({ item: itemId, qty }); }
    else itemsGained[i].qty += qty;
  };
  Object.keys(dropAgg).forEach(itemId => grant(itemId, rollQty(dropAgg[itemId] * totalKills)));
  Object.keys(bossDropAgg).forEach(itemId => grant(itemId, rollQty(bossDropAgg[itemId])));

  // 離線擊殺也要記進圖鑑，依出沒權重分配到各怪物；掛機一整晚回來圖鑑卻沒動會很奇怪
  pool.forEach(m => {
    if (!MONSTERS[m.id]) return;
    const share = Math.floor(totalKills * (m.weight / totalWeight));
    if (share > 0) codexRecordKill(m.id);
    if (share > 1) ensureCodex().mon[m.id] += share - 1;
  });
  // 頭目同理。**不動 bossKills 的耗時紀錄**：那是線上實測的數字，離線不該回頭寫它
  bossGained.forEach(b => {
    const share = Math.floor(b.kills);
    if (share > 0) codexRecordKill(b.id);
    if (share > 1) ensureCodex().mon[b.id] += share - 1;
  });

  const beforeBaseLv = state.baseLevel;
  const beforeJobLv = state.jobLevel;
  gainExp(expGained, jobExpGained);
  state.gold += goldGained;
  /* 隊友的傭兵經驗（#135）。線上 killMonster() 每擊殺都會記 ALLY_MERC_EXP_PCT，
     離線走的是外推所以沒有逐次擊殺，這裡照同一個比例一次補上——
     不然「掛機一整晚」對隊友本人的存檔完全沒有意義。
     跟線上同一條規則：記給全隊未倒地的每一位，不是只記給補刀的那個。 */
  sampleAllies.forEach(a => {
    a._pendingExp = (a._pendingExp || 0) + expGained * ALLY_MERC_EXP_PCT / 100;
    a._pendingJobExp = (a._pendingJobExp || 0) + jobExpGained * ALLY_MERC_EXP_PCT / 100;
  });
  state.lastActiveAt = Date.now();
  /* 時間錨點全部推回現在，否則主迴圈一恢復就會把離線那段「再打一次」（#135）：
     玩家的累積器會爆發一串攻擊，場上每隻怪也各賺一次免費攻擊
     （`now - mon.lastAttackTime` 是整段離線時間），慢心跳同理。 */
  state.lastAttackTime = Date.now();
  state.attackAccumulator = 0;
  state.lastMonsterAttackTime = Date.now();
  state._lastSlowTick = Date.now();
  state.lastSpawnTime = Date.now();
  (state.monsters || []).forEach(m => { m.lastAttackTime = Date.now(); });
  (state.allies || []).forEach(a => { if (a) { a._atkAccum = 0; a._lastAttackAt = Date.now(); } });
  saveGame();

  return {
    elapsedMs, elapsedSec,
    expGained, jobExpGained, goldGained,
    itemsGained,
    baseLevelUps: state.baseLevel - beforeBaseLv,
    jobLevelUps: state.jobLevel - beforeJobLv,
    kills: Math.round(totalKills),
    allyCount: sampleAllies.length,
    mapName: map.name,
    // 頭目那份分開回報：玩家最想知道的就是「這一晚有沒有打到頭目」（#137）
    bossKills: Math.round(bossKills),
    bossList: bossGained.filter(b => b.kills >= 0.5)
      .map(b => ({ id: b.id, name: MONSTERS[b.id].name, kills: Math.round(b.kills) })),
  };
}

/* ---------------- 掛機收益紀錄（#135）----------------
   使用者要的是「頻繁切分頁的人不用一直關彈窗」：結算照跑，但收益改成留在
   浮動視窗裡隨時可以翻，最多留三筆。

   **不管彈窗開不開都記**。只有關掉彈窗時才記的話，把彈窗留著的玩家點開那個
   視窗永遠是空的，那顆按鈕就變成裝飾品。記錄本身有上限，留著不花什麼成本。

   存在 state 裡跟著存檔走（音量、靜音那些設定也都在 state 上），
   所以換存檔格看到的是那一格自己的紀錄。 */
const OFFLINE_LOG_MAX = 3;
const OFFLINE_LOG_ITEMS_MAX = 12;      // 一筆紀錄最多列幾種掉落
function offlineLogList() { return (state && state.offlineLog) || []; }

/* 掉落清單的排序：**貴重的排前面**（使用者要求）。

   掛一整晚回來可能有上百種掉落，畫面上放不下就得截斷，而原本的順序是
   `dropAgg` 的建表順序——也就是地圖怪物表的順序，跟價值毫無關係。
   結果就是「一張卡片被 80 種藥草擠掉」：真正想看的那一件反而看不到。

   分三層再比單價：卡片 → 裝備 → 其他。
   為什麼分層而不是純比 sell：卡片的售價在本作只有 10z（那是官方的雜項售價），
   純比價錢的話全遊戲最稀有的東西會排在木錘後面。 */
function spoilsRank(itemId) {
  if (CARDS[itemId]) return 0;
  const it = ITEMS[itemId];
  if (!it) return 3;
  if (it.type === 'weapon' || it.type === 'armor') return 1;
  return 2;
}
function sortSpoilsByValue(items) {
  return (items || []).slice().sort((a, b) => {
    const ra = spoilsRank(a.item), rb = spoilsRank(b.item);
    if (ra !== rb) return ra - rb;
    const sa = (ITEMS[a.item] || {}).sell || 0, sb = (ITEMS[b.item] || {}).sell || 0;
    if (sa !== sb) return sb - sa;
    return (b.qty || 0) - (a.qty || 0);
  });
}
function pushOfflineLog(off) {
  if (!state || !off) return;
  if (!Array.isArray(state.offlineLog)) state.offlineLog = [];
  /* 只留畫面要用的欄位。整包 off 帶著 itemsGained 的完整陣列，
     掛一整晚可能有上百種掉落，三筆就把存檔撐大。
     截斷前先照價值排序，卡片與裝備才不會被一堆藥草擠掉。 */
  const spoils = sortSpoilsByValue(off.itemsGained);
  state.offlineLog.unshift({
    at: Date.now(),
    elapsedMs: off.elapsedMs,
    safeTown: !!off.safeTown,
    mapName: off.mapName || '',
    kills: off.kills || 0,
    expGained: off.expGained || 0,
    jobExpGained: off.jobExpGained || 0,
    goldGained: off.goldGained || 0,
    baseLevelUps: off.baseLevelUps || 0,
    jobLevelUps: off.jobLevelUps || 0,
    allyCount: off.allyCount || 0,
    bossList: (off.bossList || []).slice(0, 4),
    itemsGained: spoils.slice(0, OFFLINE_LOG_ITEMS_MAX),
    itemsMore: Math.max(0, spoils.length - OFFLINE_LOG_ITEMS_MAX),
  });
  state.offlineLog.length = Math.min(state.offlineLog.length, OFFLINE_LOG_MAX);
}
function hasSave() {
  return !!localStorage.getItem(getSlotKey(currentSlot));
}
/* 存檔匯入：把外部 JSON 物件寫進指定欄位，並用 loadGame() 的相容性遷移
   驗證過才保留。失敗時把原存檔（若原本有）原封不動還原。 */
function importSaveToSlot(slot, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, msg: '檔案內容不是有效的存檔物件。' };
  }
  if (typeof obj.name !== 'string' || typeof obj.jobId !== 'string') {
    return { ok: false, msg: '不是本遊戲的存檔（缺少角色名稱或職業）。' };
  }
  /* 結構檢查要**自己做**，不要靠 loadGame() 剛好丟例外來擋（#127）。
     以前只有 name/jobId 兩個欄位的物件會一路走到 loadGame()，在
     `allEquippedCards()` 讀 `state.equip[slot]` 時炸掉 TypeError——
     結果是對的（拒絕匯入），但玩家的 console 會噴一整串紅色堆疊，
     看起來像遊戲壞了。而且那是**碰巧**炸的：哪天 loadGame 補上
     `state.equip = state.equip || {}` 這種防呆，壞存檔就會被當成好的收下。 */
  const REQUIRED = [
    ['equip', v => v && typeof v === 'object' && !Array.isArray(v)],
    ['stats', v => v && typeof v === 'object' && !Array.isArray(v)],
    ['inventory', v => Array.isArray(v)],
    ['baseLevel', v => typeof v === 'number'],
    ['jobLevel', v => typeof v === 'number'],
  ];
  const missing = REQUIRED.filter(([k, ok]) => !ok(obj[k])).map(([k]) => k);
  if (missing.length) {
    return { ok: false, msg: `存檔結構不完整（缺少或格式錯誤：${missing.join('、')}）。` };
  }
  const prevSlot = currentSlot;
  const prevRaw = localStorage.getItem(getSlotKey(slot));
  localStorage.setItem(getSlotKey(slot), JSON.stringify(obj));
  currentSlot = slot;
  let ok = false;
  try { ok = loadGame(); } catch (e) { ok = false; }
  if (!ok) {
    currentSlot = prevSlot;
    if (prevRaw === null) localStorage.removeItem(getSlotKey(slot));
    else localStorage.setItem(getSlotKey(slot), prevRaw);
    return { ok: false, msg: '存檔無法通過相容性檢查，已取消匯入（原有存檔未被覆蓋）。' };
  }
  saveGame();   // 把遷移後的正常化版本寫回去
  return { ok: true, slot: slot };
}
function deleteSave() {
  localStorage.removeItem(getSlotKey(currentSlot));
}
function hasAnySave() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (localStorage.getItem(getSlotKey(i))) return true;
  }
  return false;
}

/* ---------------- 訊息紀錄 ---------------- */
function logMsg(text, lane) {
  pushCombatLog(text, lane);
  if (typeof renderLog === 'function') renderLog();

  // 傷害飄字（僅玩家攻擊時在怪物頭上顯示）
  if (typeof showDamageFloat === 'function') {
    const dmgMatch = text.match(/造成 (\d+) 點傷害/);
    // 只有玩家攻擊（以"你"開頭）才在怪物頭上顯示飄字
    if (dmgMatch && text.startsWith('你')) {
      const dmg = dmgMatch[1];
      const isCrit = text.includes('暴擊');
      const elemGood = text.includes('屬性克制');
      const elemBad = text.includes('屬性被克');
      const elemImmune = text.includes('屬性免疫');
      let type = 'normal';
      if (isCrit) type = 'crit';
      else if (elemGood) type = 'element-good';
      else if (elemBad) type = 'element-bad';
      else if (elemImmune) type = 'element-immune';
      showDamageFloat('-' + dmg, type);
      if (typeof triggerMonsterHit === 'function') triggerMonsterHit(isCrit);
      // 玩家攻擊動畫
      const playerSprite = document.getElementById('player-sprite');
      if (playerSprite) {
        playerSprite.classList.remove('attacking');
        void playerSprite.offsetWidth;
        playerSprite.classList.add('attacking');
      }
    }
    const healMatch = text.match(/恢復了 (\d+) 點/);
    if (healMatch) {
      showDamageFloat('+' + healMatch[1], 'heal');
    }
    if (text.includes('擊敗了') && typeof triggerMonsterDie === 'function') {
      triggerMonsterDie();
    }
  }
}
