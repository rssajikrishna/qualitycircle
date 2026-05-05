import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/users/login`, {
        gmail: email, 
        password: password 
      });
      
      // CRITICAL: Make sure we store the department so App.js routes work!
      const userData = {
        _id:        res.data._id,
        role:       res.data.role,
        department: res.data.department,
        name:       res.data.name,
        employeeId: res.data.employeeId || '',
      };

      localStorage.setItem('userInfo', JSON.stringify(userData));
      window.dispatchEvent(new Event("storage"));

      // Log the login event (excluding superadmin)
      if (res.data.role !== 'superadmin') {
        fetch(`${API}/api/loginlog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId:  res.data._id,
            empId:   res.data.employeeId || '',
            empName: res.data.name,
            role:    res.data.role,
            dept:    res.data.department || '',
            action:  'login',
          }),
        }).catch(() => {});
      }

      // REDIRECT LOGIC
      if (res.data.role === 'superadmin') {
        navigate('/admin');
      } else if (res.data.role === 'hod') {
        navigate('/hod-dashboard'); // Send HODs to their specific management page
      } else {
        navigate('/');
      }

    } catch (err) {
      alert(err.response?.data?.message || "Invalid Credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border-b-8 border-emerald-600">
        <div className="text-center mb-8">
          {/* Logo Section */}
          <div className="flex justify-center mb-6">
            <img 
              src="/arcolabLogo.jpg" 
              alt="Arcolab Logo" 
              className="h-24 w-auto object-contain"
            />
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            QDSHI PORTAL
          </h2>
          <p className="text-emerald-600 text-xs font-bold uppercase tracking-widest mt-1">
            Secure Access Management
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="relative">
            <Mail className="absolute left-4 top-4 text-emerald-600" size={18} />
            <input
              type="email"
              placeholder="Email Address"
              className="w-full pl-12 pr-4 py-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
              onChange={(e) => setEmail(e.target.value.trim())}
              value={email}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-4 text-emerald-600" size={18} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              className="w-full pl-12 pr-12 py-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-4 top-4 text-slate-400 hover:text-emerald-600 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-400 text-xs">
            © {new Date().getFullYear()} Arcolab Private Limited
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;