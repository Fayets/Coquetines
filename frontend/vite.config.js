import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

/** Hash corto del commit para mostrar en Configuración (OWNER). Se resuelve en `npm run build`. */
function resolveDeployCommit() {
  const fromEnv =
    process.env.VITE_APP_COMMIT ||
    process.env.COMMIT_REF ||
    process.env.NETLIFY_COMMIT_REF ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.CI_COMMIT_SHORT_SHA
  if (fromEnv) {
    const s = String(fromEnv).trim()
    return s.length > 12 ? s.slice(0, 12) : s
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(resolveDeployCommit()),
  },
})
