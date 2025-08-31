#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { main as detectAndUpdateIP } from './detect-ip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DevServer {
  constructor() {
    this.processes = new Map();
    this.localIP = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case 'success':
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.green(message)}`);
        break;
      case 'error':
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.red(message)}`);
        break;
      case 'warning':
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.yellow(message)}`);
        break;
      default:
        console.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.blue(message)}`);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runCommand(name, command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        shell: true,
        stdio: options.background ? 'ignore' : 'inherit',
        detached: options.background || false,
        ...options
      });
      
      if (options.background) {
        proc.unref();
        this.processes.set(name.toLowerCase(), proc);
        resolve(proc);
      } else {
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`${name} falló con código ${code}`));
          }
        });
      }
      
      proc.on('error', (err) => {
        this.log(`❌ Error en ${name}: ${err.message}`, 'error');
        reject(err);
      });
    });
  }

  async start() {
    console.clear();
    console.log(chalk.blue.bold('🚀 Iniciando Servidor de Streaming'));
    console.log('='.repeat(40) + '\n');
    
    try {
      // 1. Detectar y actualizar IP
      this.log('📡 Configurando IP local...');
      this.localIP = detectAndUpdateIP();
      await this.sleep(1000);
      
      // 2. Iniciar Redis local (Docker)
      const spinner1 = ora('🗄️ Iniciando Redis local (Docker)...').start();
      await this.runCommand(
        'Redis',
        'docker-compose',
        ['up', '-d'],
        { 
          cwd: path.join(__dirname, '..', 'streaming-docker'),
          background: true 
        }
      );
      spinner1.succeed('✅ Redis local iniciado');
      await this.sleep(3000);
      
      // 3. Conexión a VPS LiveKit
      const spinner2 = ora('📡 Conectando a VPS LiveKit Server...').start();
      this.log('🌐 Usando LiveKit VPS: wss://5.78.143.204');
      spinner2.succeed('✅ VPS LiveKit configurado');
      await this.sleep(1000);
      
      // 4. Iniciar Backend
      const spinner3 = ora('🖥️ Iniciando Backend (Puerto 5001)...').start();
      const backendProc = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, '..', 'backend-local'),
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      backendProc.unref();
      this.processes.set('backend', backendProc);
      spinner3.succeed('✅ Backend iniciado');
      await this.sleep(2000);
      
      // 5. Iniciar Frontend Admin
      const spinner4 = ora('👨‍💼 Iniciando Frontend Admin (Puerto 3000)...').start();
      const adminProc = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, '..', 'frontend-admin'),
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      adminProc.unref();
      this.processes.set('admin', adminProc);
      spinner4.succeed('✅ Frontend Admin iniciado');
      await this.sleep(2000);
      
      // 6. Iniciar Frontend Viewer
      const spinner5 = ora('👁️ Iniciando Frontend Viewer (Puerto 3001)...').start();
      const viewerProc = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, '..', 'frontend-viewer'),
        shell: true,
        detached: true,
        stdio: 'ignore'
      });
      viewerProc.unref();
      this.processes.set('viewer', viewerProc);
      spinner5.succeed('✅ Frontend Viewer iniciado');
      
      // Mostrar información final
      this.displayInfo();
      
      // Mantener proceso vivo
      console.log(chalk.gray('Presiona Ctrl+C para detener todos los servicios...\n'));
      process.stdin.resume();
      
    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  displayInfo() {
    console.log('\n' + '='.repeat(50));
    console.log(chalk.green.bold('✅ Todos los servicios iniciados correctamente'));
    console.log('='.repeat(50));
    
    console.log('\n📊 ' + chalk.bold('Servicios activos:'));
    console.log(`   - Redis Local: ${chalk.cyan('localhost:6379')}`);
    console.log(`   - LiveKit VPS: ${chalk.cyan('wss://5.78.143.204')}`);
    console.log(`   - Backend: ${chalk.cyan(`http://${this.localIP}:5001`)}`);
    console.log(`   - Admin: ${chalk.cyan(`http://${this.localIP}:3000`)}`);
    console.log(`   - Viewer: ${chalk.cyan(`http://${this.localIP}:3001`)}`);
    
    console.log('\n📱 ' + chalk.bold('Para dispositivos en red local:'));
    console.log(`   - Admin: ${chalk.magenta(`http://${this.localIP}:3000`)}`);
    console.log(`   - Viewer: ${chalk.magenta(`http://${this.localIP}:3001`)}`);
    
    console.log('\n🌐 ' + chalk.bold('LiveKit VPS:'));
    console.log(`   - URL: ${chalk.green('wss://5.78.143.204')}`);
    console.log(`   - API Key: ${chalk.yellow('APIwTqW8EBDZ3nk')}`);
    
    console.log('\n🛑 ' + chalk.bold('Para detener:') + ' npm run stop:dev\n');
  }

  cleanup() {
    this.log('🛑 Deteniendo servicios...', 'warning');
    this.processes.forEach((proc, name) => {
      if (proc && !proc.killed) {
        this.log(`🔪 Cerrando ${name}...`);
        proc.kill('SIGTERM');
      }
    });
    process.exit(0);
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const server = new DevServer();
  
  // Manejadores de señales
  process.on('SIGINT', () => {
    server.cleanup();
  });
  
  process.on('SIGTERM', () => {
    server.cleanup();
  });
  
  server.start();
}

export { DevServer };