import type { RejectReason } from '../sim/types';

/** Tüm arayüz metinleri burada tutulur (TDD §7). `{ad}` biçimli yer tutucular `fmt` ile doldurulur. */

/** Simülasyonun ret nedenlerine döngü/oturum katmanının 'paused' nedeni eklenir (TDD §3). */
export type UiRejectReason = RejectReason | 'paused';

const reject: Record<UiRejectReason, string> = {
  invalidCommand: 'Geçersiz komut',
  matchOver: 'Maç bitti',
  unknownUnit: 'Bilinmeyen birlik',
  unitNotAvailable: 'Bu çağda üretilemez',
  notEnoughGold: 'Yetersiz altın ({missing} eksik)',
  queueFull: 'Kuyruk dolu',
  orderInProduction: 'Üretimdeki sipariş iptal edilemez',
  noSuchOrder: 'Böyle bir sipariş yok',
  notEnoughXp: 'Deneyim yetersiz ({xp}/{required})',
  maxAge: 'Son çağa ulaşıldı',
  noSuchSlot: 'Böyle bir yuva yok',
  slotLocked: 'Yuva kilitli',
  slotAlreadyUnlocked: 'Yuva zaten açık',
  previousSlotLocked: 'Önce önceki yuvayı aç',
  slotOccupied: 'Yuvada zaten kule var',
  slotEmpty: 'Yuva boş',
  unknownTower: 'Bilinmeyen kule',
  towerNotAvailable: 'Bu çağda kurulamaz',
  abilityCooldown: 'Bekleme: {sec} sn',
  paused: 'Oyun duraklatıldı',
};

