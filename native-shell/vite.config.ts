import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

const shellRoot = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, projectRoot, 'VITE_'), ...process.env }
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (!env[key]) throw new Error(`${key} is required to build the native shell`)
  }
  return {
    root: shellRoot,
    envDir: projectRoot,
    base: './',
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsInlineLimit: 0,
    },
  }
})
