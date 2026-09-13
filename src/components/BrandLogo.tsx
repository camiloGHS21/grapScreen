import React from "react";

interface BrandLogoProps {
  size?: number;
}

export function BrandLogo({ size = 34 }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        borderRadius: "11px",
        flexShrink: 0,
        boxShadow: "0 4px 16px color-mix(in srgb, var(--red) 35%, transparent)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease"
      }}
    >
      <defs>
        <linearGradient id="grap3LineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--red, #ff3b5c)" />
          <stop offset="100%" stopColor="#d61c4e" />
        </linearGradient>
      </defs>

      {/* Squircle Background Container */}
      <rect width="34" height="34" rx="11" fill="url(#grap3LineGrad)" />

      {/* Minimalist 3-Line Icon (Forming a stylized 'G' and Screen Flow Wave) */}
      <g stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
        {/* Top Stripe (Line 1) */}
        <path
          d="M 9.5 11 H 21.5 A 3 3 0 0 1 24.5 14"
          strokeWidth="2.6"
        />

        {/* Middle Stripe (Line 2) */}
        <path
          d="M 9.5 17 H 18"
          strokeWidth="2.6"
        />

        {/* Bottom Stripe (Line 3 - wraps up to form 'G') */}
        <path
          d="M 9.5 23 H 21.5 A 3 3 0 0 0 24.5 20 V 18"
          strokeWidth="2.6"
        />
      </g>

      {/* Minimalist Action Dot Accent */}
      <circle cx="21" cy="17" r="1.5" fill="#ffffff" />
    </svg>
  );
}
