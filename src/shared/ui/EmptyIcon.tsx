export function EmptyIcon() {
  return <span className="empty-icon" aria-hidden="true">
    <svg viewBox="0 0 72 72" fill="none">
      <rect x="14" y="12" width="46" height="46" rx="10" transform="rotate(8 14 12)" fill="#f3dfe1" />
      <rect x="9" y="9" width="48" height="48" rx="10" fill="#fffbfb" stroke="#16284d" strokeWidth="2" />
      <path d="M10 22h46" stroke="#16284d" strokeWidth="2" />
      <circle cx="18" cy="15.5" r="2" fill="#eb7575" />
      <path d="M23 32v2M43 32v2M27 46c2-3 6-4 9-4s7 1 9 4" stroke="#16284d" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M49 8l2-4M57 12l4-2" stroke="#eb7575" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </span>
}
