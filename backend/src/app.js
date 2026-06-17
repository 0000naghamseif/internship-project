const express = require('express');
const path = require("path");
const cors = require("cors");
const app = express();
const pool = require("./config/db");
const crypto = require("crypto");

app.use(cors());
app.use(express.json());

app.use("/processed", express.static(path.join(__dirname, "..", "processed")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));


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
const extractTextFromPdf = require("./services/textExtract.service");
const extractTextWithOcr = require("./services/ocr.service");
const normalizeText = require("./services/textNormalize.service");
const buildSearchIndex = require("./services/searchIndex.service");
const { generateEmbeddingsForIndex } = require('./services/embedding.service');
const semanticSearch = require("./services/semanticSearch.service");
const suggestCategory = require('./services/categorySuggestion.service');

const createChecksum = (value) => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

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

    const dbResult = await pool.query(
      `INSERT INTO documents 
   (original_name, stored_name, document_type, page_count, status, uploaded_by)
   VALUES ($1, $2, $3, $4, $5, $6)
   RETURNING id`,
      [
        newFile.originalName,
        newFile.filename,
        newFile.normalizedType,
        newFile.pageCount,
        newFile.status,
        req.user.id,
      ],
    );

    newFile.id = dbResult.rows[0].id;
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

      for (const pageRecord of pageRecords) {
        const pageChecksum = createChecksum(
          `${newFile.filename}-${pageRecord.pageNumber}-${pageRecord.textContent || ''}`,
        );

        const insertedPage = await pool.query(
          `INSERT INTO document_pages
     (document_id, page_number, image_path, text_content, qr_path,
      is_image_only, text_extraction_method, ocr_confidence, language,
      page_checksum, qr_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
          [
            newFile.id,
            pageRecord.pageNumber,
            pageRecord.imagePath,
            pageRecord.textContent,
            pageRecord.qrPath,
            pageRecord.isImageOnly || false,
            pageRecord.textExtractionMethod,
            pageRecord.ocrConfidence || null,
            pageRecord.language || null,
            pageChecksum,
            pageRecord.qrPayload || null,
          ],
        );

        pageRecord.id = insertedPage.rows[0].id;
        pageRecord.pageChecksum = pageChecksum;
      }
      newFile.pageCount = rendered.pageCount;
      newFile.status = 'Done';
      await pool.query(
        `UPDATE documents
   SET document_type = $1,
       page_count = $2,
       status = $3,
       qr_path = $4,
       printable_pdf_path = $5
   WHERE id = $6`,
        [
          newFile.normalizedType,
          newFile.pageCount,
          newFile.status,
          newFile.documentQrPath,
          newFile.printablePdfPath,
          newFile.id,
        ],
      );
    } catch (error) {
      console.log("Processing failed, attempt:", newFile.attempts);

      if (newFile.attempts < newFile.maxAttempts) {
        console.log("Retrying...");
        await processFile(); // 🔁 retry
      } else {
        newFile.status = "Failed";
        newFile.error = error.message;
        await pool.query('UPDATE documents SET status = $1 WHERE id = $2', [
          'Failed',
          newFile.id,
        ]);
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

app.get('/files', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        d.id,
        d.original_name AS "originalName",
        d.stored_name AS filename,
        d.document_type AS "normalizedType",
        d.page_count AS "pageCount",
        d.status,
        d.qr_path AS "documentQrPath",
        d.printable_pdf_path AS "printablePdfPath",
        d.created_at AS "createdAt",
        u.username AS "uploadedBy"
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       ORDER BY d.id DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch documents',
      error: error.message,
    });
  }
});

app.get("/pages", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.id,
        d.stored_name AS "documentId",
        p.page_number AS "pageNumber",
        p.image_path AS "imagePath",
        p.text_content AS "textContent",
        p.qr_path AS "qrPath",
        p.is_image_only AS "isImageOnly",
        p.text_extraction_method AS "textExtractionMethod",
        p.ocr_confidence AS "ocrConfidence",
        p.language,
        p.page_checksum AS "pageChecksum",
        p.qr_payload AS "qrPayload"
       FROM document_pages p
       JOIN documents d ON p.document_id = d.id
       ORDER BY p.id ASC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch pages",
      error: error.message
    });
  }
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

app.get("/files/:filename/pages", async (req, res) => {
  try {
    const { filename } = req.params;

    const result = await pool.query(
      `SELECT 
        p.id,
        d.stored_name AS "documentId",
        p.page_number AS "pageNumber",
        p.image_path AS "imagePath",
        p.text_content AS "textContent",
        p.qr_path AS "qrPath",
        p.is_image_only AS "isImageOnly",
        p.text_extraction_method AS "textExtractionMethod",
        p.ocr_confidence AS "ocrConfidence",
        p.language,
        p.page_checksum AS "pageChecksum",
        p.qr_payload AS "qrPayload"
       FROM document_pages p
       JOIN documents d ON p.document_id = d.id
       WHERE d.stored_name = $1
       ORDER BY p.page_number ASC`,
      [filename]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch document pages",
      error: error.message
    });
  }
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

app.get("/search", async (req, res) => {
  try {
    const { q, uploadedBy, type, status } = req.query;

    if (!q) {
      return res.status(400).json({
        message: "Search query is required"
      });
    }

    const values = [`%${q}%`];

    let sql = `
      SELECT
        p.id AS "pageId",
        d.stored_name AS "documentId",
        d.original_name AS "originalName",
        p.page_number AS "pageNumber",
        p.text_content AS "textContent",
        p.image_path AS "imagePath",
        p.qr_path AS "qrPath",
        p.text_extraction_method AS "textExtractionMethod",
        d.document_type AS "normalizedType",
        d.status,
        u.username AS "uploadedBy"
      FROM document_pages p
      JOIN documents d ON p.document_id = d.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE p.text_content ILIKE $1
    `;

    if (uploadedBy) {
      values.push(uploadedBy);
      sql += ` AND u.username = $${values.length}`;
    }

    if (type) {
      values.push(type);
      sql += ` AND d.document_type = $${values.length}`;
    }

    if (status) {
      values.push(status);
      sql += ` AND d.status = $${values.length}`;
    }

    sql += ` ORDER BY d.id DESC, p.page_number ASC`;

    const result = await pool.query(sql, values);

   const uniqueDocuments = [];

for (const page of result.rows) {
  const alreadyExists = uniqueDocuments.find(
    (item) => item.documentId === page.documentId
  );

  if (!alreadyExists) {
    uniqueDocuments.push(page);
  }
}

const results = uniqueDocuments.map((page) => {
  const text = page.textContent || "";
  const lowerText = text.toLowerCase();
  const query = q.toLowerCase();
  const matchIndex = lowerText.indexOf(query);

  const start = Math.max(matchIndex - 60, 0);
  const end = Math.min(matchIndex + q.length + 120, text.length);

  const snippet = text.substring(start, end);

  return {
    ...page,
    snippet
  };
});

    res.json(results);
  } catch (error) {
    res.status(500).json({
      message: "Search failed",
      error: error.message
    });
  }
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "Database connected ✅",
      time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed ❌",
      error: error.message,
    });
  }
});

app.post("/search-index/build", async (req, res) => {
  try {
    const result = await buildSearchIndex();

    res.json({
      message: "Search index built successfully ✅",
      indexedPages: result.indexedPages
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to build search index ❌",
      error: error.message
    });
  }
});

app.post("/embeddings/generate", async (req, res) => {
  try {
    const result = await generateEmbeddingsForIndex();

    res.json({
      message: "Embeddings generated successfully ✅",
      embeddedRecords: result.embeddedRecords
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate embeddings ❌",
      error: error.message
    });
  }
});

app.get("/semantic-search", async (req, res) => {
  try {
    const { q, limit, uploadedBy, type, status } = req.query;

    if (!q) {
      return res.status(400).json({
        message: 'Search query is required',
      });
    }

    const results = await semanticSearch(q, limit || 5, {
      uploadedBy,
      type,
      status,
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({
      message: 'Semantic search failed',
      error: error.message,
    });
  }
});

app.get("/documents/:id/suggest-category", async (req, res) => {
  try {
    const { id } = req.params;

    const pageResult = await pool.query(
      `
      SELECT text_content
      FROM document_pages
      WHERE document_id = $1
      ORDER BY page_number ASC
      LIMIT 3
      `,
      [id]
    );

    if (!pageResult.rows.length) {
      return res.status(404).json({
        message: "Document not found"
      });
    }

    const combinedText = pageResult.rows
      .map((page) => page.text_content || "")
      .join(" ");

    const suggestion = suggestCategory(combinedText);

    res.json(suggestion);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});
app.post('/documents/:id/confirm-category', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    // 1. save confirmed category
    await pool.query(
      `
      UPDATE documents
      SET category_ids = $1
      WHERE id = $2
      `,
      [category, id],
    );

    // 2. save audit log
    await pool.query(
      `
  INSERT INTO audit_logs
  (
    actor_id,
    action,
    object_type,
    object_id,
    metadata
  )
  VALUES
  (
    $1,
    $2,
    $3,
    $4,
    $5
  )
  `,
      [
        req.user.id,
        'CATEGORY_CONFIRMED',
        'DOCUMENT',
        id,
        JSON.stringify({ category }),
      ],
    );
    res.json({
      message: 'Category confirmed and audit log saved',
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
