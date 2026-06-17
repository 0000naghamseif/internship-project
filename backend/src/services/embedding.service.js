const pool = require("../config/db");

let extractor = null;

const loadEmbeddingModel = async () => {
  if (!extractor) {
    const { pipeline } = await import("@huggingface/transformers");

    extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }

  return extractor;
};

const generateEmbedding = async (text) => {
  const model = await loadEmbeddingModel();

  const output = await model(text, {
    pooling: "mean",
    normalize: true
  });

  return Array.from(output.data);
};

const generateEmbeddingsForIndex = async () => {
  const result = await pool.query(`
    SELECT id, normalized_text
    FROM search_index_records
    WHERE normalized_text IS NOT NULL
      AND normalized_text <> ''
  `);

  for (const record of result.rows) {
    const embedding = await generateEmbedding(record.normalized_text);

    await pool.query(
      `UPDATE search_index_records
       SET embedding = $1,
           vector_embedding_id = $2
       WHERE id = $3`,
      [
        JSON.stringify(embedding),
        `xenova-minilm-${record.id}`,
        record.id
      ]
    );
  }

  return {
    embeddedRecords: result.rows.length
  };
};

module.exports = {
  generateEmbedding,
  generateEmbeddingsForIndex
};