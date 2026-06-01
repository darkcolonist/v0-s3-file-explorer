import { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="logo-top-left-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="logo-top-right-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="logo-mid-left-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="logo-mid-right-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
        <linearGradient id="logo-bottom-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
      </defs>
      <polygon points="4,2 8,4.5 4,7 0,4.5" fill="url(#logo-top-left-grad)" />
      <polygon points="12,2 16,4.5 12,7 8,4.5" fill="url(#logo-top-right-grad)" />
      <polygon points="0,9.5 4,7 8,9.5 4,12" fill="url(#logo-mid-left-grad)" />
      <polygon points="8,9.5 12,7 16,9.5 12,12" fill="url(#logo-mid-right-grad)" />
      <polygon points="4,12 8,9.5 12,12 8,14.5" fill="url(#logo-bottom-grad)" />
    </svg>
  );
}
