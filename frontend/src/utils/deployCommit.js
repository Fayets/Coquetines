/**
 * Hash del commit inyectado en build/dev por Vite (`define` → __APP_COMMIT__).
 * No usar import.meta.env.VITE_APP_COMMIT: Vite no fusiona bien define con ese objeto.
 */
export const DEPLOY_COMMIT = __APP_COMMIT__
