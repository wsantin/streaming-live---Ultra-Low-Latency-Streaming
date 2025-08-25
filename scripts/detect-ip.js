// Script para detectar IP local automáticamente
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Detecta la IP local de la red activa
 * @returns {string} IP local detectada
 */
export function detectLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Intentar encontrar IP de WiFi o Ethernet primero
  const preferredInterfaces = ['Wi-Fi', 'Ethernet', 'wlan0', 'eth0'];
  
  for (const interfaceName of preferredInterfaces) {
    if (interfaces[interfaceName]) {
      for (const iface of interfaces[interfaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`🌐 IP detectada en ${interfaceName}: ${iface.address}`);
          return iface.address;
        }
      }
    }
  }
  
  // Fallback: buscar cualquier interfaz IPv4 no internal
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`🌐 IP detectada en ${name}: ${iface.address}`);
        return iface.address;
      }
    }
  }
  
  // Último fallback
  console.log('⚠️  No se pudo detectar IP, usando fallback: 192.168.1.37');
  return '192.168.1.37';
}

/**
 * Actualiza archivo .env con nuevas variables
 * @param {string} filePath - Ruta del archivo .env
 * @param {Object} updates - Variables a actualizar
 */
export function updateEnvFile(filePath, updates) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Archivo no encontrado: ${filePath}`);
      return false;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Actualizar cada variable
    Object.entries(updates).forEach(([key, value]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (content.match(regex)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        // Si no existe, agregarlo al final
        content += `\n${key}=${value}`;
      }
    });
    
    fs.writeFileSync(filePath, content);
    console.log(`✅ Actualizado: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error actualizando ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Actualiza vite.config.js con allowedHosts dinámico
 * @param {string} viteConfigPath - Ruta del vite.config.js
 * @param {string} localIP - IP local detectada
 */
export function updateViteAllowedHosts(viteConfigPath, localIP) {
  try {
    if (!fs.existsSync(viteConfigPath)) {
      console.log(`⚠️  Vite config no encontrado: ${viteConfigPath}`);
      return false;
    }
    
    let content = fs.readFileSync(viteConfigPath, 'utf8');
    
    // Buscar y reemplazar allowedHosts
    const allowedHostsRegex = /allowedHosts:\s*\[(.*?)\]/s;
    const newAllowedHosts = `allowedHosts: ['localhost', '${localIP}', '.trycloudflare.com']`;
    
    if (content.match(allowedHostsRegex)) {
      content = content.replace(allowedHostsRegex, newAllowedHosts);
    } else {
      // Si no existe allowedHosts, agregarlo al server config
      const serverRegex = /server:\s*{([^}]*)}/s;
      if (content.match(serverRegex)) {
        content = content.replace(serverRegex, (match, serverContent) => {
          return `server: {${serverContent.trim()},\n      ${newAllowedHosts}\n    }`;
        });
      }
    }
    
    fs.writeFileSync(viteConfigPath, content);
    console.log(`✅ Vite allowedHosts actualizado: ${viteConfigPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error actualizando ${viteConfigPath}:`, error.message);
    return false;
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const ip = detectLocalIP();
  console.log(`\n🌐 IP Local Detectada: ${ip}\n`);
}