import { tr } from '../i18n';

/**
 * WebGL2 var mı? Pixi, WebGL yoksa sessizce 2B tuvale düşebilir; oyun WebGL2 gerektirdiği için (TDD §12) açılışta
 * önceden denetlenir. Hata ayrıntısı döndürür; sorun yoksa null.
 */
export function probeWebgl2(doc: Pick<Document, 'createElement'> = document): string | null {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) return tr.errors.webglContext;
    // Yoklama bağlamını hemen serbest bırak (bağlam sayısı sınırlıdır).
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
