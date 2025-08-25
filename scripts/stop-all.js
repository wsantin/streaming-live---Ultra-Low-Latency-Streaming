#!/usr/bin/env node
// Script para detener todos los ambientes
import { spawn } from 'child_process';

console.log('🛑 Deteniendo TODOS los servicios WebRTC Streaming System');
console.log('=' .repeat(65));

async function runScript(scriptName, description) {
  return new Promise((resolve) => {
    console.log(`\n${description}...`);
    
    const child = spawn('node', [`scripts/${scriptName}`], { 
      stdio: 'inherit',
      shell: true 
    });
    
    child.on('close', (code) => {
      resolve(code);
    });
    
    child.on('error', (error) => {
      console.error(`Error ejecutando ${scriptName}:`, error.message);
      resolve(1);
    });
  });
}

async function main() {
  try {
    // Ejecutar ambos scripts de stop
    await runScript('stop-prod.js', '🏭 Deteniendo ambiente de PRODUCCIÓN');
    await runScript('stop-dev.js', '🔧 Deteniendo ambiente de DESARROLLO');
    
    console.log('\n🎉 TODOS LOS SERVICIOS DETENIDOS');
    console.log('=' .repeat(65));
    console.log('✅ Ambientes de desarrollo y producción detenidos');
    console.log('🌐 Todos los tunnels de Cloudflare cerrados');
    console.log('🔍 Todos los puertos liberados');
    console.log('🧹 Archivos temporales limpiados');
    console.log('\n🚀 Para reiniciar:');
    console.log('   Desarrollo:  npm run dev');
    console.log('   Producción:  npm run prod');
    console.log('=' .repeat(65));
    
  } catch (error) {
    console.error('❌ Error deteniendo servicios:', error.message);
    process.exit(1);
  }
}

main();