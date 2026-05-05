const path = require("path");
const fs = require("fs");
const pdfPoppler = require("pdf-poppler");
const { PDFDocument } = require("pdf-lib");

const renderPdfPages = async (pdfPath, documentFilename) => {
  const pagesDir = path.join("processed", "pages");

  if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir, { recursive: true });
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();

  const outputPrefix = path.parse(documentFilename).name;

  const options = {
    format: "png",
    out_dir: pagesDir,
    out_prefix: outputPrefix,
    page: null
  };

  await pdfPoppler.convert(pdfPath, options);

  const pageImages = [];

  for (let i = 1; i <= pageCount; i++) {
    pageImages.push({
      pageNumber: i,
      imagePath: path.join(pagesDir, `${outputPrefix}-${i}.png`)
    });
  }

  return {
    pageCount,
    pageImages
  };
};

module.exports = renderPdfPages;