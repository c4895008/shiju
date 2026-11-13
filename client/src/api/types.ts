export interface WorkRef {
  id: number;
  slug: string;
  title: string;
  original_title?: string | null;
  year?: number | null;
  director?: string | null;
  country?: string | null;
  synopsis?: string | null;
  quote_count?: number;
}

export interface ThemeRef {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  quote_count?: number;
  work_count?: number;
}

export interface ThemeStats {
  quotes: number;
  works: number;
  reflections: number;
}

export interface ThemeDetailData {
  theme: ThemeRef;
  stats: ThemeStats;
  quotes: Paged<Quote>;
  featured: Quote[];
  top_works: Array<Pick<WorkRef, 'id' | 'slug' | 'title' | 'year'> & { quote_count: number }>;
  related_themes: ThemeRef[];
  redirect?: string;
}

export interface Quote {
  id: number;
  slug: string;
  text: string;
  speaker: string | null;
  context: string | null;
  featured: boolean;
  published_at: string | null;
  work?: WorkRef;
  themes?: ThemeRef[];
}

export interface PublicReflection {
  id: number;
  body: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  author: { nickname: string; avatar_preset: number };
  mine: boolean;
}

export interface Comment {
  id: number;
  body: string;
  created_at: string;
  mine: boolean;
  can_delete: boolean;
  author: { nickname: string; avatar_preset: number };
}

export interface AdminComment extends Comment {
  status: number;
  user_id: number;
  nickname: string;
}

export interface MyReflection {
  id: number;
  body: string;
  visibility: number;
  status: number;
  like_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  quote: { id: number; slug: string; text: string; speaker: string | null; context: string | null };
  work: WorkRef;
}

export interface Paged<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical?: string;
  noindex?: boolean;
  ogType?: string;
  jsonld?: unknown;
}

export interface CacheHint {
  tags: string[];
  ttl: number;
}

export interface HomeData {
  daily: {
    slug: string;
    text: string;
    speaker: string | null;
    context: string | null;
    work: { slug: string; title: string; year: number | null };
  } | null;
  featured: Quote[];
  latest: Quote[];
  themes: ThemeRef[];
  date: string;
}

export interface QuoteDetailData {
  quote: Quote;
  work: WorkRef;
  themes: ThemeRef[];
  my_reflection: MyReflection | null;
  redirect?: string;
}

export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar_preset: number;
  role: number;
  created_at?: string;
}

export interface FriendUser {
  id: number;
  username: string;
  nickname: string;
  avatar_preset: number;
}

export interface FriendItem extends FriendUser {
  since: string;
  reflection_count: number;
}

export interface FriendRequestItem {
  id: number;
  created_at: string;
  user: FriendUser;
}

export interface FriendSearchItem extends FriendUser {
  relation: 'none' | 'friend' | 'pending_in' | 'pending_out';
  request_id: number | null;
}

export interface FriendReflection {
  id: number;
  body: string;
  visibility: number;
  like_count: number;
  liked: boolean;
  created_at: string;
  author: FriendUser;
  quote: { slug: string; text: string; speaker: string | null };
  work: { slug: string; title: string; year: number | null };
}

export interface FriendsSummary {
  friend_count: number;
  pending_count: number;
}

export interface AdminQuote {
  id: number;
  work_id: number;
  work: { slug: string; title: string };
  slug: string;
  text: string;
  speaker: string | null;
  context: string | null;
  themes: Array<{ id: number; name: string }>;
  featured: boolean;
  status: number;
  published_at: string | null;
  updated_at: string;
}

export interface AdminWork extends WorkRef {
  status: number;
  quote_count: number;
  updated_at: string;
}

export interface AdminTheme extends ThemeRef {
  status: number;
  sort_order: number;
  updated_at: string;
}

export interface AdminRequest {
  id: number;
  text: string;
  work_title: string | null;
  note: string | null;
  status: number;
  nickname: string;
  created_at: string;
}

export interface AdminReflection extends MyReflection {
  status: number;
  user_id: number;
  nickname: string;
  comment_count: number;
}

export interface AdminDailyPick {
  date: string;
  note: string | null;
  quote: {
    id: number;
    slug: string;
    text: string;
    speaker: string | null;
    work_title: string;
  } | null;
}

export interface AdminOverview {
  quotes: { total: number; published: number; draft: number; offline: number; removed: number };
  works: { total: number; published: number };
  themes: { total: number; published: number };
  requests: { pending: number };
  reflections: { hidden: number };
  daily: {
    date: string;
    note: string | null;
    quote: { id: number; slug: string; text: string; work_title: string } | null;
  };
}

export interface SearchStats {
  days: number;
  total: number;
  zero_total: number;
  zero_results: Array<{ term: string; times: number }>;
  top_terms: Array<{ term: string; times: number; max_results: number }>;
}
