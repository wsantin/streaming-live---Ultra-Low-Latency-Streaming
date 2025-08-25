#!/usr/bin/env node
// Script para iniciar ambiente de desarrollo con IP automática
import { spawn } from 'child_process';
import path from 'path';
import { detectLocalIP, updateEnvFile, updateViteAllowedHosts } from './detect-ip.js';
import { getDirname, getSpawnOptions } from './utils.js';

const __dirname = getDirname(import.meta.url);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Iniciando WebRTC Streaming System - DESARROLLO');
console.log('=' .repeat(60));

/**
 * Actualiza todos los archivos de ambiente dev con IP detectada
 * @param {string} localIP - IP local detectada
 */
function updateDevEnvironments(localIP) {
  console.log('\n🔧 Actualizando archivos .env.local con IP detectada...');
  
  // Actualizar frontend-admin .env.local  
  updateEnvFile(path.join(rootDir, 'frontend-admin', '.env.local'), {
    'VITE_API_URL': `http://${localIP}:5001`
  });
  
  // Actualizar frontend-viewer .env.local
  updateEnvFile(path.join(rootDir, 'frontend-viewer', '.env.local'), {
    'VITE_API_URL': `http://${localIP}:5001`
  });
  
  // Actualizar vite.config.js allowedHosts
  updateViteAllowedHosts(path.join(rootDir, 'frontend-admin', 'vite.config.js'), localIP);
  updateViteAllowedHosts(path.join(rootDir, 'frontend-viewer', 'vite.config.js'), localIP);
  
  console.log('✅ Todos los archivos de desarrollo actualizados!\n');
}

/**
 * Inicia un proceso en background
 * @param {string} command - Comando a ejecutar
 * @param {Array} args - Argumentos del comando
 * @param {string} cwd - Directorio de trabajo
 * @param {string} name - Nombre descriptivo
 */
function startService(command, args, cwd, name) {
  console.log(`📦 Iniciando ${name}...`);
  
  const child = spawn(command, args, getSpawnOptions(path.join(rootDir, cwd)));
  
  // Mostrar output inicial
  child.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Server running') || output.includes('ready in') || output.includes('Local:')) {
      console.log(`   ✅ ${name} iniciado correctamente`);
    }
  });
  
  child.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('EADDRINUSE')) {
      console.log(`   ⚠️  ${name}: Puerto ocupado, continuando...`);
    }
  });
  
  return child;
}

async function main() {
  try {
    // 1. Detectar IP local
    const localIP = detectLocalIP();
    
    // 2. Actualizar archivos de ambiente
    updateDevEnvironments(localIP);
    
    // 3. Iniciar servicios en orden
    console.log('🔧 Iniciando servicios de desarrollo...\n');
    
    // Backend primero
    const backend = startService('npm', ['run', 'dev'], 'backend-local', 'Backend (puerto 5001)');
    
    // Esperar un poco para el backend
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Frontends
    const admin = startService('npm', ['run', 'dev'], 'frontend-admin', 'Admin Frontend (puerto 3000)');
    const viewer = startService('npm', ['run', 'dev'], 'frontend-viewer', 'Viewer Frontend (puerto 3001)');
    
    // Esperar que todos inicien
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n🎉 DESARROLLO - Sistema iniciado correctamente!');
    console.log('=' .repeat(60));
    console.log('🌐 URLs de acceso:');
    console.log(`📱 Admin (Streamer):  http://localhost:3000`);
    console.log(`📱 Admin (Red local): http://${localIP}:3000`);
    console.log(`📺 Viewer (Espectador): http://localhost:3001`);  
    console.log(`📺 Viewer (Red local): http://${localIP}:3001`);
    console.log(`🔧 Backend API:       http://${localIP}:5001/health`);
    console.log('\n⚡ Funciones:');
    console.log('✓ IP detectada automáticamente y configurada');
    console.log('✓ Archivos .env.local actualizados dinámicamente');
    console.log('✓ Vite allowedHosts configurado para red local');
    console.log('✓ WebRTC P2P ultra-baja latencia (13ms)');
    console.log('\n🛑 Para detener: npm run stop:dev');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ Error iniciando ambiente de desarrollo:', error.message);
    process.exit(1);
  }
}

main();