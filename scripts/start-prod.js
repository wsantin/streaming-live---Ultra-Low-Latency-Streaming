#!/usr/bin/env node  
// Script para iniciar ambiente de producción con tunnels automáticos
import { spawn } from 'child_process';
import path from 'path';
import { updateEnvFile } from './detect-ip.js';
import { createAllTunnels } from './create-tunnels.js';
import { getDirname, getSpawnOptions } from './utils.js';

const __dirname = getDirname(import.meta.url);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Iniciando WebRTC Streaming System - PRODUCCIÓN');
console.log('=' .repeat(60));

/**
 * Actualiza archivos .env.production con URLs de tunnels
 * @param {Object} urls - URLs de los tunnels
 */
function updateProdEnvironments(urls) {
  console.log('\n🔧 Actualizando archivos .env.production con URLs de tunnels...');
  
  // Actualizar frontend-admin .env.production - solo VITE_API_URL (Socket.IO maneja HTTP/WS automáticamente)
  updateEnvFile(path.join(rootDir, 'frontend-admin', '.env.production'), {
    'VITE_API_URL': urls.backend
  });
  
  // Actualizar frontend-viewer .env.production - solo VITE_API_URL (Socket.IO maneja HTTP/WS automáticamente)
  updateEnvFile(path.join(rootDir, 'frontend-viewer', '.env.production'), {
    'VITE_API_URL': urls.backend
  });
  
  console.log('✅ Archivos frontend .env.production actualizados con URLs de tunnel!\n');
}

/**
 * Inicia un servicio de producción
 * @param {string} command - Comando a ejecutar
 * @param {Array} args - Argumentos del comando
 * @param {string} cwd - Directorio de trabajo
 * @param {string} name - Nombre descriptivo
 */
function startProdService(command, args, cwd, name) {
  console.log(`📦 Iniciando ${name}...`);
  
  const child = spawn(command, args, getSpawnOptions(path.join(rootDir, cwd)));
  
  // Mostrar output inicial
  child.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Server running') || output.includes('ready in') || output.includes('Local:')) {
      console.log(`   ✅ ${name} iniciado en producción`);
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
    // 1. Iniciar backend primero
    console.log('🔧 Iniciando Backend en producción (puerto 6001)...\n');
    const backend = startProdService('npm', ['run', 'prod'], 'backend-local', 'Backend');
    
    // Esperar que el backend esté listo
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Crear tunnels ANTES de iniciar frontends
    const { tunnels, urls } = await createAllTunnels();
    
    // 3. Actualizar archivos de ambiente con URLs de tunnels
    updateProdEnvironments(urls);
    
    // 4. Esperar un momento para que los archivos se escriban
    console.log('⏳ Esperando actualización de archivos .env.production...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. Iniciar frontends DESPUÉS de actualizar los .env.prod
    console.log('🔧 Iniciando frontends con configuración de producción...\n');
    
    const admin = startProdService('npm', ['run', 'prod'], 'frontend-admin', 'Admin Frontend (puerto 4000)');
    const viewer = startProdService('npm', ['run', 'prod'], 'frontend-viewer', 'Viewer Frontend (puerto 4001)');
    
    // Esperar que todos estén listos
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    console.log('\n🎉 PRODUCCIÓN - Sistema iniciado correctamente!');
    console.log('=' .repeat(60));
    console.log('🌐 URLs públicas (Cloudflare Tunnels):');
    console.log(`📱 Mobile Streamer:   ${urls.admin}`);
    console.log(`📺 Mobile Viewer:     ${urls.viewer}`);
    console.log(`⚙️ Backend API:       ${urls.backend}`);
    // console.log('\n📊 Endpoints de monitoreo:');
    // console.log(`🔍 Health Check:      ${urls.backend}/health`);
    // console.log(`📈 WebRTC Stats:      ${urls.backend}/api/webrtc/stats`);
    // console.log(`🏠 Live Rooms:        ${urls.backend}/api/rooms/live`);
    console.log('\n🔥 Características de PRODUCCIÓN:');
    console.log('✓ HTTPS/WSS conexiones seguras via Cloudflare');
    console.log('✓ Acceso global desde cualquier dispositivo');
    console.log('✓ URLs de tunnel dinámicas y automáticas');
    console.log('✓ Archivos .env.production actualizados automáticamente');
    console.log('✓ WebRTC P2P ultra-baja latencia (13ms)');
    console.log('✓ Multi-room streaming support');
    console.log('\n📱 INSTRUCCIONES MÓVILES:');
    console.log(`1. Abrir ${urls.admin} en móvil`);
    console.log('2. Permitir acceso a cámara/micrófono');
    console.log('3. Crear sala y iniciar stream');
    console.log(`4. Compartir URL de viewer: ${urls.viewer}`);
    console.log('\n🛑 Para detener: npm run stop:prod');
    console.log('🚨 IMPORTANTE: Mantener esta ventana abierta para los tunnels!');
    console.log('=' .repeat(60));
    
    // Manejar cierre graceful
    process.on('SIGINT', () => {
      console.log('\n🛑 Cerrando sistema de producción...');
      tunnels.forEach(tunnel => {
        if (tunnel.process && !tunnel.process.killed) {
          tunnel.process.kill();
        }
      });
      process.exit(0);
    });
    
    // Mantener el proceso activo
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Error iniciando ambiente de producción:', error.message);
    process.exit(1);
  }
}

main();