const express = require('express');
const app = express();

app.use(express.json());

const authRoutes = require('./routes/auth.routes');
const verifyToken = require('./middleware/auth.middleware');
const allowRoles = require('./middleware/role.middleware');
const upload = require('./middleware/upload.middleware');
const files = require('./models/file.model');
const normalizeToPdf = require('./services/normalize.service');
const documentPages = require('./models/documentPage.model');
const renderPdfPages = require('./services/pageRender.service');

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
      newFile.status = "Processing";

      const normalized = await normalizeToPdf(req.file);

      newFile.normalizedPdfPath = normalized.normalizedPdfPath;
      newFile.normalizedFileName = normalized.normalizedFileName;
      newFile.normalizedType = normalized.type;

      const rendered = await renderPdfPages(
        normalized.normalizedPdfPath,
        newFile.filename
      );

      const pageRecords = [];

      rendered.pageImages.forEach((page) => {
        const pageRecord = {
          documentId: newFile.filename,
          pageNumber: page.pageNumber,
          imagePath: null,
          textContent: null,
          status: "Queued"
        };

        documentPages.push(pageRecord);
        pageRecords.push(pageRecord);
      });

      for (const pageRecord of pageRecords) {
        pageRecord.status = "Processing";

        await new Promise((r) => setTimeout(r, 300));

        const pageData = rendered.pageImages.find(
          (p) => p.pageNumber === pageRecord.pageNumber
        );

        pageRecord.imagePath = pageData.imagePath;
        pageRecord.status = "Rendered";
      }

      newFile.pageCount = rendered.pageCount;
      newFile.status = "Done";

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

    // setTimeout(async () => {
    //   try {
    //     newFile.status = 'Processing';

    //     const normalized = await normalizeToPdf(req.file);

    //     newFile.normalizedPdfPath = normalized.normalizedPdfPath;
    //     newFile.normalizedFileName = normalized.normalizedFileName;
    //     newFile.normalizedType = normalized.type;

    //     const rendered = await renderPdfPages(
    //       normalized.normalizedPdfPath,
    //       newFile.filename,
    //     );

    //     const pageRecords = [];

    //     rendered.pageImages.forEach((page) => {
    //       const pageRecord = {
    //         documentId: newFile.filename,
    //         pageNumber: page.pageNumber,
    //         imagePath: null,
    //         textContent: null,
    //         status: 'Queued',
    //       };

    //       documentPages.push(pageRecord);
    //       pageRecords.push(pageRecord);
    //     });

    //     // simulate processing pages
    //     for (const pageRecord of pageRecords) {
    //       try {
    //         pageRecord.status = 'Processing';

    //         // simulate small delay per page
    //         await new Promise((resolve) => setTimeout(resolve, 500));

    //         // assign image after processing
    //         const pageData = rendered.pageImages.find(
    //           (p) => p.pageNumber === pageRecord.pageNumber,
    //         );

    //         pageRecord.imagePath = pageData.imagePath;
    //         pageRecord.status = 'Rendered';
    //       } catch (err) {
    //         pageRecord.status = 'Failed';
    //       }
    //     }

    //     newFile.pageCount = rendered.pageCount;
    //     newFile.status = 'Done';
       
    //   } catch (error) {
    //     newFile.status = 'Failed';
    //     newFile.error = error.message;
    //   }
    // }, 2000);

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

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
