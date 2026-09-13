import React from 'react';
import { palette, accent, AccentName } from '../../theme';

/**
 * Line-art icon set, ~2px stroke, one accent per icon.
 * No fills, no gradients, no shadows — see STYLE-GUIDE §5.
 *
 * Every icon draws inside a 48×48 viewBox and scales from `size`.
 */

export type IconProps = {
  size?: number;
  tint?: AccentName;
  color?: string;
  strokeWidth?: number;
};

/**
 * Stroke width is specified in **device pixels** and held constant across sizes.
 *
 * The viewBox is 48×48 and the svg renders at `size`, so a raw stroke-width is scaled by
 * `size / 48` on the way out: `strokeWidth={2}` at `size={96}` was rendering a 4px line —
 * heavier than `stroke.bold`, and visibly wrong next to a 2px container border. Dividing
 * by the same factor cancels it, so line-art stays line-art at every scale, which is what
 * lets the robot appear as a 44px mascot, a 64px actor and a 96px token in the same
 * system (STYLE-GUIDE §5).
 *
 * (The previous `(strokeWidth * 48) / 48` was a no-op that looked like it was doing this.)
 */
const useStroke = ({ size = 48, tint, color, strokeWidth = 2 }: IconProps) => ({
  size,
  c: color ?? (tint ? accent[tint] : palette.ink),
  sw: strokeWidth * (48 / size),
});

const Svg: React.FC<{ size: number; children: React.ReactNode }> = ({ size, children }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ overflow: 'visible' }}>
    {children}
  </svg>
);

/** The agent. Rounded head, antenna, two dot eyes. The recurring protagonist. */
export const RobotIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <line x1="24" y1="6" x2="24" y2="12" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <circle cx="24" cy="4.5" r="2.5" fill={c} />
      <rect x="9" y="12" width="30" height="24" rx="9" stroke={c} strokeWidth={sw} />
      <circle cx="18" cy="23" r="2.6" fill={c} />
      <circle cx="30" cy="23" r="2.6" fill={c} />
      <path d="M19 30 h10" stroke={c} strokeWidth={sw} strokeLinecap="round" opacity={0.7} />
      <path d="M9 20 H5 a2 2 0 0 0 -2 2 v4 a2 2 0 0 0 2 2 h4" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M39 20 h4 a2 2 0 0 1 2 2 v4 a2 2 0 0 1 -2 2 h-4" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M16 36 v5 M32 36 v5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
};

/** The human. Seated at a laptop, three-quarter view. Always mint in the source. */
export const PersonIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <circle cx="24" cy="12" r="7" stroke={c} strokeWidth={sw} />
      <path d="M13 30 a11 11 0 0 1 22 0" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M11 34 h26 l4 8 H7 z" stroke={c} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M5 42 h38" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
};

/** Database. Cylinder stack. */
export const DatabaseIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <ellipse cx="24" cy="11" rx="16" ry="6" stroke={c} strokeWidth={sw} />
      <path d="M8 11 v13 c0 3.3 7.2 6 16 6 s16-2.7 16-6 V11" stroke={c} strokeWidth={sw} />
      <path d="M8 24 v13 c0 3.3 7.2 6 16 6 s16-2.7 16-6 V24" stroke={c} strokeWidth={sw} />
    </Svg>
  );
};

/** Table / grid. */
export const TableIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <rect x="5" y="8" width="38" height="32" rx="3" stroke={c} strokeWidth={sw} />
      <path d="M5 18 h38 M5 29 h38 M18 8 v32 M31 8 v32" stroke={c} strokeWidth={sw} opacity={0.8} />
    </Svg>
  );
};

/** Results / checklist. */
export const ChecklistIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <rect x="9" y="7" width="30" height="36" rx="3" stroke={c} strokeWidth={sw} />
      <rect x="18" y="3" width="12" height="7" rx="2" stroke={c} strokeWidth={sw} />
      <path d="M15 20 l3 3 l6 -6" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 32 l3 3 l6 -6" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 21 h7 M28 33 h7" stroke={c} strokeWidth={sw} strokeLinecap="round" opacity={0.7} />
    </Svg>
  );
};

