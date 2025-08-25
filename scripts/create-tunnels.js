#!/usr/bin/env node
// Script para crear y manejar Cloudflare tunnels
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDirname } from './utils.js';

const __dirname = getDirname(import.meta.url);
const rootDir = path.resolve(__dirname, '..');

/**
 * Crea un tunnel de Cloudflare para un puerto específico
 * @param {number} port - Puerto local
 * @param {string} logFile - Archivo de log  
 * @returns {Promise<Object>} Proceso del tunnel
 */
export function createTunnel(port, logFile) {
  return new Promise((resolve, reject) => {
    console.log(`🌐 Creando tunnel para puerto ${port}...`);
    
    const logPath = path.join(rootDir, 'tunnel-logs', logFile);
    
    // Asegurar que existe el directorio
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    const logStream = fs.createWriteStream(logPath);
    tunnel.stdout.pipe(logStream);
    tunnel.stderr.pipe(logStream);
    
    let tunnelUrl = null;
    let timeout = setTimeout(() => {
      reject(new Error(`Timeout creating tunnel for port ${port}`));
    }, 30000);
    
    // Escuchar stdout y stderr para encontrar la URL
    const checkForUrl = (data) => {
      const output = data.toString();
      logStream.write(output);
      
      // Buscar la URL del tunnel
      const urlMatch = output.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0];
        clearTimeout(timeout);
        console.log(`   ✅ Tunnel creado: ${tunnelUrl}`);
        resolve({
          process: tunnel,
          url: tunnelUrl,
          port: port,
          logFile: logFile
        });
      }
    };
    
    tunnel.stdout.on('data', checkForUrl);
    tunnel.stderr.on('data', checkForUrl);
    
    tunnel.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    
    tunnel.on('exit', (code) => {
      if (code !== 0 && !tunnelUrl) {
        clearTimeout(timeout);
        reject(new Error(`Tunnel process exited with code ${code}`));
      }
    });
  });
}

/**
 * Extrae URL de tunnel desde archivo de log
 * @param {string} logFile - Archivo de log
 * @returns {string|null} URL del tunnel o null
 */
export function extractTunnelUrl(logFile) {
  try {
    const logPath = path.join(rootDir, 'tunnel-logs', logFile);
    if (!fs.existsSync(logPath)) return null;
    
    const content = fs.readFileSync(logPath, 'utf8');
    const match = content.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
    return match ? match[0] : null;
  } catch (error) {
    console.error(`Error extrayendo URL de ${logFile}:`, error.message);
    return null;
  }
}

/**
 * Crea todos los tunnels necesarios para producción
 * @returns {Promise<Object>} URLs de todos los tunnels
 */
export async function createAllTunnels() {
  console.log('🌐 Creando tunnels de Cloudflare para producción...\n');
  
  try {
    // Crear tunnels en paralelo
    const [backendTunnel, adminTunnel, viewerTunnel] = await Promise.all([
      createTunnel(6001, 'backend-tunnel.log'),
      createTunnel(4000, 'admin-tunnel.log'),
      createTunnel(4001, 'viewer-tunnel.log')
    ]);
    
    const urls = {
      backend: backendTunnel.url,
      admin: adminTunnel.url,
      viewer: viewerTunnel.url
    };
    
    console.log('\n✅ Todos los tunnels creados exitosamente!');
    console.log('🌐 URLs de tunnels:');
    console.log(`   📱 Admin:   ${urls.admin}`);
    console.log(`   📺 Viewer:  ${urls.viewer}`);
    console.log(`   ⚙️ Backend: ${urls.backend}`);
    
    return {
      tunnels: [backendTunnel, adminTunnel, viewerTunnel],
      urls: urls
    };
    
  } catch (error) {
    console.error('❌ Error creando tunnels:', error.message);
    throw error;
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  createAllTunnels().catch(console.error);
}