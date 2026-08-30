import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import Assignments from './pages/Assignments';
import CampusFeed from './pages/CampusFeed';
import CampusItemDetail from './pages/CampusItemDetail';
import NoticeBoard from './pages/NoticeBoard';
import LandingPage from './pages/LandingPage';
import ProtectedRoute from './components/ProtectedRoute';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/campus-feed" element={<CampusFeed />} />
          <Route path="/campus-feed/:id" element={<CampusItemDetail />} />
          <Route path="/notice-board" element={<NoticeBoard />} />
          <Route path="/notices" element={<NoticeBoard />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

