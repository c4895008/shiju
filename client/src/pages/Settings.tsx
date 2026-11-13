import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiPut } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { formatDate } from '../lib/format';
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme';

const THEMES: Array<{ value: ThemePref; label: string }> = [
  { value: 'system', label: '自动' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const AVATAR_NAMES = ['靛蓝', '琥珀', '青碧', '紫罗兰', '绯红', '天蓝', '橄榄', '紫藤', '鎏金', '湖蓝', '洋红', '群青'];
const NICK_MAX = 20;

const fieldError = (err: unknown, field: string) => {
  if (!(err instanceof ApiError)) return '保存失败，请稍后再试';
  const details = err.details as { fields?: Record<string, string> } | undefined;
  return details?.fields?.[field] || err.message;
};

function ThemeThumb({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <span className={`theme-scene is-${tone}`}>
      <span className="theme-window">
        <span className="theme-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="theme-bar" />
        <span className="theme-line" />
        <span className="theme-line is-short" />
      </span>
    </span>
  );
}

function AppearanceSection() {
  const pref = useThemePref();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [announce, setAnnounce] = useState('');

  const choose = (next: ThemePref, label: string) => {
    if (next === pref) return;
    setThemePref(next);
    setAnnounce(`外观已切换为${label}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const index = (THEMES.findIndex((item) => item.value === pref) + step + THEMES.length) % THEMES.length;
    const next = THEMES[index];
    choose(next.value, next.label);
    refs.current[index]?.focus();
  };

  return (
    <section className="settings-section" aria-labelledby="settings-theme">
      <h2 id="settings-theme" className="settings-heading">
        外观
      </h2>
      <p className="settings-desc">只在这台设备上生效；深色模式适合夜间阅读。</p>
      <div className="theme-options" role="radiogroup" aria-labelledby="settings-theme" onKeyDown={onKeyDown}>
        {THEMES.map((item, index) => {
          const checked = item.value === pref;
          return (
            <button
              key={item.value}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={`theme-option${checked ? ' is-selected' : ''}`}
              onClick={() => choose(item.value, item.label)}
            >
              <span className={`theme-thumb${item.value === 'system' ? ' is-split' : ''}`} aria-hidden="true">
                {item.value === 'system' ? (
                  <>
                    <ThemeThumb tone="light" />
                    <ThemeThumb tone="dark" />
                  </>
                ) : (
                  <ThemeThumb tone={item.value} />
                )}
              </span>
              <span className="theme-option-name">{item.label}</span>
            </button>
          );
        })}
      </div>
      <p className="settings-hint" role="status" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}

function AvatarSection() {
  const { user, updateUser } = useAuth();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  if (!user) return null;

  const pick = async (preset: number) => {
    if (pending !== null || preset === user.avatar_preset) return;
    setPending(preset);
    setError('');
    setSaved('');
    try {
      const data = await apiPut<{ user: User }>('/me/avatar', { avatar_preset: preset });
      updateUser(data.user);
      setSaved('头像已更新');
    } catch (err) {
      setError(fieldError(err, 'avatar_preset'));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="settings-section" aria-labelledby="settings-avatar">
      <h2 id="settings-avatar" className="settings-heading">
        头像
      </h2>
      <p className="settings-desc">昵称首字配一款底色，点选即换，全站同步。</p>

      <div className="avatar-grid" role="group" aria-label="选择预设头像">
        {AVATAR_NAMES.map((name, preset) => {
          const selected = preset === user.avatar_preset;
          return (
            <button
              key={preset}
              type="button"
              className={`avatar-tile${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              aria-label={`${name}头像`}
              disabled={pending !== null && pending !== preset}
              onClick={() => void pick(preset)}
            >
              <Avatar preset={preset} name={user.nickname} size={46} />
              {selected && (
                <span className="avatar-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="form-success" role="status">
          {saved}
        </p>
      )}
    </section>
  );
}

function NicknameSection() {
  const { user, updateUser } = useAuth();
  const [value, setValue] = useState(user?.nickname ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const trimmed = value.trim();
  const length = [...trimmed].length;
  const unchanged = trimmed === user.nickname;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || unchanged) return;
    if (!trimmed) {
      setError('请填写昵称');
      return;
    }
    if (length > NICK_MAX) {
      setError(`昵称最多 ${NICK_MAX} 个字`);
      return;
    }

    setBusy(true);
    setError('');
    setSaved('');
    try {
      const data = await apiPut<{ user: User }>('/me/profile', { nickname: trimmed });
      updateUser(data.user);
      setValue(data.user.nickname);
      setSaved('昵称已更新');
    } catch (err) {
      setError(fieldError(err, 'nickname'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section" aria-labelledby="settings-nickname">
      <h2 id="settings-nickname" className="settings-heading">
        昵称
      </h2>
      <p className="settings-desc">读友在公开感悟中看到的名字。</p>
      <form className="form settings-form" onSubmit={submit} noValidate>
        <label>
          <span>昵称</span>
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
              if (saved) setSaved('');
            }}
            autoComplete="nickname"
            maxLength={NICK_MAX}
            aria-invalid={!!error || undefined}
            required
          />
          <small>
            {length} / {NICK_MAX}
          </small>
        </label>
        {error && <p className="form-error">{error}</p>}
        {saved && !error && (
          <p className="form-success" role="status">
            {saved}
          </p>
        )}
        <div className="settings-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || unchanged}>
            {busy ? '保存中…' : '保存昵称'}
          </button>
        </div>
      </form>
    </section>
  );
}

type PasswordErrors = { current_password?: string; new_password?: string; confirm?: string };

function PasswordSection() {
  const { replaceSession } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const local: PasswordErrors = {};
    if (!current) local.current_password = '请填写当前密码';
    if (next.length < 8) local.new_password = '新密码至少 8 位';
    else if (next === current) local.new_password = '新密码不能与当前密码相同';
    if (confirm !== next) local.confirm = '两次输入的新密码不一致';
    setErrors(local);
    setFormError('');
    setSaved('');
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      const data = await apiPut<{ token: string; user: User }>('/me/password', {
        current_password: current,
        new_password: next,
      });
      replaceSession(data.token, data.user);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved('密码已修改，其他设备已退出登录');
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as { fields?: PasswordErrors } | undefined;
        if (details?.fields) setErrors(details.fields);
        else setFormError(err.message);
      } else {
        setFormError('修改失败，请稍后再试');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section" aria-labelledby="settings-password">
      <h2 id="settings-password" className="settings-heading">
        密码
      </h2>
      <p className="settings-desc">修改成功后，其他设备需要用新密码重新登录。</p>
      <form className="form settings-form" onSubmit={submit} noValidate>
        <label>
          <span>当前密码</span>
          <input
            type="password"
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              setErrors((prev) => ({ ...prev, current_password: undefined }));
            }}
            autoComplete="current-password"
            maxLength={64}
            aria-invalid={!!errors.current_password || undefined}
            required
          />
        </label>
        {errors.current_password && <p className="form-error">{errors.current_password}</p>}

        <label>
          <span>新密码</span>
          <input
            type="password"
            value={next}
            onChange={(event) => {
              setNext(event.target.value);
              setErrors((prev) => ({ ...prev, new_password: undefined }));
            }}
            autoComplete="new-password"
            maxLength={64}
            aria-invalid={!!errors.new_password || undefined}
            required
          />
          <small>至少 8 位</small>
        </label>
        {errors.new_password && <p className="form-error">{errors.new_password}</p>}

        <label>
          <span>确认新密码</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              setErrors((prev) => ({ ...prev, confirm: undefined }));
            }}
            autoComplete="new-password"
            maxLength={64}
            aria-invalid={!!errors.confirm || undefined}
            required
          />
        </label>
        {errors.confirm && <p className="form-error">{errors.confirm}</p>}

        {formError && <p className="form-error">{formError}</p>}
        {saved && (
          <p className="form-success" role="status">
            {saved}
          </p>
        )}
        <div className="settings-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? '修改中…' : '修改密码'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const onLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <header className="page-head">
        <div>
          <p className="eyebrow">我的</p>
          <h1 id="settings-title">设置</h1>
          <p className="meta-line">@{user.username}</p>
        </div>
      </header>

      <div className="settings-account">
        <Avatar preset={user.avatar_preset} name={user.nickname} size={64} />
        <div className="settings-account-who">
          <p className="settings-account-name">{user.nickname}</p>
          <p className="settings-account-meta">
            @{user.username}
            {user.created_at ? ` · 加入于 ${formatDate(user.created_at)}` : ''}
          </p>
        </div>
        <div className="settings-account-actions">
          <Link className="btn btn-ghost" to="/notebook">
            我的台词本
          </Link>
          <button className="btn btn-ghost" type="button" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>

      <AppearanceSection />
      <AvatarSection />
      <NicknameSection />
      <PasswordSection />
    </section>
  );
}
