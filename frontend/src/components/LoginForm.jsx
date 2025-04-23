import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { signInWithEmail, authError } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err.message || 'שגיאה בהתחברות. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  // Enhanced styles for better UI
  const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '450px',
    margin: '0 auto',
    padding: '30px',
    border: '1px solid #2d2d2d',
    borderRadius: '12px',
    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
    backgroundColor: '#333333',
    direction: 'rtl'
  };

  const inputContainerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  };

  const labelStyle = {
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#f0f0f0'
  };

  const inputStyle = {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #555',
    fontSize: '16px',
    backgroundColor: '#444',
    color: '#fff',
    transition: 'border 0.3s ease',
    outline: 'none',
    '&:focus': {
      border: '1px solid #4285F4'
    }
  };

  const buttonStyle = {
    padding: '14px 16px',
    backgroundColor: '#4285F4',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '20px',
    transition: 'background-color 0.3s ease',
    '&:hover': {
      backgroundColor: '#3367d6'
    }
  };

  const errorStyle = {
    color: '#ff6b6b',
    textAlign: 'center',
    marginTop: '10px',
    fontSize: '14px',
    padding: '8px',
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: '4px',
    display: error || authError ? 'block' : 'none'
  };

  const headingStyle = {
    textAlign: 'center', 
    fontSize: '24px',
    color: '#f0f0f0',
    marginBottom: '10px'
  };

  return (
    <div>
      <h2 style={headingStyle}>התחברות למערכת</h2>
      
      <form style={formStyle} onSubmit={handleSubmit}>        
        <div style={inputContainerStyle}>
          <label htmlFor="email" style={labelStyle}>דואר אלקטרוני</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            placeholder="your@email.com"
          />
        </div>
        
        <div style={inputContainerStyle}>
          <label htmlFor="password" style={labelStyle}>סיסמה</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
            placeholder="סיסמה"
            minLength="6"
          />
        </div>
        
        <button 
          type="submit" 
          style={buttonStyle}
          disabled={loading}
        >
          {loading ? 'טוען...' : 'התחבר'}
        </button>
        
        {(error || authError) && (
          <p style={errorStyle}>
            {error || (authError && authError.message)}
          </p>
        )}
      </form>
    </div>
  );
}

export default LoginForm; 