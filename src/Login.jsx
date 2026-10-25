import { useState } from 'react';
import { api } from './api.js';

export default function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const user = await api('/login', 'POST', f);
      localStorage.setItem('hms_user', JSON.stringify(user));
      onLogin(user);
    } catch (err) { setError(err.message); }
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="brand dark"><span className="cross">+</span> CareDesk</div>
        <h1>Sign in</h1>
        <p className="muted">Use the account given to you by the hospital.</p>
        <label>Username
          <input required autoFocus value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </label>
        <label>Password
          <input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        {error && <p className="notice err" role="alert">{error}</p>}
        <button className="btn" type="submit">Sign in</button>
      </form>
    </div>
  );
}
