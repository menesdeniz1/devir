import type { Command, JsonValue } from '../sim/types';
import type { Observation } from './observation';

/**
 * Bir tarafı yöneten karar verici. Saf bir işlevdir: aynı (gözlem, bellek, tick) her zaman aynı sonucu verir.
 * Girdi nesnelerini değiştirmez; yeni bellek döndürür. Bellek JSON değeridir ve duruma (state.ai) yazılır.
 */
export interface Controller {
  id: string;
  decide(obs: Observation, memory: JsonValue, tick: number): { commands: Command[]; memory: JsonValue };
  /**
   * İsteğe bağlı performans kancası: false dönerse bu tick'te `decide` çağrılmaz, gözlem kurulmaz, bellek
   * değişmez ve komut verilmez. Yalnızca "bu tick'te decide boş komut ve aynı bellek döndürürdü" kesinse false
   * dönmelidir; aksi hâlde sonuç değişir. Saf işlevdir (yalnızca bellek ve tick'e bakar).
   */
  wantsDecision?(memory: JsonValue, tick: number): boolean;
}
