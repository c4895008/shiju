import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import type { AdminOverview as AdminOverviewData } from '../../api/types';
import { errText, truncateText } from './shared';

const cards = (data: AdminOverviewData) => [
  {
    label: '已发布台词',
    value: data.quotes.published,
    hint: `共 ${data.quotes.total} 句`,
    tab: 'quotes',
    attention: false,
  },
  {
    label: '草稿',
    value: data.quotes.draft,
    hint: '待补充或待发布',
    tab: 'quotes',
    attention: data.quotes.draft > 0,
  },
  {
    label: '作品',
    value: data.works.total,
    hint: `已发布 ${data.works.published} 部`,
    tab: 'works',
    attention: false,
  },
  {
    label: '主题',
    value: data.themes.total,
    hint: `已发布 ${data.themes.published} 个`,
    tab: 'themes',
    attention: false,
  },
  {
    label: '待处理求收录',
    value: data.requests.pending,
    hint: data.requests.pending > 0 ? '有用户想收录新台词' : '暂无待处理',
    tab: 'requests',
    attention: data.requests.pending > 0,
  },
  {
    label: '隐藏感悟',
    value: data.reflections.hidden,
    hint: data.reflections.hidden > 0 ? '可在感悟管理中恢复' : '暂无隐藏内容',
    tab: 'reflections',
    attention: data.reflections.hidden > 0,
  },
];

export function AdminOverview({ onTab }: { onTab: (tab: string) => void }) {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiGet<AdminOverviewData>('/admin/overview'));
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <section className="admin-section">
        <p className="form-error">{errText(error)}</p>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => void load()}>
          重试
        </button>
      </section>
    );
  }

  if (!data) return <p className="admin-loading">加载中…</p>;

  const daily = data.daily;

  return (
    <>
      <div className="admin-overview">
        {cards(data).map((card) => (
          <button
            key={card.label}
            type="button"
            className={`stat-card${card.attention ? ' is-attention' : ''}`}
            onClick={() => onTab(card.tab)}
          >
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
            <span className="stat-hint">{card.hint}</span>
          </button>
        ))}
      </div>

      <div className="admin-panels">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h3>今日一句</h3>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => onTab('daily')}>
              去编排
            </button>
          </div>
          <p className="meta-line">{daily.date}</p>
          {daily.quote ? (
            <>
              <p className="admin-daily-text">「{truncateText(daily.quote.text, 42)}」</p>
              <p className="meta-line">
                《{daily.quote.work_title}》
                {daily.note ? ` · ${daily.note}` : ''}
              </p>
              <Link className="text-link" to={`/q/${daily.quote.slug}`} target="_blank" rel="noreferrer">
                查看台词页
              </Link>
            </>
          ) : (
            <p className="meta-line">尚未手工编排，首页会按日期确定性回退挑选一句。</p>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h3>待办</h3>
          </div>
          <ul className="admin-todo">
            <li>
              <span>
                待处理求收录 <strong>{data.requests.pending}</strong>
              </span>
              <button type="button" onClick={() => onTab('requests')}>
                去处理
              </button>
            </li>
            <li>
              <span>
                已隐藏感悟 <strong>{data.reflections.hidden}</strong>
              </span>
              <button type="button" onClick={() => onTab('reflections')}>
                去审核
              </button>
            </li>
            <li>
              <span>
                草稿台词 <strong>{data.quotes.draft}</strong>
              </span>
              <button type="button" onClick={() => onTab('quotes')}>
                去编辑
              </button>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
