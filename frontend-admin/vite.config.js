import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'os'

// Función para detectar IP local dinámicamente
function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Buscar IPv4 no loopback
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Cargar variables de entorno específicas del modo
  const env = loadEnv(mode, process.cwd(), '')
  const localIP = getLocalIP()
  
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0', // Permitir conexiones desde cualquier IP
      port: parseInt(env.VITE_PORT) || (mode === 'production' ? 4000 : 3000),
      strictPort: true, // Fallar si el puerto está ocupado, no buscar otro
      allowedHosts: [
        'localhost',           // localhost
        localIP,               // IP local detectada dinámicamente
        '.trycloudflare.com'   // Todos los dominios de Cloudflare
      ]
    },
    preview: {
      host: '0.0.0.0', // Permitir conexiones desde cualquier IP en preview
      port: parseInt(env.VITE_PORT) || (mode === 'production' ? 4000 : 3000),
      strictPort: true, // Fallar si el puerto está ocupado, no buscar otro
      allowedHosts: [
        'localhost',           // localhost
        localIP,               // IP local detectada dinámicamente
        '.trycloudflare.com'   // Todos los dominios de Cloudflare
      ]
    }
  }
})
