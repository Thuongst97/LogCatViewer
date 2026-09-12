// Inline SVG icons extracted from the approved mockups (UI_Design/*.dc.html).
// Kept as plain stroke-based components — no icon font — per the design pass.
import type { CSSProperties } from 'react';

export interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

function base(size = 16) {
  return { viewBox: '0 0 24 24', width: size, height: size };
}

export function PlayIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <path d="M8 5v14l11-7z" fill={color} />
    </svg>
  );
}

export function PauseIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <rect x="6" y="5" width="4" height="14" fill={color} />
      <rect x="14" y="5" width="4" height="14" fill={color} />
    </svg>
  );
}

export function StopIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} style={style}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill={color} />
    </svg>
  );
}

export function TrashIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M4 7h16M9 7V4.8a.8.8 0 01.8-.8h4.4a.8.8 0 01.8.8V7M6.5 7l.8 12.2a1 1 0 001 .8h7.4a1 1 0 001-.8L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function FolderOpenIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M3 7.5a1 1 0 011-1h4.5l1.6 1.8H20a1 1 0 011 1V18a1 1 0 01-1 1H4a1 1 0 01-1-1V7.5z" />
    </svg>
  );
}

export function SaveIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M5 4.5h11l3.5 3.5V19a.8.8 0 01-.8.8H5a.8.8 0 01-.8-.8V5.3a.8.8 0 01.8-.8z" />
      <path d="M8 4.5v5h7v-5" />
      <path d="M7.3 13h9.4v6.5H7.3z" />
    </svg>
  );
}

export function SearchIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" style={style}>
      <circle cx="10" cy="10" r="6" />
      <path d="M20 20l-5.5-5.5" />
    </svg>
  );
}

export function ChevronRightIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function PlusIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" style={style}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PencilIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M4 20h3.6l10.9-10.9a2 2 0 000-2.8l-1.8-1.8a2 2 0 00-2.8 0L3 15.4V19a1 1 0 001 1z" />
    </svg>
  );
}

export function XIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" style={style}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

export function GearIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function PhoneIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <line x1="10.5" y1="18" x2="13.5" y2="18" />
    </svg>
  );
}

export function AutoscrollIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 4v10M8.5 10.5L12 14l3.5-3.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function RefreshIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M20 11a8 8 0 10-2.6 6" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function FilterPositiveIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M4 5h16l-6 8v6l-4-2v-4z" />
    </svg>
  );
}

export function FilterNegativeIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M4 5h16l-6 8v6l-4-2v-4z" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function MarkerIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M4 20l4-10 10-6-6 10z" />
    </svg>
  );
}

export function ChevronUpIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function TerminalMarkIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M4 5l6 6-6 6" />
      <path d="M13 17h7" />
    </svg>
  );
}

export function CopyIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
    </svg>
  );
}

export function SidebarIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <line x1="9.5" y1="4.5" x2="9.5" y2="19.5" />
    </svg>
  );
}

export function FileTextIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M6 3.5h8l4 4V19a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" />
      <path d="M14 3.5V8h4" />
      <path d="M8 12.5h8M8 15.5h8M8 9.5h3" />
    </svg>
  );
}

export function ExpandIcon({ size, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M9 4H4v5" />
      <path d="M15 20h5v-5" />
      <path d="M4 4l6 6" />
      <path d="M20 20l-6-6" />
    </svg>
  );
}
