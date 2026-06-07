import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// Web3Auth + algosdk reference Node globals (Buffer/process) and a few builtins;
// without these polyfills the bundle throws "Buffer is not defined" at load → blank page.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ globals: { Buffer: true, process: true, global: true } }),
  ],
  server: { port: 5173 },
})
