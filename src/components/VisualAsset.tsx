import React, { useState } from 'react';

interface VisualAssetProps {
  src: string;
  alt: string;
  variant?: 'guobaorou' | 'dongporou' | 'jjamppong' | 'dimsum' | 'course' | 'mabo' | 'interior' | 'hero';
  className?: string;
}

/**
 * Resilient image component enforcing the Zero-Broken-Image Policy:
 * Renders the primary image with `referrerPolicy="no-referrer"`, and seamlessly falls back
 * to a bespoke Korean-Chinese fine dining SVG illustration if the network image is unavailable.
 */
export const VisualAsset: React.FC<VisualAssetProps> = ({
  src,
  alt,
  variant = 'hero',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-[#181513] ${className}`}>
      {/* Bespoke Fine-Dining SVG Backdrop (always rendered underneath or when image errors) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#27211E] via-[#1E1B19] to-[#141210]">
        {/* Architectural Chinese Lattice Corner Ornament */}
        <svg
          className="w-full h-full opacity-35"
          viewBox="0 0 400 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="16" y="16" width="368" height="268" stroke="#B69358" strokeWidth="1" strokeOpacity="0.4" />
          <rect x="24" y="24" width="352" height="252" stroke="#B69358" strokeWidth="0.75" strokeOpacity="0.25" />
          <circle cx="200" cy="150" r="88" stroke="#B69358" strokeWidth="1.2" strokeOpacity="0.45" />
          <circle cx="200" cy="150" r="72" stroke="#A52A32" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 4" />
          {variant === 'jjamppong' || variant === 'mabo' ? (
            <>
              <path
                d="M140 165C140 195 260 195 260 165L272 140H128L140 165Z"
                fill="#A52A32"
                fillOpacity="0.35"
                stroke="#B69358"
                strokeWidth="1.5"
              />
              <path
                d="M165 122C165 110 175 104 175 92M200 120C200 106 210 100 210 86M235 122C235 110 245 104 245 92"
                stroke="#B69358"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </>
          ) : variant === 'interior' ? (
            <>
              <path d="M200 62V105" stroke="#B69358" strokeWidth="1.5" />
              <rect x="170" y="105" width="60" height="42" rx="8" fill="#A52A32" fillOpacity="0.4" stroke="#B69358" strokeWidth="1.5" />
              <ellipse cx="200" cy="200" rx="68" ry="20" fill="#2A2421" stroke="#B69358" strokeWidth="1.5" />
            </>
          ) : (
            <>
              <ellipse cx="200" cy="160" rx="64" ry="34" fill="#A52A32" fillOpacity="0.3" stroke="#B69358" strokeWidth="1.5" />
              <path d="M160 155Q200 130 240 155" stroke="#F7F2E9" strokeOpacity="0.5" strokeWidth="1.5" />
              <line x1="150" y1="112" x2="265" y2="142" stroke="#B69358" strokeWidth="2" strokeLinecap="round" />
              <line x1="146" y1="122" x2="262" y2="148" stroke="#B69358" strokeWidth="2" strokeLinecap="round" />
            </>
          )}
        </svg>
        {hasError && (
          <div className="relative z-10 text-center px-4">
            <p className="font-serif-kr text-sm text-[#B69358] tracking-widest mb-1">하오찬 · 味覺</p>
            <p className="text-xs text-[#F7F2E9]/80 line-clamp-1">{alt}</p>
          </div>
        )}
      </div>

      {/* Primary Photographic Layer */}
      {!hasError && (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setHasError(true)}
          className="relative z-10 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
    </div>
  );
};
