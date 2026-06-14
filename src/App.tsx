import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { RequireAdmin, RequireAuth } from './components/Guards'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { BrandCatalogPage } from './pages/BrandCatalog'
import { CustomersPage } from './pages/Customers'
import { CustomerDetailPage } from './pages/CustomerDetail'
import { QuotesListPage } from './pages/QuotesList'
import { QuoteEditorPage } from './pages/QuoteEditor'
import { AdminOverviewPage } from './pages/AdminOverview'
import { CatalogAdminPage } from './pages/CatalogAdmin'
import { CalcAdminPage } from './pages/CalcAdmin'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/quotes" element={<QuotesListPage />} />
            <Route path="/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/quotes/:id" element={<QuoteEditorPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/catalog" element={<BrandCatalogPage />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminOverviewPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/catalog"
              element={
                <RequireAdmin>
                  <CatalogAdminPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/calc"
              element={
                <RequireAdmin>
                  <CalcAdminPage />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
