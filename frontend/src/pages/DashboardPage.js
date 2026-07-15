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
  const [stats, setStats] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [suggestingId, setSuggestingId] = useState(null);
  const [savingCategoryId, setSavingCategoryId] = useState(null);

  const fileInputRef = useRef(null);
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const isAdmin = role === 'Admin';

  const canManageDocuments = role === 'Admin' || role === 'Editor';

  const fetchDocuments = async () => {
    try {
      const res = await api.get('/files');
      setDocuments(res.data);
    } catch (error) {
      setMessage('Failed to load documents ❌');
    }
  };

  const fetchStats = async () => {
  if (!isAdmin) return;

  try {
    const res = await api.get('/dashboard/stats');
    if(res && res.data){
      setStats(res.data);
    }
  } catch (error) {
    console.log(error);
  }
};
  useEffect(() => {
    fetchDocuments();
    fetchStats();

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
     setIsUploading(true);
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
      if (error.response?.status === 403) {
        setMessage(
          'You do not have permission to upload files. Only Admin and Editor can upload.',
        );
      } else {
        setMessage(error.response?.data?.message || 'Upload failed ❌');
      }
    } finally {
  setTimeout(() => {
    setIsUploading(false);
  }, 2500);
}
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.originalName?.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSuggestCategory = async (doc) => {
    try {
      setSuggestingId(doc.id);
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
      if (error.response?.status === 403) {
        setMessage(
          'You do not have permission to suggest categories. Only Admin and Editor can use AI categorization.',
        );
      } else {
        setMessage(
          error.response?.data?.message || 'Category suggestion failed ❌',
        );
      }
    }finally {
  setTimeout(() => {
    setSuggestingId(null);
  }, 2500);
}
  };

  const handleConfirmCategory = async (doc) => {
    try {
      setSavingCategoryId(doc.id);
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
      setSuggestions((prev) => {
        const updated = { ...prev };
        delete updated[doc.id];
        return updated;
      });

      setSelectedCategories((prev) => {
        const updated = { ...prev };
        delete updated[doc.id];
        return updated;
      });

      fetchDocuments();
    } catch (error) {
      if (error.response?.status === 403) {
        setMessage(
          'You do not have permission to confirm categories. Only Admin and Editor can update document categories.',
        );
      } else {
        setMessage(
          error.response?.data?.message || 'Category confirmation failed ❌',
        );
      }
    }finally {
  setTimeout(() => {
    setSavingCategoryId(null);
  }, 2500);
}
  };
const handleCancelProcessing = async (documentId) => {
  try {
    await api.post(`/documents/${documentId}/cancel`);

    setMessage("Processing cancellation requested ✅");
    fetchDocuments();
  } catch (error) {
    if (error.response?.status === 403) {
      setMessage(
        "You do not have permission to cancel processing. Only Admin and Editor can cancel."
      );
    } else {
      setMessage(
        error.response?.data?.message || "Failed to cancel processing ❌"
      );
    }
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
      {isAdmin && stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span>Total Documents</span>
            <strong>{stats.totalDocuments}</strong>
          </div>

          <div className="stat-card done">
            <span>Done</span>
            <strong>{stats.done}</strong>
          </div>

          <div className="stat-card processing">
            <span>Processing</span>
            <strong>{stats.processing}</strong>
          </div>

          <div className="stat-card queued">
            <span>Queued</span>
            <strong>{stats.queued}</strong>
          </div>

          <div className="stat-card failed">
            <span>Failed</span>
            <strong>{stats.failed}</strong>
          </div>

          <div className="stat-card cancelled">
            <span>Cancelled</span>
            <strong>{stats.cancelled}</strong>
          </div>
        </div>
      )}
      {canManageDocuments && (
        <div className="dashboard-card">
          <h2>Upload Document</h2>

          <form onSubmit={handleUpload} className="upload-form">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files[0])}
            />

            <button
              className="auth-button"
              type="submit"
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>

          {message && <p className="message">{message}</p>}
        </div>
      )}

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
                  {/* <td>{doc.pageCount}</td> */}
                  <td>
                    {doc.status === 'Processing' ? (
                      <span className="progress-text">
                        {doc.processedPages || 0} /{' '}
                        {doc.totalPages || doc.pageCount || 0}
                      </span>
                    ) : (
                      doc.pageCount
                    )}
                  </td>
                  <td>{doc.normalizedType}</td>
                  <td>{doc.uploadedBy}</td>
                  <td>
                    {doc.category && !suggestions[doc.id] ? (
                      <div className="category-box">
                        <span className="category-badge">{doc.category}</span>

                        {canManageDocuments && (
                          <button
                            className="small-button"
                            disabled={
                              doc.status === 'Queued' ||
                              doc.status === 'Processing'
                            }
                            onClick={() => {
                              setSuggestions((prev) => ({
                                ...prev,
                                [doc.id]: {
                                  suggestedCategory: doc.category,
                                  confidence: 'Saved',
                                },
                              }));

                              setSelectedCategories((prev) => ({
                                ...prev,
                                [doc.id]: doc.category,
                              }));
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    ) : suggestions[doc.id] ? (
                      canManageDocuments ? (
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
                            disabled={
                              savingCategoryId === doc.id ||
                              doc.status === 'Queued' ||
                              doc.status === 'Processing'
                            }
                          >
                            {savingCategoryId === doc.id
                              ? 'Saving...'
                              : 'Save Category'}
                          </button>
                        </div>
                      ) : (
                        <span className="read-only-text">Read only</span>
                      )
                    ) : canManageDocuments ? (
                      <button
                        className="small-button"
                        onClick={() => handleSuggestCategory(doc)}
                        disabled={
                          suggestingId === doc.id ||
                          doc.status === 'Queued' ||
                          doc.status === 'Processing'
                        }
                      >
                        {suggestingId === doc.id ? 'Suggesting...' : 'Suggest'}
                      </button>
                    ) : (
                      <span className="read-only-text">No category</span>
                    )}
                  </td>
                  <td>
                    <div className="actions-box">
                      {doc.printablePdfPath && (
                        <a
                          className="action-link"
                          href={`http://localhost:3001/files/${doc.filename}/printable?token=${token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Printable PDF
                        </a>
                      )}

                      {canManageDocuments && doc.status === 'Processing' && (
                        <button
                          className="cancel-button"
                          onClick={() => handleCancelProcessing(doc.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      className="view-button"
                      disabled={doc.status === 'Queued' || doc.status === 'Processing'}
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