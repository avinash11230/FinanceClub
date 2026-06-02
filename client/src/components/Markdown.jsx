import { marked } from 'marked';
import { useMemo } from 'react';

marked.setOptions({ breaks: true, gfm: true });

// Renders admin-authored markdown (company details, recaps).
export default function Markdown({ children, className = '' }) {
  const html = useMemo(() => marked.parse(children || ''), [children]);
  if (!children) return <p className="text-slate-500 italic text-sm">No information provided yet.</p>;
  return <div className={`prose-arena ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
