#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnvValidator {
  constructor() {
    this.validationResults = {
      backend: { status: '❌', issues: [] },
      admin: { status: '❌', issues: [] },
      viewer: { status: '❌', issues: [] },
      livekit: { status: '❌', issues: [] },
      redis: { status: '❌', issues: [] }
    };
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

  async validateBackendEnv() {
    const spinner = ora('🔍 Validando Backend .env.production...').start();
    
    try {
      const envPath = path.join(__dirname, '..', 'backend-local', '.env.production');
      
      if (!fs.existsSync(envPath)) {
        this.validationResults.backend.issues.push('Archivo .env.production no existe');
        spinner.fail('❌ Backend .env.production no encontrado');
        return;
      }

      const envContent = fs.readFileSync(envPath, 'utf8');
      const issues = [];

      // Validar variables requeridas
      if (!envContent.includes('NODE_ENV=production')) {
        issues.push('NODE_ENV no está configurado como production');
      }
      
      if (!envContent.includes('PORT=6001')) {
        issues.push('PORT no está configurado como 6001');
      }
      
      if (!envContent.includes('LIVEKIT_HOST=ws://localhost:7880') && !envContent.includes('LIVEKIT_HOST=ws://')) {
        issues.push('LIVEKIT_HOST no está configurado correctamente');
      }
      
      if (!envContent.includes('REDIS_HOST=localhost')) {
        issues.push('REDIS_HOST no configurado');
      }

      if (issues.length === 0) {
        this.validationResults.backend.status = '✅';
        spinner.succeed('✅ Backend .env.production válido');
      } else {
        this.validationResults.backend.issues = issues;
        spinner.fail('❌ Backend .env.production tiene problemas');
      }

    } catch (error) {
      this.validationResults.backend.issues.push(`Error leyendo archivo: ${error.message}`);
      spinner.fail('❌ Error validando Backend');
    }
  }

  async validateFrontendEnv(type = 'admin') {
    const spinner = ora(`🔍 Validando Frontend ${type} .env.production...`).start();
    
    try {
      const envPath = path.join(__dirname, '..', `frontend-${type}`, '.env.production');
      
      if (!fs.existsSync(envPath)) {
        this.validationResults[type].issues.push('Archivo .env.production no existe');
        spinner.fail(`❌ Frontend ${type} .env.production no encontrado`);
        return;
      }

      const envContent = fs.readFileSync(envPath, 'utf8');
      const issues = [];

      // Validar variables requeridas
      if (!envContent.includes('VITE_NODE_ENV=production')) {
        issues.push('VITE_NODE_ENV no está configurado como production');
      }
      
      if (!envContent.includes('VITE_API_URL=https://')) {
        issues.push('VITE_API_URL no está configurado con https://');
      }
      
      if (!envContent.includes('VITE_LIVEKIT_URL=wss://') && 
          !envContent.includes('VITE_LIVEKIT_URL=ws://localhost:7880') &&
          !envContent.includes('VITE_LIVEKIT_URL=ws://')) {
        issues.push('VITE_LIVEKIT_URL no está configurado correctamente');
      }

      if (issues.length === 0) {
        this.validationResults[type].status = '✅';
        spinner.succeed(`✅ Frontend ${type} .env.production válido`);
      } else {
        this.validationResults[type].issues = issues;
        spinner.fail(`❌ Frontend ${type} .env.production tiene problemas`);
      }

    } catch (error) {
      this.validationResults[type].issues.push(`Error leyendo archivo: ${error.message}`);
      spinner.fail(`❌ Error validando Frontend ${type}`);
    }
  }

  async validateLiveKitProcess() {
    const spinner = ora('🎥 Validando proceso LiveKit...').start();
    
    try {
      const processes = execSync('tasklist /fi "imagename eq livekit-server.exe"', { encoding: 'utf8' });
      
      if (processes.includes('livekit-server.exe')) {
        this.validationResults.livekit.status = '✅';
        spinner.succeed('✅ LiveKit Server está ejecutándose');
      } else {
        this.validationResults.livekit.issues.push('Proceso livekit-server.exe no encontrado');
        spinner.fail('❌ LiveKit Server no está ejecutándose');
      }
    } catch (error) {
      this.validationResults.livekit.issues.push('Error verificando proceso LiveKit');
      spinner.fail('❌ Error validando LiveKit');
    }
  }

  async validateRedisProcess() {
    const spinner = ora('🗄️ Validando proceso Redis...').start();
    
    try {
      const containers = execSync('docker ps --filter name=redis --format "{{.Names}}"', { encoding: 'utf8' });
      
      if (containers.includes('redis')) {
        this.validationResults.redis.status = '✅';
        spinner.succeed('✅ Redis Docker container está ejecutándose');
      } else {
        this.validationResults.redis.issues.push('Container Redis no encontrado');
        spinner.fail('❌ Redis no está ejecutándose');
      }
    } catch (error) {
      this.validationResults.redis.issues.push('Error verificando Docker Redis');
      spinner.fail('❌ Error validando Redis');
    }
  }

  async validateServiceConnectivity() {
    this.log('🌐 Validando conectividad de servicios...');

    // Validar conectividad local
    const localTests = [
      { name: 'Backend Local', url: 'http://localhost:6001/health', service: 'backend' },
      { name: 'LiveKit Local', url: 'http://localhost:7880', service: 'livekit' },
      { name: 'Admin Local', url: 'http://localhost:4173', service: 'admin' },
      { name: 'Viewer Local', url: 'http://localhost:4174', service: 'viewer' }
    ];

    for (const test of localTests) {
      try {
        // Usar método más simple para Windows
        const response = execSync(`curl -s -f "${test.url}"`, { 
          encoding: 'utf8',
          timeout: 10000,
          stdio: 'pipe'
        });
        
        if (response && response.length > 0) {
          this.log(`✅ ${test.name}: Conectado`, 'success');
        } else {
          this.log(`⚠️ ${test.name}: Respuesta vacía`, 'warning');
        }
      } catch (error) {
        // Intentar con método alternativo
        try {
          const altResponse = execSync(`curl -s "${test.url}"`, { 
            encoding: 'utf8',
            timeout: 5000 
          });
          
          if (altResponse && !altResponse.includes('error') && !altResponse.includes('failed')) {
            this.log(`✅ ${test.name}: Conectado (método alternativo)`, 'success');
          } else {
            this.log(`❌ ${test.name}: ${error.message}`, 'error');
            this.validationResults[test.service].issues.push('Sin conectividad local');
          }
        } catch (altError) {
          this.log(`❌ ${test.name}: No conectado`, 'error');
          this.validationResults[test.service].issues.push('Sin conectividad local');
        }
      }
    }
  }

  async validateTunnelUrls() {
    this.log('🌐 Validando URLs de túneles...');

    // Leer archivos de log para encontrar URLs de túneles
    const logFiles = ['backend-tunnel.log', 'livekit-tunnel.log', 'admin-tunnel.log', 'viewer-tunnel.log'];
    const tunnelUrls = {};

    for (const logFile of logFiles) {
      const logPath = path.join(__dirname, logFile);
      if (fs.existsSync(logPath)) {
        try {
          const logContent = fs.readFileSync(logPath, 'utf8');
          const urlMatch = logContent.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
          if (urlMatch) {
            const service = logFile.replace('-tunnel.log', '');
            tunnelUrls[service] = urlMatch[0];
            this.log(`🔗 ${service}: ${urlMatch[0]}`, 'success');
          }
        } catch (error) {
          this.log(`⚠️ Error leyendo ${logFile}`, 'warning');
        }
      }
    }

    return tunnelUrls;
  }

  displayResults() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.blue.bold('📊 REPORTE DE VALIDACIÓN DE ENVIRONMENTS'));
    console.log('='.repeat(70));

    // Mostrar estado de cada servicio
    Object.entries(this.validationResults).forEach(([service, result]) => {
      console.log(`\n🔧 ${service.toUpperCase()}: ${result.status}`);
      
      if (result.issues.length > 0) {
        result.issues.forEach(issue => {
          console.log(`   ❌ ${issue}`);
        });
      } else if (result.status === '✅') {
        console.log(`   ✅ Configuración correcta`);
      }
    });

    // Resumen general
    const allValid = Object.values(this.validationResults).every(r => r.status === '✅');
    
    console.log('\n' + '='.repeat(70));
    if (allValid) {
      console.log(chalk.green.bold('🎉 TODOS LOS ENVIRONMENTS ESTÁN CORRECTOS'));
      console.log(chalk.green('✅ Sistema listo para producción'));
    } else {
      console.log(chalk.red.bold('⚠️ SE ENCONTRARON PROBLEMAS EN LOS ENVIRONMENTS'));
      console.log(chalk.yellow('🔧 Revisa los problemas listados arriba'));
    }
    console.log('='.repeat(70) + '\n');
  }

  async validate() {
    console.log(chalk.blue.bold('🚀 Iniciando Validación de Environments de Producción'));
    console.log('='.repeat(60) + '\n');

    // Validar archivos .env
    await this.validateBackendEnv();
    await this.validateFrontendEnv('admin');
    await this.validateFrontendEnv('viewer');
    
    // Validar procesos
    await this.validateLiveKitProcess();
    await this.validateRedisProcess();
    
    // Validar conectividad
    await this.validateServiceConnectivity();
    
    // Validar túneles
    const tunnelUrls = await this.validateTunnelUrls();
    
    // Mostrar resultados
    this.displayResults();

    return tunnelUrls;
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const validator = new EnvValidator();
  validator.validate();
}

export { EnvValidator };