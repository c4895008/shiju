import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!agree) {
      setError('请先阅读并同意用户协议与隐私条款');
      return;
    }
    setBusy(true);
    try {
      await register({ username: username.trim(), password, nickname: nickname.trim() || undefined });
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError('这个用户名已经被使用了');
      else setError(err instanceof ApiError ? err.message : '注册失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <p className="eyebrow">第一次来</p>
        <h1>注册拾句</h1>
        <form className="form" onSubmit={submit}>
          <label>
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              maxLength={20}
              minLength={3}
              pattern="[A-Za-z0-9_]{3,20}"
              required
            />
            <small>3–20 位字母、数字或下划线</small>
          </label>
          <label>
            <span>昵称（可选）</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={64}
              required
            />
            <small>至少 8 位</small>
          </label>
          <label>
            <span>确认密码</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={64}
              required
            />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            <span>我已阅读并同意用户协议与隐私条款</span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? '注册中…' : '注册并登录'}
          </button>
        </form>
        <p className="auth-switch">
          已经有账号？<Link to={`/auth/login?next=${encodeURIComponent(next)}`}>直接登录</Link>
        </p>
      </div>
    </div>
  );
}
