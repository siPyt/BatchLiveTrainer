import { resolve } from 'path'
import react from '@vitejs/plugin-react'
export default {
  root: resolve(process.cwd(), 'src/renderer'),
  resolve: { alias: { '@renderer': resolve(process.cwd(), 'src/renderer/src') } },
  plugins: [react()],
  server: { port: 5199, strictPort: true }
}
