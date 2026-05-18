const fs = require("fs");

const extractTextFromPdf = async (pdfPath) => {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const pdfBytes = fs.readFileSync(pdfPath);

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    disableWorker: true,
    standardFontDataUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/standard_fonts/"
  });

  const pdf = await loadingTask.promise;
  const pagesText = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const text = textContent.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    pagesText.push({
      pageNumber,
      textContent: text,
      isImageOnly: text.length === 0
    });
  }

  return pagesText;
};

module.exports = extractTextFromPdf;