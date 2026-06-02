// 1–5 confidence selector (segmented bars). Read-only mode for display.
export default function ConfidenceMeter({ value = 0, onChange, readOnly = false, size = 'md' }) {
  const levels = [1, 2, 3, 4, 5];
  const colors = ['#64748B', '#38BDF8', '#3B82F6', '#F59E0B', '#22D3A5'];
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const w = size === 'sm' ? 'w-5' : 'w-7';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {levels.map((l) => {
          const active = value >= l;
          const Tag = readOnly ? 'span' : 'button';
          return (
            <Tag
              key={l}
              type={readOnly ? undefined : 'button'}
              onClick={readOnly ? undefined : () => onChange(l)}
              aria-label={readOnly ? undefined : `Confidence ${l} of 5`}
              className={`${w} ${h} rounded-full transition-colors duration-150 ${
                readOnly ? '' : 'cursor-pointer hover:opacity-80'
              }`}
              style={{ backgroundColor: active ? colors[value - 1] : 'rgba(255,255,255,0.10)' }}
            />
          );
        })}
      </div>
      {value > 0 && (
        <span className="num text-xs text-slate-400">{value}/5</span>
      )}
    </div>
  );
}
