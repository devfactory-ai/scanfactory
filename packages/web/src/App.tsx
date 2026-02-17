import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { ErrorBoundary, PageErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner, PageLoadingSpinner } from './components/LoadingSpinner';

// Lazy-loaded pages for code splitting
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Scan = lazy(() => import('./pages/Scan').then(m => ({ default: m.Scan })));
const ValidationQueue = lazy(() => import('./pages/ValidationQueue').then(m => ({ default: m.ValidationQueue })));
const ValidationDetail = lazy(() => import('./pages/ValidationDetail').then(m => ({ default: m.ValidationDetail })));
const ValidationBatch = lazy(() => import('./pages/ValidationBatch').then(m => ({ default: m.ValidationBatch })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 5 minutes (reduces unnecessary refetches)
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Keep unused data in cache for 24 hours (faster navigation)
      gcTime: 24 * 60 * 60 * 1000, // 24 hours (formerly cacheTime)
      // Don't refetch on window focus (explicit refresh preferred)
      refetchOnWindowFocus: false,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});

// Placeholder page
function BatchesPage() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900">Lots</h1>
      <p className="text-gray-600 mt-2">Gestion des lots (Phase 2)</p>
    </div>
  );
}

function App() {
  return (
    <PageErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoadingSpinner />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />

                {/* Protected routes */}
                <Route
                  path="/scan"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ErrorBoundary>
                          <Suspense fallback={<LoadingSpinner />}>
                            <Scan />
                          </Suspense>
                        </ErrorBoundary>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/validation"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ErrorBoundary>
                          <Suspense fallback={<LoadingSpinner />}>
                            <ValidationQueue />
                          </Suspense>
                        </ErrorBoundary>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/validation/:id"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ErrorBoundary>
                          <Suspense fallback={<LoadingSpinner />}>
                            <ValidationDetail />
                          </Suspense>
                        </ErrorBoundary>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/validation/batch"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ErrorBoundary>
                          <Suspense fallback={<LoadingSpinner />}>
                            <ValidationBatch />
                          </Suspense>
                        </ErrorBoundary>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/batches"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ErrorBoundary>
                          <BatchesPage />
                        </ErrorBoundary>
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/validation" replace />} />
                <Route path="*" element={<Navigate to="/validation" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </PageErrorBoundary>
  );
}

export default App;
