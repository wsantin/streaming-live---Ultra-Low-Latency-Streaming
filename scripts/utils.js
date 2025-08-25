// Utilidades comunes para los scripts
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Obtiene el directorio del script actual (compatible con Windows/Linux)
 * @param {string} importMetaUrl - import.meta.url
 * @returns {string} Directorio del script
 */
export function getDirname(importMetaUrl) {
  const filename = fileURLToPath(importMetaUrl);
  return path.dirname(filename);
}

/**
 * Configuración de spawn optimizada para cada plataforma
 * @param {string} cwd - Directorio de trabajo
 * @returns {Object} Opciones para spawn
 */
export function getSpawnOptions(cwd) {
  return {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    windowsHide: true
  };
}