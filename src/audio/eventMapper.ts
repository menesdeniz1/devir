import { ABILITIES } from '../data/abilities';
import { TOWERS } from '../data/towers';
import { UNITS } from '../data/units';
import type { Role } from '../data/types';
import type { SideId, SimEvent } from '../sim/types';
import { MIX } from './config';
import { clamp } from './dsp';
import { clampAge } from './sfx';
import type { SfxId } from './sfx/ids';

/**
 * Aşama 5'te eklenen yetenek olayları. SimEvent birleşiminde henüz yoksa da burada yapısal olarak tanımlıdır;
 * birleşimde varsa aynı biçimdedir. Bilinmeyen diğer olay türleri güvenle yok sayılır.
 */
export interface AbilityAudioEvent {
  type: 'abilityCast' | 'abilityImpact';
  side: SideId;
  abilityId: string;
  hits?: number;
}

export type AudioEvent = SimEvent | AbilityAudioEvent;

export interface AudioEventContext {
  /** Oyuncunun tarafı (varsayılan 0). Oyuncunun kendi seslerine ayrıcalık tanınır. */
  playerSide?: SideId;
  /** Tarafların güncel çağları; birlik türü bilinmediğinde tını için yedek. */
  ages?: readonly [number, number];
  /** Yaşayan birlikler (kimlik -> tür). Maç ortasında yüklenen durumlarda, doğma olayını görmemiş birlikler için yedek. */
  units?: ReadonlyArray<{ id: number; type: string }>;
}

/** Bir efekt isteği; `gain` bağlamsal çarpandır (taraf, birleştirme, üs hasarı), efekt ayarı motorda çarpılır. */
export interface SfxRequest {
  sfx: SfxId;
  /** Tını çağı 1..5. */
  age: number;
  gain: number;
  /** Çalma hızı çarpanı (rol perdesi). */
  rate: number;
  /** Aynı karede bu isteğe birleşen olay sayısı. */
  count: number;
  /** Kendi tarafına ait mi (bilgi amaçlı). */
  own: boolean;
}

/** Yetenek kimliği -> ses. Bilinmeyen kimlik çağına göre, o da yoksa genel sese düşer. */
const ABILITY_SFX: Record<string, { cast: SfxId; impact?: SfxId }> = {
  primitive_stampede: { cast: 'abilityStampede' },
  ancient_fire_trench: { cast: 'abilityFireTrench' },
  medieval_caltrops: { cast: 'abilityCaltrops' },
  industrial_barrage: { cast: 'abilityBarrage', impact: 'abilityBarrageImpact' },
  future_stasis: { cast: 'abilityStasis' },
};

const ABILITY_BY_AGE: Record<number, string> = {};
for (const a of ABILITIES) ABILITY_BY_AGE[a.age] = a.id;

function abilitySounds(abilityId: string): { cast: SfxId; impact?: SfxId } {
  const direct = ABILITY_SFX[abilityId];
  if (direct) return direct;
  const def = ABILITIES.find((a) => a.id === abilityId);
  const byAge = def ? ABILITY_SFX[ABILITY_BY_AGE[def.age] ?? ''] : undefined;
  return byAge ?? { cast: 'abilityGeneric' };
}

const UNIT_BY_ID = new Map(UNITS.map((u) => [u.id, u]));
const TOWER_BY_ID = new Map(TOWERS.map((t) => [t.id, t]));

interface ProjectileMemo {
  explosive: boolean;
  age: number;
  side: SideId;
}

const MEMO_LIMIT = 512;

interface Pending {
  req: SfxRequest;
  maxGain: number;
}

/**
 * SimEvent dizisini efekt isteklerine çevirir. Saf eşleme (ses bağlamı gerektirmez); yalnızca doğan birlik
 * türlerini ve uçan mermileri hatırlar, çünkü 'attack' ve 'projectileImpact' olayları tür taşımaz.
 */
export class EventSoundMapper {
  private readonly unitTypes = new Map<number, string>();
  private readonly projectiles = new Map<number, ProjectileMemo>();

  reset(): void {
    this.unitTypes.clear();
    this.projectiles.clear();
  }

