/** Derleme anında vite `define` ile eklenen sabitler (vite.config.ts); tanımsızsa (ör. araçlar) varsayılanlar kullanılır. */
declare const __APP_VERSION__: string | undefined;
declare const __APP_COMMIT__: string | undefined;

export const GAME_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const GAME_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';

/** Ayarlar ekranında gösterilen sürüm metni: "0.1.0 (a682df5)". */
export function versionLabel(version: string = GAME_VERSION, commit: string = GAME_COMMIT): string {
  return `${version} (${commit})`;
}
