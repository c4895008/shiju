import { useState, type FormEvent } from 'react';
import { ApiError, apiPost } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Link, useLocation } from 'react-router-dom';

export function QuoteRequestForm() {
  const { user } = useAuth();
  const location = useLocation();
  const [text, setText] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="request-card">
        <p>想收录一句站里还没有的台词？登录后告诉我们。</p>
        <Link className="btn btn-small" to={`/auth/login?next=${encodeURIComponent(location.pathname)}`}>
          登录后提交
        </Link>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await apiPost('/quote-requests', { text, work_title: workTitle || undefined, note: note || undefined });
      setMessage('收到了。编辑会看到这条请求，收录后会出现在站内。');
      setText('');
      setWorkTitle('');
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '提交失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="request-card form" onSubmit={submit}>
      <h3>想收录某句台词？</h3>
      <label>
        <span>台词</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
          rows={3}
          required
          placeholder="写下你想收录的那句话"
        />
      </label>
      <label>
        <span>出处（可选）</span>
        <input value={workTitle} onChange={(event) => setWorkTitle(event.target.value)} maxLength={120} />
      </label>
      <label>
        <span>想说的话（可选）</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={2} />
      </label>
      {message && <p className="form-success">{message}</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? '提交中…' : '提交收录请求'}
      </button>
    </form>
  );
}
