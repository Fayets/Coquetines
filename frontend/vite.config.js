import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function gitShortHeadFromAncestors() {
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: dir }).trim()
    } catch {
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return ''
}

/** Hash corto del commit para Configuración (OWNER). Resuelto al arrancar Vite / en `npm run build`. */
function resolveDeployCommit(envFromFiles) {
  const fromEnv =
    envFromFiles.VITE_APP_COMMIT ||
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
  return gitShortHeadFromAncestors()
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const commit = resolveDeployCommit(env)

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Constante global: import.meta.env + define para VITE_* suele quedar vacío en runtime
      __APP_COMMIT__: JSON.stringify(commit),
    },
  }
})
