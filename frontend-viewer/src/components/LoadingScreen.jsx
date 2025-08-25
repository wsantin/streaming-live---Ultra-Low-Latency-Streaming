import React from 'react';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <h2>⚡ Iniciando Ultra Viewer</h2>
      <p>Conectando con el servidor de streaming...</p>
    </div>
  );
}

export default LoadingScreen;