const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const os = require('os');

function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

async function getOrCreateCertificates() {
  const certDir = path.join(__dirname, '..', '..', 'certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  }

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const ips = getLocalIpAddresses();
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' }
  ];

  ips.forEach(ip => {
    altNames.push({ type: 7, ip });
  });

  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    extensions: [{
      name: 'subjectAltName',
      altNames
    }]
  });

  fs.writeFileSync(keyPath, pems.private, 'utf8');
  fs.writeFileSync(certPath, pems.cert, 'utf8');

  return {
    key: pems.private,
    cert: pems.cert
  };
}

module.exports = {
  getOrCreateCertificates,
  getLocalIpAddresses
};
