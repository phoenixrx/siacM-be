const express = require('express');
const router = express.Router();
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// Configurar cliente S3 para Backblaze B2
const s3Client = new S3Client({
  region: "us-east-005",
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  credentials: {
    accessKeyId: process.env.BACKBLAZE_KEY_ID,
    secretAccessKey: process.env.BACKBLAZE_APP_KEY
  },
  forcePathStyle: true
});

// Endpoint para generar URL firmada
router.post('/generar-url-subida', async (req, res) => {
  try {
    const { fileName, contentType } = req.body;

    const command = new PutObjectCommand({
      Bucket: "SIAC-archivos",
      Key: fileName,
      ContentType: contentType
    });

    // Generar URL firmada válida por 1 hora
    const signedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600
    });

    res.json({ 
      success: true, 
      signedUrl: signedUrl,
      fileName: fileName
    });

  } catch (error) {
    console.error("Error generando URL:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;

