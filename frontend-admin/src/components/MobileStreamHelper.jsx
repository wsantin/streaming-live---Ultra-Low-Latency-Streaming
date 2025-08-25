import React, { useState, useEffect } from 'react';

const MobileStreamHelper = ({ onStreamReady }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isHttps, setIsHttps] = useState(false);
  const [hasMediaSupport, setHasMediaSupport] = useState(false);
  const [error, setError] = useState(null);
  const [solution, setSolution] = useState(null);

  useEffect(() => {
    checkCapabilities();
  }, []);

  const checkCapabilities = async () => {
    // Check if mobile
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobileCheck);

    // Check if HTTPS
    const httpsCheck = window.location.protocol === 'https:';
    setIsHttps(httpsCheck);

    // Check media devices support
    const mediaCheck = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setHasMediaSupport(mediaCheck);

    // Determine solution needed
    if (mobileCheck && !httpsCheck) {
      setSolution('https');
      setError('Mobile streaming requires HTTPS connection');
    } else if (!mediaCheck) {
      setSolution('unsupported');
      setError('Your browser does not support camera access');
    } else {
      // Try to access camera
      try {
        const constraints = {
          video: { facingMode: 'environment' }, // Use back camera on mobile
          audio: true
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        onStreamReady(stream);
        setSolution('ready');
      } catch (err) {
        console.error('Media access error:', err);
        
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access.');
          setSolution('permission');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
          setSolution('nocamera');
        } else {
          setError(`Camera error: ${err.message}`);
          setSolution('error');
        }
      }
    }
  };

  const openHttpsTunnel = () => {
    window.open('https://ngrok.com/download', '_blank');
  };

  const copyNgrokCommand = () => {
    navigator.clipboard.writeText('ngrok http 5001');
    alert('Command copied! Run this in your terminal after installing ngrok.');
  };

  const installPWA = async () => {
    // This would be triggered by the PWA install prompt
    alert('PWA installation will be available once HTTPS is configured.');
  };

  if (solution === 'ready') {
    return null; // Camera is ready, no helper needed
  }

  return (
    <div className="mobile-stream-helper">
      <div className="helper-card">
        <h2>📱 Mobile Streaming Setup</h2>
        
        <div className="status-checks">
          <div className={`check-item ${isMobile ? 'yes' : 'no'}`}>
            {isMobile ? '✅' : '❌'} Mobile Device
          </div>
          <div className={`check-item ${isHttps ? 'yes' : 'no'}`}>
            {isHttps ? '✅' : '❌'} HTTPS Connection
          </div>
          <div className={`check-item ${hasMediaSupport ? 'yes' : 'no'}`}>
            {hasMediaSupport ? '✅' : '❌'} Camera Support
          </div>
        </div>

        {error && (
          <div className="error-box">
            ⚠️ {error}
          </div>
        )}

        {solution === 'https' && (
          <div className="solution-box">
            <h3>🔐 Enable HTTPS for Mobile Streaming</h3>
            <p>Mobile devices require HTTPS to access the camera. Choose an option:</p>
            
            <div className="solution-options">
              <div className="option">
                <h4>Option 1: Ngrok Tunnel (Easiest)</h4>
                <ol>
                  <li>Install ngrok from their website</li>
                  <li>Run the command below in terminal</li>
                  <li>Access the HTTPS URL provided</li>
                </ol>
                <div className="button-group">
                  <button onClick={openHttpsTunnel} className="btn-primary">
                    🌐 Get Ngrok
                  </button>
                  <button onClick={copyNgrokCommand} className="btn-secondary">
                    📋 Copy Command
                  </button>
                </div>
                <code className="command">ngrok http 5001</code>
              </div>

              <div className="option">
                <h4>Option 2: Localtunnel (Alternative)</h4>
                <ol>
                  <li>Install: <code>npm install -g localtunnel</code></li>
                  <li>Run: <code>lt --port 5001</code></li>
                  <li>Access the HTTPS URL provided</li>
                </ol>
              </div>

              <div className="option">
                <h4>Option 3: Use Desktop Browser</h4>
                <p>For testing, you can use a desktop browser which works with HTTP on local network.</p>
              </div>
            </div>
          </div>
        )}

        {solution === 'permission' && (
          <div className="solution-box">
            <h3>🎥 Camera Permission Required</h3>
            <p>Please allow camera access when prompted.</p>
            <button onClick={checkCapabilities} className="btn-primary">
              🔄 Try Again
            </button>
            
            <div className="help-text">
              <p><strong>iOS Safari:</strong></p>
              <ol>
                <li>Go to Settings → Safari</li>
                <li>Scroll to "Camera" and "Microphone"</li>
                <li>Select "Allow" for this website</li>
              </ol>
              
              <p><strong>Android Chrome:</strong></p>
              <ol>
                <li>Tap the lock icon in address bar</li>
                <li>Tap "Site settings"</li>
                <li>Allow Camera and Microphone</li>
              </ol>
            </div>
          </div>
        )}

        {solution === 'nocamera' && (
          <div className="solution-box">
            <h3>📷 No Camera Detected</h3>
            <p>Your device doesn't have a camera or it's not accessible.</p>
            <button onClick={checkCapabilities} className="btn-primary">
              🔄 Check Again
            </button>
          </div>
        )}

        {solution === 'unsupported' && (
          <div className="solution-box">
            <h3>🚫 Browser Not Supported</h3>
            <p>Your browser doesn't support WebRTC streaming.</p>
            <p>Please use a modern browser:</p>
            <ul>
              <li>Chrome (recommended)</li>
              <li>Safari (iOS 11+)</li>
              <li>Firefox</li>
              <li>Edge</li>
            </ul>
          </div>
        )}
      </div>

      <style jsx>{`
        .mobile-stream-helper {
          padding: 20px;
          max-width: 600px;
          margin: 0 auto;
        }

        .helper-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }

        h2 {
          color: #333;
          margin-bottom: 20px;
          text-align: center;
        }

        .status-checks {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }

        .check-item {
          padding: 10px;
          border-radius: 8px;
          font-weight: 500;
        }

        .check-item.yes {
          background: #d4edda;
          color: #155724;
        }

        .check-item.no {
          background: #f8d7da;
          color: #721c24;
        }

        .error-box {
          background: #fff3cd;
          color: #856404;
          padding: 12px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #ffc107;
        }

        .solution-box {
          margin-top: 20px;
        }

        .solution-box h3 {
          color: #007bff;
          margin-bottom: 15px;
        }

        .solution-options {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .option {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
        }

        .option h4 {
          color: #495057;
          margin-bottom: 10px;
        }

        .option ol {
          margin: 10px 0 15px 20px;
        }

        .command {
          display: block;
          background: #212529;
          color: #28a745;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
          font-family: monospace;
        }

        .button-group {
          display: flex;
          gap: 10px;
          margin: 15px 0;
        }

        .btn-primary, .btn-secondary {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn-primary {
          background: #007bff;
          color: white;
        }

        .btn-primary:hover {
          background: #0056b3;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover {
          background: #545b62;
        }

        .help-text {
          margin-top: 20px;
          padding: 15px;
          background: #e9ecef;
          border-radius: 8px;
        }

        .help-text p {
          font-weight: bold;
          margin-bottom: 5px;
        }

        .help-text ol {
          margin: 5px 0 15px 20px;
        }

        @media (max-width: 480px) {
          .mobile-stream-helper {
            padding: 10px;
          }

          .helper-card {
            padding: 16px;
          }

          .button-group {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default MobileStreamHelper;