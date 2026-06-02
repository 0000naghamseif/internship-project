import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DocumentViewerPage from './pages/DocumentViewerPage';
import SearchPage from "./pages/SearchPage";
import './App.css';

function App() {
  const [page, setPage] = useState(
    localStorage.getItem('token') ? 'dashboard' : 'login',
  );

  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedPage, setSelectedPage] = useState(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');

    setPage('login');
  };

  return (
    <>
      {page === 'login' && (
        <LoginPage
          onSwitchToRegister={() => setPage('register')}
          onLoginSuccess={() => setPage('dashboard')}
        />
      )}

      {page === 'register' && (
        <RegisterPage onSwitchToLogin={() => setPage('login')} />
      )}

      {page === 'dashboard' && (
        <DashboardPage
          onLogout={handleLogout}
          onViewDocument={(filename) => {
            setSelectedDocument(filename);
            setPage('viewer');
          }}
          onSearch={() => setPage('search')}
        />
      )}

      {page === 'viewer' && (
        <DocumentViewerPage
          filename={selectedDocument}
          initialPageNumber={selectedPage}
          onBack={() => {
            setSelectedPage(null);
            setPage('search');
          }}
        />
      )}

      {page === 'search' && (
        <SearchPage
          onBack={() => setPage('dashboard')}
          onOpenPage={(documentId, pageNumber) => {
            setSelectedDocument(documentId);
            setSelectedPage(pageNumber);
            setPage('viewer');
          }}
        />
      )}
    </>
  );
}

export default App;