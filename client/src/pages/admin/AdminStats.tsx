import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import type { SearchStats } from '../../api/types';
import { AdminEmpty, errText } from './shared';

const RANGES = [7, 30, 90];

export function AdminStats() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await apiGet<SearchStats>(`/admin/search-stats?days=${days}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [days]);

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

  if (!stats) return <p className="admin-loading">加载中…</p>;

  const zeroRate = stats.total ? Math.round((stats.zero_total / stats.total) * 100) : 0;

  return (
    <section className="admin-section">
      <div className="admin-filters">
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          disabled={loading}
        >
          {RANGES.map((value) => (
            <option key={value} value={value}>
              近 {value} 天
            </option>
          ))}
        </select>
        <button
          className="btn btn-ghost btn-small"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      <div className="admin-overview admin-stats-summary">
        <div className="stat-card is-static">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">总搜索次数</span>
          <span className="stat-hint">近 {stats.days} 天</span>
        </div>
        <div className="stat-card is-static">
          <span className="stat-value">{stats.zero_total}</span>
          <span className="stat-label">零结果次数</span>
          <span className="stat-hint">占比 {zeroRate}%</span>
        </div>
      </div>

      <div className="stats-grid">
        <div>
          <h3>近 {stats.days} 天零结果</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>搜索词</th>
                <th>次数</th>
              </tr>
            </thead>
            <tbody>
              {stats.zero_results.map((row) => (
                <tr key={row.term}>
                  <td>{row.term}</td>
                  <td>{row.times}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.zero_results.length === 0 && <AdminEmpty>暂无零结果记录。</AdminEmpty>}
        </div>
        <div>
          <h3>热门搜索</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>搜索词</th>
                <th>次数</th>
                <th>最大结果数</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_terms.map((row) => (
                <tr key={row.term}>
                  <td>{row.term}</td>
                  <td>{row.times}</td>
                  <td>{row.max_results}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.top_terms.length === 0 && <AdminEmpty>暂无搜索记录。</AdminEmpty>}
        </div>
      </div>
    </section>
  );
}
