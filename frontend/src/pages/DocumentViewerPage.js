import { useEffect, useState } from "react";
import api from "../services/api";
import "./DocumentViewerPage.css";

function DocumentViewerPage({ filename, initialPageNumber, onBack }) {
  const [pages, setPages] = useState([]);
  const [message, setMessage] = useState("");

  const toFileUrl = (filePath) => {
    if (!filePath) return "";
    return `http://localhost:3001/${filePath.replaceAll("\\", "/")}`;
  };

  const fetchPages = async () => {
    try {
      const res = await api.get(`/files/${filename}/pages`);
      setPages(res.data);
    } catch (error) {
      setMessage("Failed to load pages ❌");
    }
  };

  useEffect(() => {
    fetchPages();
  }, [filename]);

  useEffect(() => {
    if (!initialPageNumber || pages.length === 0) return;

    setTimeout(() => {
      const pageElement = document.getElementById(`page-${initialPageNumber}`);

      if (pageElement) {
        pageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, 300);
  }, [initialPageNumber, pages]);

  return (
    <div className="viewer-container">
      <div className="viewer-header">
        <div>
          <h1>Document Viewer</h1>
          <p>{filename}</p>
        </div>

        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>

      {message && <p className="message">{message}</p>}

      <div className="pages-list">
        {pages.map((page) => (
          <div
            className="page-card"
            id={`page-${page.pageNumber}`}
            key={page.pageNumber}
          >
            <div className="page-top">
              <div>
                <h3>Page {page.pageNumber}</h3>
                <p>
                  <strong>Status:</strong> {page.status}
                </p>
                <p>
                  <strong>Text Method:</strong>{' '}
                  {page.textExtractionMethod || 'N/A'}
                </p>

                {page.ocrConfidence && (
                  <p>
                    <strong>OCR Confidence:</strong> {page.ocrConfidence}
                  </p>
                )}
              </div>

              {page.qrPath && (
                <div className="qr-box">
                  <img src={toFileUrl(page.qrPath)} alt="Page QR" />
                  <span>Page QR</span>
                </div>
              )}
            </div>

            <div className="page-content-grid">
              <div className="page-preview">
                <h4>Page Image</h4>
                {page.imagePath ? (
                  <img
                    src={toFileUrl(page.imagePath)}
                    alt={`Page ${page.pageNumber}`}
                  />
                ) : (
                  <p>No image available</p>
                )}
              </div>

              <div className="page-text">
                <h4>Extracted Text</h4>
                <p>{page.textContent || 'No text found'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DocumentViewerPage;