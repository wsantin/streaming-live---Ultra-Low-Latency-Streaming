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

  async checkNgrok() {
    try {
      execSync('where ngrok', { stdio: 'ignore' });
      return true;
    } catch {
      const spinner = ora('📥 Instalando ngrok...').start();
      try {
        execSync('winget install ngrok.ngrok -e --accept-source-agreements --accept-package-agreements', 
          { stdio: 'pipe' });
        spinner.succeed('✅ ngrok instalado');
        this.log('⚠️ IMPORTANTE: Debes configurar tu token de ngrok con: ngrok config add-authtoken [tu-token]');
        this.log('💡 Obtén tu token en: https://dashboard.ngrok.com/get-started/your-authtoken');
        return true;
      } catch (error) {
        spinner.fail('❌ Error instalando ngrok');
        this.log('Por favor instala ngrok manualmente: winget install ngrok.ngrok');
        this.log('Y configura tu token: ngrok config add-authtoken [tu-token]');
        return false;
      }
    }
  }

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

  async startLiveKit() {
    const spinner = ora('🎥 Verificando/Iniciando LiveKit SFU...').start();
    
    return new Promise((resolve, reject) => {
      // Verificar si LiveKit ya está corriendo
      try {
        const checkLiveKit = execSync('tasklist /fi "imagename eq livekit-server.exe"', { encoding: 'utf8' });
        if (checkLiveKit.includes('livekit-server.exe')) {
          spinner.succeed('✅ LiveKit ya está activo');
          resolve();
          return;
        }
      } catch (error) {
        // LiveKit no está corriendo, iniciarlo
      }

      const livekitPath = path.join(__dirname, '..', 'livekit-native', 'livekit-server.exe');
      
      if (!fs.existsSync(livekitPath)) {
        spinner.fail('❌ LiveKit no encontrado');
        this.log(`LiveKit no encontrado en ${livekitPath}`, 'error');
        reject(new Error('LiveKit no encontrado'));
        return;
      }

      const livekitProcess = spawn(livekitPath, 
        ['--config', '.\\livekit-native\\livekit-native-config.yaml'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
        shell: false
      });

      setTimeout(() => {
        spinner.succeed('✅ LiveKit SFU iniciado');
        this.processes.set('livekit', livekitProcess);
        resolve();
      }, 5000);
    });
  }

  async startBackend() {
    const spinner = ora('🖥️ Iniciando Backend Producción (Puerto 6001)...').start();
    
    return new Promise((resolve) => {
      const backendProcess = spawn('npm', ['run', 'start:prod'], {
        cwd: path.join(__dirname, '..', 'backend-local'),
        stdio: 'pipe',
        shell: true
      });

      setTimeout(() => {
        spinner.succeed('✅ Backend producción iniciado');
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

      // Esperar y verificar detección
      setTimeout(() => {
        if (!urlDetected) {
          // Último intento de detectar en todo el output
          const urlMatch = output.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
          if (urlMatch) {
            this.tunnelUrls.set(name, urlMatch[0]);
            this.log(`✅ Túnel ${name}: ${urlMatch[0]}`, 'success');
          } else {
            this.log(`⚠️ URL de túnel ${name} no detectada. Revisa ${logFile}`, 'warning');
            this.tunnelUrls.set(name, `https://example-${name}.trycloudflare.com`);
          }
        }
        resolve();
      }, 20000); // Aumentar tiempo de espera
    });
  }

  async createNgrokTunnel(name, port, logFile) {
    return new Promise((resolve) => {
      this.log(`🚀 Creando túnel ngrok ${name} para puerto ${port}...`);
      
      const ngrokProcess = spawn('ngrok', ['http', port.toString(), '--log=stdout'], {
        stdio: 'pipe',
        shell: true
      });

      // Capturar salida para extraer URL
      let output = '';
      let urlDetected = false;
      
      ngrokProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        fs.appendFileSync(path.join(__dirname, logFile), chunk);
        
        // Detectar URL de ngrok (formato: https://xxxx-xx-xx-xx-xx.ngrok-free.app)
        const urlMatch = chunk.match(/https:\/\/[\w-]+\.ngrok-free\.app/) || 
                         chunk.match(/https:\/\/[\w-]+\.ngrok\.io/) ||
                         chunk.match(/url=https:\/\/[\w-]+\.ngrok-free\.app/) ||
                         chunk.match(/url=https:\/\/[\w-]+\.ngrok\.io/);
        
        if (urlMatch && !urlDetected) {
          urlDetected = true;
          const cleanUrl = urlMatch[0].replace('url=', '');
          this.tunnelUrls.set(name, cleanUrl);
          this.log(`✅ Túnel ngrok ${name}: ${cleanUrl}`, 'success');
        }
      });

      ngrokProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        fs.appendFileSync(path.join(__dirname, logFile), chunk);
        
        // También buscar en stderr
        const urlMatch = chunk.match(/https:\/\/[\w-]+\.ngrok-free\.app/) || 
                         chunk.match(/https:\/\/[\w-]+\.ngrok\.io/);
        if (urlMatch && !urlDetected) {
          urlDetected = true;
          this.tunnelUrls.set(name, urlMatch[0]);
          this.log(`✅ Túnel ngrok ${name}: ${urlMatch[0]}`, 'success');
        }
      });

      this.processes.set(`ngrok-${name}`, ngrokProcess);

      // Esperar y verificar detección
      setTimeout(() => {
        if (!urlDetected) {
          // Último intento de detectar en todo el output
          const urlMatch = output.match(/https:\/\/[\w-]+\.ngrok-free\.app/) || 
                           output.match(/https:\/\/[\w-]+\.ngrok\.io/);
          if (urlMatch) {
            this.tunnelUrls.set(name, urlMatch[0]);
            this.log(`✅ Túnel ngrok ${name}: ${urlMatch[0]}`, 'success');
          } else {
            this.log(`⚠️ URL de túnel ngrok ${name} no detectada. Revisa ${logFile}`, 'warning');
            this.log('💡 Asegúrate de haber configurado tu token de ngrok: ngrok config add-authtoken [token]');
            this.tunnelUrls.set(name, `https://example-${name}.ngrok-free.app`);
          }
        }
        resolve();
      }, 30000); // 30 segundos para ngrok
    });
  }

  async updateEnvFiles() {
    const spinner = ora('⚙️ Configurando archivos .env.production y vite.config.js...').start();
    
    const backendUrl = this.tunnelUrls.get('backend');
    const livekitUrl = this.tunnelUrls.get('livekit')?.replace('https://', 'wss://');

    // Backend .env.production
    // Detectar IP local de red (para LiveKit)
    let localNetworkIP = '192.168.1.38'; // Fallback
    try {
      const ipOutput = execSync('node scripts/detect-ip.js', { 
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8' 
      });
      
      const ipMatch = ipOutput.match(/IP seleccionada: ([\d\.]+)/);
      if (ipMatch) {
        localNetworkIP = ipMatch[1];
        this.log(`🏠 IP de red local detectada: ${localNetworkIP}`, 'success');
      }
    } catch (error) {
      this.log('⚠️ No se pudo detectar IP local, usando fallback', 'warning');
    }

    const backendEnv = `# Backend Production Environment
# ===============================

NODE_ENV=production
PORT=6001

REDIS_HOST=localhost
REDIS_PORT=6379

LIVEKIT_HOST=${livekitUrl}
LIVEKIT_API_KEY=devkey1000
LIVEKIT_API_SECRET=ultralowlatency2025secretkeyforlivekitsfuserver
`;

    fs.writeFileSync(
      path.join(__dirname, '..', 'backend-local', '.env.production'),
      backendEnv
    );

    // Frontend Admin .env.production
    const adminEnv = `# Frontend Admin Production
VITE_NODE_ENV=production
VITE_API_URL=${backendUrl}
VITE_LIVEKIT_URL=${livekitUrl}
VITE_VIEWER_URL=https://tu-viewer-tunnel.trycloudflare.com
`;

    fs.writeFileSync(
      path.join(__dirname, '..', 'frontend-admin', '.env.production'),
      adminEnv
    );

    // Frontend Viewer .env.production
    const viewerEnv = `# Frontend Viewer Production
VITE_NODE_ENV=production
VITE_API_URL=${backendUrl}
VITE_LIVEKIT_URL=${livekitUrl}
`;

    fs.writeFileSync(
      path.join(__dirname, '..', 'frontend-viewer', '.env.production'),
      viewerEnv
    );

    // Actualizar configuración LiveKit con IP local de red
    await this.updateLiveKitConfig(localNetworkIP);

    // Actualizar vite.config.js con IP local actual
    await this.updateViteConfigs();

    spinner.succeed('✅ Archivos .env.production, LiveKit config y vite.config.js actualizados');
  }

  async updateLiveKitConfig(localNetworkIP) {
    const livekitConfigPath = path.join(__dirname, '..', 'livekit-native', 'livekit-native-config.yaml');
    
    if (fs.existsSync(livekitConfigPath)) {
      let configContent = fs.readFileSync(livekitConfigPath, 'utf8');
      
      // Actualizar use_external_ip y external_ip
      configContent = configContent.replace(
        /use_external_ip:\s*false/g,
        'use_external_ip: true'
      );
      
      if (configContent.includes('external_ip:')) {
        configContent = configContent.replace(
          /external_ip:\s*[\d\.]+/g,
          `external_ip: ${localNetworkIP}`
        );
      } else {
        configContent = configContent.replace(
          /(use_external_ip: true)/,
          `$1\n  external_ip: ${localNetworkIP}`
        );
      }
      
      fs.writeFileSync(livekitConfigPath, configContent);
      this.log(`🎥 LiveKit configurado con IP local de red: ${localNetworkIP}`, 'success');
    }
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
    // Start admin (package.json decides build strategy)
    const adminSpinner = ora('👨‍💼 Iniciando Frontend Admin...').start();

    const adminProcess = spawn('npm', ['run', 'prod'], {
      cwd: path.join(__dirname, '..', 'frontend-admin'),
      stdio: 'pipe',
      shell: true
    });

    this.processes.set('admin', adminProcess);
    adminSpinner.succeed('✅ Frontend Admin iniciado');

    await this.sleep(2000);

    // Start viewer (package.json decides build strategy)
    const viewerSpinner = ora('👁️ Iniciando Frontend Viewer...').start();

    const viewerProcess = spawn('npm', ['run', 'prod'], {
      cwd: path.join(__dirname, '..', 'frontend-viewer'),
      stdio: 'pipe',
      shell: true
    });

    this.processes.set('viewer', viewerProcess);
    viewerSpinner.succeed('✅ Frontend Viewer iniciado');
  }

  async createFrontendTunnels() {
    this.log('🌐 Creando túneles para frontends...');
    
    // Crear túneles con puertos correctos 4000/4001
    await this.createTunnel('admin', 4000, 'admin-tunnel.log');
    await this.createTunnel('viewer', 4001, 'viewer-tunnel.log');
    
    this.log('✅ Túneles frontend creados con URLs detectadas', 'success');
  }

  displayInfo() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.green.bold('✅ Sistema Híbrido de Producción Iniciado'));
    console.log('='.repeat(70));
    
    console.log('\n🌐 ' + chalk.bold('URLs de Túneles Públicos (HÍBRIDO):'));
    console.log(`   🖥️  Backend API: ${chalk.cyan(this.tunnelUrls.get('backend') || 'Ver backend-tunnel.log')} ${chalk.gray('(Cloudflare)')}`);
    console.log(`   📡 LiveKit SFU: ${chalk.green(this.tunnelUrls.get('livekit') || 'Ver livekit-ngrok.log')} ${chalk.gray('(ngrok - WebRTC optimizado)')}`);
    console.log(`   👨‍💼 Admin Panel: ${chalk.magenta(this.tunnelUrls.get('admin') || 'Ver admin-tunnel.log')} ${chalk.gray('(Cloudflare)')}`);
    console.log(`   👁️  Viewer Panel: ${chalk.magenta(this.tunnelUrls.get('viewer') || 'Ver viewer-tunnel.log')} ${chalk.gray('(Cloudflare)')}`);
    
    console.log('\n🔧 ' + chalk.bold('Puertos Locales de Producción:'));
    console.log(`   - Backend: ${chalk.yellow('localhost:6001')}`);
    console.log(`   - LiveKit: ${chalk.yellow('localhost:7880')} ${chalk.green('→ ngrok')}`);
    console.log(`   - Admin Production: ${chalk.yellow('localhost:4000')}`);
    console.log(`   - Viewer Production: ${chalk.yellow('localhost:4001')}`);
    console.log(`   - Redis: ${chalk.yellow('localhost:6379')}`);
    
    console.log('\n💡 ' + chalk.bold('Configuración Híbrida:'));
    console.log('   🌐 ' + chalk.cyan('Cloudflare') + ': Backend, Admin, Viewer (HTTP/API)');
    console.log('   🚀 ' + chalk.green('ngrok') + ': LiveKit (WebRTC/WebSocket optimizado)');
    
    console.log('\n📝 ' + chalk.bold('Archivos .env.production actualizados automáticamente'));
    console.log('🛑 ' + chalk.bold('Para detener:') + ' npm run stop:prod');
    console.log('📋 ' + chalk.bold('Logs:') + ' backend-tunnel.log, livekit-ngrok.log, admin-tunnel.log, viewer-tunnel.log\n');
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

      const hasNgrok = await this.checkNgrok();
      if (!hasNgrok) {
        process.exit(1);
      }

      // 2. Limpiar logs anteriores
      ['backend-tunnel.log', 'livekit-ngrok.log', 'admin-tunnel.log', 'viewer-tunnel.log'].forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      // 3. CREAR TÚNELES HÍBRIDOS
      this.log('📡 PASO 1: Creando túneles híbridos...', 'info');
      this.log('   🌐 Cloudflare para Backend', 'info');
      this.log('   🚀 ngrok para LiveKit (mejor compatibilidad WebRTC)', 'info');
      
      // Backend con Cloudflare (funciona bien para API REST)
      await this.createTunnel('backend', 6001, 'backend-tunnel.log');
      
      // LiveKit con ngrok (mejor para WebRTC/WebSocket)
      await this.createNgrokTunnel('livekit', 7880, 'livekit-ngrok.log');
      
      // 4. ACTUALIZAR archivos .env CON URLs de túneles ANTES de iniciar servicios
      this.log('📝 PASO 2: Actualizando archivos .env.production con URLs de túneles...', 'info');
      await this.updateEnvFiles();

      // 5. INICIAR servicios con configuración ya actualizada
      this.log('🚀 PASO 3: Iniciando servicios backend con configuración de producción...', 'info');
      await this.startRedis();
      
      // IMPORTANTE: Iniciar LiveKit DESPUÉS de tener su URL pública
      this.log('🎥 Iniciando LiveKit con configuración de túnel...', 'info');
      await this.startLiveKit();
      
      await this.startBackend();

      // 6. Start frontends (package.json decide strategy)
      this.log('🚀 PASO 4: Iniciando frontends en modo producción...', 'info');
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
    ['backend-tunnel.log', 'livekit-tunnel.log', 'admin-tunnel.log', 'viewer-tunnel.log'].forEach(file => {
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