import type { AdminTheme } from '../../api/types';

const MAX_THEMES = 3;

interface ThemePickerProps {
  options: AdminTheme[];
  value: string[];
  onChange: (names: string[]) => void;
  error?: string | null;
}

export function ThemePicker({ options, value, onChange, error }: ThemePickerProps) {
  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((item) => item !== name));
    else if (value.length < MAX_THEMES) onChange([...value, name]);
  };

  return (
    <div className="form-field theme-picker">
      <span>主题</span>
      <details className="theme-picker-dropdown">
        <summary>
          {value.length ? (
            <span className="theme-picker-chosen">{value.join('、')}</span>
          ) : (
            <span className="theme-picker-placeholder">选择主题（最多 3 个）</span>
          )}
        </summary>
        <div className="theme-picker-panel">
          {options.length === 0 ? (
            <p className="hint">还没有主题，请先在「主题」标签中创建。</p>
          ) : (
            options.map((theme) => {
              const checked = value.includes(theme.name);
              const disabled = !checked && value.length >= MAX_THEMES;
              return (
                <label
                  key={theme.id}
                  className={`theme-picker-option${disabled ? ' disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(theme.name)}
                  />
                  <span>{theme.name}</span>
                  {theme.status !== 1 && <span className="theme-picker-status">未发布</span>}
                </label>
              );
            })
          )}
        </div>
      </details>
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
