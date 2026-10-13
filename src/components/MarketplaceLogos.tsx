import React from 'react';
import { Marketplace } from '../types';

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * Adobe Stock Official Brand Emblem:
 * Authentic Adobe Red tile with geometric 'A' mark and 'St' microstock identifier
 */
export const AdobeStockLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="Adobe Stock"
  >
    {/* Adobe Brand Red Rounded Container */}
    <rect width="64" height="64" rx="14" fill="#DA1F26" />
    {/* Authentic Adobe 'A' & Stock Contributor glyphs */}
    <path
      d="M39.6 15.5H49L35.2 48.5H26.3L39.6 15.5Z"
      fill="white"
    />
    <path
      d="M24.4 15.5H15L28.8 48.5H37.7L24.4 15.5Z"
      fill="white"
    />
    <path
      d="M32 25.8L38.4 41.5H25.6L32 25.8Z"
      fill="#DA1F26"
    />
    {/* Micro-badge 'St' for Stock */}
    <rect x="36" y="38" width="19" height="15" rx="3.5" fill="#1E1E1E" />
    <text
      x="45.5"
      y="49.5"
      fill="#FFFFFF"
      fontSize="10"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
      textAnchor="middle"
      letterSpacing="-0.5"
    >
      St
    </text>
  </svg>
);

/**
 * Shutterstock Official Brand Emblem:
 * Authentic Shutterstock Red with camera aperture / viewfinder geometry
 */
export const ShutterstockLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="Shutterstock"
  >
    {/* Shutterstock Brand Red Rounded Container */}
    <rect width="64" height="64" rx="14" fill="#EE2B24" />
    {/* Iconic Shutterstock Aperture / Viewfinder lens geometry */}
    <circle cx="32" cy="32" r="19" stroke="white" strokeWidth="4.5" />
    <path
      d="M32 15C32 22 26 27 19 27"
      stroke="white"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M45 19C39 25 34 32 34 39"
      stroke="white"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M32 49C32 42 38 37 45 37"
      stroke="white"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M19 45C25 39 30 32 30 25"
      stroke="white"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="32" cy="32" r="5" fill="white" />
  </svg>
);

/**
 * Freepik Official Brand Emblem:
 * Authentic Freepik Electric Blue with iconic geometric 'F' folded mark
 */
export const FreepikLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="Freepik"
  >
    {/* Freepik Electric Blue Rounded Container */}
    <rect width="64" height="64" rx="14" fill="#1273EB" />
    {/* Freepik Iconic Bold Geometric 'F' */}
    <path
      d="M20 18H44C45.6569 18 47 19.3431 47 21V23C47 24.6569 45.6569 26 44 26H28V32H40C41.6569 32 43 33.3431 43 35V36C43 37.6569 41.6569 39 40 39H28V46C28 47.6569 26.6569 49 25 49H23C21.3431 49 20 47.6569 20 46V18Z"
      fill="white"
    />
    <circle cx="38" cy="46" r="3.5" fill="#58A6FF" />
  </svg>
);

/**
 * iStock / Getty Images Official Brand Emblem:
 * Authentic deep black/gray badge with lowercase 'iStock' styling and Getty branding
 */
export const IStockLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="iStock / Getty Images"
  >
    {/* iStock Black Slate Rounded Container */}
    <rect width="64" height="64" rx="14" fill="#111827" stroke="#374151" strokeWidth="1.5" />
    {/* Lowercase 'i' with signature dot */}
    <circle cx="21" cy="20" r="4.5" fill="#38BDF8" />
    <rect x="17.5" y="28" width="7" height="20" rx="2.5" fill="white" />
    {/* Stylized 'Stock' framing block */}
    <text
      x="28"
      y="38"
      fill="#FFFFFF"
      fontSize="13"
      fontWeight="800"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      Stock
    </text>
    <text
      x="28.5"
      y="47"
      fill="#9CA3AF"
      fontSize="7.5"
      fontWeight="700"
      fontFamily="system-ui, -apple-system, sans-serif"
      letterSpacing="0.8"
    >
      BY GETTY
    </text>
  </svg>
);

