const express = require('express');
const path = require("path");
const cors = require("cors");
const app = express();
const pool = require("./config/db");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

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
const {
  buildSearchIndex,
  buildSearchIndexForDocument,
} = require("./services/searchIndex.service");
const {
  generateEmbeddingsForIndex,
  generateEmbeddingsForDocument,
} = require('./services/embedding.service');
const semanticSearch = require("./services/semanticSearch.service");
const suggestCategory = require('./services/categorySuggestion.service');
const createAuditLog = require("./services/audit.service");


const createChecksum = (value) => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

// const rejectUnauthorizedUpload = (req, res, next) => {
//   const role = req.user?.role;

//   if (role === "Viewer") {
//     return res.status(403).json({
//       message: "Viewer should not be allowed to upload"
//     });
//   }

//   if (!["Admin", "Editor"].includes(role)) {
//     return res.status(403).json({
//       message: "Access denied"
//     });
//   }

//   next();
// };

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

app.get('/admin-only', verifyToken, allowRoles(["Admin"]), (req, res) => {
  res.json({ message: 'Welcome Admin 👑' });
});

app.post(
  '/upload',
  verifyToken,
  (req, res, next) => {
    if (req.user?.role === 'Viewer') {
      req.resume();
      req.on('end', () => {
        res
          .status(403)
          .json({ message: 'Access denied: insufficient permissions' });
      });
      return;
    }
    next();
  },
  allowRoles(['Admin', 'Editor']),
  upload.single('file'),
  async (req, res) => {
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
        maxAttempts: 2,
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

      await createAuditLog({
        actorId: req.user.id,
        action: 'DOCUMENT_UPLOADED',
        objectType: 'DOCUMENT',
        objectId: newFile.id,
        metadata: {
          filename: newFile.filename,
          originalName: newFile.originalName,
        },
      });

      files.push(newFile);

      const isTest = process.env.NODE_ENV === 'test';

      const startProcessing = async () => {
        const processFile = async () => {
          try {
            const delay = (ms) =>
              new Promise((resolve) => setTimeout(resolve, ms));

            const checkCancelled = async () => {
              const result = await pool.query(
                `SELECT cancel_requested FROM documents WHERE id = $1`,
                [newFile.id],
              );

              if (result.rows[0]?.cancel_requested) {
                newFile.status = 'Cancelled';

                await pool.query(
                  `UPDATE documents SET status = 'Cancelled' WHERE id = $1`,
                  [newFile.id],
                );

                return true;
              }

              return false;
            };

            newFile.attempts++;
            newFile.status = 'Processing';

            await pool.query(
              `UPDATE documents SET status = 'Processing' WHERE id = $1`,
              [newFile.id],
            );

            if (await checkCancelled()) return;

            const normalized = await normalizeToPdf(req.file);

            newFile.normalizedPdfPath = normalized.normalizedPdfPath;
            newFile.normalizedFileName = normalized.normalizedFileName;
            newFile.normalizedType = normalized.type;

            if (await checkCancelled()) return;

            const rendered = await renderPdfPages(
              normalized.normalizedPdfPath,
              newFile.filename,
            );

            await pool.query(
              `UPDATE documents
               SET total_pages = $1,
                   processed_pages = 0,
                   status = 'Processing'
               WHERE id = $2`,
              [rendered.pageCount, newFile.id],
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
              if (await checkCancelled()) return;

              pageRecord.status = 'Processing';

              await delay(800);

              const pageData = rendered.pageImages.find(
                (p) => p.pageNumber === pageRecord.pageNumber,
              );

              pageRecord.imagePath = pageData.imagePath;
              pageRecord.status = 'Rendered';
            }

            if (await checkCancelled()) return;

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
              if (await checkCancelled()) return;

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

            if (await checkCancelled()) return;

            const extractedPagesText = await extractTextFromPdf(
              newFile.normalizedPdfPath,
            );

            for (const pageRecord of pageRecords) {
              if (await checkCancelled()) return;

              const extracted = extractedPagesText.find(
                (p) => p.pageNumber === pageRecord.pageNumber,
              );

              pageRecord.textContent = normalizeText(
                extracted?.textContent || '',
              );
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

            if (await checkCancelled()) return;

            const printable = await stampQrOnPdf(
              newFile.normalizedPdfPath,
              pageRecords,
              newFile.filename,
            );

            newFile.printablePdfPath = printable.printablePdfPath;
            newFile.printableFileName = printable.printableFileName;

            for (const pageRecord of pageRecords) {
              if (await checkCancelled()) return;

              await delay(800);

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

              await pool.query(
                `UPDATE documents
                 SET processed_pages = processed_pages + 1
                 WHERE id = $1`,
                [newFile.id],
              );
            }

            if (await checkCancelled()) return;

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

            const indexResult = await buildSearchIndexForDocument(newFile.id);
            const embeddingResult = await generateEmbeddingsForDocument(
              newFile.id,
            );

            await createAuditLog({
              actorId: req.user.id,
              action: 'DOCUMENT_INCREMENTALLY_INDEXED',
              objectType: 'DOCUMENT',
              objectId: newFile.id,
              metadata: {
                indexedPages: indexResult.indexedPages,
                embeddedRecords: embeddingResult.embeddedRecords,
              },
            });
          } catch (error) {
            console.log('Processing failed, attempt:', newFile.attempts);
            console.log(error.message);

            if (newFile.attempts < newFile.maxAttempts) {
              console.log('Retrying...');
              await processFile();
            } else {
              newFile.status = 'Failed';
              newFile.error = error.message;

              await pool.query(
                `UPDATE documents
                 SET status = $1,
                     error_summary = $2
                 WHERE id = $3`,
                ['Failed', error.message, newFile.id],
              );
            }
          }
        };

        await processFile();
      };

      // ✅ FIX: prevent Jest from running background job
      if (!isTest) {
        startProcessing().catch(console.error);
      }

      return res.json({
        message: 'File uploaded and queued for normalization',
        file: newFile,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Upload failed',
        error: error.message,
      });
    }
  },
);

