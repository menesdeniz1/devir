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
  pause: {
    title: 'Duraklatıldı',
    resume: 'Devam et',
    resumeAria: 'Oyuna devam et',
    hint: 'P veya Esc ile de devam edebilirsin',
  },
  result: {
    win: 'Zafer',
    loss: 'Yenilgi',
    draw: 'Beraberlik',
    time: 'Süre: {time}',
    replay: 'Yeniden oyna',
    replayAria: 'Maçı yeniden oyna',
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
export function rejectText(reason: UiRejectReason, missingGold?: number, xpInfo?: { xp: number; xpRequired: number }): string {
  return fmt(tr.reject[reason], { missing: missingGold ?? 0, xp: xpInfo?.xp ?? 0, required: xpInfo?.xpRequired ?? 0 });
}

export function ageNameTo(age: number): string {
  return tr.ageTo[age] ?? tr.ageFallback;
}

export function ageName(age: number): string {
  return tr.age[age] ?? tr.ageFallback;
}

export function unitName(unitId: string): string {
  return tr.unit[unitId] ?? tr.unitFallback;
}
