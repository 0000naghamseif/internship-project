const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const qrDir = path.join("processed", "qrcodes");

if (!fs.existsSync(qrDir)) {
  fs.mkdirSync(qrDir, { recursive: true });
}

const createQrPayload = ({ type, documentId, pageNumber = null, checksum = "demo-checksum" }) => {
  return {
    v: 1,
    type,
    documentId,
    pageNumber,
    checksum
  };
};

const generateQrImage = async (payload, fileName) => {
  const qrPath = path.join(qrDir, fileName);

  await QRCode.toFile(qrPath, JSON.stringify(payload), {
    width: 300,
    margin: 2
  });

  return qrPath;
};

module.exports = {
  createQrPayload,
  generateQrImage
};