import { companyColor } from '../lib/format';

// Logo placeholder: shows the image if logo_url is set, else a colored
// monogram derived from the ticker / name.
export default function CompanyLogo({ company, index = 0, size = 44 }) {
  const color = companyColor(index);
  const initials = (company.ticker || company.name || '?').slice(0, 2).toUpperCase();
  if (company.logo_url) {
    return (
      <img
        src={company.logo_url}
        alt={`${company.name} logo`}
        width={size}
        height={size}
        className="rounded-xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-xl font-mono font-semibold"
      style={{
        width: size,
        height: size,
        color,
        backgroundColor: `${color}1A`,
        border: `1px solid ${color}33`,
        fontSize: size * 0.34,
      }}
    >
      {initials}
    </span>
  );
}
