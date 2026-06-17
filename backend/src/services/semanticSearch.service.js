const pool = require("../config/db");
const { generateEmbedding } = require("./embedding.service");

const cosineSimilarity = (vectorA, vectorB) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const semanticSearch = async (query, limit = 5, filters = {}) => {
  const queryEmbedding = await generateEmbedding(query);

 const values = [];

 let sql = `
  SELECT
    s.id AS "searchIndexId",
    s.embedding,
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
  FROM search_index_records s
  JOIN document_pages p ON s.page_id = p.id
  JOIN documents d ON p.document_id = d.id
  LEFT JOIN users u ON d.uploaded_by = u.id
  WHERE s.embedding IS NOT NULL
`;

 if (filters.uploadedBy) {
   values.push(filters.uploadedBy);
   sql += ` AND u.username = $${values.length}`;
 }

 if (filters.type) {
   values.push(filters.type);
   sql += ` AND d.document_type = $${values.length}`;
 }

 if (filters.status) {
   values.push(filters.status);
   sql += ` AND d.status = $${values.length}`;
 }

 const result = await pool.query(sql, values);

  const scoredResults = result.rows.map((row) => {
    const pageEmbedding =
      typeof row.embedding === 'string'
        ? JSON.parse(row.embedding)
        : row.embedding;

    const score = cosineSimilarity(queryEmbedding, pageEmbedding);

    const text = row.textContent || '';
    const snippet = text.substring(0, 250);

    const { embedding, ...cleanRow } = row;

    return {
      ...cleanRow,
      similarityScore: Number(score.toFixed(4)),
      snippet,
    };
  });

 const filteredResults = scoredResults
   .filter((item) => item.similarityScore > 0.25)
   .sort((a, b) => b.similarityScore - a.similarityScore);

 const uniqueDocuments = [];

 for (const item of filteredResults) {
   const alreadyExists = uniqueDocuments.find(
     (doc) => doc.documentId === item.documentId,
   );

   if (!alreadyExists) {
     uniqueDocuments.push(item);
   }
 }

 return uniqueDocuments.slice(0, Number(limit));
};

module.exports = semanticSearch;