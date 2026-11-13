import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page status-page">
      <p className="status-code">404</p>
      <h1>页面不存在或已下架</h1>
      <p className="status-desc">可能是地址写错了，也可能这句话暂时不在这里。换一句搜搜看。</p>
      <form className="hero-search" action="/search" method="get" role="search">
        <input type="search" name="q" placeholder="搜索台词、影片或角色" aria-label="搜索台词" />
        <button type="submit" className="btn btn-primary">
          搜索
        </button>
      </form>
      <Link className="text-link" to="/">
        回首页
      </Link>
    </div>
  );
}

export function GonePage() {
  return (
    <div className="page status-page">
      <p className="status-code">410</p>
      <h1>这句台词已永久下架</h1>
      <p className="status-desc">
        它不会再回到站内。你可以搜搜别的句子，或者告诉我们你想找的是哪一句。
      </p>
      <form className="hero-search" action="/search" method="get" role="search">
        <input type="search" name="q" placeholder="搜索别的台词" aria-label="搜索台词" />
        <button type="submit" className="btn btn-primary">
          搜索
        </button>
      </form>
      <Link className="text-link" to="/">
        回首页
      </Link>
    </div>
  );
}
