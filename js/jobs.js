/* ---------------- 職業樹 ----------------
   從 js/data.js 搬出來（原本佔 412 行，夾在 23,000 筆 ITEMS 中間很難改）。

   **技能的定義本體在 js/skills.js**，這邊的 skills 只列 id，檔案尾端會換回物件陣列。
   所以 js/skills.js 必須先載入（index.html 已經排好）。
   要改某個技能的數值請去 js/skills.js；要改某個職業「學得到什麼」才改這裡。

   注意：tools/ 底下有幾支舊工具（find_error / fix_consumable_food / rebuild_full /
   revert_job_level_cap）是直接在 data.js 的文字裡找 'const JOB_TREE' 或 eval data.js
   來取用它的，那幾支都是當初的一次性腳本、跑完就沒再用；若日後要寫類似的工具，
   記得連 js/jobs.js 一起讀進去。
------------------------------------------------- */

const JOB_TREE = {
  novice: {
    id: 'novice', name: '新手', tier: 0, icon: '🌱',
    baseLevelReq: 1, jobLevelReq: 1, jobLevelMax: 10,
    atkMod: 1.0, matkMod: 1.0,
    baseAspd: {"dagger":138,"sword":137,"tsword":null,"bow":null,"rod":129,"mace":144,"katar":null,"spear":null,"knuckle":null}, shieldPenalty: -6,
    next: ['swordsman', 'mage', 'archer', 'merchant', 'thief', 'acolyte', 'supernovice'],
    bonusLevels: { str:[8], agi:[5], vit:[6], int:[9], dex:[3], luk:[2] },
    skills: [
      'novice_firstaid', 'novice_basicskill', 'novice_hpboost', 'novice_flee',
    ],
    desc: '每個冒險者的起點，尚未踏上任何職業道路。'
  },

  /* ---- 超級新手 ----
     官方的特殊路線：不轉一轉，直接留在新手系但能使用「全部六個一轉職業」的技能。
     這裡靠 borrowSkillsFrom 一次借齊，不複製任何技能定義——這也是把技能表獨立出來的主因。

     HP/SP 走 `JOB_BASE_HP.supernovice` / `JOB_BASE_SP.supernovice`（#92 補的表，
     官方參數 HpFactor 70 / SpIncrease 600）——HP 與劍士同級、SP 與法師同級，
     正好對上「六系技能都要放、但只有一條命」的設計。
       atk/matk    兩邊都給 1.0，物理魔法都能打但都不專精，正是這個職業的性格
     轉職條件依官方：新手職業等級滿 10、基本等級 45。轉了就不能再轉（next 為空）。 */
  supernovice: {
    id: 'supernovice', name: '超級新手', tier: 1, icon: '⭐', parent: 'novice',
    baseLevelReq: 45, jobLevelReq: 10, jobLevelMax: 99,
    atkMod: 1.0, matkMod: 1.0,
    baseAspd: {"dagger":138,"sword":137,"tsword":null,"bow":null,"rod":129,"mace":144,"katar":null,"spear":null,"knuckle":null}, shieldPenalty: -6,
    /* #75 修：以前沒寫 aspdFrom，而 `ASPD_WEAPON_BASE` 裡沒有 supernovice 這個 key
       （官方那列叫 `x_超級初心者`），所以攻速一路退回空手值 154，
       而且 `jobCanUseWeapon()` 查不到表時一律放行——超級新手拿得動拳刃、矛、樂器、鞭、槍械。 */
    aspdFrom: 'x_超級初心者',
    next: [],
    // 官方 BonusStats（rAthena job_stats.yml 的 Supernovice）
    bonusLevels: { str:[1,13,25,37,49], agi:[3,15,27,39,52], vit:[5,17,29,41,56], int:[7,19,31,43,60], dex:[9,21,33,45,64], luk:[11,23,35,47,68] },
    skills: [],   // 自己沒有專屬技能，全部靠下面借
    borrowSkillsFrom: ['swordsman', 'mage', 'archer', 'merchant', 'thief', 'acolyte'],
    desc: '不選擇任何一條路，於是每一條路都走得到。體質孱弱，卻能使出六個職業的看家本領。'
  },

  // ---- 一轉 ----
  swordsman: {
    id: 'swordsman', name: '劍士', tier: 1, icon: '⚔️', parent: 'novice',
    baseLevelReq: 10, jobLevelReq: 10, jobLevelMax: 50,
    atkMod: 1.25, matkMod: 0.7,
    // 劍士是第一個做出兩條分支的一轉（2026-08-09），其餘五個一轉的分支還在 JOBS_TIER2_PENDING
    next: ['knight', 'crusader'],
    nextLocked: [],
    bonusLevels: { str:[2,14,33,40,47,49,50], agi:[30,46], vit:[6,18,38,42], int:[], dex:[10,22,36], luk:[26,44] },
    skills: [
      'berserk_sword', 'fatalblow', 'hpmove', 'bash',
      'magnumbreak', 'provoke', 'endure', 'increasehp',
      'swordmastery', 'twoswordmastery',
    ],
    desc: '以劍與盾為伴的近戰戰士，堅韌不拔。'
  },
  mage: {
    id: 'mage', name: '法師', tier: 1, icon: '🔮', parent: 'novice',
    baseLevelReq: 10, jobLevelReq: 10, jobLevelMax: 50,
    atkMod: 0.55, matkMod: 1.35,
    // 法師是第五個做出分支的一轉（#71）
    next: ['wizard', 'sage'],
    nextLocked: [],
    bonusLevels: { str:[], agi:[18,26,40,47], vit:[], int:[2,14,22,33,38,44,46,50], dex:[6,10,36], luk:[30,42,49] },
    skills: [
      'sight', 'energycoat', 'firebolt', 'fireball',
      'firewall', 'lightningbolt', 'thunderstorm', 'coldbolt',
      'frostdiver', 'stonecurse', 'napalmbeat', 'soulstrike',
      'safetywall', 'spregen',
    ],
    desc: '操控元素之力的智慧使者，SP 是最強武器。'
  },
  archer: {
    id: 'archer', name: '弓箭手', tier: 1, icon: '🏹', parent: 'novice',
    baseLevelReq: 10, jobLevelReq: 10, jobLevelMax: 50,
    atkMod: 1.3, matkMod: 0.6,
    /* 弓箭手是第二個做出分支的一轉（#68）。詩人／舞孃官方依性別二選一
       （男→詩人、女→舞孃），兩個都掛在 next 上，由 `genderLock` 過濾。 */
    next: ['hunter', 'bard', 'dancer'],
    nextLocked: [],
    bonusLevels: { str:[6,38,40], agi:[26,33,49], vit:[46], int:[10,47], dex:[2,14,18,30,36,42,50], luk:[22,44] },
    skills: [
      'createarrow', 'chargearrow', 'owleye', 'vultureeye',
      'improveconc', 'doublestrafe', 'arrowshower',
    ],
    desc: '遠距離精準打擊的專家，先發制人。'
  },
  merchant: {
    id: 'merchant', name: '商人', tier: 1, icon: '💰', parent: 'novice',
    baseLevelReq: 10, jobLevelReq: 10, jobLevelMax: 50,
    atkMod: 1.05, matkMod: 0.6,
    // 商人是最後一個做出分支的一轉（#72），六條分支到此全部完成
    next: ['blacksmith', 'alchemist'],
    nextLocked: [],
    bonusLevels: { str:[10,22,40,44,49], agi:[33], vit:[2,18,30,47], int:[26], dex:[6,14,38,42,50], luk:[36,46] },
    skills: [
      'vending', 'itemappraisal', 'loudexclamation', 'cartattack',
      'discount', 'overcharge', 'pushcart', 'mammonite',
      'weightup',
    ],
    desc: '精打細算的鍛造與交易好手。'
  },
  thief: {
    id: 'thief', name: '盜賊', tier: 1, icon: '🗡️', parent: 'novice',
    baseLevelReq: 10, jobLevelReq: 10, jobLevelMax: 50,
    atkMod: 1.2, matkMod: 0.55,
    // 盜賊是第三個做出分支的一轉（#69）
    next: ['assassin', 'rogue'],
    nextLocked: [],
    bonusLevels: { str:[6,30,38,47], agi:[2,33,36,50], vit:[14,44], int:[18], dex:[10,22,42,49], luk:[26,40,46] },
    skills: [
      'detoxify', 'sandman', 'backsliding', 'steal',
      'doubleattack', 'improvedodge', 'hiding', 'envenom',
    ],
    desc: '身法敏捷、擅長暗殺的邊緣行走者。'
  },
  acolyte: {
    id: 'acolyte', name: '服事', tier: 1, icon: '🙏', parent: 'novice',
    baseLevelReq: 10, jobLevelReq: 10, jobLevelMax: 50,
    atkMod: 0.7, matkMod: 1.1,
    // 服事是第四個做出分支的一轉（#70）
    next: ['priest', 'monk'],
    nextLocked: [],
    bonusLevels: { str:[26,42,49], agi:[22,40], vit:[6,30,44], int:[10,33,46], dex:[14,36,47], luk:[2,18,38,50] },
    skills: [
    /* 官方 15 支，順序照 `ro_skill_data/js_data/sk_pr.js` 的 AL_*。
       只有神聖之光是 `maxLv: 0`＝不靠加點拿的，本作用 `isQuest` 對應。 */
      'heal', 'cure', 'increaseagi', 'decreaseagi',
      'divineprotection', 'angelic', 'angelusbarrier', 'blessing',
      'signumcrusis', 'holywater', 'ruwach', 'teleport',
      'warpportal', 'pneuma', 'holylight',
    ],
    desc: '侍奉光明神的治療者，慈悲亦堅定。'
  },

  // ---- 二轉（已實作代表分支）----
  knight: {
    id: 'knight', name: '騎士', tier: 2, icon: '🐎', parent: 'swordsman',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.7, matkMod: 0.7,
    next: [], nextLocked: ['lordknight'],
    bonusLevels: { str:[4,10,15,21,27,33,46,47], agi:[13,38], vit:[1,3,8,12,17,18,23,29,36,43], int:[], dex:[11,19,31,40,48,49], luk:[5,20,28,37] },
    skills: [
      'riding', 'charge', 'cavaliermastery', 'bowlingbash',
      'pierce', 'twohandquicken', 'spearmastery', 'spearstab',
      'spearboomerang', 'brandishspear', 'counter',
    ],
    desc: '身騎戰馬、統率戰場的貴族戰士。'
  },
  wizard: {
    id: 'wizard', name: '巫師', tier: 2, icon: '🧙', parent: 'mage',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 0.5, matkMod: 1.9,
    baseAspd: 150,
    next: [], nextLocked: ['highwizard'],
    bonusLevels: { str:[12], agi:[6,10,24,34,41,43,46,47], vit:[38], int:[1,4,9,18,22,29,31,33,40,45,48,50], dex:[2,5,13,26,32,39], luk:[15,36] },
    skills: [
      'sense', 'firebolt_wiz', 'firepillar', 'meteorstorm',
      'jupitel', 'lordofvermillion', 'waterball', 'icewall',
      'frostdiver_wiz', 'stormgust', 'earthspike', 'heavensdrive',
      'quagmire',
    ],
    desc: '掌握高階咒文的元素支配者。'
  },
  hunter: {
    id: 'hunter', name: '獵人', tier: 2, icon: '🎯', parent: 'archer',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.75, matkMod: 0.6,
    baseAspd: 150,
    next: [], nextLocked: ['sniper'],
    bonusLevels: { str:[6,10,11,44], agi:[12,19,20,31,39,47], vit:[17,23], int:[3,34,41,46], dex:[1,4,8,14,21,27,33,38,43,49], luk:[5,15,29,42] },
    skills: [
      'falcondelivery', 'huntingmastery', 'blitzbeat', 'falconnastery',
      'trap', 'skidtrap', 'flasher', 'sleeptrap',
      'freezingtrap', 'blastmine', 'claymoretrap', 'magnumbreak_h',
      'removetrap', 'researchtrap', 'animalslayer',
    ],
    desc: '與獵鷹並肩作戰的森林狙擊手。'
  },
  blacksmith: {
    id: 'blacksmith', name: '鐵匠', tier: 2, icon: '🔨', parent: 'merchant',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.8, matkMod: 0.6,
    baseAspd: 145,
    next: [], nextLocked: ['whitesmith'],
    bonusLevels: { str:[3,8,16,23,31,44], agi:[29,38], vit:[7,13,20,32,37,49], int:[21,34], dex:[1,4,5,9,12,19,26,28,36,39,40,47], luk:[11,46] },
    skills: [
      'weaponrepair', 'ironworking', 'steelworking', 'elementalstone',
      'oridecon', 'hiltbinding', 'findingore', 'daggercraft',
      'swordcraft', 'axecraft', 'knucklecraft', 'macecraft',
      'spearcraft', 'weaponresearch', 'hammerfall', 'adrenaline',
      'skintemper', 'cartrevo', 'overthrust', 'overthrustbuff',
      'maximize', 'weaponfusion', 'greed',
    ],
    desc: '鎚起鎚起鎚落，鍛出無堅不摧的武器與力量。'
  },
  assassin: {
    id: 'assassin', name: '刺客', tier: 2, icon: '🥷', parent: 'thief',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.85, matkMod: 0.5,
    baseAspd: 140,
    next: [], nextLocked: ['assassincross'],
    bonusLevels: { str:[11,25,27,32,45,48], agi:[1,2,3,15,16,17,18,19,20,21], vit:[6,8], int:[4,14,38,42], dex:[9,24,30,31,40,41,46,50], luk:[] },
    skills: [
      'rightmaster', 'leftmaster', 'katarmastery', 'cloaking',
      'sonicblow', 'grimtooth', 'enchantweapon', 'poisonreact',
      'venomdust', 'venominfusion', 'sonicblow_max', 'enchantblade',
    ],
    desc: '潛行於暗處、一擊致命的殺手。'
  },
  priest: {
    id: 'priest', name: '祭司', tier: 2, icon: '✨', parent: 'acolyte',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 0.6, matkMod: 1.3,
    baseAspd: 150,
    next: [], nextLocked: ['highpriest'],
    bonusLevels: { str:[4,11,17,27,35], agi:[6,29,37,48], vit:[7,14,34,36,45], int:[8,9,22,42,43], dex:[16,20,25,32], luk:[1,3,10,21,31,39,50] },
    /* 官方 19 支，順序照 ro.ntome.com/skill/pr（＝ `ro_skill_data/js_data/sk_pr.js`）。
       `safetywall` 是**跟法師共用的同一支**——官方就是 `MG_SAFETYWALL`，
       兩個職業都學得到。以前祭司自己複製了一份叫 `darkbarrier`（#95 刪掉）。 */
    skills: [
      'maceMastery', 'zenrecovery', 'sanctuary', 'magnificat',
      'gloria', 'kyrie', 'impositio_manus', 'assumptio',
      'aspersio', 'sanctuary_holy', 'safetywall', 'slowpoison',
      'strecovery', 'resurrection', 'impositio', 'turnundead',
      'angelus', 'asperio', 'suffragium',
    ],
    desc: '光輝籠罩之地，皆為信徒的庇護所。'
  },

  /* ---------------- 二轉分支 ----------------
     每個一轉官方都有兩條二轉，上面那六個是「代表分支」。這裡開始補另一條。
     跟上面那六個是同一種東西（tier 2、jobLevelMax 50、40/40 轉職條件），
     沒有任何特別待遇——差別只在成長表與技能。

     `hpSpFrom` 不寫：十字軍有**自己的**官方 HP/SP 表（見 js/hp_sp_tables.js 檔頭，
     rAthena job_stats.yml 的 HpFactor 110 / HpIncrease 700 / SpIncrease 470）。
     `aspdFrom` 指向攻速表裡的 `x_十字軍_聖殿十字軍`——那張表本來就有，不必新增。
     `nextLocked: ['paladin']` 目前指向還沒實作的聖殿十字軍；rebirthLine() 查不到
     就會退回十字軍本身，不會壞，但代表**轉生走這條線暫時拿不到進階二轉**。 */
  crusader: {
    id: 'crusader', name: '十字軍', tier: 2, icon: '🛡️', parent: 'swordsman',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.6, matkMod: 1.0,
    aspdFrom: 'x_十字軍_聖殿十字軍',
    next: [], nextLocked: ['paladin'],
    bonusLevels: { str:[7,11,17,23,25,32,48], agi:[30,36], vit:[12,15,22,40,41,46,50], int:[9,20,21,35,38,44], dex:[14,28,34], luk:[1,2,3,4,5] },
    /* 官方 12 個做 10 個（犧牲擱置、退縮刪除，理由見 js/skills.js 的十字軍區塊）
       ＋官方另外給的 7 個借用技能（服事 4 個、騎士 3 個），本作全都已經存在，直接引用。
       `autoguard` / `grandcross` 兩個 id 沒有 cr_ 前綴是刻意的——有卡片指名它們。 */
    skills: [
      'autoguard', 'cr_shieldcharge', 'cr_shieldboomerang', 'cr_defender',
      'cr_reflectshield', 'cr_trust', 'cr_holycross', 'grandcross',
      'cr_providence', 'cr_spearquicken', 'cr_shrink', 'cr_devotion',
      // 官方借用：服事的治癒術／天使之護／天使之擊／治療術
      'heal', 'divineprotection', 'angelic', 'holywater',
      // 官方借用：騎士的長矛熟練度／騎乘術／騎兵修練
      'spearmastery', 'riding', 'cavaliermastery',
    ],
    desc: '以盾為誓，以聖光為刃。擋在最前面的那個人。'
  },

  /* 詩人與舞孃（#68）。官方是**依性別二選一**的一對，資料幾乎相同：
     同一張 HP/SP 表參數（HpFactor 75 / HpIncrease 300 / SpIncrease 600）、
     同一張攻速表（`x_詩人_舞孃`，差別只在詩人查 instrument、舞孃查 whip）、
     `bonusLevels` 只有 DEX 與 LUK 對調。

     `genderLock` 是新欄位，`canJobChange()` 與 `jobChangeBlockReason()` 都認它。 */
  bard: {
    id: 'bard', name: '詩人', tier: 2, icon: '🎻', parent: 'archer', genderLock: 'male',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.6, matkMod: 0.9,
    // 攻速表由 x_詩人_舞孃 派生（見 js/data.js 的 splitBardDancerAspd）
    baseAspd: 150,
    next: [], nextLocked: ['clown'],
    bonusLevels: { str:[3,28], agi:[2,10,11,24,30,35,48], vit:[17,33,43], int:[5,13,21,40,47], dex:[1,7,15,16,19,32,38,46,50], luk:[6,9,20,41] },
    skills: [
      'ba_musicallesson', 'frostjoke', 'ba_dissonance', 'ba_whistle',
      'ba_assassincross', 'ba_poembragi', 'ba_appleidun', 'ba_musicalstrike',
      'ba_pangvoice',
      // 詩舞共用
      'bd_adaptation', 'bd_encore', 'bd_lullaby', 'bd_intoabyss', 'bd_rokisweil',
      'bd_eternalchaos', 'bd_siegfried', 'bd_richmankim', 'bd_drumbattlefield',
      'bd_ringnibelungen',
    ],
    // 官方借用弓箭手的技能（本作弓箭手那 7 個全都已經存在）
    borrowSkillsFrom: ['archer'],
    desc: '一把樂器就能改變整場戰鬥的節奏。'
  },
  dancer: {
    id: 'dancer', name: '舞孃', tier: 2, icon: '💃', parent: 'archer', genderLock: 'female',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.6, matkMod: 0.9,
    // 攻速表由 x_詩人_舞孃 派生，樂器換成鞭子（見 js/data.js 的 splitBardDancerAspd）
    baseAspd: 150,
    next: [], nextLocked: ['gypsy'],
    bonusLevels: { str:[3,28], agi:[2,10,11,24,30,35,48], vit:[17,33,43], int:[5,13,21,40,47], dex:[6,9,16,20,41], luk:[1,7,15,19,32,38,46,50] },
    skills: [
      'dc_dancinglesson', 'dc_scream', 'dc_uglydance', 'dc_humming',
      'dc_dontforgetme', 'dc_fortunekiss', 'dc_serviceforyou', 'dc_throwarrow',
      'dc_winkcharm',
      // 詩舞共用
      'bd_adaptation', 'bd_encore', 'bd_lullaby', 'bd_intoabyss', 'bd_rokisweil',
      'bd_eternalchaos', 'bd_siegfried', 'bd_richmankim', 'bd_drumbattlefield',
      'bd_ringnibelungen',
    ],
    borrowSkillsFrom: ['archer'],
    desc: '每一步都踩在敵人的心跳上。'
  },

  /* 流氓（#69）。官方 17 個技能做 13 個，九個主動技全部改成普攻觸發的被動。
     攻速表由 `x_流氓_神行太保` 派生（見 js/data.js 的 fixRogueAspd —— 上游那列的
     `axe1: -6` 是盾牌欄跑錯位置，派生時拿掉）。 */
  rogue: {
    id: 'rogue', name: '流氓', tier: 2, icon: '🎭', parent: 'thief',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.7, matkMod: 0.7,
    baseAspd: 150,
    next: [], nextLocked: ['stalker'],
    bonusLevels: { str:[5,25,27,30,36,42], agi:[1,7,16,23,29,39,45], vit:[2,6,9,14,15,26], int:[38,43,47,48], dex:[3,11,18,20,33,34,50], luk:[] },
    skills: [
      'rg_snatcher', 'rg_stealcoin', 'rg_backstap', 'rg_tunneldrive', 'rg_raid',
      'rg_intimidate', 'rg_plagiarism', 'rg_striphelm', 'rg_stripshield',
      'rg_striparmor', 'rg_stripweapon', 'rg_compulsion', 'rg_closeconfine',
    ],
    // 官方借用盜賊全套 + 劍士的單手劍熟練、弓箭手的蒼鷹之眼與二連矢、獵人的陷阱移除
    borrowSkillsFrom: ['thief'],
    desc: '不擇手段，也不留下名字。'
  },

  /* 武僧（#70）。服事的另一條分支——祭司往後站，武僧往前衝。

     兩個係數是本作自訂的（官方沒有職業 ATK 倍率這種東西，ATK 全部來自 STR 與武器），
     以同為近戰二轉的流氓 1.7/0.7 與十字軍 1.6/1.0 為基準：
       atkMod 1.75 拳頭流的傷害幾乎全在被動 proc 上，基礎 ATK 要撐得住那些倍率
       matkMod 0.8 從服事繼承一點魔法底子，但用不到

     `bonusLevels` 出自 rAthena `db/pre-re/job_stats.yml` 的 BonusStats（Monk），
     跟 HP/SP 表同一份來源檔，30 點與其他二轉一致。
     `aspdFrom` 指向攻速表裡本來就有的 `x_武僧_武宗術師`（空手 154／拳套 154／鈍器 151）。
     拳套武器全庫 68 把，reqJob 寫的是 priest/acolyte，武僧經職業鏈（monk→acolyte）全部拿得動。 */
  monk: {
    id: 'monk', name: '武僧', tier: 2, icon: '👊', parent: 'acolyte',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.75, matkMod: 0.8,
    aspdFrom: 'x_武僧_武宗術師',
    next: [], nextLocked: ['champion'],
    bonusLevels: { str:[1,2,12,13,26,27,49,50], agi:[5,10,18,21,23,35,44], vit:[7,20,25,33,41,46], int:[16,38], dex:[4,22,30,43], luk:[15,32,40] },
    skills: [
      'mo_ironhand', 'mo_callspirits', 'mo_absorbspirits', 'mo_explosionspirits',
      'mo_dodge', 'mo_bladestop', 'mo_spiritsrecovery', 'mo_tripleattack',
      'mo_chaincombo', 'mo_combofinish', 'mo_steelbody', 'mo_investigate',
      'mo_fingeroffensive', 'mo_extremityfist', 'mo_bodyrelocation',
      'mo_balkyoung', 'mo_kitranslation',
    ],
    // 官方武僧與祭司共用服事的技能樹，整份借過來
    borrowSkillsFrom: ['acolyte'],
    desc: '不拿武器，因為拳頭比武器更誠實。'
  },

  /* 賢者（#71）。法師的另一條分支——巫師把傷害推到極限，賢者把場面握在手裡。

     兩個係數是本作自訂的（官方沒有職業 ATK 倍率），以巫師 0.5/1.9 與祭司 0.6/1.3 為基準：
       atkMod 1.0  **拿得動書本（全庫 94 把）並吃進化之書的 ATK 加成**，所以不能給巫師那種 0.5
       matkMod 1.5 魔法還是主力，但不到巫師的 1.9

     `bonusLevels` 出自 rAthena `db/pre-re/job_stats.yml` 的 BonusStats（Sage），30 點。
     `aspdFrom` 指向攻速表裡本來就有的 `x_賢者_智者`（書 151／空手 149／法杖 139／短劍 141）。 */
  sage: {
    id: 'sage', name: '賢者', tier: 2, icon: '📖', parent: 'mage',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.0, matkMod: 1.5,
    aspdFrom: 'x_賢者_智者',
    next: [], nextLocked: ['professor'],
    bonusLevels: { str:[42,44,46,47,48], agi:[3,6,13,22,33], vit:[4,11,18], int:[1,8,15,24,30,37,38,45,50], dex:[20,25,27,32,39], luk:[17,35,40] },
    skills: [
      'sa_advancedbook', 'sa_dragonology',
      'sa_flamelauncher', 'sa_frostweapon', 'sa_lightningloader', 'sa_seismicweapon',
      'sa_volcano', 'sa_deluge', 'sa_violentgale', 'sa_landprotector',
      'sa_castcancel', 'sa_freecast', 'sa_autospell', 'sa_magicrod',
      'sa_spellbreaker', 'sa_dispell', 'sa_abracadabra', 'sa_createcon',
      'sa_elementfire', 'sa_elementwater', 'sa_elementwind', 'sa_elementearth',
    ],
    // 官方賢者與巫師共用法師的技能樹，整份借過來（屬性附加的前置就是法師的三個箭術）
    borrowSkillsFrom: ['mage'],
    desc: '知道的比誰都多，所以從不硬碰硬。'
  },

  /* 鍊金術士（#72）。商人的另一條分支，也是六條分支的最後一個。

     官方 HP/SP 參數（HpFactor 90／HpIncrease 500／SpIncrease 400）**跟神匠一模一樣**，
     HP/SP 因此也完全相同（#92 之後照官方表算，沒有本作自己的係數），
     兩者的差別全放在後面兩個係數上：
       atkMod 1.5  神匠是 1.8。鍊金術士的傷害大半來自技能倍率（生命體召喚 ATK 3000%），
                   基礎 ATK 給太高會讓那些倍率直接失控
       matkMod 0.9 官方沒有魔法路線，但藥劑師總不至於完全不懂

     `bonusLevels` 出自 rAthena `db/pre-re/job_stats.yml` 的 BonusStats（Alchemist），30 點。
     `aspdFrom` 指向攻速表裡本來就有的 `x_煉金術師_創造者`
     （空手 154／單手劍 149／斧 149／鈍器 149／短劍 144，盾 −4）。 */
  alchemist: {
    id: 'alchemist', name: '鍊金術士', tier: 2, icon: '⚗️', parent: 'merchant',
    baseLevelReq: 40, jobLevelReq: 40, jobLevelMax: 50,
    atkMod: 1.5, matkMod: 0.9,
    aspdFrom: 'x_煉金術師_創造者',
    next: [], nextLocked: ['creator'],
    bonusLevels: { str:[6,15,26,34,43], agi:[11,14,40,45,49,50], vit:[20,31,36], int:[1,9,17,23,24,29,38], dex:[2,3,8,13,19,21,25,28,32], luk:[] },
    skills: [
      'am_learningpotion', 'am_pharmacy', 'am_axemastery', 'am_potionpitcher',
      'am_demonstration', 'am_acidterror', 'am_spheremine', 'am_cannibalize',
      'am_cp_helm', 'am_cp_shield', 'am_cp_armor', 'am_cp_weapon',
      'am_bioethics', 'am_callhomun', 'am_rest', 'am_resurrecthomun',
    ],
    // 官方鍊金術士與神匠共用商人的技能樹，整份借過來
    borrowSkillsFrom: ['merchant'],
    desc: '把生命與藥劑一起放進燒瓶，然後在筆記本上寫下代價。'
  },

  /* ---------------- 進階二轉（tier 3，轉生後才走得到）----------------
     只有**轉生過**的角色接得到（`canJobChange()` 走 `state.rebirthPath` → `nextLocked`）。
     轉生的定位是「把本職練得更強」，所以這六個是原二轉的加強版，不是新路線。

     這一批是**框架**：職業本體、成長曲線、轉職條件都到位，`skills` 先留空，
     官方技能分批補（領主騎士 8 個先做，其餘在 #74～#79 補完）。
     留空不會壞——技能表本來就是
     id 陣列，空陣列在 jobs.js 尾端的還原、技能分頁、被動掃描全部都走得通。

     四個共通設定，理由寫在這裡不逐條重複：

     `jobLevelMax: 70`  官方轉生二轉就是 70（一般二轉 50）。多出來的 20 級＝20 點技能點，
                        剛好夠點那批新技能，不必另外發點。

     `baseLevelReq: 70` **本作自訂**。官方的轉職條件是另一套階層（轉生一轉 job 40），
                        本作沒有轉生一轉那一層，所以改用基礎等級當門檻。
                        一轉 10 / 二轉 40 / 進階二轉 70，間距一致。

     `hpSpFrom` / `aspdFrom`  一律指回本職。官方轉生職**用的就是同一張 HP/SP 表與攻速表**，
                        差別只在那個固定的 +25%，而那 25% 掛在 `state.rebirthCount` 上
                        （見 engine.js 的 TRANSCENDENT_HPSP_MULT），不是掛在職業資料裡——
                        官方是「轉生過」就有，轉生後那段高等一轉同樣吃得到。
                        所以這裡不複製 100 格陣列，也不新增攻速表。

     `bonusLevels` 沿用本職的表（職業加成是累計繼承的，見 computeJobBonuses），
     51~70 那段再補一輪，讓多出來的 20 級不是白練。 */

  lordknight: {
    id: 'lordknight', name: '領主騎士', tier: 2.5, icon: '⚔️', parent: 'knight',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.8, matkMod: 0.7,
    hpSpFrom: 'knight', aspdFrom: 'knight',
    // 進階二轉「取代」二轉（不再經過騎士那一站），所以二轉的技能整份借過來
    borrowSkillsFrom: ['knight'],
    next: [], nextLocked: ['runeknight'],
    bonusLevels: { str:[1,6,7,8,19,25,33,41,46,47,52,56,57,64,70], agi:[2,10,14,17,37,53,60,65], vit:[5,12,22,29,40,43,58,68], int:[13,67], dex:[4,11,16,28,31,36,44,49,62], luk:[3,27,38] },
    // 官方 8 個技能全數到齊（2026-08-08）
    skills: [
      'lk_berserk', 'lk_tensionrelax', 'lk_parrying', 'lk_aurablade',
      'lk_concentration', 'lk_headcrush', 'lk_jointbeat', 'lk_spiralpierce',
    ],
    desc: '騎士之上的騎士。戰場上的旗幟只為他而立。'
  },
  highwizard: {
    id: 'highwizard', name: '高等巫師', tier: 2.5, icon: '🔮', parent: 'wizard',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 0.5, matkMod: 2.0,
    hpSpFrom: 'wizard', aspdFrom: 'wizard', baseAspd: 150,
    // 進階二轉「取代」二轉（不再經過騎士那一站），所以二轉的技能整份借過來
    borrowSkillsFrom: ['wizard'],
    next: [], nextLocked: ['warlock'],
    bonusLevels: { str:[20,40,60], agi:[8,18,26,34,50,56,65,69], vit:[3,29,47,53,66], int:[1,5,10,14,19,24,28,32,37,38,39,46,49,55,59,62,70], dex:[2,9,17,22,23,31,43,61,67], luk:[12,41,57] },
    skills: ['hw_ganbantein', 'hw_napalmvulcan', 'hw_souldrain', 'hw_magiccrasher', 'hw_magicpower', 'hw_gravitation'],
    desc: '把咒文推到極限的人，最後連自己都成了咒文的一部分。'
  },
  sniper: {
    id: 'sniper', name: '狙擊之王', tier: 2.5, icon: '🏹', parent: 'hunter',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.6, matkMod: 0.8,
    hpSpFrom: 'hunter', aspdFrom: 'hunter',
    // 進階二轉「取代」二轉（不再經過騎士那一站），所以二轉的技能整份借過來
    borrowSkillsFrom: ['hunter'],
    next: [], nextLocked: ['ranger'],
    bonusLevels: { str:[8,24,45,61], agi:[2,6,10,11,21,28,33,38,43,48,58], vit:[12,32,55], int:[5,20,42,54,65], dex:[1,3,4,16,17,22,26,30,35,40,46,51,60,69], luk:[14,25,31,36,50,57,62,70] },
    skills: ['sn_windwalk', 'sn_sharpshooting', 'sn_sight', 'sn_falconassault'],
    desc: '一箭，一命。距離只是他與獵物之間的一個數字。'
  },
  whitesmith: {
    id: 'whitesmith', name: '神匠', tier: 2.5, icon: '🔨', parent: 'blacksmith',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.75, matkMod: 0.7,
    hpSpFrom: 'blacksmith', aspdFrom: 'blacksmith',
    // 進階二轉「取代」二轉（不再經過騎士那一站），所以二轉的技能整份借過來
    borrowSkillsFrom: ['blacksmith'],
    next: [], nextLocked: ['mechanic'],
    bonusLevels: { str:[2,3,17,26,33,52], agi:[7,19,20,31,36,58,64], vit:[9,13,29,48,60,65], int:[4,15,22,34,50,61], dex:[1,6,12,23,32,38,41,47,55,56,62,70], luk:[8,16,28,39,44,45,66,67] },
    // 官方 8 個，三個空技能（金錢鑄造／金屬塊製造／攻擊塔製作）刪除——見 js/skills.js
    skills: ['ws_weaponrefine', 'ws_cartboost', 'ws_cartterm', 'ws_meltdown', 'ws_overthrustmax'],
    desc: '鐵砧上敲出來的不只是武器，還有一整個時代的重量。'
  },
  assassincross: {
    id: 'assassincross', name: '十字刺客', tier: 2.5, icon: '🗡️', parent: 'assassin',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.75, matkMod: 0.7,
    hpSpFrom: 'assassin', aspdFrom: 'assassin',
    // 進階二轉「取代」二轉（不再經過騎士那一站），所以二轉的技能整份借過來
    borrowSkillsFrom: ['assassin'],
    next: [], nextLocked: ['guillotinecross'],
    bonusLevels: { str:[2,7,12,21,29,38,50,54,66], agi:[1,4,5,15,20,24,25,31,32,33,42,46,51,56,62], vit:[9,47,69], int:[], dex:[10,23,37,39,43,53,57,61,64,70], luk:[3,8,16,18,26,34,48,65] },
    // 官方 6 個，幻影步（ASC_HALLUCINATION）刪除——官方資料本身就是空的，見 js/skills.js
    skills: ['asc_katar', 'asc_cdp', 'asc_edp', 'asc_breaker', 'asc_meteorassault'],
    desc: '影子裡的影子。你察覺的那一刻，已經是他允許的。'
  },
  highpriest: {
    id: 'highpriest', name: '高階祭司', tier: 2.5, icon: '🕊️', parent: 'priest',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 0.6, matkMod: 1.4,
    hpSpFrom: 'priest', aspdFrom: 'priest', baseAspd: 150,
    // 進階二轉「取代」二轉（不再經過騎士那一站），所以二轉的技能整份借過來
    borrowSkillsFrom: ['priest'],
    next: [], nextLocked: ['archbishop'],
    bonusLevels: { str:[5,12,21,31,38,45,60], agi:[3,8,19,29,42,55,65,68], vit:[4,22,30,50,51,58,67], int:[1,7,11,20,23,24,34,47,57,61,66,70], dex:[13,16,26,28,37,43,46,56,62], luk:[40,49] },
    skills: ['hp_manarecharge', 'hp_basilica', 'hp_assumptio', 'hp_meditatio'],
    desc: '祈禱到了盡頭，連神都會側耳。'
  },

  /* ---------------- 分支線的進階二轉（tier 3）----------------
     #74。上面那六個進階二轉掛在「代表分支」上，這七個掛在另一條分支上。
     使用者 2026-08-14 指定「分支二轉的全部轉生那路一起處理」——
     所以七個一次補齊，**技能之後逐步補**（只有聖殿十字軍先做完 4 個）。

     補進 JOB_TREE 之後轉生的路就自動通了：`rebirthLine()` 是查
     `nextLocked[0]` 在不在 JOB_TREE 裡，在就換上去，不在就退回二轉本身。
     這七個一補進來，六條分支線的轉生斷層（BUGS #67-續）同時消失，不必改 engine。

     四個共通設定沿用上面那批（理由寫在 highpriest 上方那段，不重複）：
     jobLevelMax 70 / baseLevelReq 70 / hpSpFrom 與 aspdFrom 指回本職。

     `aspdFrom` 一律寫**本職的職業 id**。`aspdJobKey()` 會沿著 aspdFrom 一路跟到終點
     （#75 改的；以前只解析一層，寫 'crusader' 會停在那裡、查不到表就整個退回空手值 154），
     所以 聖殿十字軍 → 十字軍 → `x_十字軍_聖殿十字軍` 這種兩段的指向現在接得起來。

     **`bonusLevels` 這批用的是官方轉生職自己的表**（rAthena job_stats.yml 的
     Paladin / Professor / Clown / Gypsy / Creator / Stalker / Champion），
     不是「本職的表 + 51~70」。官方轉生職的加成表跟原二轉是不同的兩張，
     而 `computeJobBonuses()` 是每個職業各查各的表，進階二轉又取代了二轉
     （轉生後的路線裡根本沒有十字軍那一站），所以直接用官方表是對的也是自洽的。
     （上面那六個代表分支當初是用「本職的表 + 自己補 51~70」做的，跟官方對不上，
     #75 已經連同超級新手一起校正成官方表——現在 34 個職業全部對得上 job_stats.yml。） */
  paladin: {
    id: 'paladin', name: '聖殿十字軍', tier: 2.5, icon: '🛡️', parent: 'crusader',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.65, matkMod: 1.0,
    hpSpFrom: 'crusader', aspdFrom: 'crusader',
    /* matkMod 維持十字軍的 1.0 沒有加。神之威壓雖然是魔法技能，但使用者 2026-08-14
       指定「照官方，不一定要強勢」——想讓那招痛就自己堆 INT 與魔攻裝，不靠職業係數補。 */
    borrowSkillsFrom: ['crusader'],
    next: [], nextLocked: ['royalguard'],
    bonusLevels: { str:[2,10,18,26,33,40,48,55,64], agi:[3,8,16,24,37,52,60,70], vit:[1,9,15,21,30,42,49,53,63,69], int:[7,14,29,43,54,61,65], dex:[6,12,17,23,36,45,57,68], luk:[39,59,67] },
    // 官方 4 個技能全數到齊（#74）
    skills: ['pa_shieldchain', 'pa_pressure', 'pa_sacrifice', 'pa_gospel'],
    desc: '盾後面站著的不只是他自己。'
  },
  professor: {
    // 名稱用「智者」：官方攻速表那一列就叫 `x_賢者_智者`，跟資料對齊（使用者 2026-08-14 指定）
    id: 'professor', name: '智者', tier: 2.5, icon: '📚', parent: 'sage',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.0, matkMod: 1.6,
    hpSpFrom: 'sage', aspdFrom: 'sage',
    borrowSkillsFrom: ['sage'],
    next: [], nextLocked: ['sorcerer'],
    bonusLevels: { str:[5,18,27,36,45,56], agi:[3,12,23,32,43,50,54,60,69], vit:[7,24,39,63], int:[1,2,11,14,22,30,38,41,49,57,64,68,70], dex:[8,16,20,26,29,34,37,46,52,55,62], luk:[21,66] },
    // 官方 8 個技能全數到齊（#76）
    skills: [
      'pf_spiderweb', 'pf_fogwall', 'pf_doublecasting', 'pf_memorize',
      'pf_hpconversion', 'pf_soulchange', 'pf_soulburn', 'pf_mindbreaker',
    ],
    desc: '知識本身就是一種暴力，只是他習慣先說明。'
  },
  clown: {
    id: 'clown', name: '搞笑藝人', tier: 2.5, icon: '🎺', parent: 'bard', genderLock: 'male',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.65, matkMod: 0.9,
    hpSpFrom: 'bard', aspdFrom: 'bard', baseAspd: 150,
    borrowSkillsFrom: ['bard'],
    next: [], nextLocked: ['minstrel'],
    bonusLevels: { str:[5,10,19,33,45,54,62,70], agi:[1,4,9,13,24,32,36,49,53,58,65,68], vit:[16,59], int:[8,21,28,41,69], dex:[2,7,15,23,30,39,40,43,50,56,57,61,63,66], luk:[11,18,26,47] },
    // 官方 6 個做 5 個（傀儡師的把戲擱置，等隊伍系統）
    skills: ['cg_moonlit', 'cg_specialsinger', 'cg_hermode', 'cg_tarotcard', 'cg_arrowvulcan'],
    desc: '掌聲響起的時候，戰場已經結束了。'
  },
  gypsy: {
    id: 'gypsy', name: '冷豔舞姬', tier: 2.5, icon: '🌹', parent: 'dancer', genderLock: 'female',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.65, matkMod: 0.9,
    hpSpFrom: 'dancer', aspdFrom: 'dancer', baseAspd: 150,
    borrowSkillsFrom: ['dancer'],
    next: [], nextLocked: ['wanderer'],
    bonusLevels: { str:[2,6,20,35,50,66], agi:[4,11,12,13,25,31,38,47,52,57,61,62,67,70], vit:[17,54], int:[8,26,39,53,60], dex:[1,9,14,15,18,22,23,28,33,41,43,45,49,58,65,69], luk:[27,63] },
    // 跟搞笑藝人共用同一份（官方就是共用的六個）
    skills: ['cg_moonlit', 'cg_specialsinger', 'cg_hermode', 'cg_tarotcard', 'cg_arrowvulcan'],
    desc: '她跳的每一支舞，都是替誰送行。'
  },
  creator: {
    id: 'creator', name: '創造者', tier: 2.5, icon: '🧬', parent: 'alchemist',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.55, matkMod: 0.9,
    hpSpFrom: 'alchemist', aspdFrom: 'alchemist',
    borrowSkillsFrom: ['alchemist'],
    next: [], nextLocked: ['geneticist'],
    bonusLevels: { str:[6,31,53,66], agi:[5,18,27,38,54,67], vit:[9,33,61], int:[7,13,22,30,46,59,68], dex:[1,10,15,23,35,41,42,43,47,49,56,57,63,70], luk:[3,8,20,25,34,45,51,52,60,64,69] },
    // 官方 6 個做 3 個（植物栽培／鍊金術／藥水合成刪除，理由見 js/skills.js 的創造者區塊）
    skills: ['bc_slimpitcher', 'bc_aciddemonstration', 'bc_fullprotection'],
    desc: '他不再問代價，因為代價早就付完了。'
  },
  stalker: {
    id: 'stalker', name: '神行太保', tier: 2.5, icon: '👁️', parent: 'rogue',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.75, matkMod: 0.7,
    hpSpFrom: 'rogue', aspdFrom: 'rogue', baseAspd: 150,
    borrowSkillsFrom: ['rogue'],
    next: [], nextLocked: ['shadowchaser'],
    bonusLevels: { str:[1,11,22,32,43,47,53,62,67], agi:[2,9,12,21,27,34,41,45,58,64,70], vit:[6,15,42,63], int:[5,44,57], dex:[10,16,17,26,29,37,38,49,52,56,60,66], luk:[4,20,24,31,50,59] },
    // 官方 4 個技能全數到齊（#79）
    skills: ['st_rejectsword', 'st_chasewalk', 'st_preserve', 'st_fullstrip'],
    desc: '你回頭的時候，他就已經是你了。'
  },
  champion: {
    id: 'champion', name: '武術宗師', tier: 2.5, icon: '🥋', parent: 'monk',
    baseLevelReq: 70, jobLevelReq: 50, jobLevelMax: 70,
    atkMod: 1.85, matkMod: 0.8,
    hpSpFrom: 'monk', aspdFrom: 'monk',
    borrowSkillsFrom: ['monk'],
    next: [], nextLocked: ['sura'],
    bonusLevels: { str:[1,9,17,27,37,48,59,65,66], agi:[4,12,20,21,29,45,52,62,70], vit:[3,15,24,39,42,58,68], int:[2,11,33,47,56,64,69], dex:[6,16,22,30,38,44,50,53,60,67], luk:[13,34,46] },
    // 官方 4 個技能全數到齊（#79），四個都是被動，跟 #70 武僧整條線一致
    skills: ['ch_soulcollect', 'ch_palmstrike', 'ch_tigerfist', 'ch_chaincrush'],
    desc: '一拳之後就沒有第二拳了，因為不需要。'
  },

  /* ---------------- 三轉（tier 3，#111）----------------
     使用者 2026-08-16 決定：**先只做外觀**——名字、立繪、職業樹上的那一格，
     沒有任何自己的技能（官方三轉的傷害公式換了一套，照抄倍率會失衡）。
     它真正的作用是解鎖「基礎等級 200」與「素質上限 130」。
     數值（atkMod/matkMod/bonusLevels/HP-SP/ASPD）一律沿用母職，轉了不會變弱也不會變強。
     之後要補技能的話，往各自的 skills 陣列填就好，其餘不用動。 */
  runeknight: {
    id: 'runeknight', name: '盧恩騎士', tier: 3, icon: '🗡️', parent: 'lordknight',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.8, matkMod: 0.7,
    hpSpFrom: 'lordknight', aspdFrom: 'lordknight',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['lordknight'],
    next: [], nextLocked: [],
    bonusLevels: { str:[1,6,7,8,19,25,33,41,46,47,52,56,57,64,70], agi:[2,10,14,17,37,53,60,65], vit:[5,12,22,29,40,43,58,68], int:[13,67], dex:[4,11,16,28,31,36,44,49,62], luk:[3,27,38] },
    skills: [],
    desc: '龍與符文的繼承者。劍上刻著看不懂的字，但敵人看得懂。'
  },
  royalguard: {
    id: 'royalguard', name: '皇家禁衛', tier: 3, icon: '🛡️', parent: 'paladin',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.65, matkMod: 1.0,
    hpSpFrom: 'paladin', aspdFrom: 'paladin',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['paladin'],
    next: [], nextLocked: [],
    bonusLevels: { str:[2,10,18,26,33,40,48,55,64], agi:[3,8,16,24,37,52,60,70], vit:[1,9,15,21,30,42,49,53,63,69], int:[7,14,29,43,54,61,65], dex:[6,12,17,23,36,45,57,68], luk:[39,59,67] },
    skills: [],
    desc: '站在王座前面的那一個。他不倒，後面就沒事。'
  },
  warlock: {
    id: 'warlock', name: '咒術士', tier: 3, icon: '🌌', parent: 'highwizard',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 0.5, matkMod: 2.0,
    hpSpFrom: 'highwizard', aspdFrom: 'highwizard',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['highwizard'],
    next: [], nextLocked: [],
    bonusLevels: { str:[20,40,60], agi:[8,18,26,34,50,56,65,69], vit:[3,29,47,53,66], int:[1,5,10,14,19,24,28,32,37,38,39,46,49,55,59,62,70], dex:[2,9,17,22,23,31,43,61,67], luk:[12,41,57] },
    skills: [],
    desc: '把咒文寫成公式的人。世界照著他的算式崩塌。'
  },
  sorcerer: {
    id: 'sorcerer', name: '妖術師', tier: 3, icon: '🌪️', parent: 'professor',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.0, matkMod: 1.6,
    hpSpFrom: 'professor', aspdFrom: 'professor',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['professor'],
    next: [], nextLocked: [],
    bonusLevels: { str:[5,18,27,36,45,56], agi:[3,12,23,32,43,50,54,60,69], vit:[7,24,39,63], int:[1,2,11,14,22,30,38,41,49,57,64,68,70], dex:[8,16,20,26,29,34,37,46,52,55,62], luk:[21,66] },
    skills: [],
    desc: '四大元素在他手上不是力量，是同事。'
  },
  ranger: {
    id: 'ranger', name: '遊俠', tier: 3, icon: '🏹', parent: 'sniper',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.6, matkMod: 0.8,
    hpSpFrom: 'sniper', aspdFrom: 'sniper',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['sniper'],
    next: [], nextLocked: [],
    bonusLevels: { str:[8,24,45,61], agi:[2,6,10,11,21,28,33,38,43,48,58], vit:[12,32,55], int:[5,20,42,54,65], dex:[1,3,4,16,17,22,26,30,35,40,46,51,60,69], luk:[14,25,31,36,50,57,62,70] },
    skills: [],
    desc: '箭離弦的那一刻，獵物才知道自己一直在陷阱裡。'
  },
  minstrel: {
    id: 'minstrel', name: '樂團', tier: 3, icon: '🎻', parent: 'clown',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.65, matkMod: 0.9,
    hpSpFrom: 'clown', aspdFrom: 'clown',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['clown'],
    next: [], nextLocked: [],
    bonusLevels: { str:[5,10,19,33,45,54,62,70], agi:[1,4,9,13,24,32,36,49,53,58,65,68], vit:[16,59], int:[8,21,28,41,69], dex:[2,7,15,23,30,39,40,43,50,56,57,61,63,66], luk:[11,18,26,47] },
    skills: [],
    desc: '一個人就是一整支樂隊，安可是必須的。'
  },
  wanderer: {
    id: 'wanderer', name: '漂流者', tier: 3, icon: '💃', parent: 'gypsy',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.65, matkMod: 0.9,
    hpSpFrom: 'gypsy', aspdFrom: 'gypsy',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['gypsy'],
    next: [], nextLocked: [],
    bonusLevels: { str:[2,6,20,35,50,66], agi:[4,11,12,13,25,31,38,47,52,57,61,62,67,70], vit:[17,54], int:[8,26,39,53,60], dex:[1,9,14,15,18,22,23,28,33,41,43,45,49,58,65,69], luk:[27,63] },
    skills: [],
    desc: '舞步走到哪，戰場的節奏就改到哪。'
  },
  mechanic: {
    id: 'mechanic', name: '機工士', tier: 3, icon: '⚙️', parent: 'whitesmith',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.75, matkMod: 0.7,
    hpSpFrom: 'whitesmith', aspdFrom: 'whitesmith',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['whitesmith'],
    next: [], nextLocked: [],
    bonusLevels: { str:[2,3,17,26,33,52], agi:[7,19,20,31,36,58,64], vit:[9,13,29,48,60,65], int:[4,15,22,34,50,61], dex:[1,6,12,23,32,38,41,47,55,56,62,70], luk:[8,16,28,39,44,45,66,67] },
    skills: [],
    desc: '鐵鎚換成了扳手，敲的東西變大台了。'
  },
  geneticist: {
    id: 'geneticist', name: '基因學者', tier: 3, icon: '🧪', parent: 'creator',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.55, matkMod: 0.9,
    hpSpFrom: 'creator', aspdFrom: 'creator',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['creator'],
    next: [], nextLocked: [],
    bonusLevels: { str:[6,31,53,66], agi:[5,18,27,38,54,67], vit:[9,33,61], int:[7,13,22,30,46,59,68], dex:[1,10,15,23,35,41,42,43,47,49,56,57,63,70], luk:[3,8,20,25,34,45,51,52,60,64,69] },
    skills: [],
    desc: '已經不滿足於製藥，開始改寫配方本身。'
  },
  guillotinecross: {
    id: 'guillotinecross', name: '十字斬首者', tier: 3, icon: '🗡️', parent: 'assassincross',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.75, matkMod: 0.7,
    hpSpFrom: 'assassincross', aspdFrom: 'assassincross',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['assassincross'],
    next: [], nextLocked: [],
    bonusLevels: { str:[2,7,12,21,29,38,50,54,66], agi:[1,4,5,15,20,24,25,31,32,33,42,46,51,56,62], vit:[9,47,69], int:[], dex:[10,23,37,39,43,53,57,61,64,70], luk:[3,8,16,18,26,34,48,65] },
    skills: [],
    desc: '影子裡的影子。你連他來過都不會知道。'
  },
  shadowchaser: {
    id: 'shadowchaser', name: '影武者', tier: 3, icon: '🌑', parent: 'stalker',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.75, matkMod: 0.7,
    hpSpFrom: 'stalker', aspdFrom: 'stalker',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['stalker'],
    next: [], nextLocked: [],
    bonusLevels: { str:[1,11,22,32,43,47,53,62,67], agi:[2,9,12,21,27,34,41,45,58,64,70], vit:[6,15,42,63], int:[5,44,57], dex:[10,16,17,26,29,37,38,49,52,56,60,66], luk:[4,20,24,31,50,59] },
    skills: [],
    desc: '偷來的不只是技能，還有你的名字。'
  },
  archbishop: {
    id: 'archbishop', name: '大主教', tier: 3, icon: '✝️', parent: 'highpriest',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 0.6, matkMod: 1.4,
    hpSpFrom: 'highpriest', aspdFrom: 'highpriest',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['highpriest'],
    next: [], nextLocked: [],
    bonusLevels: { str:[5,12,21,31,38,45,60], agi:[3,8,19,29,42,55,65,68], vit:[4,22,30,50,51,58,67], int:[1,7,11,20,23,24,34,47,57,61,66,70], dex:[13,16,26,28,37,43,46,56,62], luk:[40,49] },
    skills: [],
    desc: '神的話由他轉述，所以他說的就是。'
  },
  sura: {
    id: 'sura', name: '修羅', tier: 3, icon: '👊', parent: 'champion',
    baseLevelReq: 99, jobLevelReq: 70, jobLevelMax: 70,
    atkMod: 1.85, matkMod: 0.8,
    hpSpFrom: 'champion', aspdFrom: 'champion',
    // 沒有自己的技能，母職那份整份借過來（見上面的區塊說明）
    borrowSkillsFrom: ['champion'],
    next: [], nextLocked: [],
    bonusLevels: { str:[1,9,17,27,37,48,59,65,66], agi:[4,12,20,21,29,45,52,62,70], vit:[3,15,24,39,42,58,68], int:[2,11,33,47,56,64,69], dex:[6,16,22,30,38,44,50,53,60,67], luk:[13,34,46] },
    skills: [],
    desc: '拳頭之後不需要解釋。'
  }
};

