const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Create certs directory if it doesn't exist
const certsDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir);
}

console.log('🔐 Generating self-signed SSL certificate for HTTPS...\n');

try {
  // Create config file for multi-domain certificate
  const configContent = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = WebRTC Streaming
CN = localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[v3_ca]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
IP.1 = 127.0.0.1
IP.2 = 192.168.1.1
IP.3 = 192.168.1.37
IP.4 = 192.168.0.1
IP.5 = 192.168.2.1
IP.6 = 10.0.0.1
IP.7 = 172.16.0.1`;

  fs.writeFileSync(path.join(certsDir, 'cert.conf'), configContent);

  // Try using OpenSSL with multi-domain support
  const opensslCommands = [
    'openssl genrsa -out certs/server.key 2048',
    'openssl req -new -key certs/server.key -out certs/server.csr -config certs/cert.conf',
    'openssl x509 -req -days 365 -in certs/server.csr -signkey certs/server.key -out certs/server.crt -extensions v3_req -extfile certs/cert.conf'
  ];

  opensslCommands.forEach(cmd => {
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  });

  console.log('\n✅ SSL Certificate generated with OpenSSL!');
} catch (error) {
  console.log('OpenSSL not available, using Node.js fallback...\n');
  
  // Fallback: Use Node.js mkcert alternative
  (async () => {
    try {
      // Install mkcert package if needed
      console.log('Installing mkcert package...');
      execSync('npm install mkcert', { stdio: 'inherit' });
      
      // Generate certificate using mkcert
      const mkcert = require('mkcert');
      
      // Create certificate authority
      const ca = await mkcert.createCA({
        organization: 'WebRTC Streaming',
        countryCode: 'US',
        state: 'State',
        locality: 'City',
        validityDays: 365
      });
      
      // Create certificate with multiple domains/IPs
      const cert = await mkcert.createCert({
        domains: [
          'localhost',
          '127.0.0.1',
          '192.168.1.1',
          '192.168.1.37', 
          '192.168.0.1',
          '192.168.2.1',
          '10.0.0.1',
          '172.16.0.1',
          '*.local'
        ],
        validityDays: 365,
        caKey: ca.key,
        caCert: ca.cert
      });
      
      // Save files
      fs.writeFileSync(path.join(certsDir, 'server.key'), cert.key);
      fs.writeFileSync(path.join(certsDir, 'server.crt'), cert.cert);
      fs.writeFileSync(path.join(certsDir, 'ca.crt'), ca.cert);
      
      console.log('\n✅ SSL Certificate generated with mkcert!');
    } catch (fallbackError) {
    console.log('OpenSSL and mkcert not available. Please install OpenSSL or use tunnels for HTTPS.\n');
    console.log('Alternatives:');
    console.log('1. Install OpenSSL: https://slproweb.com/products/Win32OpenSSL.html');
    console.log('2. Use production mode: npm run prod (uses Cloudflare tunnels)');
    console.log('3. Install Git for Windows (includes OpenSSL)');
    
    process.exit(1);
    }
  })();
}

console.log('\n📁 Certificate files location:');
console.log(`   - Private Key: ${path.join(certsDir, 'server.key')}`);
console.log(`   - Certificate: ${path.join(certsDir, 'server.crt')}`);
console.log('\n⚠️  IMPORTANT NOTES:');
console.log('1. You must accept the certificate warning in your browser/mobile');
console.log('2. On mobile, you may need to install the certificate as trusted');
console.log('3. For production, use a proper SSL certificate from a CA');
console.log('\n✅ You can now start the server with HTTPS support!');