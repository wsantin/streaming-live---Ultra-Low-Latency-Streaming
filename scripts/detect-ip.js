#!/usr/bin/env node

import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para obtener la IP local correcta
export function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const allIPs = [];
  
  console.log('🔍 Detectando IP local...\n');
  console.log('📋 IPs encontradas:');
  
  // Recopilar todas las IPs
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   ${name}: ${iface.address}`);
        allIPs.push({
          name: name,
          address: iface.address,
          priority: getIPPriority(iface.address)
        });
      }
    }
  }
  
  console.log();
  
  // Ordenar por prioridad y seleccionar la mejor
  allIPs.sort((a, b) => b.priority - a.priority);
  
  if (allIPs.length > 0) {
    const selectedIP = allIPs[0].address;
    console.log(`🎯 IP seleccionada: ${selectedIP}`);
    return selectedIP;
  }
  
  console.log('❌ No se pudo detectar IP local, usando localhost');
  return 'localhost';
}

// Función para priorizar IPs
export function getIPPriority(ip) {
  if (ip.startsWith('192.168.1.')) return 100;  // WiFi común (máxima prioridad)
  if (ip.startsWith('192.168.0.')) return 90;   // Router alternativo
  if (ip.startsWith('192.168.')) return 80;      // Otra red local
  if (ip.startsWith('10.')) return 70;           // Red corporativa
  if (ip.startsWith('172.')) return 60;          // Docker/VM
  return 50;                                      // Otras
}

// Función para actualizar archivos .env
export function updateEnvFile(filePath, updates) {
  let content = '';
  
  // Leer archivo existente si existe
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  
  // Actualizar o agregar cada variable
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'gm');
    const newLine = `${key}=${value}`;
    
    if (regex.test(content)) {
      content = content.replace(regex, newLine);
    } else {
      content += (content && !content.endsWith('\n') ? '\n' : '') + newLine + '\n';
    }
  }
  
  // Escribir archivo actualizado
  fs.writeFileSync(filePath, content);
  console.log(`✅ Actualizado: ${path.basename(filePath)}`);
}

// Main
export function main() {
  const localIP = getLocalIP();
  
  console.log('\n📊 Configurando archivos .env...\n');
  
  // Actualizar backend .env (mantener VPS LiveKit)
  const backendEnvPath = path.join(__dirname, '..', 'backend-local', '.env');
  updateEnvFile(backendEnvPath, {
    'SERVER_HOST': localIP,
    'REDIS_HOST': 'localhost', // Redis siempre local
    'LIVEKIT_HOST': 'wss://5.78.143.204' // VPS LiveKit siempre
  });
  
  // Actualizar frontend-admin .env
  const adminEnvPath = path.join(__dirname, '..', 'frontend-admin', '.env');
  updateEnvFile(adminEnvPath, {
    'VITE_API_URL': `http://${localIP}:5001`
  });
  
  // Actualizar frontend-viewer .env
  const viewerEnvPath = path.join(__dirname, '..', 'frontend-viewer', '.env');
  updateEnvFile(viewerEnvPath, {
    'VITE_API_URL': `http://${localIP}:5001`,
  });
  
  console.log('\n✅ Todos los archivos .env actualizados con IP:', localIP);
  
  // Guardar IP para otros scripts
  const ipInfo = {
    localIP: localIP,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(__dirname, 'current-ip.json'), JSON.stringify(ipInfo, null, 2));
  
  return localIP;
}

// Ejecutar si es llamado directamente
if (process.argv[1] === __filename) {
  const ipConfig = main();
  console.log('\n🎯 IP detectada y archivos .env actualizados correctamente\n');
}