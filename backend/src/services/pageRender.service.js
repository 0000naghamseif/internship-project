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

    // try normal name
    const normalPath = path.join(
      pagesDir,
      `${outputPrefix}-${i}.png`
    );

    // try padded name like 01, 02, 03...
    const paddedPath = path.join(
      pagesDir,
      `${outputPrefix}-${String(i).padStart(2, "0")}.png`
    );

    // use existing file
    const imagePath = fs.existsSync(normalPath)
      ? normalPath
      : paddedPath;

    pageImages.push({
      pageNumber: i,
      imagePath
    });
  }

  return {
    pageCount,
    pageImages
  };
};

module.exports = renderPdfPages;