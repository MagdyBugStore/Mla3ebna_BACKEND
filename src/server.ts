require('dotenv').config();

import os from 'os'; // Use import for TypeScript
const { env } = require('./config/env');
const { connectMongo } = require('./config/mongo');
const { createApp } = require('./app');
const { seedIfEmpty } = require('./seed');

async function start() {
  await connectMongo(env.mongoUri);
  await seedIfEmpty();

  const app = createApp();

  // Get network interfaces
  const networkInterfaces = os.networkInterfaces();
  
  // Explicitly cast the flattened array to the correct NodeJS type
  const localIp = Object.values(networkInterfaces)
    .flat()
    .find((iface) => {
      const i = iface as os.NetworkInterfaceInfo; // Cast to access properties safely
      return i?.family === 'IPv4' && !i?.internal;
    })?.address || 'localhost';

  app.listen(env.port, () => {
    console.log(`Mla3ebna backend listening on:`);
    console.log(`  Local:   http://localhost:${env.port}`);
    console.log(`  Network: http://${localIp}:${env.port}`);
  });
}

export { start };

start().catch((err) => {
  console.error(err);
  process.exit(1);
});