/** Code execution. The `</>` bracket pair. */
export const CodeIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <path d="M16 13 L5 24 l11 11" stroke={c} strokeWidth={sw * 1.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 13 L43 24 l-11 11" stroke={c} strokeWidth={sw * 1.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 8 L20 40" stroke={c} strokeWidth={sw * 1.4} strokeLinecap="round" />
    </Svg>
  );
};

/** Context / embeddings. Cube cluster. */
export const CubeIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <path d="M24 5 l16 9 v20 l-16 9 l-16-9 V14 z" stroke={c} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M8 14 l16 9 l16-9 M24 23 v20" stroke={c} strokeWidth={sw} strokeLinejoin="round" opacity={0.75} />
    </Svg>
  );
};

/** Queue / inbox of pending work. */
export const QueueIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <rect x="6" y="9" width="36" height="8" rx="2.5" stroke={c} strokeWidth={sw} />
      <rect x="6" y="20" width="36" height="8" rx="2.5" stroke={c} strokeWidth={sw} opacity={0.75} />
      <rect x="6" y="31" width="36" height="8" rx="2.5" stroke={c} strokeWidth={sw} opacity={0.5} />
    </Svg>
  );
};

/** Fan-out / dispatch. One source splitting into three. */
export const DispatchIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <circle cx="8" cy="24" r="4.5" stroke={c} strokeWidth={sw} />
      <circle cx="40" cy="9" r="4" stroke={c} strokeWidth={sw} />
      <circle cx="40" cy="24" r="4" stroke={c} strokeWidth={sw} />
      <circle cx="40" cy="39" r="4" stroke={c} strokeWidth={sw} />
      <path d="M12.5 24 h8 M20.5 24 V11 h15 M20.5 24 h15 M20.5 24 v13 h15" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

/** Git branch — parallel worktrees. */
export const BranchIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <circle cx="13" cy="10" r="4.5" stroke={c} strokeWidth={sw} />
      <circle cx="13" cy="38" r="4.5" stroke={c} strokeWidth={sw} />
      <circle cx="35" cy="10" r="4.5" stroke={c} strokeWidth={sw} />
      <path d="M13 14.5 v19" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M17.5 10 h13" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M35 14.5 v6 a8 8 0 0 1 -8 8 h-10" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
};

/** Cloud / remote execution. */
export const CloudIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <path
        d="M14 36 a9 9 0 0 1 -0.6 -18 A13 13 0 0 1 38 20 a8 8 0 0 1 -2 16 z"
        stroke={c}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </Svg>
  );
};

/** Merge / collect results back. */
export const MergeIcon: React.FC<IconProps> = (p) => {
  const { size, c, sw } = useStroke(p);
  return (
    <Svg size={size}>
      <circle cx="8" cy="9" r="4" stroke={c} strokeWidth={sw} />
      <circle cx="8" cy="24" r="4" stroke={c} strokeWidth={sw} />
      <circle cx="8" cy="39" r="4" stroke={c} strokeWidth={sw} />
      <circle cx="40" cy="24" r="4.5" stroke={c} strokeWidth={sw} />
      <path d="M12 9 h15 v13 M12 24 h23 M12 39 h15 V26" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const icons = {
  robot: RobotIcon,
  person: PersonIcon,
  database: DatabaseIcon,
  table: TableIcon,
  checklist: ChecklistIcon,
  code: CodeIcon,
  cube: CubeIcon,
  queue: QueueIcon,
  dispatch: DispatchIcon,
  branch: BranchIcon,
  cloud: CloudIcon,
  merge: MergeIcon,
} as const;

export type IconName = keyof typeof icons;

export const Icon: React.FC<IconProps & { name: IconName }> = ({ name, ...rest }) => {
  const C = icons[name];
  return <C {...rest} />;
};
