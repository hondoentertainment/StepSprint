type IconProps = { size?: number; className?: string };

export function IconFootstep({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="5.5" cy="4" rx="2.5" ry="3.5" fill="currentColor" opacity="0.9" />
      <ellipse cx="3" cy="9" rx="1.2" ry="1.8" fill="currentColor" opacity="0.7" transform="rotate(-15 3 9)" />
      <ellipse cx="5.5" cy="10.5" rx="1.2" ry="1.8" fill="currentColor" opacity="0.7" />
      <ellipse cx="7.8" cy="10" rx="1.2" ry="1.8" fill="currentColor" opacity="0.7" transform="rotate(10 7.8 10)" />
      <ellipse cx="10.5" cy="7" rx="2.5" ry="3.5" fill="currentColor" opacity="0.9" transform="rotate(15 10.5 7)" />
      <ellipse cx="13" cy="12" rx="1.2" ry="1.8" fill="currentColor" opacity="0.7" transform="rotate(15 13 12)" />
    </svg>
  );
}

export function IconFlame({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8 14c-3 0-5-2-5-4.5C3 7 4.5 5.5 5 4c.5 1.5-.5 2-.5 3C4.5 8.5 6 9.5 6 8c0-2 1.5-4 2-5.5C9.5 5 11 7 11 9.5 11 12 9.5 14 8 14z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconTarget({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

export function IconCalendarWeek({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1.5" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="9.5" width="8" height="2" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function IconCalendarMonth({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1.5" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="10.5" r="1" fill="currentColor" opacity="0.7" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" opacity="0.7" />
      <circle cx="11" cy="10.5" r="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function IconTeam({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="6" cy="5" r="2.5" fill="currentColor" />
      <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11.5" cy="5" r="2" fill="currentColor" opacity="0.7" />
      <path d="M14.5 14c0-2.21-1.34-4.1-3.25-4.77" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function IconTrophy({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 2h8v5a4 4 0 01-8 0V2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M2 3.5h2M14 3.5h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 10v2M5.5 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconArrowUp({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
