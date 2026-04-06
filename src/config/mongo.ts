const mongoose = require('mongoose');

async function connectMongo(mongoUri: string) {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 4000
    });
    return { mode: 'external', uri: mongoUri };
  } catch (err) {
    if (String(process.env.MONGO_IN_MEMORY || '').toLowerCase() !== 'true') throw err;
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri('mla3ebna');
    await mongoose.connect(uri, { autoIndex: true });
    return { mode: 'memory', uri };
  }
}

module.exports = { connectMongo };

export {};
