// config/s3.js
const { S3Client } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AMZ_S3_FIRMAS_ACC,
        secretAccessKey: process.env.AMZ_S3_FIRMAS_KEY,
    },
});

const BUCKET_NAME = process.env.S3_FIRMAS_BUCKET;

module.exports = { s3Client, BUCKET_NAME };