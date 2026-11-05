import { cooldownSeconds } from './ability';
import type { Check } from '../game/session';
import { rejectText, tr } from '../i18n';
import type { RejectReason } from '../sim/types';

/** Bildirim süresi sayacı: duraklatılmışken azalmaz (oyun zamanı gibi). */
export class NoticeTimer {
  private left = 0;

  /** Bildirimi `ms` boyunca gösterir. */
  show(ms: number): void {
    this.left = ms;
  }

  clear(): void {
    this.left = 0;
  }

  get active(): boolean {
    return this.left > 0;
  }

  /** Kare süresi kadar azaltır; bu çağrıda süre dolduysa true. Duraklatmadayken azalmaz. */
  tick(frameMs: number, paused: boolean): boolean {
    if (this.left <= 0 || paused) return false;
    this.left -= frameMs;
    return this.left <= 0;
  }
}

/**
 * Oyuncunun komutu simülasyonda reddedildiğinde (aynı tick'te sıralı komutlar tick başı duruma göre doğrulanır)
 * gösterilecek metin. `recheck`: komutun şimdiki duruma göre yeniden denetimi; eksik altın, deneyim ve bekleme
 * bilgisini buradan alır. Yeniden denetim geçerse (durum değişmiş) parametresiz kısa metin kullanılır.
 */
export function rejectNoticeText(reason: RejectReason, recheck: Check): string {
  if (!recheck.ok) {
    const xp = recheck.xp !== undefined && recheck.xpRequired !== undefined ? { xp: recheck.xp, xpRequired: recheck.xpRequired } : undefined;
    const sec = recheck.cooldownTicks === undefined ? undefined : cooldownSeconds(recheck.cooldownTicks);
    return rejectText(recheck.reason, recheck.missingGold, xp, sec);
  }
  return tr.rejectBare[reason] ?? rejectText(reason);
}
