import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

// Placeholder pages until we implement them
function ScanPage() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900">Scan</h1>
      <p className="text-gray-600 mt-2">Page de numérisation (à implémenter)</p>
    </div>
  );
}

function ValidationQueuePage() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900">Validation</h1>
      <p className="text-gray-600 mt-2">File d'attente de validation (à implémenter)</p>
    </div>
  );
}

function BatchesPage() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900">Lots</h1>
      <p className="text-gray-600 mt-2">Gestion des lots (à implémenter)</p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route
              path="/scan"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ScanPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/validation"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ValidationQueuePage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/validation/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <div>Validation Detail (à implémenter)</div>
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/batches"
              element={
                <ProtectedRoute>
                  <Layout>
                    <BatchesPage />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/validation" replace />} />
            <Route path="*" element={<Navigate to="/validation" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
