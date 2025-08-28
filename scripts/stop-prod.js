#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProdStopper {
  constructor() {
    this.killedProcesses = [];
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

  async killProcessByName(processName, windowTitle = null) {
    try {
      // ⚠️ PROTECCIÓN: Nunca matar procesos de Claude Code
      if (processName === 'node.exe') {
        // En lugar de matar TODOS los node.exe, buscar por puerto específico
        return await this.killSpecificNodeProcesses();
      }
      
      let command;
      if (windowTitle) {
        command = `taskkill /f /im ${processName} /fi "WINDOWTITLE eq ${windowTitle}*"`;
      } else {
        command = `taskkill /f /im ${processName}`;
      }
      
      execSync(command, { stdio: 'pipe' });
      this.killedProcesses.push(processName);
      return true;
    } catch (error) {
      return false;
    }
  }

  async killSpecificNodeProcesses() {
    // Matar solo procesos Node.js en puertos específicos de producción
    const prodPorts = [6001, 4173, 4174];
    let killedAny = false;
    
    for (const port of prodPorts) {
      if (await this.killProcessByPort(port)) {
        killedAny = true;
      }
    }
    
    return killedAny;
  }

  async killProcessByPort(port) {
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const lines = netstatOutput.split('\n');
      
      for (const line of lines) {
        const match = line.match(/\s+(\d+)\s*$/);
        if (match) {
          const pid = match[1];
          try {
            execSync(`taskkill /f /pid ${pid}`, { stdio: 'pipe' });
            this.log(`🔪 Proceso en puerto ${port} terminado (PID: ${pid})`);
            return true;
          } catch {
            // PID ya terminado
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async stopCloudflared() {
    const spinner = ora('🔪 Cerrando túneles Cloudflare...').start();
    
    const killed = await this.killProcessByName('cloudflared.exe');
    
    if (killed) {
      spinner.succeed('✅ Túneles Cloudflare cerrados');
    } else {
      spinner.warn('⚠️ No se encontraron túneles Cloudflare activos');
    }
  }

  async stopNgrok() {
    const spinner = ora('🔪 Cerrando túneles ngrok...').start();
    
    const killed = await this.killProcessByName('ngrok.exe');
    
    if (killed) {
      spinner.succeed('✅ Túneles ngrok cerrados');
    } else {
      spinner.warn('⚠️ No se encontraron túneles ngrok activos');
    }
  }

  async stopNodeProcesses() {
    const spinner = ora('🔪 Cerrando procesos Node.js de producción (protegiendo Claude Code)...').start();
    
    // Solo matar procesos por puerto específico, NUNCA por nombre node.exe
    const killed = await this.killSpecificNodeProcesses();

    if (killed) {
      spinner.succeed('✅ Procesos Node.js de producción cerrados (Claude Code protegido)');
    } else {
      spinner.warn('⚠️ No se encontraron procesos Node.js específicos de producción en puertos objetivo');
    }
  }

  async stopLiveKit() {
    const spinner = ora('🔪 Cerrando LiveKit Server...').start();
    
    const killed = await this.killProcessByName('livekit-server.exe');
    
    if (killed) {
      spinner.succeed('✅ LiveKit Server cerrado');
    } else {
      spinner.warn('⚠️ LiveKit Server no estaba ejecutándose');
    }
  }

  async stopRedis() {
    const spinner = ora('🔪 Deteniendo Redis...').start();
    
    try {
      execSync('docker-compose down', {
        cwd: path.join(__dirname, '..', 'streaming-docker'),
        stdio: 'pipe'
      });
      spinner.succeed('✅ Redis detenido');
    } catch (error) {
      spinner.warn('⚠️ Redis ya estaba detenido o no se pudo detener');
    }
  }

  async cleanupTempFiles() {
    const spinner = ora('🧹 Limpiando archivos temporales...').start();
    
    const logFiles = ['backend-tunnel.log', 'livekit-ngrok.log', 'admin-tunnel.log', 'viewer-tunnel.log'];
    let filesDeleted = 0;

    logFiles.forEach(file => {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          filesDeleted++;
        } catch (error) {
          this.log(`⚠️ No se pudo eliminar ${file}`, 'warning');
        }
      }
    });

    if (filesDeleted > 0) {
      spinner.succeed(`✅ ${filesDeleted} archivos temporales eliminados`);
    } else {
      spinner.succeed('✅ No hay archivos temporales para limpiar');
    }
  }

  async killProductionPorts() {
    const prodPorts = [6001, 4173, 4174, 7880];
    let portProcessesKilled = 0;
    
    this.log('🔍 Verificando puertos de producción...');
    
    for (const port of prodPorts) {
      if (await this.killProcessByPort(port)) {
        portProcessesKilled++;
      }
    }

    if (portProcessesKilled > 0) {
      this.log(`🔪 ${portProcessesKilled} procesos adicionales cerrados por puerto`);
    }
  }

  async stop() {
    console.log(chalk.red.bold('🛑 Deteniendo Modo Producción'));
    console.log('='.repeat(40) + '\n');

    // Detener servicios en orden
    await this.stopCloudflared();
    await this.stopNgrok();
    await this.stopNodeProcesses();
    await this.stopLiveKit();
    await this.stopRedis();
    
    // Matar procesos por puerto como respaldo
    await this.killProductionPorts();
    
    // Limpiar archivos temporales
    await this.cleanupTempFiles();

    console.log('\n' + '='.repeat(60));
    console.log(chalk.green.bold('✅ Todos los servicios de producción han sido detenidos'));
    console.log('='.repeat(60) + '\n');

    if (this.killedProcesses.length > 0) {
      this.log(`Procesos terminados: ${this.killedProcesses.join(', ')}`, 'success');
    }

    this.log('Sistema de producción limpio y listo para reiniciar', 'success');
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const stopper = new ProdStopper();
  
  stopper.stop().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(chalk.red(`❌ Error deteniendo servicios: ${error.message}`));
    process.exit(1);
  });
}

export { ProdStopper };