import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import Footer from './components/Footer';

function App() {
  return (
    <Router>
      {/* This wrapper ensures the background stays dark and fills the screen */}
      <div className="flex flex-col min-h-screen bg-[#0a0f1c] w-full font-sans">
        <Navbar />
        
        {/* flex-grow ensures the page content pushes the footer down */}
        <main className="grow w-full relative">
          <Routes>
            <Route path="/" element={<StudentDashboard />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Routes>
        </main>
        <Footer/>
      </div>
    </Router>
  );
}

export default App;