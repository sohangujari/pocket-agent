export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="10" width="12" height="12" rx="4" transform="rotate(-45 8 16)" fill="currentColor" opacity="0.95" />
      <rect x="18" y="10" width="12" height="12" rx="4" transform="rotate(45 24 16)" fill="currentColor" opacity="0.95" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
}
