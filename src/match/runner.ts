import type { Controller } from '../ai/controller';
import { buildObservation } from '../ai/observation';
import { step } from '../sim/step';
import { isSideId } from '../sim/validate';
import type { Command, GameState, SimEvent } from '../sim/types';

export type { Controller } from '../ai/controller';

/**
 * Orkestrasyon: her tick'te önce denetleyicilerin kararlarını alır, sonra sim.step'i çağırır.
 * Komut sırası: taraf 0 (dış komutlar, sonra denetleyici), taraf 1 (dış komutlar, sonra denetleyici).
 * Sonuç belirlenmişse denetleyiciler çalışmaz.
 */
export function stepMatch(
  state: GameState,
  externalCommands: readonly Command[],
  controllers: readonly [Controller | null, Controller | null],
): SimEvent[] {
  if (state.outcome !== null) return step(state, []);

  // İki taraf da aynı tick başı durumundan gözlem alır; bellek yazımı gözlemi etkilemez.
  const decisions: Command[][] = [[], []];
  for (const side of [0, 1] as const) {
    const controller = controllers[side];
    if (controller === null) continue;
    // Karar vermeyecek tick'te gözlem kurmak gereksizdir (denetleyicinin isteğe bağlı kancası).
    if (controller.wantsDecision !== undefined && !controller.wantsDecision(state.ai[side], state.tick)) continue;
    const result = controller.decide(buildObservation(state, side), state.ai[side], state.tick);
    state.ai[side] = result.memory;
    decisions[side] = result.commands.filter((c) => c?.side === side);
  }

  const commands: Command[] = [];
  for (const side of [0, 1] as const) {
    commands.push(...externalCommands.filter((c) => c?.side === side), ...(decisions[side] ?? []));
  }
  // Taraf dışı/bozuk dış komutlar sessizce atılmaz; step onları 'invalidCommand' ile reddeder.
  commands.push(...externalCommands.filter((c) => !isSideId(c?.side)));
  return step(state, commands);
}