/**
 * Alamy Official Brand Emblem:
 * Authentic Alamy Royal Blue with stylized distinctive 'a' mark
 */
export const AlamyLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="Alamy"
  >
    {/* Alamy Deep Royal Blue Rounded Container */}
    <rect width="64" height="64" rx="14" fill="#002D62" />
    {/* Alamy Distinctive Bold Lowercase 'a' in Circle */}
    <circle cx="32" cy="32" r="21" stroke="#00A3FF" strokeWidth="3" />
    <path
      d="M32 23C27.5 23 24 26.5 24 31C24 35.5 27.5 39 32 39C34.5 39 36.7 37.8 38 36V41H42V24H38V27C36.7 24.6 34.5 23 32 23ZM32 35C29.8 35 28 33.2 28 31C28 28.8 29.8 27 32 27C34.2 27 36 28.8 36 31C36 33.2 34.2 35 32 35Z"
      fill="white"
    />
    <circle cx="43" cy="20" r="2.5" fill="#00A3FF" />
  </svg>
);

/**
 * Dreamstime Official Brand Emblem:
 * Authentic Dreamstime Dual-Tone in brand green and cyan
 */
export const DreamstimeLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="Dreamstime"
  >
    {/* Dreamstime Dark Slate Backdrop with Dual Gradient */}
    <rect width="64" height="64" rx="14" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
    {/* Curved Camera Eye & Smile in Dreamstime Green & Cyan */}
    <path
      d="M17 32C17 23.7157 23.7157 17 32 17C40.2843 17 47 23.7157 47 32"
      stroke="#62A818"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M20 37C22.5 42 27 45 32 45C37 45 41.5 42 44 37"
      stroke="#0090D0"
      strokeWidth="5"
      strokeLinecap="round"
    />
    {/* Center Aperture Iris */}
    <circle cx="32" cy="30" r="6" fill="#62A818" />
    <circle cx="32" cy="30" r="3" fill="#FFFFFF" />
  </svg>
);

/**
 * Generic Stock Official Emblem:
 * Universal Microstock standard emblem with sleek layered geometry
 */
export const GenericStockLogo: React.FC<LogoProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-label="Generic Stock"
  >
    {/* Modern Gradient Container */}
    <defs>
      <linearGradient id="genericGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4F46E5" />
        <stop offset="1" stopColor="#06B6D4" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="url(#genericGrad)" />
    {/* Layered Cards / Metadata Icon */}
    <rect x="18" y="24" width="28" height="20" rx="4" fill="#FFFFFF" fillOpacity="0.3" />
    <rect x="15" y="20" width="28" height="20" rx="4" fill="#FFFFFF" fillOpacity="0.6" />
    <rect x="12" y="16" width="28" height="20" rx="4" fill="#FFFFFF" />
    <circle cx="18" cy="22" r="2.5" fill="#4F46E5" />
    <path d="M16 32L22 26L27 30L34 23L38 32H16Z" fill="#4F46E5" />
    {/* Sparkle badge */}
    <path
      d="M44 34L46 39L51 41L46 43L44 48L42 43L37 41L42 39L44 34Z"
      fill="#FDE047"
    />
  </svg>
);

/**
 * Universal Marketplace Logo Dispatcher
 */
export const MarketplaceLogo: React.FC<{
  marketplace: Marketplace;
  className?: string;
  size?: number;
}> = ({ marketplace, className, size }) => {
  switch (marketplace) {
    case 'adobe':
      return <AdobeStockLogo className={className} size={size} />;
    case 'shutterstock':
      return <ShutterstockLogo className={className} size={size} />;
    case 'freepik':
      return <FreepikLogo className={className} size={size} />;
    case 'istock':
      return <IStockLogo className={className} size={size} />;
    case 'alamy':
      return <AlamyLogo className={className} size={size} />;
    case 'dreamstime':
      return <DreamstimeLogo className={className} size={size} />;
    case 'generic':
    default:
      return <GenericStockLogo className={className} size={size} />;
  }
};
