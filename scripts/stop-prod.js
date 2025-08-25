#!/usr/bin/env node
// Script para detener ambiente de producción
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDirname } from './utils.js';

const __dirname = getDirname(import.meta.url);
const rootDir = path.resolve(__dirname, '..');

console.log('🛑 Deteniendo WebRTC Streaming System - PRODUCCIÓN');
console.log('=' .repeat(58));

/**
 * Mata procesos por puerto específico
 * @param {number} port - Puerto a liberar
 * @param {string} name - Nombre del servicio
 */
function killProcessByPort(port, name) {
  return new Promise((resolve) => {
    console.log(`🔧 Deteniendo ${name} (puerto ${port})...`);
    
    // En Windows
    if (process.platform === 'win32') {
      const netstat = spawn('netstat', ['-ano'], { stdio: 'pipe' });
      let output = '';
      
      netstat.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      netstat.on('close', () => {
        const lines = output.split('\n');
        const portLine = lines.find(line => line.includes(`:${port} `));
        
        if (portLine) {
          const parts = portLine.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          
          if (pid && pid !== '0') {
            const kill = spawn('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' });
            kill.on('close', () => {
              console.log(`   ✅ ${name} detenido (PID: ${pid})`);
              resolve();
            });
            return;
          }
        }
        
        console.log(`   ℹ️  ${name} no estaba ejecutándose`);
        resolve();
      });
    } else {
      // En Linux/Mac
      const lsof = spawn('lsof', ['-ti', `:${port}`], { stdio: 'pipe' });
      let pids = '';
      
      lsof.stdout.on('data', (data) => {
        pids += data.toString();
      });
      
      lsof.on('close', () => {
        if (pids.trim()) {
          const pidList = pids.trim().split('\n');
          pidList.forEach(pid => {
            spawn('kill', ['-9', pid], { stdio: 'ignore' });
          });
          console.log(`   ✅ ${name} detenido`);
        } else {
          console.log(`   ℹ️  ${name} no estaba ejecutándose`);
        }
        resolve();
      });
    }
  });
}

/**
 * Detiene todos los tunnels de Cloudflare
 */
function killCloudflaredTunnels() {
  return new Promise((resolve) => {
    console.log('🌐 Deteniendo tunnels de Cloudflare...');
    
    if (process.platform === 'win32') {
      const kill = spawn('taskkill', ['/F', '/IM', 'cloudflared.exe'], { stdio: 'ignore' });
      kill.on('close', () => {
        console.log('   ✅ Todos los tunnels de Cloudflare detenidos');
        resolve();
      });
    } else {
      spawn('pkill', ['-f', 'cloudflared'], { stdio: 'ignore' });
      setTimeout(() => {
        console.log('   ✅ Todos los tunnels de Cloudflare detenidos');
        resolve();
      }, 1000);
    }
  });
}

/**
 * Limpia archivos temporales de producción
 */
function cleanupProdFiles() {
  console.log('🧹 Limpiando archivos temporales...');
  
  // Limpiar logs de tunnels
  const tunnelLogsDir = path.join(rootDir, 'tunnel-logs');
  if (fs.existsSync(tunnelLogsDir)) {
    try {
      fs.rmSync(tunnelLogsDir, { recursive: true, force: true });
      console.log('   ✅ Logs de tunnels eliminados');
    } catch (error) {
      console.log('   ⚠️  No se pudieron eliminar algunos logs');
    }
  }
  
  // Limpiar archivos temporales
  const tempFiles = [
    'tunnel-urls.txt',
    'local-ip-output.txt'
  ];
  
  tempFiles.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        // Ignorar errores de archivos temporales
      }
    }
  });
  
  console.log('   ✅ Archivos temporales limpiados');
}

async function main() {
  try {
    // 1. Detener tunnels de Cloudflare primero
    await killCloudflaredTunnels();
    
    // 2. Detener servicios por puerto
    await Promise.all([
      killProcessByPort(6001, 'Backend'),
      killProcessByPort(4000, 'Admin Frontend'), 
      killProcessByPort(4001, 'Viewer Frontend')
    ]);
    
    // 3. Matar procesos npm restantes
    console.log('\n🔧 Limpiando procesos npm...');
    
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/IM', 'npm.exe'], { stdio: 'ignore' });
      spawn('taskkill', ['/F', '/IM', 'node.exe', '/FI', 'WINDOWTITLE eq *streaming*'], { stdio: 'ignore' });
    } else {
      spawn('pkill', ['-f', 'npm.*streaming'], { stdio: 'ignore' });
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Limpiar archivos temporales
    cleanupProdFiles();
    
    console.log('\n✅ PRODUCCIÓN - Sistema detenido correctamente!');
    console.log('🌐 Todos los tunnels de Cloudflare cerrados');
    console.log('🔍 Puertos liberados: 6001, 4000, 4001');  
    console.log('🔧 Procesos npm terminados');
    console.log('🧹 Archivos temporales limpiados');
    console.log('💡 Todas las URLs de tunnel son ahora inválidas');
    console.log('🚀 Para reiniciar: npm run prod');
    console.log('=' .repeat(58));
    
  } catch (error) {
    console.error('❌ Error deteniendo producción:', error.message);
    process.exit(1);
  }
}

main();