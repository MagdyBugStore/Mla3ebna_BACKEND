const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, uploadsDir),
    filename: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname || '');
      cb(null, `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = { upload, uploadsDir };

export {};
