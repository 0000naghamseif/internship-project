import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import "./DashboardPage.css";

function DashboardPage({ onLogout, onViewDocument, onSearch }){
  const [file, setFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState({});
  const [selectedCategories, setSelectedCategories] = useState({});

  const fileInputRef = useRef(null);
  const token = localStorage.getItem('token');

  const fetchDocuments = async () => {
    try {
      const res = await api.get('/files');
      setDocuments(res.data);
    } catch (error) {
      setMessage('Failed to load documents ❌');
    }
  };

  useEffect(() => {
    fetchDocuments();

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) {
      setMessage('Please choose a file first');
      return;
    }

    if (!token) {
      setMessage('You must login first ❌');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setMessage('File uploaded successfully ✅');
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      fetchDocuments();
    } catch (error) {
      console.log(error);
      setMessage('Upload failed ❌');
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.originalName?.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSuggestCategory = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/suggest-category`);

      setSuggestions((prev) => ({
        ...prev,
        [doc.id]: res.data,
      }));

      setSelectedCategories((prev) => ({
        ...prev,
        [doc.id]: res.data.suggestedCategory,
      }));
    } catch (error) {
      setMessage('Category suggestion failed ❌');
    }
  };

  const handleConfirmCategory = async (doc) => {
    try {
      await api.post(
        `/documents/${doc.id}/confirm-category`,
        {
          category: selectedCategories[doc.id],
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setMessage('Category saved ✅');
      fetchDocuments();
    } catch (error) {
      setMessage('Category confirmation failed ❌');
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1>Document Dashboard</h1>
          <p>Upload, process, and manage your documents</p>
        </div>

        <div className="header-actions">
          <button className="logout-button" onClick={onLogout}>
            Logout
          </button>

          <button className="view-button" onClick={onSearch}>
            Text Search
          </button>
        </div>
      </div>
      <div className="dashboard-card">
        <h2>Upload Document</h2>

        <form onSubmit={handleUpload} className="upload-form">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button className="auth-button" type="submit">
            Upload
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </div>

      <div className="dashboard-card">
        <h2>Documents</h2>

        <input
          className="search-input"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="table-wrapper">
          <table className="documents-table">
            <thead>
              <tr>
                <th>Original Name</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Type</th>
                <th>Uploaded By</th>
                <th>Category</th>
                <th>Actions</th>
                <th>View</th>
              </tr>
            </thead>

            <tbody>
              {filteredDocuments.map((doc) => (
                <tr key={doc.filename}>
                  <td>{doc.originalName}</td>
                  <td>
                    <span
                      className={`status-badge ${doc.status?.toLowerCase()}`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td>{doc.pageCount}</td>
                  <td>{doc.normalizedType}</td>
                  <td>{doc.uploadedBy}</td>
                  <td>
                    {suggestions[doc.id] ? (
                      <div className="category-box">
                        <span className="category-badge">
                          Suggested: {suggestions[doc.id].suggestedCategory}
                        </span>

                        <small>
                          Confidence: {suggestions[doc.id].confidence}
                        </small>

                        <select
                          className="category-select"
                          value={selectedCategories[doc.id] || ''}
                          onChange={(e) =>
                            setSelectedCategories((prev) => ({
                              ...prev,
                              [doc.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="Medical">Medical</option>
                          <option value="Finance">Finance</option>
                          <option value="Education">Education</option>
                          <option value="Legal">Legal</option>
                          <option value="Technology">Technology</option>
                          <option value="HumanResources">
                            Human Resources
                          </option>
                          <option value="Uncategorized">Uncategorized</option>
                        </select>

                        <button
                          className="small-button"
                          onClick={() => handleConfirmCategory(doc)}
                        >
                          Save Category
                        </button>
                      </div>
                    ) : (
                      <button
                        className="small-button"
                        onClick={() => handleSuggestCategory(doc)}
                      >
                        Suggest
                      </button>
                    )}
                  </td>
                  <td>
                    {doc.printablePdfPath && (
                      <a
                        className="action-link"
                        href={`http://localhost:3001/files/${doc.filename}/printable`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Printable PDF
                      </a>
                    )}
                  </td>
                  <td>
                    <button
                      className="view-button"
                      onClick={() => onViewDocument(doc.filename)}
                    >
                      View Pages
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {documents.length === 0 && (
          <p className="empty-text">No documents uploaded yet.</p>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;