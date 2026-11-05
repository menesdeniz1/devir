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
  paused: 'Oyun duraklatıldı',
};

export const tr = {
  appTitle: 'Devir',
  reject,
  unit: {
    primitive_front: 'Taşbaltacı',
  } as Record<string, string>,
  unitFallback: 'Birlik',
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
    queueSlotProducing: 'Üretimde: {name}, %{pct}',
    queueSlotCancel: 'Siparişi iptal et: {name} (iade {refund} altın)',
    queueSlotCancelTip: 'Tıkla: iptal et, {refund} altın iade',
    controls: 'Birlik komutları',
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
export function rejectText(reason: UiRejectReason, missingGold?: number): string {
  return fmt(tr.reject[reason], { missing: missingGold ?? 0 });
}

export function unitName(unitId: string): string {
  return tr.unit[unitId] ?? tr.unitFallback;
}
