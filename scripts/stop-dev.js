#!/usr/bin/env node
// Script para detener ambiente de desarrollo
import { spawn } from 'child_process';

console.log('🛑 Deteniendo WebRTC Streaming System - DESARROLLO');
console.log('=' .repeat(55));

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

async function main() {
  try {
    // Detener servicios por puerto
    await Promise.all([
      killProcessByPort(5001, 'Backend'),
      killProcessByPort(3000, 'Admin Frontend'), 
      killProcessByPort(3001, 'Viewer Frontend')
    ]);
    
    // Matar procesos npm/nodemon restantes
    console.log('\n🔧 Limpiando procesos npm/nodemon...');
    
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/IM', 'npm.exe'], { stdio: 'ignore' });
      spawn('taskkill', ['/F', '/IM', 'nodemon.exe'], { stdio: 'ignore' });
      spawn('taskkill', ['/F', '/IM', 'node.exe', '/FI', 'WINDOWTITLE eq *streaming*'], { stdio: 'ignore' });
    } else {
      spawn('pkill', ['-f', 'npm.*streaming'], { stdio: 'ignore' });
      spawn('pkill', ['-f', 'nodemon.*streaming'], { stdio: 'ignore' });
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n✅ DESARROLLO - Sistema detenido correctamente!');
    console.log('🔍 Puertos liberados: 5001, 3000, 3001');
    console.log('🔧 Procesos npm/nodemon terminados');
    console.log('🚀 Para reiniciar: npm run dev');
    console.log('=' .repeat(55));
    
  } catch (error) {
    console.error('❌ Error deteniendo desarrollo:', error.message);
    process.exit(1);
  }
}

main();