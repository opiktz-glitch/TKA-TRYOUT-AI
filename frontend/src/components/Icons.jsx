// Kumpulan ikon garis sederhana (pengganti emoji).
// Semua ikon menerima props `size` (default 18) dan meneruskan sisanya ke <svg>.

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ size = 18, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...rest}>
      {children}
    </svg>
  );
}

export function IconHome(props) {
  return (
    <Svg {...props}>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </Svg>
  );
}

export function IconUsers(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.5 14.2c2.3.3 4 2 4 4.8" />
    </Svg>
  );
}

export function IconUserPlus(props) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" />
      <path d="M19 8v5M16.5 10.5h5" />
    </Svg>
  );
}

export function IconBook(props) {
  return (
    <Svg {...props}>
      <path d="M4 5.5c1.8-.8 4.3-1 6 0v13c-1.7-1-4.2-.8-6 0z" />
      <path d="M20 5.5c-1.8-.8-4.3-1-6 0v13c1.7-1 4.2-.8 6 0z" />
    </Svg>
  );
}

export function IconNotebook(props) {
  return (
    <Svg {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M9 3.5v17M5 8h4M5 13h4" />
    </Svg>
  );
}

export function IconClipboard(props) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="4.5" width="13" height="16" rx="1.5" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M8.5 12h7M8.5 15.5h7" />
    </Svg>
  );
}

export function IconGraduationCap(props) {
  return (
    <Svg {...props}>
      <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
      <path d="M6 11.5v4.3c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-4.3" />
      <path d="M21 10v5" />
    </Svg>
  );
}

export function IconBarChart(props) {
  return (
    <Svg {...props}>
      <path d="M5 19V10M12 19V5M19 19v-6" />
      <path d="M3 19h18" />
    </Svg>
  );
}

export function IconTrendingUp(props) {
  return (
    <Svg {...props}>
      <path d="M3 16l6-6 4 4 8-9" />
      <path d="M15 5h6v6" />
    </Svg>
  );
}

export function IconSettings(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7.8l2.1 1.3M17.7 14.9l2.1 1.3M4.2 16.2l2.1-1.3M17.7 9.1l2.1-1.3M3 12h2.5M18.5 12H21" />
    </Svg>
  );
}

export function IconLogOut(props) {
  return (
    <Svg {...props}>
      <path d="M9 4H5.5A1.5 1.5 0 004 5.5v13A1.5 1.5 0 005.5 20H9" />
      <path d="M20 12H10.5M20 12l-3.5-3.5M20 12l-3.5 3.5" />
    </Svg>
  );
}

export function IconBell(props) {
  return (
    <Svg {...props}>
      <path d="M6 10.5a6 6 0 0112 0c0 4.2 1.2 5.5 1.2 5.5H4.8S6 14.7 6 10.5z" />
      <path d="M10.2 19a1.9 1.9 0 003.6 0" />
    </Svg>
  );
}

export function IconChevronDown(props) {
  return (
    <Svg {...props}>
      <path d="M5.5 8.5L12 15l6.5-6.5" />
    </Svg>
  );
}

export function IconMenu(props) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </Svg>
  );
}

export function IconUser(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.3" r="3.5" />
      <path d="M4.8 19.5c0-3.6 3.2-6.2 7.2-6.2s7.2 2.6 7.2 6.2" />
    </Svg>
  );
}

export function IconTarget(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </Svg>
  );
}

export function IconClock(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function IconShield(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l7 2.7v5.2c0 4.6-3 7.6-7 9.1-4-1.5-7-4.5-7-9.1V6.2z" />
      <path d="M9 12l2 2 4-4.2" />
    </Svg>
  );
}

export function IconTrophy(props) {
  return (
    <Svg {...props}>
      <path d="M7 4.5h10v4.3c0 3-2.2 5.4-5 5.4s-5-2.4-5-5.4z" />
      <path d="M7 5.5H4.5v1.8c0 1.7 1.2 3 2.8 3.2M17 5.5h2.5v1.8c0 1.7-1.2 3-2.8 3.2" />
      <path d="M12 14.2v3M9 20h6M9.5 20c0-1.6.9-2.4 2.5-2.8 1.6.4 2.5 1.2 2.5 2.8" />
    </Svg>
  );
}

export function IconEdit(props) {
  return (
    <Svg {...props}>
      <path d="M14.5 5.5l4 4L8 20H4v-4z" />
      <path d="M13 7l4 4" />
    </Svg>
  );
}

export function IconTrash(props) {
  return (
    <Svg {...props}>
      <path d="M5 7h14M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function IconEye(props) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

export function IconEyeOff(props) {
  return (
    <Svg {...props}>
      <path d="M4 4l16 16" />
      <path d="M10.6 6.1A9.9 9.9 0 0112 6c6 0 9.5 6 9.5 6a15.6 15.6 0 01-3.4 4.1M6.6 7.9C4 9.7 2.5 12 2.5 12S6 18 12 18c1 0 1.9-.15 2.8-.4" />
      <path d="M9.6 10.6a2.6 2.6 0 003.6 3.6" />
    </Svg>
  );
}

export function IconCheck(props) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Svg>
  );
}

export function IconRefresh(props) {
  return (
    <Svg {...props}>
      <path d="M4 12a8 8 0 0 1 14-5.3L20 8" />
      <path d="M20 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-14 5.3L4 16" />
      <path d="M4 20v-4h4" />
    </Svg>
  );
}

export function IconCpu(props) {
  return (
    <Svg {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10" y="2.5" width="4" height="3" />
      <rect x="10" y="18.5" width="4" height="3" />
      <rect x="2.5" y="10" width="3" height="4" />
      <rect x="18.5" y="10" width="3" height="4" />
    </Svg>
  );
}

export function IconWifi(props) {
  return (
    <Svg {...props}>
      <path d="M3 8.5a13 13 0 0118 0" />
      <path d="M6.2 12a8.5 8.5 0 0111.6 0" />
      <path d="M9.5 15.5a4 4 0 015 0" />
      <circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconKey(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="15" r="3.3" />
      <path d="M10.3 12.7L18 5M15.5 7.5l2 2M18 5l2.5 2.5" />
    </Svg>
  );
}
