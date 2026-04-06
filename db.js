const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

let memoryDb = null;
let writeLock = Promise.resolve();

function ensureDbFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [],
      otp: [],
      refresh_tokens: [],
      fields: [],
      reviews: [],
      bookings: [],
      payments: [],
      notifications: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function loadDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return {
    users: parsed.users ?? [],
    otp: parsed.otp ?? [],
    refresh_tokens: parsed.refresh_tokens ?? [],
    fields: parsed.fields ?? [],
    reviews: parsed.reviews ?? [],
    bookings: parsed.bookings ?? [],
    payments: parsed.payments ?? [],
    notifications: parsed.notifications ?? []
  };
}

async function getDb() {
  if (!memoryDb) {
    memoryDb = loadDb();
  }
  return memoryDb;
}

async function persistDb(db) {
  ensureDbFile();
  writeLock = writeLock.then(async () => {
    memoryDb = db;
    await fs.promises.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  });
  return writeLock;
}

async function updateDb(mutator) {
  const current = await getDb();
  const next = JSON.parse(JSON.stringify(current));
  const result = await mutator(next);
  await persistDb(next);
  return result;
}

function generateId(prefix) {
  const suffix = Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `${prefix}_${suffix}`;
}

module.exports = {
  getDb,
  updateDb,
  generateId
};