  map(events: readonly AudioEvent[], ctx: AudioEventContext = {}): SfxRequest[] {
    const player: SideId = ctx.playerSide ?? 0;
    const pending = new Map<string, Pending>();
    let ctxUnits: Map<number, string> | null = null;

    const sideAge = (side: SideId): number => clampAge(ctx.ages?.[side] ?? 1);
    const unitTypeOf = (id: number): string | undefined => {
      const known = this.unitTypes.get(id);
      if (known) return known;
      if (!ctx.units) return undefined;
      ctxUnits ??= new Map(ctx.units.map((u) => [u.id, u.type]));
      return ctxUnits.get(id);
    };

    const add = (sfx: SfxId, side: SideId | null, age: number, extraGain = 1, rate = 1): void => {
      const own = side === null || side === player;
      const gain = (own ? MIX.ownGain : MIX.enemyGain) * extraGain;
      const a = clampAge(age);
      const key = `${sfx}|${a}|${own ? 1 : 0}|${rate}`;
      const found = pending.get(key);
      if (found) {
        found.req.count++;
        found.maxGain = Math.max(found.maxGain, gain);
      } else {
        pending.set(key, { req: { sfx, age: a, gain, rate, count: 1, own }, maxGain: gain });
      }
    };

    for (const event of events) {
      switch (event.type) {
        case 'unitSpawned': {
          this.remember(this.unitTypes, event.id, event.unitType);
          const def = UNIT_BY_ID.get(event.unitType);
          add('unitSpawn', event.side, def?.age ?? sideAge(event.side));
          break;
        }
        case 'attack': {
          if (event.damage === null) break; // mermili saldırı: sesi 'projectileFired' verir
          const def = UNIT_BY_ID.get(unitTypeOf(event.attackerId) ?? '');
          add('meleeHit', event.side, def?.age ?? sideAge(event.side), 1, rolePitch(def?.role));
          break;
        }
        case 'projectileFired': {
          const unit = UNIT_BY_ID.get(event.sourceType);
          const tower = TOWER_BY_ID.get(event.sourceType);
          if (tower) {
            // Kule sesi 'towerFired' olayından gelir; yalnızca çarpma için hatırla.
            this.remember(this.projectiles, event.id, { explosive: tower.kind === 'heavy', age: tower.age, side: event.side });
            break;
          }
          const age = unit?.age ?? sideAge(event.side);
          const heavy = unit?.role === 'heavy';
          this.remember(this.projectiles, event.id, { explosive: heavy || unit?.splash !== undefined, age, side: event.side });
          add(heavy ? 'shootHeavy' : 'shootRanged', event.side, age, 1, rolePitch(unit?.role));
          break;
        }
        case 'projectileImpact': {
          const memo = this.projectiles.get(event.id);
          this.projectiles.delete(event.id);
          const side = memo?.side ?? event.side;
          const age = memo?.age ?? sideAge(side);
          if (event.hits === 0 && !event.hitBase) add('impact', side, age, 0.5);
          else add(memo?.explosive ? 'explosion' : 'impact', side, age);
          break;
        }
        case 'unitDied': {
          this.unitTypes.delete(event.id);
          const def = UNIT_BY_ID.get(event.unitType);
          add('unitDeath', event.side, def?.age ?? sideAge(event.side), 1, rolePitch(def?.role));
          break;
        }
        case 'baseDamaged': {
          const scale = clamp(event.amount / MIX.baseHitFullDamage, MIX.baseHitMinGain, 1);
          add('baseHit', event.side, sideAge(event.side), scale);
          break;
        }
        case 'agedUp':
          add('ageUp', event.side, event.age);
          break;
        case 'slotUnlocked':
          if (event.side === player) add('slotUnlocked', null, sideAge(event.side));
          break;
        case 'towerBuilt': {
          const def = TOWER_BY_ID.get(event.towerType);
          add('towerBuilt', event.side, def?.age ?? sideAge(event.side));
          break;
        }
        case 'towerSold': {
          const def = TOWER_BY_ID.get(event.towerType);
          add('towerSold', event.side, def?.age ?? sideAge(event.side));
          break;
        }
        case 'towerFired': {
          const def = TOWER_BY_ID.get(event.towerType);
          add(def?.kind === 'heavy' ? 'towerHeavy' : 'towerFast', event.side, def?.age ?? sideAge(event.side));
          break;
        }
        case 'stoneCaptured':
          add(event.side === player ? 'stoneCapture' : 'stoneLose', null, sideAge(player));
          break;
        case 'stoneLost':
          // Rakibin taşı kaybetmesi ayrıca sesli değil; kendi kaybımız bildirilir.
          if (event.side === player) add('stoneLose', null, sideAge(player));
          break;
        case 'commandRejected':
          if (event.command.side === player) add('uiError', null, 1);
          break;
        case 'matchEnded': {
          const o = event.outcome;
          add(o.kind === 'draw' ? 'stingerDraw' : o.winner === player ? 'stingerWin' : 'stingerLoss', null, sideAge(player));
          break;
        }
        case 'abilityCast':
          add(abilitySounds(event.abilityId).cast, event.side, sideAge(event.side));
          break;
        case 'abilityImpact': {
          const impact = abilitySounds(event.abilityId).impact;
          if (impact) add(impact, event.side, sideAge(event.side));
          break;
        }
        default:
          break; // diğer olaylar sessizdir (bilinmeyen/yeni türler dahil)
      }
    }

    const out: SfxRequest[] = [];
    for (const { req, maxGain } of pending.values()) {
      const boost = Math.min(MIX.coalesceMax, 1 + MIX.coalesceGain * Math.log(req.count));
      out.push({ ...req, gain: maxGain * boost });
    }
    return out;
  }

  private remember<V>(map: Map<number, V>, id: number, value: V): void {
    map.set(id, value);
    if (map.size > MEMO_LIMIT) {
      const first = map.keys().next().value;
      if (first !== undefined) map.delete(first);
    }
  }
}

function rolePitch(role: Role | undefined): number {
  return MIX.roleRate[role ?? 'front'];
}
