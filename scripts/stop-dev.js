#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DevStopper {
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
      // Proceso no encontrado o ya terminado
      return false;
    }
  }

  async killProcessByPort(port) {
    try {
      // Encontrar PID usando el puerto
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

  async stopRedis() {
    const spinner = ora('🔪 Deteniendo Redis (Docker)...').start();
    
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

  async stop() {
    console.log(chalk.red.bold('🛑 Deteniendo Servidor de Streaming'));
    console.log('='.repeat(40) + '\n');

    // Matar procesos Node.js específicos (excluyendo Claude Code)
    const spinner1 = ora('🔪 Cerrando procesos Node.js...').start();
    
    const nodeProcessesKilled = [
      await this.killProcessByName('node.exe', 'Backend'),
      await this.killProcessByName('node.exe', 'Admin'),
      await this.killProcessByName('node.exe', 'Viewer')
    ];

    if (nodeProcessesKilled.some(killed => killed)) {
      spinner1.succeed('✅ Procesos Node.js cerrados');
    } else {
      spinner1.warn('⚠️ No se encontraron procesos Node.js específicos');
    }

    // Matar LiveKit Server
    const spinner2 = ora('🔪 Cerrando LiveKit Server...').start();
    const livekitKilled = await this.killProcessByName('livekit-server.exe');
    
    if (livekitKilled) {
      spinner2.succeed('✅ LiveKit Server cerrado');
    } else {
      spinner2.warn('⚠️ LiveKit Server no estaba ejecutándose');
    }

    // Detener Redis
    await this.stopRedis();

    // Matar procesos por puerto como respaldo
    const ports = [5001, 3000, 3001, 7880];
    let portProcessesKilled = 0;
    
    for (const port of ports) {
      if (await this.killProcessByPort(port)) {
        portProcessesKilled++;
      }
    }

    if (portProcessesKilled > 0) {
      this.log(`🔪 ${portProcessesKilled} procesos adicionales cerrados por puerto`);
    }

    console.log('\n' + '='.repeat(50));
    console.log(chalk.green.bold('✅ Todos los servicios han sido detenidos'));
    console.log('='.repeat(50) + '\n');

    if (this.killedProcesses.length > 0) {
      this.log(`Procesos terminados: ${this.killedProcesses.join(', ')}`, 'success');
    }

    this.log('Sistema limpio y listo para reiniciar', 'success');
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const stopper = new DevStopper();
  
  stopper.stop().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(chalk.red(`❌ Error deteniendo servicios: ${error.message}`));
    process.exit(1);
  });
}

export { DevStopper };