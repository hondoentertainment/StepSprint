type Props = {
  size?: number;
  className?: string;
};

/** Inline SVG logo — ascending step bars with an upward arrow, representing progress */
export function StepSprintLogo({ size = 28, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="20" width="5" height="6" rx="1.5" fill="url(#ss-grad)" />
      <rect x="9" y="14" width="5" height="12" rx="1.5" fill="url(#ss-grad)" />
      <rect x="16" y="8" width="5" height="18" rx="1.5" fill="url(#ss-grad)" />
      <path
        d="M23 2l3 3-3 3M26 5H21"
        stroke="url(#ss-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="ss-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
    </svg>
  );
}