/* ---------------- 技能 id → 定義本體 ----------------
   技能定義住在 js/skills.js，職業這邊只列 id。載入時換回物件陣列，
   所以 engine.js / ui.js 讀到的 job.skills 跟以前完全一樣。

   陣列元素可以是：
     'bash'                     直接引用
     { id: 'bash', maxLv: 5 }   引用並覆寫欄位（轉生職上限不同時用得到）

   技能物件是共用參照——超級新手借用一轉技能時指到的是同一份。
   全專案沒有任何地方會寫入技能物件（只讀 mult/spCost/desc 這些），所以共用是安全的；
   若日後要改成可寫，這裡要改成複製一份。
------------------------------------------------- */
for (const job of Object.values(JOB_TREE)) {
  job.skills = (job.skills || []).map(ref => {
    if (typeof ref === 'string') return SKILLS[ref];
    return SKILLS[ref.id] ? Object.assign({}, SKILLS[ref.id], ref) : null;
  }).filter(Boolean);
}

/* borrowSkillsFrom：把別的職業「學得到什麼」整份借過來。
   超級新手就是靠這個一次拿到六個一轉職業的技能，不必複製 61 筆定義。
   要在上面的解析跑完之後才做，因為借的是解析後的技能物件。 */
for (const job of Object.values(JOB_TREE)) {
  if (!job.borrowSkillsFrom) continue;
  const seen = new Set(job.skills.map(s => s.id));
  /* `borrowedFrom[技能id] = 來源職業id`。**借來的跟自己的要分得出來**（#99）：
       · 技能分頁不能在借用者底下把它們再畫一次（武僧借了服事整份，玩家又本來就
         走過服事那一站，同一批技能會在兩個區塊各出現一次，而且借用者那份全是 MAX，
         看起來像「一轉職就自動點滿」）
       · 加點時要扣**來源職業**的點數池，不是借用者的 */
  job.borrowedFrom = job.borrowedFrom || {};
  job.borrowSkillsFrom.forEach(srcId => {
    const src = JOB_TREE[srcId];
    if (!src) return;
    src.skills.forEach(sk => {
      if (seen.has(sk.id)) return;
      seen.add(sk.id);
      job.borrowedFrom[sk.id] = srcId;
      job.skills.push(sk);
    });
  });
}

