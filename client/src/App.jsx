import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AdminLayout from './pages/admin/AdminLayout';
import { ParticipantRoute, AdminRoute } from './components/ProtectedRoute';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';

import AdminLogin from './pages/admin/AdminLogin';
import AdminOverview from './pages/admin/AdminOverview';
import Companies from './pages/admin/Companies';
import Rounds from './pages/admin/Rounds';
import Returns from './pages/admin/Returns';
import Analytics from './pages/admin/Analytics';

export default function App() {
  return (
    <Routes>
      {/* Participant auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Participant app */}
      <Route
        element={
          <ParticipantRoute>
            <Layout />
          </ParticipantRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Admin */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route path="overview" element={<AdminOverview />} />
        <Route path="companies" element={<Companies />} />
        <Route path="rounds" element={<Rounds />} />
        <Route path="returns" element={<Returns />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
