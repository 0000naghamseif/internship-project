const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

const stampQrOnPdf = async (pdfPath, pageRecords, documentFilename) => {
  const printableDir = path.join("processed", "printable");

  if (!fs.existsSync(printableDir)) {
    fs.mkdirSync(printableDir, { recursive: true });
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    const pageRecord = pageRecords.find(
      (p) => p.pageNumber === i + 1
    );

    if (!pageRecord || !pageRecord.qrPath) {
      continue;
    }

    const qrBytes = fs.readFileSync(pageRecord.qrPath);
    const qrImage = await pdfDoc.embedPng(qrBytes);

    const qrSize = 70;
    const margin = 20;

    page.drawImage(qrImage, {
      x: page.getWidth() - qrSize - margin,
      y: margin,
      width: qrSize,
      height: qrSize
    });
  }

  const printableFileName = `${path.parse(documentFilename).name}-printable.pdf`;
  const printablePath = path.join(printableDir, printableFileName);

  const stampedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(printablePath, stampedPdfBytes);

  return {
    printablePdfPath: printablePath,
    printableFileName
  };
};

module.exports = stampQrOnPdf;