import React from 'react';
import { Node } from '../components/Node';
import { ArcArrow } from '../components/ArcArrow';
import { SceneFrame, type SceneBase } from '../components/SceneFrame';
import { Icon, type IconName } from '../components/icons';
import { palette, type, AccentName } from '../theme';
import { makeBeats } from '../anim/beats';

/**
 * "You think it's a line; it's a loop."
 *
 * The rhetorical *opposite* of `chain`, which asserts a terminus — and that opposition is
 * the reason both exist. A chain says "this ends here." A loop says "the output is the
 * next input, and that's why the behaviour compounds."
 *
 * The closing edge is the whole clip. Everything before it draws in the base ink; the
 * edge from the last node back to the first draws bold and accented, late, and the camera
 * frames it. If a viewer only sees one second of this archetype, that is the second.
 *
 * Subjects: observe → decide → act; retry with backoff; RLHF; the feedback loop that
 * turns a chatbot into an agent.
 */

export type CycleLoopProps = SceneBase & {
  /** 3 or 4, ordered clockwise from the top. */
  nodes: { label: string; icon?: IconName }[];
  /** Rides edge i (node i → node i+1). Length should match nodes. */
  edges?: string[];
  /** Text in the ring's centre — the loop's name. */
  centre?: string;
  accent?: AccentName;
};

/**
 * rx is wide (330) so the E/W boxes clear the centre label. At rx=306 with 330-wide
 * boxes the west box ran to x399 while the centre text started at x390 — a 9px overlap
 * that read as a collision.
 */
const RING = { cx: 540, cy: 950, rx: 330, ry: 268 };

/** Width of the centre label. Must not reach the inner edge of the E/W boxes. */
const CENTRE_W = 300;

/** Angles in degrees, 0 = east, clockwise. Four sits N/E/S/W; three is a triangle. */
const ANGLES: Record<number, number[]> = {
  3: [-90, 30, 150],
  4: [-90, 0, 90, 180],
};

/**
 * N/S boxes are wide and short; E/W boxes narrower and taller, so the ring reads as a
 * ring rather than as four identical cards. E/W are capped at 290 wide: they have to fit
 * between the canvas edge and the centre label.
 */
const boxFor = (n: number, angle: number) => {
  if (n === 3) return { w: 330, h: 150 };
  const vertical = angle === -90 || angle === 90;
  return vertical ? { w: 360, h: 130 } : { w: 290, h: 150 };
};

const DEG = Math.PI / 180;

export const CycleLoop: React.FC<CycleLoopProps> = (props) => {
  const { nodes, edges, centre, accent: tint = 'violet' } = props;

  const n = nodes.length;
  const angles = ANGLES[n] ?? ANGLES[4];
  const positions = angles.map((a) => ({
    a,
    x: RING.cx + RING.rx * Math.cos(a * DEG),
    y: RING.cy + RING.ry * Math.sin(a * DEG),
  }));

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.1,
    buildFrom: 0.2,
    buildTo: 0.62,
    accent: 0.78,
    verdict: 0.88,
  });
  const closingAt = b.accent;
  const from = props.variant?.entrance ?? 'up';

  // Pull each edge back from the node boxes it connects, so the arc starts and ends in
  // open space rather than under a container.
  const inset = n === 3 ? 26 : 22;

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={b.build(0, n)}
      verdictAt={b.verdict}
      defaultCamera="frame-part"
      // The camera frames the closing edge — §6.5, the first real use of a camera move
      // that means something rather than decorating.
      focus={{
        x: RING.cx,
        y: RING.cy + RING.ry * 0.6,
        at: closingAt,
        until: b.t(0.94),
      }}
    >
      {centre ? (
        <div
          style={{
            position: 'absolute',
            left: RING.cx - CENTRE_W / 2,
            top: RING.cy - 40,
            width: CENTRE_W,
            textAlign: 'center',
            color: palette.inkMute,
            fontSize: type.label,
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          {centre}
        </div>
      ) : null}

      {positions.map((pos, i) => {
        const next = (i + 1) % n;
        const isClosing = i === n - 1;
        const box = boxFor(n, pos.a);
        return (
          <React.Fragment key={nodes[i].label}>
            <ArcArrow
              cx={RING.cx}
              cy={RING.cy}
              rx={RING.rx}
              ry={RING.ry}
              fromAngle={pos.a + inset}
              toAngle={positions[next].a - inset}
              // Non-closing edges follow their target node. The closing edge waits.
              at={isClosing ? closingAt : b.build(next, n) - 6}
              label={edges?.[i]}
              tint={isClosing ? tint : undefined}
              bold={isClosing}
            />
            <Node
              x={pos.x}
              y={pos.y}
              w={box.w}
              h={box.h}
              at={b.build(i, n)}
              variant="solid"
              tint={i === 0 ? tint : undefined}
              from={from}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {nodes[i].icon ? <Icon name={nodes[i].icon} size={52} tint={tint} /> : null}
                <span
                  style={{
                    color: palette.ink,
                    fontSize: type.label,
                    fontWeight: 500,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    padding: '0 16px',
                  }}
                >
                  {nodes[i].label}
                </span>
              </div>
            </Node>
          </React.Fragment>
        );
      })}
    </SceneFrame>
  );
};
