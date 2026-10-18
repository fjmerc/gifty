import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { NotificationProvider } from './NotificationContext';
import ProtectedRoute from './ProtectedRoute';
import Header from './components/js/Header';
import ScrollToTop from './components/js/ScrollToTop';
import SessionTimeout from '../src/components/js/SessionTimeout';
import ExportReminder from './components/ui/ExportReminder';
import Home from './pages/js/Home';
import Login from './pages/js/Login';
import LoadingSpinner from './components/ui/LoadingSpinner';
import './App.css';

// Home and Login are the first paint for a signed-out visitor; every other
// page loads as its own chunk the first time it is visited.
const UserHome = lazy(() => import('./pages/js/UserHome'));
const Register = lazy(() => import('./pages/js/Register'));
const Invite = lazy(() => import('./pages/js/Invite'));
const Setup = lazy(() => import('./pages/js/Setup'));
const ResetPassword = lazy(() => import('./pages/js/ResetPassword'));
const Events = lazy(() => import('./pages/js/Events'));
const Gifts = lazy(() => import('./pages/js/Gifts'));
const Budgets = lazy(() => import('./pages/js/Budgets'));
const Notifications = lazy(() => import('./pages/js/Notifications'));
const Recipients = lazy(() => import('./pages/js/Recipients'));
const RecipientProfile = lazy(() => import('./pages/js/RecipientProfile'));
const EditRecipientProfileWrapper = lazy(() => import('./components/forms/js/EditRecipientProfileWrapper'));
const UserProfile = lazy(() => import('./pages/js/UserProfile'));
const EditOverallBudget = lazy(() => import('./pages/js/EditOverallBudget'));
const PurchaseHistory = lazy(() => import('./pages/js/PurchaseHistory'));
const Settings = lazy(() => import('./pages/js/Settings'));
const Admin = lazy(() => import('./pages/js/Admin'));
const SuggestionsHelp = lazy(() => import('./pages/js/SuggestionsHelp'));
const About = lazy(() => import('./pages/js/About'));
const Favorites = lazy(() => import('./pages/js/Favorites'));
const FeedbackAnalytics = lazy(() => import('./pages/js/FeedbackAnalytics'));
const GiftExplorer = lazy(() => import('./components/GiftExplorer/GiftExplorer'));

const App = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
      <NotificationProvider>
        <Router>
          <ScrollToTop />
          <SessionTimeout />
          <div className="App">
            <AppContent />
          </div>
        </Router>
      </NotificationProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

const AppContent = () => {
  const location = useLocation();
  const isLoginOrRegister = location.pathname === "/" || location.pathname === "/login" || location.pathname === "/register" || location.pathname === "/about";

  // Keyboard users jump past the header; focus lands on the main region
  const skipToMain = (e) => {
    const main = document.getElementById('main-content');
    if (!main) return;
    e.preventDefault();
    main.focus();
  };

  return (
    <>
      <a href="#main-content" className="skip-link" onClick={skipToMain}>Skip to main content</a>
      {(location.pathname !== "/" && location.pathname !== "/register" && location.pathname !== "/about") && <Header />}
      <main id="main-content" tabIndex={-1} className={`main-content ${isLoginOrRegister ? 'no-margin' : ''}`}>
        {/* In the flow under the header, so it never covers a page's own buttons */}
        <ExportReminder />
        <Suspense fallback={<LoadingSpinner minHeight="60vh" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/reset/:token" element={<ResetPassword />} />
            <Route path="/userhome" element={<ProtectedRoute><UserHome /></ProtectedRoute>} />
            <Route path="/user-profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
            {/* The profile is edited from the profile page, where the form gets the user's data */}
            <Route path="/user-profile/edit" element={<Navigate to="/user-profile" replace />} />
            <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
            <Route path="/gifts" element={<ProtectedRoute><Gifts /></ProtectedRoute>} />
            <Route path="/budgets" element={<ProtectedRoute><Budgets /></ProtectedRoute>} />
            <Route path="/budgets/overall/:year" element={<ProtectedRoute><EditOverallBudget /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/recipients" element={<ProtectedRoute><Recipients /></ProtectedRoute>} />
            <Route path="/recipients/:id" element={<ProtectedRoute><RecipientProfile /></ProtectedRoute>} />
            <Route path="/recipients/:id/edit" element={<ProtectedRoute><EditRecipientProfileWrapper /></ProtectedRoute>} />
            <Route path="/purchase-history" element={<ProtectedRoute><PurchaseHistory /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/suggestions-help" element={<ProtectedRoute><SuggestionsHelp /></ProtectedRoute>} />
            <Route path="/feedback-analytics" element={<ProtectedRoute><FeedbackAnalytics /></ProtectedRoute>} />
            <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute><GiftExplorer /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {/* Pages report results with toast messages */}
      <ToastContainer position="top-right" autoClose={5000} newestOnTop />
    </>
  );
};

export default App;
