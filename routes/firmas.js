// routes/firmas.js (o en tu archivo de rutas actual)
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3Client, BUCKET_NAME } = require('../configs/s3'); // ajusta ruta

// Multer: solo en memoria (para enviar a S3, no guardar en disco)
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes PNG o JPG'), false);
        }
    },
    limits: {
        fileSize: 2 * 1024 * 1024 // 2 MB máximo
    }
});

// Subir firma de un médico 
router.post('/subir/:id_med', authenticateToken, upload.single('firma'), async (req, res) => {
    const { id_med } = req.params;
    if (!id_med || isNaN(id_med)) {
        return res.status(400).json({ success: false, error: 'ID de médico inválido' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Debe subir una imagen de firma' });
    }

    const file = req.file;
    const key = `firmas/medico_${id_med}.png`;

    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: 'image/png',
        ACL: 'private'
    };

    try {
        const command = new PutObjectCommand(params);
        await s3Client.send(command);
        return res.json({
            success: true,
            datos: { mensaje: 'Firma subida correctamente' }
        });
    } catch (error) {
        registrarErrorPeticion(error.Code);
        return res.status(500).json({ success: false, error: 'Error al guardar la firma' });
    }
});

// Obtener URL firmada para la firma de un médico
router.get('/obtener/:id_med', authenticateToken, async (req, res) => {
    const { id_med } = req.params;
    if (!id_med || isNaN(id_med)) {
        return res.status(400).json({ success: false, error: 'ID de médico inválido' });
    }

    const key = `firmas/medico_${id_med}.png`;
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });

    try {
        // Verificar existencia (headObject no existe en v3 para S3Client, usamos getObject con rango 0)
        await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, Range: 'bytes=0-0' }));

        // Generar URL firmada (válida 15 min)
        const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
        return res.json({ success: true, datos: { url_firma: url } });
    } catch (error) {
        if (error.Code === 'NoSuchKey') {
            return res.status(404).json({ success: false, error: 'Firma no encontrada' });
        }
        registrarErrorPeticion(error.Code);
        return res.status(500).json({ success: false, error: 'Error al generar URL de firma' });
    }
});

module.exports = router;