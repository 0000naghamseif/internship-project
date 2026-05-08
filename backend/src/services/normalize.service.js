const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process"); // ADDED: used to run LibreOffice command
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");

// ADDED: function to convert DOCX to PDF using LibreOffice
const convertDocxToPdf = (inputPath, outputDir) => {
  return new Promise((resolve, reject) => {
    execFile(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        inputPath
      ],
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
};

const normalizeToPdf = async (file) => {
  const originalPath = file.path;
  const ext = path.extname(file.originalname).toLowerCase();

  const outputDir = path.join("processed", "normalized"); // ADDED: output folder variable

  // ADDED: make sure normalized folder exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFileName = `${Date.now()}-${path.parse(file.originalname).name}.pdf`;
  const outputPath = path.join(outputDir, outputFileName);

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

  // ADDED: 3. If file is DOCX, convert it to PDF using LibreOffice
if (ext === ".docx") {
  await convertDocxToPdf(originalPath, outputDir);

  // LibreOffice creates PDF using the uploaded file name, not originalname
  const convertedFileName = `${path.parse(path.basename(originalPath)).name}.pdf`;
  const convertedPath = path.join(outputDir, convertedFileName);

  if (!fs.existsSync(convertedPath)) {
    throw new Error("DOCX conversion failed: PDF was not created");
  }

  fs.renameSync(convertedPath, outputPath);

  return {
    normalizedPdfPath: outputPath,
    normalizedFileName: outputFileName,
    type: "docx"
  };
}

  throw new Error("Unsupported file type");
};

module.exports = normalizeToPdf;
// const path = require("path");
// const fs = require("fs");
// const { PDFDocument } = require("pdf-lib");
// const sharp = require("sharp");

// const normalizeToPdf = async (file) => {
//   const originalPath = file.path;
//   const ext = path.extname(file.originalname).toLowerCase();

//   const outputFileName = `${Date.now()}-${path.parse(file.originalname).name}.pdf`;
//   const outputPath = path.join("processed", "normalized", outputFileName);

//   // 1. If file is already PDF, copy it to normalized folder
//   if (ext === ".pdf") {
//     fs.copyFileSync(originalPath, outputPath);

//     return {
//       normalizedPdfPath: outputPath,
//       normalizedFileName: outputFileName,
//       type: "pdf"
//     };
//   }

//   // 2. If file is image, convert image to PDF
//   if ([".jpg", ".jpeg", ".png"].includes(ext)) {
//     const imageBuffer = await sharp(originalPath).jpeg().toBuffer();

//     const pdfDoc = await PDFDocument.create();
//     const image = await pdfDoc.embedJpg(imageBuffer);

//     const page = pdfDoc.addPage([image.width, image.height]);
//     page.drawImage(image, {
//       x: 0,
//       y: 0,
//       width: image.width,
//       height: image.height
//     });

//     const pdfBytes = await pdfDoc.save();
//     fs.writeFileSync(outputPath, pdfBytes);

//     return {
//       normalizedPdfPath: outputPath,
//       normalizedFileName: outputFileName,
//       type: "image"
//     };
//   }

//   // 3. DOCX support will be added later
//   if (ext === ".docx") {
//     throw new Error("DOCX normalization will be implemented later");
//   }

//   throw new Error("Unsupported file type");
// };

// module.exports = normalizeToPdf;