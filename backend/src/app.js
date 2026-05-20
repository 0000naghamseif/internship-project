const express = require('express');
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth.routes');
const verifyToken = require('./middleware/auth.middleware');
const allowRoles = require('./middleware/role.middleware');
const upload = require('./middleware/upload.middleware');
const files = require('./models/file.model');
const normalizeToPdf = require('./services/normalize.service');
const documentPages = require('./models/documentPage.model');
const renderPdfPages = require('./services/pageRender.service');
const { createQrPayload, generateQrImage } = require("./services/qr.service");
const stampQrOnPdf = require("./services/pdfStamp.service");
const path = require("path");
const extractTextFromPdf = require("./services/textExtract.service");
const extractTextWithOcr = require("./services/ocr.service");
const normalizeText = require("./services/textNormalize.service");

app.use('/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Backend is working 🚀');
});

app.get('/protected', verifyToken, (req, res) => {
  res.json({
    message: 'You are authorized',
    user: req.user,
  });
});

app.get('/admin-only', verifyToken, allowRoles('Admin'), (req, res) => {
  res.json({ message: 'Welcome Admin 👑' });
});

app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const newFile = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      originalPath: req.file.path,
      normalizedPdfPath: null,
      normalizedFileName: null,
      normalizedType: null,
      pageCount: 0,
      status: 'Queued',
      uploadedBy: req.user.username,
      attempts: 0,
      maxAttempts: 2
    };

    files.push(newFile);

    setTimeout(async () => {
  const processFile = async () => {
    try {
      newFile.attempts++;
      newFile.status = 'Processing';

      const normalized = await normalizeToPdf(req.file);

      newFile.normalizedPdfPath = normalized.normalizedPdfPath;
      newFile.normalizedFileName = normalized.normalizedFileName;
      newFile.normalizedType = normalized.type;

      const rendered = await renderPdfPages(
        normalized.normalizedPdfPath,
        newFile.filename,
      );

      const pageRecords = [];

      rendered.pageImages.forEach((page) => {
        const pageRecord = {
          documentId: newFile.filename,
          pageNumber: page.pageNumber,
          imagePath: null,
          textContent: null,
          status: 'Queued',
        };

        documentPages.push(pageRecord);
        pageRecords.push(pageRecord);
      });

      for (const pageRecord of pageRecords) {
        pageRecord.status = 'Processing';

        await new Promise((r) => setTimeout(r, 300));

        const pageData = rendered.pageImages.find(
          (p) => p.pageNumber === pageRecord.pageNumber,
        );

        pageRecord.imagePath = pageData.imagePath;
        pageRecord.status = 'Rendered';
      }

      const documentQrPayload = createQrPayload({
        type: 'document',
        documentId: newFile.filename,
      });

      newFile.documentQrPayload = documentQrPayload;
      newFile.documentQrPath = await generateQrImage(
        documentQrPayload,
        `${newFile.filename}-document-qr.png`,
      );

      for (const pageRecord of pageRecords) {
        const pageQrPayload = createQrPayload({
          type: 'page',
          documentId: newFile.filename,
          pageNumber: pageRecord.pageNumber,
        });

        pageRecord.qrPayload = pageQrPayload;
        pageRecord.qrPath = await generateQrImage(
          pageQrPayload,
          `${newFile.filename}-page-${pageRecord.pageNumber}-qr.png`,
        );
      }

      

      // // Extract native text from normalized PDF
      const extractedPagesText = await extractTextFromPdf(
        newFile.normalizedPdfPath,
      );

      for (const pageRecord of pageRecords) {
        const extracted = extractedPagesText.find(
          (p) => p.pageNumber === pageRecord.pageNumber,
        );

        pageRecord.textContent = normalizeText(extracted?.textContent || '');
        pageRecord.isImageOnly = extracted?.isImageOnly || false;
        pageRecord.textExtractionMethod = pageRecord.isImageOnly
          ? 'pending-ocr'
          : 'native-pdf';

        if (pageRecord.isImageOnly && pageRecord.imagePath) {
          const ocrResult = await extractTextWithOcr(
            pageRecord.imagePath,
            'eng',
          );

          pageRecord.textContent = normalizeText(ocrResult.textContent);
          pageRecord.ocrConfidence = ocrResult.ocrConfidence;
          pageRecord.language = ocrResult.language;
          pageRecord.textExtractionMethod = 'ocr';
        }
      }
      // const extractedPagesText = await extractTextFromPdf(
      //   newFile.normalizedPdfPath,
      // );

      // for (const pageRecord of pageRecords) {
      //   const extracted = extractedPagesText.find(
      //     (p) => p.pageNumber === pageRecord.pageNumber,
      //   );

      //   pageRecord.textContent = extracted?.textContent || '';
      //   pageRecord.isImageOnly = extracted?.isImageOnly || false;
      //   pageRecord.textExtractionMethod = pageRecord.isImageOnly
      //     ? 'none'
      //     : 'native-pdf';
      // }

      // Stamp page QR codes onto the normalized PDF
      const printable = await stampQrOnPdf(
        newFile.normalizedPdfPath,
        pageRecords,
        newFile.filename,
      );

      newFile.printablePdfPath = printable.printablePdfPath;
      newFile.printableFileName = printable.printableFileName;

      newFile.pageCount = rendered.pageCount;
      newFile.status = 'Done';
    } catch (error) {
      console.log("Processing failed, attempt:", newFile.attempts);

      if (newFile.attempts < newFile.maxAttempts) {
        console.log("Retrying...");
        await processFile(); // 🔁 retry
      } else {
        newFile.status = "Failed";
        newFile.error = error.message;
      }
    }
  };

  await processFile();
}, 2000);

   

    res.json({
      message: 'File uploaded and queued for normalization',
      file: newFile,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Upload failed',
      error: error.message,
    });
  }
});

