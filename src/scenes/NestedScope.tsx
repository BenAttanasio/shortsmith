import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Node } from '../components/Node';
import { SceneFrame, type SceneBase } from '../components/SceneFrame';
import { Icon, type IconName } from '../components/icons';
import { palette, type, AccentName } from '../theme';
import { enter, dimAfter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "X lives inside Y lives inside Z — and the thing you're worried about never leaves the
 * outer ring."
 *
 * Implements STYLE-GUIDE §3's nesting rule, which was documented and never built: a solid
 * box containing dashed boxes containing icons, where solid = a real boundary things
 * cross and dashed = a category. Also the only archetype that uses `Node`'s vertical
 * label, which existed as a dead prop until now.
 *
 * `direction` inverts the entire argument from one field:
 *
 *   'in'  — outer to inner, each ring dimming as the next lands. Narrowing. "Your data
 *           goes here, then here, then here, and *this* is where it stops."
 *   'out' — inner to outer, nothing dimming, things added *around* the core. Widening.
 *           "This one call touches this, which touches this."
 *
 * Same component, opposite rhetoric, and the camera follows: 'in' pushes, 'out' settles
 * back from the core. That is the cheapest large variety win in the library.
 */

export type NestedScopeProps = SceneBase & {
  /** Outermost first. 2 or 3 rings. */
  rings: { label: string; variant: 'solid' | 'dashed'; vertical?: boolean }[];
  core: { label: string; icon?: IconName };
  direction?: 'in' | 'out';
  accent?: AccentName;
};

const CENTRE = { x: 540, y: 945 };

/** Concentric, with ≥100px between ring edges so an inside-top label always fits. */
const RING_SIZES: Record<number, { w: number; h: number }[]> = {
  2: [
    { w: 940, h: 640 },
    { w: 700, h: 360 },
  ],
  3: [
    { w: 940, h: 700 },
    { w: 760, h: 480 },
    { w: 560, h: 280 },
  ],
};

export const NestedScope: React.FC<NestedScopeProps> = (props) => {
  const { rings, core, direction = 'in', accent: tint = 'cyan' } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const n = Math.min(rings.length, 3);
  const sizes = RING_SIZES[n] ?? RING_SIZES[3];

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    buildFrom: 0.12,
    buildTo: 0.66,
    verdict: 0.86,
  });

  // 'in' builds outer→inner; 'out' builds core→outer. The core is one extra step.
  const steps = n + 1;
  const ringAt = (i: number) =>
    direction === 'in' ? b.build(i, steps) : b.build(n - i, steps);
  const coreAt = direction === 'in' ? b.build(n, steps) : b.build(0, steps);

  const from = props.variant?.entrance ?? 'up';

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={direction === 'in' ? ringAt(0) : coreAt}
      verdictAt={b.verdict}
      // Narrowing pushes in; widening starts tight on the core and pulls back.
      defaultCamera={direction === 'in' ? 'push' : 'settle'}
    >
      {rings.slice(0, n).map((ring, i) => {
        const size = sizes[i];
        // Only the narrowing story dims — 'out' adds context without withdrawing any.
        const next = direction === 'in' && i < n - 1 ? ringAt(i + 1) : Infinity;
        const opacity =
          direction === 'in'
            ? dimAfter({ frame, fps, at: next, active: frame < next })
            : 1;
        return (
          <Node
            key={ring.label}
            x={CENTRE.x}
            y={CENTRE.y}
            w={size.w}
            h={size.h}
            at={ringAt(i)}
            variant={ring.variant}
            tint={i === n - 1 ? tint : undefined}
            label={ring.label}
            labelVertical={ring.vertical ?? i === 0}
            labelPosition="inside-top"
            opacity={opacity}
            from={from}
          />
        );
      })}

      <Core label={core.label} icon={core.icon} at={coreAt} tint={tint} />
    </SceneFrame>
  );
};

/** The thing at the middle. Sits above every ring, so it is drawn last. */
const Core: React.FC<{
  label: string;
  icon?: IconName;
  at: number;
  tint: AccentName;
}> = ({ label, icon, at, tint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up', distance: 10 });
  return (
    <div
      style={{
        position: 'absolute',
        left: CENTRE.x - 200,
        top: CENTRE.y - 70,
        width: 400,
        height: 140,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        ...anim,
      }}
    >
      {icon ? <Icon name={icon} size={64} tint={tint} /> : null}
      <span
        style={{
          color: palette.ink,
          fontSize: type.body,
          fontWeight: 600,
          textAlign: 'center',
          lineHeight: 1.15,
        }}
      >
        {label}
      </span>
    </div>
  );
};
