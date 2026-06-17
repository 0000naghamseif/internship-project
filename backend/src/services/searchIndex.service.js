const pool = require("../config/db");
const normalizeText = require("./textNormalize.service");

const buildSearchIndex = async () => {
  const pagesResult = await pool.query(`
    SELECT 
      id,
      text_content
    FROM document_pages
    WHERE text_content IS NOT NULL
      AND text_content <> ''
  `);

  for (const page of pagesResult.rows) {
    const normalizedText = normalizeText(page.text_content);

    const keywords = normalizedText
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 3)
      .slice(0, 50)
      .join(", ");

    const existing = await pool.query(
      "SELECT id FROM search_index_records WHERE page_id = $1",
      [page.id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE search_index_records
         SET keywords = $1,
             normalized_text = $2
         WHERE page_id = $3`,
        [keywords, normalizedText, page.id]
      );
    } else {
      await pool.query(
        `INSERT INTO search_index_records
         (page_id, keywords, normalized_text)
         VALUES ($1, $2, $3)`,
        [page.id, keywords, normalizedText]
      );
    }
  }

  return {
    indexedPages: pagesResult.rows.length
  };
};

module.exports = buildSearchIndex;