app.get('/files', verifyToken, async (req, res) => {
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
        d.category_ids AS "category",
        d.created_at AS "createdAt",
        d.processed_pages AS "processedPages",
        d.total_pages AS "totalPages",
        d.cancel_requested AS "cancelRequested",
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

app.get("/pages",verifyToken, async (req, res) => {
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

app.patch('/files/:filename/status', verifyToken,
  allowRoles(["Admin"]), (req, res) => {
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

app.get("/files/:filename/pages", verifyToken, async (req, res) => {
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
      error: error.message,
    });
  }
});

app.get('/files/:filename/qr',verifyToken, (req, res) => {
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

app.get("/files/:filename/printable", async (req, res) => {
  try {
    const { filename } = req.params;
    const { token } = req.query;

    let decoded;

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      decoded = jwt.verify(token, "secretkey");
    } catch (error) {
      return res.status(401).json({ message: "Invalid token" });
    }

    let sql = `
      SELECT id, uploaded_by, printable_pdf_path
      FROM documents
      WHERE stored_name = $1
    `;

    const values = [filename];

    // // Admin يفتح أي printable
    // // Viewer / Editor يفتحوا بس ملفاتهم
    // if (decoded.role !== "Admin") {
    //   values.push(decoded.id);
    //   sql += ` AND uploaded_by = $${values.length}`;
    // }

    const result = await pool.query(sql, values);

    if (!result.rows.length || !result.rows[0].printable_pdf_path) {
      return res.status(404).json({
        message: "Printable PDF not found or access denied",
      });
    }

    await createAuditLog({
      actorId: decoded.id,
      action: "DOCUMENT_DOWNLOADED",
      objectType: "DOCUMENT",
      objectId: result.rows[0].id,
      metadata: {
        filename,
        type: "printable_pdf",
      },
    });

    res.sendFile(path.resolve(result.rows[0].printable_pdf_path));
  } catch (error) {
    res.status(500).json({
      message: "Failed to open printable PDF",
      error: error.message,
    });
  }
});

app.get("/files/:filename/pages/:pageNumber",verifyToken, (req, res) => {
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

app.get("/search", verifyToken, async (req, res) => {
  try {
    const { q, uploadedBy, type, status } = req.query;

    if (!q) {
      return res.status(400).json({
        message: "Search query is required",
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

    // if (req.user.role !== "Admin") {
    //   values.push(req.user.id);
    //   sql += ` AND d.uploaded_by = $${values.length}`;
    // }

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
        snippet,
      };
    });

    await createAuditLog({
      actorId: req.user.id,
      action: "KEYWORD_SEARCH",
      objectType: "SEARCH",
      metadata: {
        query: q,
        uploadedBy,
        type,
        status,
        resultCount: results.length,
      },
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({
      message: "Search failed",
      error: error.message,
    });
  }
});
app.get("/db-test",verifyToken,
  allowRoles(["Admin"]), async (req, res) => {
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

app.post("/search-index/build", verifyToken, 
  allowRoles(["Admin"]), async (req, res) => {
  try {
    const result = await buildSearchIndex();

    await createAuditLog({
      actorId: req.user.id,
      action: 'SEARCH_INDEX_BUILT',
      objectType: 'SEARCH_INDEX',
      metadata: {
        indexedPages: result.indexedPages,
      },
    });

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

app.post("/embeddings/generate", verifyToken,  allowRoles(["Admin"]), async (req, res) => {
  try {
    const result = await generateEmbeddingsForIndex();

    await createAuditLog({
      actorId: req.user.id,
      action: 'EMBEDDINGS_GENERATED',
      objectType: 'EMBEDDING',
      metadata: {
        embeddedRecords: result.embeddedRecords,
      },
    });

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

app.get("/semantic-search", verifyToken, async (req, res) => {
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
    await createAuditLog({
      actorId: req.user.id,
      action: 'SEMANTIC_SEARCH',
      objectType: 'SEARCH',
      metadata: {
        query: q,
        uploadedBy,
        type,
        status,
        resultCount: results.length,
      },
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({
      message: 'Semantic search failed',
      error: error.message,
    });
  }
});

app.get("/documents/:id/suggest-category", verifyToken, allowRoles(["Admin", "Editor"]), async (req, res) => {
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

    await createAuditLog({
      actorId: req.user.id,
      action: 'CATEGORY_SUGGESTED',
      objectType: 'DOCUMENT',
      objectId: id,
      metadata: suggestion,
    });

    res.json(suggestion);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});
app.post('/documents/:id/confirm-category', verifyToken, allowRoles(["Admin", "Editor"]), async (req, res) => {
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

app.post(
  "/documents/:id/cancel",
  verifyToken,
  allowRoles(["Admin", "Editor"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(
        `
        UPDATE documents
        SET cancel_requested = true,
            status = 'Cancelled'
        WHERE id = $1
        `,
        [id]
      );

      await createAuditLog({
        actorId: req.user.id,
        action: "DOCUMENT_PROCESSING_CANCELLED",
        objectType: "DOCUMENT",
        objectId: id,
        metadata: {
          reason: "User requested cancellation",
        },
      });

      res.json({
        message: "Processing cancellation requested",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to cancel processing",
        error: error.message,
      });
    }
  }
);
app.get(
  "/dashboard/stats",
  verifyToken,
  allowRoles(["Admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) AS "totalDocuments",
          COUNT(*) FILTER (WHERE status = 'Done') AS "done",
          COUNT(*) FILTER (WHERE status = 'Processing') AS "processing",
          COUNT(*) FILTER (WHERE status = 'Queued') AS "queued",
          COUNT(*) FILTER (WHERE status = 'Failed') AS "failed",
          COUNT(*) FILTER (WHERE status = 'Cancelled') AS "cancelled"
        FROM documents
      `);

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({
        message: "Failed to load dashboard statistics",
        error: error.message,
      });
    }
  }
);
if (require.main === module) {
    app.listen(3001, () => {
    console.log('Server running on port 3001');
  });
}

module.exports = app;
