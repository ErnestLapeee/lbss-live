import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f5]">
      <header className="shrink-0 bg-[#2f2f2f] text-white border-b border-black/30">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-center gap-2">
          <img src="/lbss-logo.png" alt="LBSS" className="h-8 w-8 object-contain" />
          <span className="text-sm font-semibold">LBSS Admin</span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-surface rounded-lg border border-border shadow-sm p-8">
        <div className="text-center mb-8">
          <h1 className="font-heading text-2xl font-bold text-text">Sign in</h1>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">User</label>
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-transparent"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border border-black/15 bg-[#e8e8e8] py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-[#dedede] active:bg-[#d4d4d4] disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