app.get('/files', (req, res) => {
  res.json(files);
});

app.get('/pages', (req, res) => {
  res.json(documentPages);
});

app.patch('/files/:filename/status', (req, res) => {
  const { filename } = req.params;
  const { status } = req.body;

  const file = files.find((f) => f.filename === filename);

  if (!file) {
    return res.status(404).json({ message: 'File not found' });
  }

  file.status = status;

  res.json({
    message: 'Status updated',
    file,
  });
});

app.get('/files/:filename/pages', (req, res) => {
  const { filename } = req.params;

  const pages = documentPages.filter((page) => page.documentId === filename);

  res.json(pages);
});

app.get('/files/:filename/qr', (req, res) => {
  const { filename } = req.params;

  const file = files.find((f) => f.filename === filename);

  if (!file) {
    return res.status(404).json({ message: 'File not found' });
  }

  res.json({
    documentId: file.filename,
    qrPayload: file.documentQrPayload,
    qrPath: file.documentQrPath
  });
});

app.get("/files/:filename/printable", (req, res) => {
  const { filename } = req.params;

  const file = files.find((f) => f.filename === filename);

  if (!file || !file.printablePdfPath) {
    return res.status(404).json({ message: "Printable PDF not found" });
  }

  res.sendFile(path.resolve(file.printablePdfPath));
});

app.get("/files/:filename/pages/:pageNumber", (req, res) => {
  const { filename, pageNumber } = req.params;

  const page = documentPages.find(
    (p) =>
      p.documentId === filename &&
      p.pageNumber === Number(pageNumber)
  );

  if (!page) {
    return res.status(404).json({ message: "Page not found" });
  }

  res.json(page);
});

app.get("/search", (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ message: "Search query is required" });
  }

  const query = q.toLowerCase();

  const results = documentPages.filter((page) =>
    page.textContent?.toLowerCase().includes(query)
  );

  res.json(results);
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
