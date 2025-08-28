import React from 'react';
import StreamingViewer from './components/StreamingViewer';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <div className="App">
      <div className="viewer-component">
        <StreamingViewer />
      </div>

      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />

      <style jsx>{`
        .App {
          min-height: 100vh;
          background: linear-gradient(135deg, #2196F3 0%, #21CBF3 100%);
          padding: 20px;
        }
        
        .app-header {
          text-align: center;
          margin-bottom: 30px;
          color: white;
        }
        
        .app-header h1 {
          font-size: 2.8rem;
          margin-bottom: 30px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
          font-weight: bold;
        }
        
        .viewer-info {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }
        
        .info-card {
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(15px);
          padding: 25px;
          border-radius: 15px;
          border: 1px solid rgba(255,255,255,0.2);
          max-width: 500px;
          text-align: left;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        
        .info-card h3 {
          margin-top: 0;
          margin-bottom: 20px;
          color: #4CAF50;
          font-size: 1.4rem;
          text-align: center;
        }
        
        .info-card ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .info-card li {
          padding: 8px 0;
          color: rgba(255,255,255,0.95);
          font-size: 15px;
          font-weight: 500;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .info-card li:last-child {
          border-bottom: none;
        }
        
        .viewer-component {
          background: white;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(0,0,0,0.15);
          border: 1px solid rgba(255,255,255,0.2);
        }
        
        @media (max-width: 768px) {
          .App {
            padding: 15px;
          }
          
          .app-header h1 {
            font-size: 2.2rem;
          }
          
          .info-card {
            max-width: 100%;
            padding: 20px;
          }
          
          .info-card li {
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}

export default App;