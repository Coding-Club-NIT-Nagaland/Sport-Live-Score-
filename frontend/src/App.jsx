import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import Footer from './components/Footer';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem('token');
      
      // If there is no token, stop loading and keep them logged out
      if (!token) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      try {
        // Ask the Render backend if this token is actually valid
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/admin/verify`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Token is invalid or expired');
        }

        // Token is good, grant access to the admin dashboard
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Session verification failed:", error.message);
        // Clean up the bad token to prevent the "ghost login" glitch
        localStorage.removeItem('token');
        localStorage.removeItem('sportAccess');
        localStorage.removeItem('adminName');
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifySession();
  }, []);

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-[#0a0f1c] w-full font-sans text-white">
        <Navbar />
        
        <main className="grow w-full relative">
          {isLoading ? (

            <div className="flex h-full w-full items-center justify-center min-h-[50vh]">
              <div className="text-xl font-semibold animate-pulse text-blue-400">Verifying Access...</div>
            </div>
          ) : (
            <Routes>
              {/* Public Route */}
              <Route path="/" element={<StudentDashboard />} />
              {/* Authentication Routes */}
              <Route 
                path="/admin-login" 
                element={isAuthenticated ? <Navigate to="/admin" replace /> : <AdminLogin setIsAuthenticated={setIsAuthenticated} />} 
              />
              {/* Protected Admin Route */}
              <Route 
                path="/admin" 
                element={isAuthenticated ? <AdminDashboard setIsAuthenticated={setIsAuthenticated} /> : <Navigate to="/admin-login" replace />} 
              />
            </Routes>
          )}
        </main>

        <Footer/>
      </div>
    </Router>
  );
}

export default App;