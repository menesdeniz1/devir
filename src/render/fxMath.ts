/**
 * Görsel efektlerin saf matematiği (Pixi'den bağımsız; testlenebilir): ekran sarsıntısı, üs hasar düzeyi,
 * arka plan geçişi. Simülasyon durumunu değiştirmez; zaman çizimin gerçek kare saatinden gelir.
 */

// ---- Ekran sarsıntısı (GDD §14, PRD GR-06: kısa, kapatılabilir; tam ekran parlama yok) ----

export type ShakeStrength = 'light' | 'medium';

/** Genlik (mantıksal px) ve süre (ms). Süreler ≤ 250 ms. */
export const SHAKE = {
  light: { amp: 3, ms: 150 },
  medium: { amp: 8, ms: 240 },
  /** Hafif sarsıntı (üs vuruşu) en sık bu aralıkla yeniden başlar: kuşatmada sürekli titreme olmasın. */
  lightCooldownMs: 420,
  /** Salınım frekansları (rad/ms): iki eksende farklı, düzenli görünmesin. */
  freqX: 0.11,
  freqY: 0.083,
} as const;

/** Ekran sarsıntısı durumu. `enabled` kapalıyken tetikleme yok sayılır ve ofset her zaman 0'dır. */
export class ScreenShake {
  private enabled = true;
  private amp = 0;
  private durMs = 0;
  private ageMs = Infinity;
  private sinceLightMs = Infinity;
  private phase = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.ageMs = Infinity;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Sarsıntı başlatır; süren daha güçlü bir sarsıntıyı zayıfı ezmez. */
  trigger(strength: ShakeStrength): void {
    if (!this.enabled) return;
    const s = SHAKE[strength];
    if (strength === 'light') {
      if (this.sinceLightMs < SHAKE.lightCooldownMs) return;
      this.sinceLightMs = 0;
    }
    if (this.active && this.currentAmp() > s.amp) return;
    this.amp = s.amp;
    this.durMs = s.ms;
    this.ageMs = 0;
    this.phase += 1.7;
  }

  get active(): boolean {
    return this.enabled && this.ageMs < this.durMs;
  }

  private currentAmp(): number {
    if (!this.active) return 0;
    const k = 1 - this.ageMs / this.durMs;
    return this.amp * k * k;
  }

  /** Zamanı ilerletir ve ofseti (mantıksal px) döndürür. */
  update(ms: number): { x: number; y: number } {
    this.sinceLightMs += ms;
    if (!this.active) return { x: 0, y: 0 };
    this.ageMs += ms;
    const a = this.currentAmp();
    if (a <= 0) return { x: 0, y: 0 };
    const t = this.ageMs;
    return { x: a * Math.sin(t * SHAKE.freqX + this.phase), y: a * 0.6 * Math.cos(t * SHAKE.freqY + this.phase * 1.3) };
  }

  reset(): void {
    this.ageMs = Infinity;
    this.sinceLightMs = Infinity;
  }
}

/** Sarsıntı tetikleyen yetenekler (vuruş anında orta düzey): Sürü Hücumu, Baraj Ateşi. */
export const SHAKE_ABILITIES: ReadonlySet<string> = new Set(['primitive_stampede', 'industrial_barrage']);

// ---- Üs hasar görseli (GDD §14: çatlaklar %75 / %50 / %25) ----

export const BASE_DAMAGE_THRESHOLDS = [0.75, 0.5, 0.25] as const;
export type BaseDamageLevel = 0 | 1 | 2 | 3;

/** Can oranından hasar katmanı: < %75 → 1, < %50 → 2, < %25 → 3. */
export function baseDamageLevel(hpFraction: number): BaseDamageLevel {
  const f = Number.isFinite(hpFraction) ? hpFraction : 1;
  if (f < BASE_DAMAGE_THRESHOLDS[2]) return 3;
  if (f < BASE_DAMAGE_THRESHOLDS[1]) return 2;
  if (f < BASE_DAMAGE_THRESHOLDS[0]) return 1;
  return 0;
}

// ---- Arka plan çağ geçişi ----

/** Arka plan geçiş süresi (ms): yeni çağın arka planı eskisinin üstünde belirir. */
export const BACKGROUND_FADE_MS = 1400;

/** Geçişin saydamlığı 0..1 (yumuşak başlangıç ve bitiş). */
export function crossfadeAlpha(elapsedMs: number, durationMs = BACKGROUND_FADE_MS): number {
  if (durationMs <= 0) return 1;
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return t * t * (3 - 2 * t);
}

// ---- Birlik vuruş parlaması ----

/** Parlama süresi (ms) ve en yüksek saydamlık. */
export const HIT_FLASH = { ms: 140, alpha: 0.8 } as const;

/** Vuruştan bu yana geçen süreye göre parlama saydamlığı (hızlı yükseliş, doğrusal sönüm). */
export function hitFlashAlpha(sinceHitMs: number): number {
  if (!(sinceHitMs >= 0) || sinceHitMs >= HIT_FLASH.ms) return 0;
  const rise = 20;
  const k = sinceHitMs < rise ? sinceHitMs / rise : 1 - (sinceHitMs - rise) / (HIT_FLASH.ms - rise);
  return HIT_FLASH.alpha * k;
}
