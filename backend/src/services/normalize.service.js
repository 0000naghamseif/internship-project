const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");

const normalizeToPdf = async (file) => {
  const originalPath = file.path;
  const ext = path.extname(file.originalname).toLowerCase();

  const outputFileName = `${Date.now()}-${path.parse(file.originalname).name}.pdf`;
  const outputPath = path.join("processed", "normalized", outputFileName);

  // 1. If file is already PDF, copy it to normalized folder
  if (ext === ".pdf") {
    fs.copyFileSync(originalPath, outputPath);

    return {
      normalizedPdfPath: outputPath,
      normalizedFileName: outputFileName,
      type: "pdf"
    };
  }

  // 2. If file is image, convert image to PDF
  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    const imageBuffer = await sharp(originalPath).jpeg().toBuffer();

    const pdfDoc = await PDFDocument.create();
    const image = await pdfDoc.embedJpg(imageBuffer);

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    return {
      normalizedPdfPath: outputPath,
      normalizedFileName: outputFileName,
      type: "image"
    };
  }

  // 3. DOCX support will be added later
  if (ext === ".docx") {
    throw new Error("DOCX normalization will be implemented later");
  }

  throw new Error("Unsupported file type");
};

module.exports = normalizeToPdf;