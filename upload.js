// upload.js
const multer = require('multer');
const path = require('path');

// Configuración del almacenamiento (opcional)
const storage = multer.memoryStorage(); // Almacena en memoria para procesarlo con sharp después

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite temporal alto para procesarlo después
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif)'));
    }
  }
});

module.exports = upload;