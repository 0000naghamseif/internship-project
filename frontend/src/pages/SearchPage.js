import { useState } from "react";
import api from "../services/api";
import "./SearchPage.css";

function SearchPage({ onBack, onOpenPage }) {
  const [query, setQuery] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState("keyword");

  const toFileUrl = (filePath) => {
    if (!filePath) return "";
    return `http://localhost:3001/${filePath.replaceAll("\\", "/")}`;
  };

  const highlightText = (text = "", keyword = "") => {
    if (!keyword.trim()) return text;

    const parts = text.split(new RegExp(`(${keyword})`, "gi"));

    return parts.map((part, index) =>
      part.toLowerCase() === keyword.toLowerCase() ? (
        <mark key={index}>{part}</mark>
      ) : (
        part
      )
    );
  };

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!query.trim()) {
      setMessage("Please enter a search word");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const params = new URLSearchParams();
      params.append("q", query);

      if (uploadedBy) params.append("uploadedBy", uploadedBy);
      if (type) params.append("type", type);
      if (status) params.append("status", status);

      let res;

      if (searchMode === 'keyword') {
        res = await api.get(`/search?${params.toString()}`);
      }

      if (searchMode === 'semantic') {
        res = await api.get(`/semantic-search?${params.toString()}`);
      }

      if (searchMode === 'hybrid') {
        const keywordRes = await api.get(`/search?${params.toString()}`);
        const semanticRes = await api.get(
          `/semantic-search?${params.toString()}`,
        );

        const combined = [...keywordRes.data, ...semanticRes.data];

        const uniqueResults = combined.filter(
          (item, index, self) =>
            index ===
            self.findIndex(
              (r) =>
                r.documentId === item.documentId &&
                r.pageNumber === item.pageNumber,
            ),
        );

        res = { data: uniqueResults };
      }

      setResults(res.data);
      setMessage(`${res.data.length} result(s) found`);
    } catch (error) {
      setMessage("Search failed ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-page">
      <div className="search-header">
        <div>
          <h1>Text Search</h1>
          <p>Search inside extracted PDF and OCR text</p>
        </div>

        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>

      <div className="search-card">
        <form onSubmit={handleSearch} className="text-search-form">
          <input
            placeholder="Search extracted text..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value)}
          >
            <option value="keyword">Keyword</option>
            <option value="semantic">Semantic</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <input
            placeholder="Uploader"
            value={uploadedBy}
            onChange={(e) => setUploadedBy(e.target.value)}
          />

          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All Types</option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="image">Image</option>
          </select>

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="Done">Done</option>
            <option value="Processing">Processing</option>
            <option value="Queued">Queued</option>
            <option value="Failed">Failed</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </div>

      {results.length === 0 && !loading && message && (
        <p className="empty-text">No matching pages found.</p>
      )}

      <div className="search-results">
        {results.map((page, index) => (
          <div className="result-card" key={index}>
            <div className="result-card-header">
              <div>
                <h3>{page.originalName || page.documentId}</h3>

                <div className="result-meta">
                  <span>Page: {page.pageNumber}</span>
                  <span>Type: {page.normalizedType}</span>
                  <span>Status: {page.status}</span>
                  <span>Uploader: {page.uploadedBy}</span>
                  <span>Method: {page.textExtractionMethod}</span>
                </div>
              </div>

              {page.qrPath && (
                <div className="result-qr">
                  <img src={toFileUrl(page.qrPath)} alt="Page QR" />
                  <span>Page QR</span>
                </div>
              )}
            </div>

            <div className="result-text">
              {highlightText(page.snippet, query)}
            </div>

            <button
              className="open-page-button"
              onClick={() => onOpenPage(page.documentId, page.pageNumber)}
            >
              Open Page
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchPage;