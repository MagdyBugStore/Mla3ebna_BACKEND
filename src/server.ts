require('dotenv').config();

const { env } = require('./config/env');
const { connectMongo } = require('./config/mongo');
const { createApp } = require('./app');
const { seedIfEmpty } = require('./seed');

async function start() {
  await connectMongo(env.mongoUri);
  await seedIfEmpty();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Mla3ebna backend listening on http://localhost:${env.port}`);
  });
}

module.exports = { start };

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
