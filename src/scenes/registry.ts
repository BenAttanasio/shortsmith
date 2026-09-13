import React from 'react';
import { ContrastPair, type ContrastProps, type ContrastSide } from './ContrastPair';
import { ChainFlow, type ChainProps } from './ChainFlow';
import { StackFill, type StackProps } from './StackFill';
import { DispatchFanout, type DispatchProps } from './DispatchFanout';
import { CodeAnnotate, type CodeAnnotateProps } from './CodeAnnotate';
import { LayerStack, type LayerStackProps } from './LayerStack';
import { CycleLoop, type CycleLoopProps } from './CycleLoop';
import { GatherMerge, type GatherMergeProps } from './GatherMerge';
import { NestedScope, type NestedScopeProps } from './NestedScope';
import { QuadrantMatrix, type QuadrantMatrixProps } from './QuadrantMatrix';
import type { SceneBase, SceneVariant } from '../components/SceneFrame';
import type { AccentName } from '../theme';
import type { IconName } from '../components/icons';

/**
 * Scene dispatch.
 *
 * Replaces the `if/if/fallthrough` chain that used to live in Root.tsx, where any
 * unrecognized scene name silently rendered StackFill — so `"scene": "fanuot"` produced
 * `items.map of undefined` inside a render worker, with a stack pointing at React
 * internals rather than at the typo. With ten archetypes that is untenable.
 *
 * Validation here is a last line of defence that throws with the reel's id attached.
 * `scripts/lint-reels.mjs` is the first, and it runs before anything costs money.
 */

/** The raw JSON shape. Checked mechanically by the linter, not by tsc. */
export type RawReel = {
  id: string;
  title: string;
  hook: string;
  scene: string;
  narration: string;
  verdict?: string;
  variant?: SceneVariant;
} & Record<string, unknown>;

const req = <T,>(r: RawReel, key: string): T => {
  const v = r[key];
  if (v === undefined || v === null) {
    throw new Error(
      `reels.json: "${r.id}" (scene "${r.scene}") is missing required prop "${key}". ` +
        'Run: node scripts/lint-reels.mjs',
    );
  }
  return v as T;
};

/** narrationFrames is a placeholder here; calculateMetadata overwrites it from the WAV. */
const shared = (r: RawReel): SceneBase => ({
  title: r.title,
  hook: r.hook,
  narration: r.narration,
  narrationFrames: 1,
  verdict: r.verdict,
  variant: r.variant,
  guides: false,
});

type Entry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>;
  build: (r: RawReel) => SceneBase & Record<string, unknown>;
};

export const registry: Record<string, Entry> = {
  contrast: {
    component: ContrastPair,
    build: (r): ContrastProps => ({
      ...shared(r),
      left: req<ContrastSide>(r, 'left'),
      right: req<ContrastSide>(r, 'right'),
    }),
  },

  chain: {
    component: ChainFlow,
    build: (r): ChainProps => ({
      ...shared(r),
      steps: req<string[]>(r, 'steps'),
      accent: r.accent as AccentName | undefined,
    }),
  },

  fill: {
    component: StackFill,
    build: (r): StackProps => ({
      ...shared(r),
      items: req<string[]>(r, 'items'),
      regionLabel: req<string>(r, 'regionLabel'),
      accent: r.accent as AccentName | undefined,
    }),
  },

  fanout: {
    component: DispatchFanout,
    build: (r): DispatchProps => ({
      ...shared(r),
      source: req<{ label: string; icon?: IconName }>(r, 'source'),
      workers: req<{ label: string; icon?: IconName }[]>(r, 'workers'),
      braceLabel: r.braceLabel as string | undefined,
      accent: r.accent as AccentName | undefined,
      sourceAccent: r.sourceAccent as AccentName | undefined,
    }),
  },

  code: {
    component: CodeAnnotate,
    build: (r): CodeAnnotateProps => ({
      ...shared(r),
      code: req<string[]>(r, 'code'),
      focus: req<number>(r, 'focus'),
      callout: req<string>(r, 'callout'),
      filename: r.filename as string | undefined,
      accent: r.accent as AccentName | undefined,
    }),
  },

  layers: {
    component: LayerStack,
    build: (r): LayerStackProps => ({
      ...shared(r),
      layers: req<{ label: string; note?: string }[]>(r, 'layers'),
      focus: req<number>(r, 'focus'),
      axisLabel: req<string>(r, 'axisLabel'),
      chip: r.chip as string | undefined,
      accent: r.accent as AccentName | undefined,
    }),
  },

  loop: {
    component: CycleLoop,
    build: (r): CycleLoopProps => ({
      ...shared(r),
      nodes: req<{ label: string; icon?: IconName }[]>(r, 'nodes'),
      edges: r.edges as string[] | undefined,
      centre: r.centre as string | undefined,
      accent: r.accent as AccentName | undefined,
    }),
  },

  gather: {
    component: GatherMerge,
    build: (r): GatherMergeProps => ({
      ...shared(r),
      sources: req<{ label: string; icon?: IconName }[]>(r, 'sources'),
      collector: req<{ label: string; icon?: IconName; note?: string }>(r, 'collector'),
      result: req<{ label: string; icon?: IconName }>(r, 'result'),
      edgeLabel: r.edgeLabel as string | undefined,
      mergeLabel: r.mergeLabel as string | undefined,
      accent: r.accent as AccentName | undefined,
      resultAccent: r.resultAccent as AccentName | undefined,
    }),
  },

  nest: {
    component: NestedScope,
    build: (r): NestedScopeProps => ({
      ...shared(r),
      rings: req<{ label: string; variant: 'solid' | 'dashed'; vertical?: boolean }[]>(r, 'rings'),
      core: req<{ label: string; icon?: IconName }>(r, 'core'),
      direction: r.direction as 'in' | 'out' | undefined,
      accent: r.accent as AccentName | undefined,
    }),
  },

  matrix: {
    component: QuadrantMatrix,
    build: (r): QuadrantMatrixProps => ({
      ...shared(r),
      columns: req<[string, string]>(r, 'columns'),
      rows: req<[string, string]>(r, 'rows'),
      cells: req<[string, string, string, string]>(r, 'cells'),
      pick: req<number>(r, 'pick'),
      pickLabel: r.pickLabel as string | undefined,
      revealOrder: r.revealOrder as number[] | undefined,
      accent: r.accent as AccentName | undefined,
    }),
  },
};

export const sceneNames = Object.keys(registry);

/** Throws with a named error rather than resolving to the wrong component. */
export const entryFor = (reel: RawReel): Entry => {
  const entry = registry[reel.scene];
  if (!entry) {
    throw new Error(
      `reels.json: "${reel.id}" has unknown scene "${reel.scene}". ` +
        `Known scenes: ${sceneNames.join(', ')}`,
    );
  }
  return entry;
};
