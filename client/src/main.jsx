import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { UploadPage } from './pages/UploadPage.jsx';
import { ObservationPage } from './pages/ObservationPage.jsx';
import { ClassesPage } from './pages/ClassesPage.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/observation/:videoId" element={<ObservationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
