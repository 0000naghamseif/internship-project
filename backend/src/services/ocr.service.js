const Tesseract = require("tesseract.js");

const extractTextWithOcr = async (imagePath, language = "eng") => {
  const result = await Tesseract.recognize(imagePath, language);

  return {
    textContent: result.data.text.replace(/\s+/g, " ").trim(),
    ocrConfidence: result.data.confidence,
    language
  };
};

module.exports = extractTextWithOcr;