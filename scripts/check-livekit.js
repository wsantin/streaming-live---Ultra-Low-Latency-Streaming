#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LiveKitChecker {
  constructor() {
    this.livekitPath = path.join(__dirname, '..', 'livekit-native', 'livekit-server.exe');
  }

  log(message, type = 'info') {
    switch (type) {
      case 'success':
        console.log(chalk.green(message));
        break;
      case 'error':
        console.log(chalk.red(message));
        break;
      case 'warning':
        console.log(chalk.yellow(message));
        break;
      case 'info':
        console.log(chalk.blue(message));
        break;
      default:
        console.log(message);
    }
  }

  checkFileExists() {
    this.log('🔍 Verificando LiveKit Server...\n');
    
    if (!fs.existsSync(this.livekitPath)) {
      this.log('❌ ERROR: livekit-server.exe no encontrado en livekit-native\\', 'error');
      this.log('   Por favor, descarga LiveKit desde: https://github.com/livekit/livekit/releases');
      return false;
    }
    
    this.log('✅ livekit-server.exe encontrado', 'success');
    return true;
  }

  checkIfRunning() {
    try {
      const output = execSync('tasklist /fi "imagename eq livekit-server.exe"', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      if (output.includes('livekit-server.exe')) {
        this.log('✅ LiveKit Server está ejecutándose', 'success');
        return true;
      } else {
        this.log('⚠️ LiveKit Server NO está ejecutándose', 'warning');
        return false;
      }
    } catch (error) {
      this.log('⚠️ Error verificando si LiveKit está ejecutándose', 'warning');
      return false;
    }
  }

  checkPorts() {
    this.log('\n📊 Estado de puertos:');
    
    const ports = [
      { port: 7880, name: 'LiveKit WS' },
      { port: 7881, name: 'LiveKit TCP' }
    ];

    ports.forEach(({ port, name }) => {
      try {
        const output = execSync(`netstat -an | findstr :${port}`, { 
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        if (output.trim()) {
          this.log(`   - Puerto ${port} (${name}):`, 'info');
          output.split('\n').forEach(line => {
            if (line.trim()) {
              console.log(`     ${chalk.cyan(line.trim())}`);
            }
          });
        } else {
          this.log(`   - Puerto ${port} (${name}): ${chalk.gray('No activo')}`, 'warning');
        }
      } catch (error) {
        this.log(`   - Puerto ${port} (${name}): ${chalk.gray('No activo')}`, 'warning');
      }
    });
  }

  getFileInfo() {
    try {
      const stats = fs.statSync(this.livekitPath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      this.log('\n📁 Información del archivo:');
      this.log(`   - Tamaño: ${chalk.cyan(sizeInMB + ' MB')}`);
      this.log(`   - Modificado: ${chalk.cyan(stats.mtime.toLocaleString())}`);
    } catch (error) {
      this.log('⚠️ No se pudo obtener información del archivo', 'warning');
    }
  }

  testConnection() {
    this.log('\n🔗 Probando conexión HTTP...');
    
    try {
      // Usar curl si está disponible, sino usar comando alternativo
      const output = execSync('curl -s -w "%{http_code}" http://localhost:7880 -o nul', { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 5000
      });
      
      const statusCode = output.trim();
      if (statusCode === '404' || statusCode === '200') {
        this.log('✅ LiveKit Server responde correctamente', 'success');
      } else {
        this.log(`⚠️ LiveKit Server responde con código: ${statusCode}`, 'warning');
      }
    } catch (error) {
      this.log('❌ No se pudo conectar a LiveKit Server (puerto 7880)', 'error');
      this.log('   Asegúrate de que LiveKit esté ejecutándose');
    }
  }

  displayHelp() {
    this.log('\n' + '='.repeat(50));
    this.log('📚 Comandos útiles:');
    this.log('='.repeat(50));
    
    this.log('\n🚀 Para iniciar LiveKit manualmente:');
    console.log(chalk.gray('   cd livekit-native'));
    console.log(chalk.gray('   .\\livekit-server.exe --config=..\\livekit-native-config.yaml'));
    
    this.log('\n🛑 Para detener LiveKit:');
    console.log(chalk.gray('   taskkill /f /im livekit-server.exe'));
    
    this.log('\n📊 Para ver procesos activos:');
    console.log(chalk.gray('   tasklist | findstr livekit'));
    
    this.log('\n🌐 Para probar conexión:');
    console.log(chalk.gray('   curl http://localhost:7880'));
    
    this.log('\n📁 Ubicación del ejecutable:');
    console.log(chalk.gray(`   ${this.livekitPath}`));
  }

  async check() {
    console.log(chalk.blue.bold('🔍 LiveKit Server - Verificación de Estado'));
    console.log('='.repeat(45) + '\n');

    const fileExists = this.checkFileExists();
    
    if (fileExists) {
      this.getFileInfo();
      this.checkIfRunning();
      this.checkPorts();
      this.testConnection();
    }
    
    this.displayHelp();
    
    console.log('\n' + '='.repeat(50));
    console.log(chalk.blue.bold('Verificación completada'));
    console.log('='.repeat(50) + '\n');
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const checker = new LiveKitChecker();
  checker.check();
}

export { LiveKitChecker };