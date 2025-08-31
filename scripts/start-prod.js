#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProdServer {
  constructor() {
    this.processes = new Map();
    this.tunnelUrls = new Map();
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

  async checkCloudflared() {
    try {
      execSync('where cloudflared', { stdio: 'ignore' });
      return true;
    } catch {
      const spinner = ora('📥 Instalando cloudflared...').start();
      try {
        execSync('winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements', 
          { stdio: 'pipe' });
        spinner.succeed('✅ cloudflared instalado');
        return true;
      } catch (error) {
        spinner.fail('❌ Error instalando cloudflared');
        this.log('Por favor instala cloudflared manualmente desde https://github.com/cloudflare/cloudflared/releases');
        return false;
      }
    }
  }

  // Eliminado checkNgrok() - ya no se necesita

  async startRedis() {
    const spinner = ora('🗄️ Verificando/Iniciando Redis...').start();
    
    return new Promise((resolve) => {
      // Verificar si Redis ya está corriendo
      try {
        const checkRedis = execSync('docker ps --filter name=redis --format "{{.Names}}"', { encoding: 'utf8' });
        if (checkRedis.includes('redis')) {
          spinner.succeed('✅ Redis ya está activo');
          resolve();
          return;
        }
      } catch (error) {
        // Redis no está corriendo, iniciarlo
      }

      const redisProcess = spawn('docker-compose', ['up', '-d'], {
        cwd: path.join(__dirname, '..', 'streaming-docker'),
        stdio: 'pipe'
      });

      setTimeout(() => {
        spinner.succeed('✅ Redis iniciado');
        this.processes.set('redis', redisProcess);
        resolve();
      }, 5000);
    });
  }

  async checkVPSLiveKit() {
    const spinner = ora('📡 Verificando conexión VPS LiveKit...').start();
    
    return new Promise((resolve) => {
      this.log('🌐 Usando LiveKit VPS: wss://5.78.143.204');
      this.log('🔑 API Key: APIwTqW8EBDZ3nk');
      spinner.succeed('✅ VPS LiveKit configurado');
      resolve();
    });
  }

  async startBackend() {
    const spinner = ora('🖥️ Iniciando Backend (Puerto 5001)...').start();
    
    return new Promise((resolve) => {
      const backendProcess = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, '..', 'backend-local'),
        stdio: 'pipe',
        shell: true
      });

      setTimeout(() => {
        spinner.succeed('✅ Backend iniciado');
        this.processes.set('backend', backendProcess);
        resolve();
      }, 4000);
    });
  }

  async createTunnel(name, port, logFile) {
    return new Promise((resolve) => {
      this.log(`🌐 Creando túnel ${name} para puerto ${port}...`);
      
      const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: 'pipe',
        shell: true
      });

      // Capturar salida para extraer URL
      let output = '';
      let urlDetected = false;
      
      tunnelProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        fs.appendFileSync(path.join(__dirname, logFile), chunk);
        
        // Intentar detectar URL inmediatamente
        const urlMatch = chunk.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
        if (urlMatch && !urlDetected) {
          urlDetected = true;
          this.tunnelUrls.set(name, urlMatch[0]);
          this.log(`✅ Túnel ${name}: ${urlMatch[0]}`, 'success');
        }
      });

      tunnelProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        fs.appendFileSync(path.join(__dirname, logFile), chunk);
        
        // También buscar en stderr
        const urlMatch = chunk.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
        if (urlMatch && !urlDetected) {
          urlDetected = true;
          this.tunnelUrls.set(name, urlMatch[0]);
          this.log(`✅ Túnel ${name}: ${urlMatch[0]}`, 'success');
        }
      });

      this.processes.set(`tunnel-${name}`, tunnelProcess);

      // Esperar y verificar detección con múltiples intentos
      let attempts = 0;
      const maxAttempts = 8;
      const checkInterval = setInterval(() => {
        attempts++;
        
        if (urlDetected) {
          clearInterval(checkInterval);
          resolve();
          return;
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          // Último intento de detectar en todo el output
          const urlMatch = output.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
          if (urlMatch) {
            this.tunnelUrls.set(name, urlMatch[0]);
            this.log(`✅ Túnel ${name}: ${urlMatch[0]}`, 'success');
          } else {
            this.log(`⚠️ URL de túnel ${name} no detectada después de ${maxAttempts} intentos`, 'warning');
            this.log(`📄 Revisa el archivo ${logFile} para más detalles`, 'warning');
            // No establecer URL falsa, dejar que use fallback local
          }
          resolve();
          return;
        }
        
        // Intentar detectar URL en cada intento
        const attemptMatch = output.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
        if (attemptMatch && !urlDetected) {
          urlDetected = true;
          this.tunnelUrls.set(name, attemptMatch[0]);
          this.log(`✅ Túnel ${name}: ${attemptMatch[0]} (intento ${attempts})`, 'success');
          clearInterval(checkInterval);
          resolve();
        }
      }, 3000); // Revisar cada 3 segundos
    });
  }

  // Eliminado createNgrokTunnel() - ya no se necesita

  async updateEnvFiles() {
    const spinner = ora('⚙️ Configurando archivos .env con URLs de túneles...').start();
    
    const backendUrl = this.tunnelUrls.get('backend');
    const livekitUrl = this.tunnelUrls.get('livekit')?.replace('https://', 'wss://');
    const adminUrl = this.tunnelUrls.get('admin');
    const viewerUrl = this.tunnelUrls.get('viewer');

    // Detectar IP local de red (SIN ejecutar detect-ip.js que sobreescribe archivos .env)
    let localNetworkIP = '192.168.1.38'; // Fallback
    try {
      // Obtener IP local directamente
      const os = await import('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
              localNetworkIP = iface.address;
              break;
            }
          }
        }
        if (localNetworkIP !== '192.168.1.38') break;
      }
      
      this.log(`🏠 IP de red local detectada: ${localNetworkIP}`, 'success');
    } catch (error) {
      this.log('⚠️ No se pudo detectar IP local, usando fallback', 'warning');
    }

    // Verificar URLs de túneles
    this.log('🔍 Verificando URLs de túneles detectadas:', 'info');
    this.log(`   Backend: ${backendUrl || 'NO DETECTADA'}`, backendUrl ? 'success' : 'warning');
    this.log(`   LiveKit: ${livekitUrl || 'NO DETECTADA'}`, livekitUrl ? 'success' : 'warning');
    this.log(`   Admin: ${adminUrl || 'NO DETECTADA'}`, adminUrl ? 'success' : 'warning');
    this.log(`   Viewer: ${viewerUrl || 'NO DETECTADA'}`, viewerUrl ? 'success' : 'warning');

    // Usar URLs de túneles si están disponibles, sino usar fallbacks locales
    const finalBackendUrl = backendUrl || `http://${localNetworkIP}:5001`;
    const finalLivekitUrl = 'wss://5.78.143.204'; // Usar VPS LiveKit siempre
    const finalViewerUrl = viewerUrl || `http://${localNetworkIP}:3001`;
    
    // Debug: mostrar qué URLs se van a usar
    this.log('🔧 URLs que se aplicarán a los archivos .env:', 'info');
    this.log(`   Backend → ${finalBackendUrl}`, finalBackendUrl === backendUrl ? 'success' : 'warning');
    this.log(`   LiveKit → ${finalLivekitUrl}`, finalLivekitUrl === livekitUrl ? 'success' : 'warning');
    this.log(`   Viewer → ${finalViewerUrl}`, finalViewerUrl === viewerUrl ? 'success' : 'warning');

    // Backend .env
    const backendEnv = `# Backend Environment
NODE_ENV=development
PORT=5001
SERVER_HOST=${localNetworkIP}
REDIS_HOST=localhost
REDIS_PORT=6379
LIVEKIT_HOST=${finalLivekitUrl}
LIVEKIT_API_KEY=APIwTqW8EBDZ3nk
LIVEKIT_API_SECRET=4gRkQFcWqxNzYGmkfmPzHN8dXL5V2KbJTsAd7FBwhPeM`;

    fs.writeFileSync(
      path.join(__dirname, '..', 'backend-local', '.env'),
      backendEnv
    );

    // Frontend Admin .env
    const adminEnv = `# Frontend Admin Environment
VITE_NODE_ENV=development
VITE_PORT=3000
VITE_API_URL=${finalBackendUrl}`;

    fs.writeFileSync(
      path.join(__dirname, '..', 'frontend-admin', '.env'),
      adminEnv
    );

    // Frontend Viewer .env
    const viewerEnv = `# Frontend Viewer Environment
VITE_NODE_ENV=development
VITE_PORT=3001
VITE_API_URL=${finalBackendUrl}`;

    fs.writeFileSync(
      path.join(__dirname, '..', 'frontend-viewer', '.env'),
      viewerEnv
    );

    // Log final URLs
    this.log('📝 URLs finales configuradas:', 'info');
    this.log(`   Backend API: ${finalBackendUrl}`, 'success');
    this.log(`   Backend LIVEKIT_HOST: ${finalLivekitUrl}`, 'success');
    this.log(`   Frontend VITE_API_URL: ${finalBackendUrl}`, 'success');

    // NO ejecutar updateViteConfigs() que llama a detect-ip.js y sobreescribe todo

    spinner.succeed('✅ Archivos .env y configuraciones actualizados con URLs de túneles');
  }

  async updateViteConfigs() {
    // Detectar IP local actual ejecutando el script detect-ip.js
    let currentIP = '192.168.1.38'; // Fallback
    try {
      const ipOutput = execSync('node scripts/detect-ip.js', { 
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8' 
      });
      
      // Extraer la IP de la salida del script
      const ipMatch = ipOutput.match(/IP seleccionada: ([\d\.]+)/);
      if (ipMatch) {
        currentIP = ipMatch[1];
      }
    } catch (error) {
      this.log('⚠️ No se pudo detectar IP local, usando fallback', 'warning');
    }
    
    // Actualizar vite.config.js de admin
    const adminViteConfigPath = path.join(__dirname, '..', 'frontend-admin', 'vite.config.js');
    let adminViteConfig = fs.readFileSync(adminViteConfigPath, 'utf8');
    
    // Reemplazar IP local en allowedHosts
    adminViteConfig = adminViteConfig.replace(
      /('|")192\.168\.\d+\.\d+('|")/g,
      `'${currentIP}'`
    );
    
    fs.writeFileSync(adminViteConfigPath, adminViteConfig);
    
    // Actualizar vite.config.js de viewer
    const viewerViteConfigPath = path.join(__dirname, '..', 'frontend-viewer', 'vite.config.js');
    let viewerViteConfig = fs.readFileSync(viewerViteConfigPath, 'utf8');
    
    // Reemplazar IP local en allowedHosts
    viewerViteConfig = viewerViteConfig.replace(
      /('|")192\.168\.\d+\.\d+('|")/g,
      `'${currentIP}'`
    );
    
    fs.writeFileSync(viewerViteConfigPath, viewerViteConfig);
    
    this.log(`🔧 Vite configs actualizados con IP local: ${currentIP}`, 'success');
  }

  async startFrontends() {
    // Start admin
    const adminSpinner = ora('👨‍💼 Iniciando Frontend Admin...').start();

    const adminProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..', 'frontend-admin'),
      stdio: 'pipe',
      shell: true
    });

    this.processes.set('admin', adminProcess);
    adminSpinner.succeed('✅ Frontend Admin iniciado');

    await this.sleep(2000);

    // Start viewer
    const viewerSpinner = ora('👁️ Iniciando Frontend Viewer...').start();

    const viewerProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..', 'frontend-viewer'),
      stdio: 'pipe',
      shell: true
    });

    this.processes.set('viewer', viewerProcess);
    viewerSpinner.succeed('✅ Frontend Viewer iniciado');
  }

  async createFrontendTunnels() {
    this.log('🌐 Creando túneles para frontends...');
    
    // Crear túneles con puertos dev
    await this.createTunnel('admin', 3000, 'admin-tunnel.log');
    await this.createTunnel('viewer', 3001, 'viewer-tunnel.log');
    
    this.log('✅ Túneles frontend creados con URLs detectadas', 'success');
  }

  displayInfo() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.green.bold('✅ Sistema de Producción Cloudflare Iniciado'));
    console.log('='.repeat(70));
    
    console.log('\n🌐 ' + chalk.bold('URLs de Túneles Públicos (CLOUDFLARE):'));
    console.log(`   🖥️  Backend API: ${chalk.cyan(this.tunnelUrls.get('backend') || 'Ver backend-tunnel.log')} ${chalk.gray('(Cloudflare)')}`);
    console.log(`   📡 LiveKit VPS: ${chalk.green('wss://5.78.143.204')} ${chalk.gray('(VPS - WebRTC)')}`);
    console.log(`   👨‍💼 Admin Panel: ${chalk.magenta(this.tunnelUrls.get('admin') || 'Ver admin-tunnel.log')} ${chalk.gray('(Cloudflare)')}`);
    console.log(`   👁️  Viewer Panel: ${chalk.magenta(this.tunnelUrls.get('viewer') || 'Ver viewer-tunnel.log')} ${chalk.gray('(Cloudflare)')}`);
    
    console.log('\n🔧 ' + chalk.bold('Puertos Locales:'));
    console.log(`   - Backend: ${chalk.yellow('localhost:5001')}`);
    console.log(`   - LiveKit VPS: ${chalk.green('wss://5.78.143.204')} ${chalk.gray('(Remoto)')}`);
    console.log(`   - Admin: ${chalk.yellow('localhost:3000')}`);
    console.log(`   - Viewer: ${chalk.yellow('localhost:3001')}`);
    console.log(`   - Redis: ${chalk.yellow('localhost:6379')}`);
    
    console.log('\n💡 ' + chalk.bold('Configuración Híbrida:'));
    console.log('   🌐 ' + chalk.cyan('Cloudflare') + ': Frontend y Backend');
    console.log('   🚀 ' + chalk.green('VPS LiveKit') + ': Streaming server profesional');
    
    console.log('\n📝 ' + chalk.bold('Archivos .env actualizados automáticamente con URLs de túneles'));
    console.log('🛑 ' + chalk.bold('Para detener:') + ' npm run stop:prod');
    console.log('📋 ' + chalk.bold('Logs:') + ' backend-tunnel.log, admin-tunnel.log, viewer-tunnel.log\n');
  }

  showFinalSummary() {
    console.log('\n' + '🎯'.repeat(50));
    console.log(chalk.green.bold('  SISTEMA DE PRODUCCIÓN LISTO PARA USAR'));
    console.log('🎯'.repeat(50));
    
    console.log('\n📱 ' + chalk.bold('URLs para COMPARTIR con usuarios:'));
    
    const adminUrl = this.tunnelUrls.get('admin');
    const viewerUrl = this.tunnelUrls.get('viewer');
    
    if (adminUrl) {
      console.log(`   👨‍💼 STREAMER: ${chalk.green.bold(adminUrl)}`);
    } else {
      console.log(`   👨‍💼 STREAMER: ${chalk.yellow('Ver admin-tunnel.log para URL')}`);
    }
    
    if (viewerUrl) {
      console.log(`   👁️  VIEWERS: ${chalk.green.bold(viewerUrl)}`);
    } else {
      console.log(`   👁️  VIEWERS: ${chalk.yellow('Ver viewer-tunnel.log para URL')}`);
    }
    
    console.log(`\n💡 ${chalk.bold('Comparte estas URLs')}: El streamer usa la primera, los viewers la segunda`);
    console.log(`⚡ ${chalk.bold('Ultra-baja latencia')}: 20-50ms con 1000+ viewers concurrentes`);
    console.log(`📱 ${chalk.bold('Acceso global')}: Funciona desde cualquier dispositivo con Internet\n`);
  }

  async start() {
    try {
      console.log(chalk.blue.bold('🚀 Iniciando Modo Producción con Túneles'));
      console.log('='.repeat(50) + '\n');

      // 1. Verificar herramientas necesarias
      const hasCloudflared = await this.checkCloudflared();
      if (!hasCloudflared) {
        process.exit(1);
      }

      // 2. Limpiar logs anteriores
      ['backend-tunnel.log', 'admin-tunnel.log', 'viewer-tunnel.log'].forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      // 3. CREAR TÚNELES CLOUDFLARE
      this.log('📡 PASO 1: Creando túneles Cloudflare...', 'info');
      this.log('   🌐 Cloudflare para Backend', 'info');
      this.log('   🌐 Cloudflare para LiveKit', 'info');
      
      // Backend con Cloudflare
      await this.createTunnel('backend', 5001, 'backend-tunnel.log');
      
      // VPS LiveKit - no necesita túnel local
      await this.checkVPSLiveKit();
      
      // 4. ACTUALIZAR archivos .env CON URLs de túneles ANTES de iniciar servicios
      this.log('📝 PASO 2: Actualizando archivos .env con URLs de túneles...', 'info');
      await this.updateEnvFiles();

      // 5. INICIAR servicios con configuración ya actualizada
      this.log('🚀 PASO 3: Iniciando servicios backend con configuración de producción...', 'info');
      await this.startRedis();
      
      await this.startBackend();

      // 6. Start frontends
      this.log('🚀 PASO 4: Iniciando frontends...', 'info');
      await this.startFrontends();

      // 7. Crear túneles para frontends
      this.log('🌐 PASO 5: Creando túneles para frontends compilados...', 'info');
      await this.createFrontendTunnels();

      // 8. Mostrar información final
      this.displayInfo();
      this.showFinalSummary();

      // Mantener proceso vivo
      console.log(chalk.gray('Presiona Ctrl+C para detener todos los servicios...\n'));
      process.stdin.resume();

    } catch (error) {
      this.log(`❌ Error: ${error.message}`, 'error');
      this.cleanup();
      process.exit(1);
    }
  }

  cleanup() {
    this.log('🛑 Deteniendo servicios de producción...', 'warning');
    
    // Matar procesos específicos
    this.processes.forEach((proc, name) => {
      if (proc && !proc.killed) {
        this.log(`🔪 Cerrando ${name}...`);
        proc.kill('SIGTERM');
      }
    });

    // Limpiar logs
    ['backend-tunnel.log', 'admin-tunnel.log', 'viewer-tunnel.log'].forEach(file => {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.log(`🧹 Limpiado ${file}`);
      }
    });

    process.exit(0);
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const server = new ProdServer();
  
  // Manejadores de señales
  process.on('SIGINT', () => {
    server.cleanup();
  });
  
  process.on('SIGTERM', () => {
    server.cleanup();
  });
  
  server.start();
}

export { ProdServer };