export const tr = {
  appTitle: 'Devir',
  reject,
  unit: {
    primitive_front: 'Taşbaltacı',
    primitive_ranged: 'Mızrak Savuran',
    primitive_heavy: 'Kaya Kaldıracı',
    ancient_front: 'Kalkanlı Mızrakçı',
    ancient_ranged: 'Atlı Okçu',
    ancient_heavy: 'Balista',
    medieval_front: 'Zırhlı Muhafız',
    medieval_ranged: 'Arbaletçi',
    medieval_heavy: 'Mancınık',
    industrial_front: 'Süngülü Er',
    industrial_ranged: 'Nişancı',
    industrial_heavy: 'Buharlı Top Arabası',
    future_front: 'Plazma Muhafızı',
    future_ranged: 'Ray Tüfekçisi',
    future_heavy: 'Yürüyen Kale',
  } as Record<string, string>,
  tower: {
    primitive_tower_fast: 'Sapan Direği',
    primitive_tower_heavy: 'Kaya Oluğu',
    ancient_tower_fast: 'Ok Burcu',
    ancient_tower_heavy: 'Kızgın Kum Kazanı',
    medieval_tower_fast: 'Arbalet Mazgalı',
    medieval_tower_heavy: 'Kaynar Yağ Oluğu',
    industrial_tower_fast: 'Makineli Yuva',
    industrial_tower_heavy: 'Havan Mevzisi',
    future_tower_fast: 'Darbe Lazeri',
    future_tower_heavy: 'Plazma Havanı',
  } as Record<string, string>,
  towerFallback: 'Kule',
  /** Kule türü açıklamaları (GDD §6). */
  towerKind: {
    fast: 'Hızlı, tek hedef',
    heavy: 'Ağır, alan hasarı',
  },
  towerStats: {
    line: 'Hasar {damage} · Aralık {interval} sn · Menzil {range}',
    splash: 'Alan hasarı (yarıçap {radius})',
  },
  /** Çağ adları (1..5). */
  age: {
    1: 'İlkel Çağ',
    2: 'Antik Çağ',
    3: 'Orta Çağ',
    4: 'Endüstri Çağı',
    5: 'Gelecek Çağı',
  } as Record<number, string>,
  /** Yönelme hâli (-e/-a): "… geçtin" cümleleri için. */
  ageTo: {
    1: "İlkel Çağ'a",
    2: "Antik Çağ'a",
    3: "Orta Çağ'a",
    4: "Endüstri Çağı'na",
    5: "Gelecek Çağı'na",
  } as Record<number, string>,
  ageFallback: 'Çağ',
  /** Hasar çarpanı tablosunun hedef sınıfları (araç ipucu). */
  targetClass: {
    front: 'ön hat',
    ranged: 'menzilli',
    heavy: 'ağır',
    base: 'üs',
  } as Record<string, string>,
  unitFallback: 'Birlik',
  /** Özel yetenek adları (GDD §7). */
  ability: {
    primitive_stampede: 'Sürü Hücumu',
    ancient_fire_trench: 'Ateş Hendeği',
    medieval_caltrops: 'Çivi Kapanı',
    industrial_barrage: 'Baraj Ateşi',
    future_stasis: 'Durağanlık Alanı',
  } as Record<string, string>,
  /** Kısa açıklamalar; sayılar veriden doldurulur ({damage}, {sec}, {zoneSec}, {dps}, {slow}, {delay}, {pct}). */
  abilityDesc: {
    primitive_stampede: 'Yaban hayvanı sürüsü alandan geçer: düşmanlara {damage} hasar verir ve {sec} sn sersemletir.',
    ancient_fire_trench: 'Alan {zoneSec} sn yanar: içindeki düşmanlara saniyede {dps} hasar verir.',
    medieval_caltrops: 'Alan {zoneSec} sn boyunca düşmanları %{slow} yavaşlatır ve saniyede {dps} hasar verir.',
    industrial_barrage: 'Alan işaretlenir; {delay} sn sonra düşmanlara {damage} hasar verir.',
    future_stasis: 'Düşmanları {sec} sn dondurur; donanlar %{pct} fazla hasar alır.',
  } as Record<string, string>,
  abilityFallback: 'Yetenek',
  abilityDescFallback: 'Düşman birliklerine etki eden özel yetenek.',
  /** Rol adları (araç ipucu ve kuyruk işareti). */
  role: {
    front: 'Ön hat',
    ranged: 'Menzilli',
    heavy: 'Ağır',
  },
  /** Kuyruk kutusundaki kısa rol işareti. */
  roleMark: {
    front: 'ÖN',
    ranged: 'MEN',
    heavy: 'AĞR',
  },
  /** Kısa rol/karşılık açıklaması (GDD §3 döngüsü). */
  roleHint: {
    front: 'Yakın dövüş. Ağır birliklere karşı güçlü; menzilli birliklere karşı zayıf.',
    ranged: 'Uzaktan atış. Ön hat birliklerine karşı güçlü; ağır birliklere karşı zayıf.',
    heavy: 'Alan hasarı. Menzilli birlikleri ve üssü ezer; ön hat birliklerine karşı zayıf.',
  },
  unitStats: {
    line: 'Can {hp} · Hasar {damage} · Menzil {range} · Hız {speed} · Üretim {build} sn',
    splash: 'Alan hasarı (yarıçap {radius})',
    pierce: 'Delici ({count} hedef daha)',
    override: 'Özel çarpan: {target} hedefe ×{value}',
  },
  hud: {
    you: 'Sen',
    enemy: 'Rakip',
    baseHp: 'Üs canı',
    time: 'Süre',
    gold: 'Altın',
    incomePerSec: '+{n}/sn',
    pause: 'Duraklat',
    pauseAria: 'Oyunu duraklat',
    unitTitle: '{name} — {cost} altın [{key}]',
    produceAria: 'Üret: {name}, {cost} altın, kısayol {key}',
    produceAriaBlocked: 'Üret: {name}, {cost} altın, kısayol {key}. Kullanılamıyor: {reason}',
    queue: 'Üretim kuyruğu',
    queueSlotEmpty: 'Boş kutu',
    queueSlotProducing: 'Üretimde: {name} ({role}), %{pct}',
    queueSlotCancel: 'Siparişi iptal et: {name} ({role}), iade {refund} altın',
    queueSlotCancelTip: '{name} ({role}) — tıkla: iptal et, {refund} altın iade',
    queueSlotProducingTip: '{name} ({role}) — {reason}',
    controls: 'Birlik komutları',
    xp: 'Deneyim',
    ageName: 'Çağ',
    xpProgress: '{xp} / {next}',
    xpFinal: 'Son çağ',
    xpAria: 'Deneyim: {xp}, sonraki çağ için {next}',
    xpAriaFinal: 'Deneyim: {xp}. Son çağdasın',
    ageUp: 'Çağ Atla',
    ageUpCost: '{cost} altın',
    ageUpKey: 'E',
    ageUpAria: 'Çağ atla: {name}, {cost} altın, kısayol {key}',
    ageUpAriaBlocked: 'Çağ atla: {name}, {cost} altın, kısayol {key}. Kullanılamıyor: {reason}',
    ageUpTip: '{dative} geç — {cost} altın [{key}]',
    ageUpTipFinal: 'Son çağdasın',
    ageUpNotice: '{dative} geçtin',
    ageUpNoticeFoe: 'Rakip {dative} geçti',
    stone: 'Sınır Taşı',
    stoneNeutral: 'Tarafsız',
    stoneOwned: '{owner}',
    stoneLeaning: 'Tarafsız ({owner} %{pct})',
    stoneAria: 'Sınır Taşı: {state}',
    stoneTip: 'Koridorun ortasındaki taşı tek başına tutan taraf ele geçirir; sahibi saniyede ek altın ve deneyim kazanır.',
    noticeStoneCaptured: 'Sınır Taşı senin',
    noticeStoneLost: 'Sınır Taşı elden çıktı',
    noticeStoneCapturedFoe: "Rakip Sınır Taşı'nı aldı",
  },
  abilityUi: {
    group: 'Özel yetenek',
    key: 'Q',
    ready: 'Hazır',
    stats: 'Alan {width} · Bekleme {cooldown} sn',
    aria: 'Yetenek: {name}, kısayol {key}. {desc}',
    ariaBlocked: 'Yetenek: {name}, kısayol {key}. Kullanılamıyor: {reason}',
    tip: '{name} [{key}]\n{desc}\n{stats}',
    targetHint: 'Hedef seç: sol tık uygula, sağ tık veya Esc iptal',
    targeting: 'Hedef seç',
    castFoe: 'Rakip {name} kullandı',
  },
  defense: {
    group: 'Savunma yuvaları',
    slotLabel: 'Yuva {n}',
    locked: 'Yuva aç — {cost} altın',
    lockedAria: 'Yuva {n} kilitli. Aç: {cost} altın',
    lockedAriaBlocked: 'Yuva {n} kilitli. Aç: {cost} altın. Kullanılamıyor: {reason}',
    lockedTip: 'Yuva {n}: kilitli — tıkla: aç, {cost} altın (iade edilmez)',
    empty: 'Boş yuva',
    emptyHint: 'Kule kur',
    emptyAria: 'Yuva {n} boş. Kule kurmak için aç',
    emptyTip: 'Yuva {n}: boş — tıkla: kule kur',
    built: '{name}',
    builtAria: 'Yuva {n}: {name}{old}. Satmak için aç',
    builtTip: 'Yuva {n}: {name} — tıkla: sat',
    oldAge: 'Eski çağ',
    oldAgeAria: ', eski çağ kulesi',
    menuBuild: 'Kule kur — yuva {n}',
    menuSell: 'Yuva {n}: {name}',
    sell: 'Sat (+{refund} altın)',
    sellAria: 'Sat: {name}, {refund} altın iade',
    sellTip: '{name} sat — ödenen {paid} altının yarısı (aşağı yuvarlanır) iade edilir',
    buildOption: '{name}',
    buildCost: '{cost} altın',
    buildAria: 'Kur: {name}, {cost} altın, {kind}',
    buildAriaBlocked: 'Kur: {name}, {cost} altın, {kind}. Kullanılamıyor: {reason}',
  },
  pause: {
    title: 'Duraklatıldı',
    resume: 'Devam et',
    resumeAria: 'Oyuna devam et',
    settings: 'Ayarlar',
    settingsAria: 'Ayarları aç',
    toMenu: 'Ana menüye dön',
    toMenuAria: 'Ana menüye dön; maç kaydedilir',
    hint: 'P veya Esc ile de devam edebilirsin.',
    savedHint: 'Ana menüye dönersen maç kaydedilir.',
  },
  result: {
    win: 'Zafer',
    loss: 'Yenilgi',
    draw: 'Beraberlik',
    time: 'Süre: {time}',
    ages: 'Ulaşılan çağ — Sen: {you} · Rakip: {foe}',
    replay: 'Yeniden oyna',
    replayAria: 'Maçı aynı zorlukla yeniden oyna',
    toMenu: 'Ana menü',
    toMenuAria: 'Ana menüye dön',
    unitsTitle: 'Birliklerin',
    unitsEmpty: 'Hiç birlik üretilmedi',
    colUnit: 'Birlik',
    colProduced: 'Üretilen',
    colLost: 'Kaybedilen',
    colKills: 'Öldürülen',
    colYou: 'Sen',
    colFoe: 'Rakip',
    summaryTitle: 'Özet',
    goldEarned: 'Kazanılan altın',
    goldSpent: 'Harcanan altın',
    baseDamage: 'Üsse verilen hasar',
    towerKills: 'Kule öldürmeleri',
    abilityKills: 'Yetenek öldürmeleri',
    ageUps: 'Çağ geçişleri',
    ageUpsNone: '—',
    total: 'Toplam',
  },
  menu: {
    title: 'Devir',
    tagline: 'Çağlar boyunca tek koridorda savaş',
    start: 'Oyuna başla',
    startAria: 'Yeni maç kur',
    continue: 'Devam et',
    continueAria: 'Kayıtlı maça devam et',
    continueNone: 'Kayıtlı maç yok',
    continueInfo: '{difficulty} · {time} · {age}',
    tutorial: 'Öğretici',
    tutorialSoon: 'Yakında',
    settings: 'Ayarlar',
    settingsAria: 'Ayarları aç',
    version: 'Sürüm {version}',
    navigation: 'Ana menü',
  },
  setup: {
    title: 'Maç kurulumu',
    difficultyGroup: 'Zorluk',
    start: 'Başlat',
    startAria: 'Maçı {difficulty} zorlukta başlat',
    back: 'Geri',
    backAria: 'Ana menüye dön',
    record: 'Galibiyet {wins} · Yenilgi {losses}',
    recordDraws: ' · Beraberlik {draws}',
    historyTitle: 'Son sonuçlar',
    historyEmpty: 'Henüz sonuç yok',
    historyRow: '{result} · {difficulty} · {time} · {age}',
    confirmTitle: 'Kayıtlı maç silinsin mi?',
    confirmText: 'Yeni bir maç başlatırsan kayıtlı maçın silinir.',
    confirmYes: 'Sil ve başla',
    confirmNo: 'Vazgeç',
  },
  difficulty: {
    easy: 'Kolay',
    normal: 'Normal',
    hard: 'Zor',
  } as Record<string, string>,
  difficultyDesc: {
    easy: 'Rakip yavaş karar verir, sık hata yapar. Oyunu öğrenmek için.',
    normal: 'Rakip karşılıkları çoğunlukla doğru seçer ve kuleleri kullanır.',
    hard: 'Rakip hızlı ve isabetli oynar, baskıyı önceden görür.',
  } as Record<string, string>,
  difficultyFallback: 'Rakip',
  settings: {
    title: 'Ayarlar',
    music: 'Müzik ses düzeyi',
    sfx: 'Efekt ses düzeyi',
    shake: 'Ekran sarsıntısı',
    shakeOn: 'Açık',
    shakeOff: 'Kapalı',
    volumeValue: '{n}',
    shortcuts: 'Kısayollar',
    version: 'Oyun sürümü',
    back: 'Geri',
    backAria: 'Ayarlardan çık',
  },
  shortcuts: {
    produce: 'Ön hat / menzilli / ağır birlik üret',
    cancelLast: 'Son bekleyen siparişi iptal et',
    ability: 'Özel yetenek: hedefle, tekrar basınca uygula',
    ageUp: 'Çağ atla',
    pause: 'Duraklat / devam et',
    cancelTarget: 'Hedeflemeyi ya da açık menüyü kapat',
  },
  notices: {
    saveInvalid: 'Kayıtlı maç bozuk olduğu için silindi.',
    saveVersion: 'Kayıtlı maç bu oyun sürümüyle uyumlu değil ve silindi.',
    saveWriteFailed: 'İlerleme kaydedilemiyor: tarayıcı depolamaya izin vermiyor. Oyun sürer ama kayıt alınmaz.',
    continueFailed: 'Kayıtlı maç yüklenemedi.',
    dismiss: 'Kapat',
  },
  errors: {
    noWebgl: 'Oyun başlatılamadı',
    noWebglDetail:
      'Tarayıcın WebGL2 desteklemiyor veya devre dışı. Donanım hızlandırmayı açmayı ya da güncel bir Chrome, Edge veya Firefox kullanmayı dene.',
    noWebglTech: 'Ayrıntı: {message}',
    noRoot: 'Sayfada uygulama kök öğesi bulunamadı.',
  },
  debug: {
    title: 'Geliştirici paneli',
    speed: 'Hız',
    speedAria: 'Hız ×{n}',
    enemyBase1: 'Rakip üs canı = 1',
    hitEnemyBase: 'Rakip üssüne 1 hasar',
    selfBase1: 'Kendi üs canı = 1',
    addGold: '+{n} altın',
    addXp: '+{n} deneyim',
    hash: 'Karma',
    tick: 'Tick',
  },
} as const;

/** `{ad}` yer tutucularını doldurur. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

/** Ret nedeninin görünen metni (eksik altın varsa doldurulur). */
export function rejectText(
  reason: UiRejectReason,
  missingGold?: number,
  xpInfo?: { xp: number; xpRequired: number },
  cooldownSec?: number,
): string {
  return fmt(tr.reject[reason], { missing: missingGold ?? 0, xp: xpInfo?.xp ?? 0, required: xpInfo?.xpRequired ?? 0, sec: cooldownSec ?? 0 });
}

export function ageNameTo(age: number): string {
  return tr.ageTo[age] ?? tr.ageFallback;
}

export function ageName(age: number): string {
  return tr.age[age] ?? tr.ageFallback;
}

export function towerName(towerId: string): string {
  return tr.tower[towerId] ?? tr.towerFallback;
}

export function abilityName(abilityId: string): string {
  return tr.ability[abilityId] ?? tr.abilityFallback;
}

export function difficultyName(difficulty: string): string {
  return tr.difficulty[difficulty] ?? tr.difficultyFallback;
}

export function unitName(unitId: string): string {
  return tr.unit[unitId] ?? tr.unitFallback;
}
