import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    ...props,
  }
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}

export function IconMeter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2L15 16" />
    </svg>
  )
}

export function IconInvoice(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14l-2.2-1.4-2.3 1.4-2.3-1.4-2.2 1.4-2.3-1.4-2.2 1.4V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  )
}

export function IconRooms(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V8.5L12 4l8 4.5V20" />
      <path d="M10 20v-5h4v5" />
      <path d="M4 12h16" />
    </svg>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 3.5 3.5" />
    </svg>
  )
}

export function IconPrint(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 9V4.5h10V9" />
      <path d="M7 15.5H5.5A1.5 1.5 0 0 1 4 14v-3.5A1.5 1.5 0 0 1 5.5 9h13A1.5 1.5 0 0 1 20 10.5V14a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="M7 14.5h10V20H7v-5.5Z" />
    </svg>
  )
}

export function IconReport(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 19V10M10 19V5M15 19v-7M20 19V8" />
    </svg>
  )
}

export function IconBack(props: IconProps) {
  return (
    <svg {...base({ size: 18, ...props })}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export type EmptyIconKind = 'home' | 'meter' | 'invoice' | 'search' | 'print' | 'report' | 'rooms'

export function EmptyIcon({ kind, size = 28 }: { kind: EmptyIconKind; size?: number }) {
  switch (kind) {
    case 'home':
    case 'rooms':
      return <IconRooms size={size} />
    case 'meter':
      return <IconMeter size={size} />
    case 'invoice':
      return <IconInvoice size={size} />
    case 'search':
      return <IconSearch size={size} />
    case 'print':
      return <IconPrint size={size} />
    case 'report':
      return <IconReport size={size} />
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