/* ---------------- 尚未實作的職業路線 ----------------
   原本只有一個 JOB_TIER3_PLACEHOLDER，名字寫 tier-3、內容卻是
   「6 個沒做的普通二轉」＋「6 個轉生二轉」混在一起，而且漏了詩人（bard），
   拿來鋪三轉的路會踩到。這裡按實際的職業階層拆成三份。

   三份都只是待辦清單，engine/ui 目前都不讀；等哪個職業真的要做，
   就照這裡的 id/parent 在上面的 JOB_TREE 補一筆完整條目。
   parent 一律指向轉職前的職業，跟 JOB_TREE 裡的 parent 欄位同一套語意。

   中文名採台服慣用譯名，日後要動到 UI 前請再確認一次。
------------------------------------------------- */

/* 一、還沒做的普通二轉（tier 2）。
   **2026-08-10 全部清空**：六個一轉的第二條分支（十字軍／詩人／舞孃／流氓／武僧／賢者／鍊金術士）
   在 #66、#68～#72 全部進了 JOB_TREE，這份清單留著是給日後的擴充職業用的。 */
const JOBS_TIER2_PENDING = [];

/* 二、還沒做的進階二轉。
   **2026-08-14 全部清空**：十三個進階二轉全部進了 JOB_TREE——
   六個代表分支在 #58~#64、七個分支線在 #74。
   技能也在 2026-08-15 由 #74～#79 全部補完，六條分支線的轉生路都通了。 */
const JOBS_TRANS_PENDING = [];

// 三、三轉（tier 3）。官方一律從轉生二轉接上去，所以 parent 全在上面那份清單裡
/* 三轉已於 #111 全部進 JOB_TREE（純外觀、無技能），這份待辦清單清空。 */
const JOBS_TIER3_PENDING = [];