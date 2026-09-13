/**
 * Named token sets.
 *
 * `theme.ts` re-exports whichever one `activeTheme` points at, so every component keeps
 * importing `palette` / `accent` exactly as before and nothing needs a context provider.
 *
 * ---------------------------------------------------------------------------
 * Why the accent KEYS never change between themes
 * ---------------------------------------------------------------------------
 * The five accent names are semantic roles, not colour descriptions — STYLE-GUIDE §1
 * assigns each one a job (mint = the good path, rose = failure/cost, violet =
 * multiplicity, and so on) and content/reels.json selects them by role. So a theme swaps
 * the five *values* and never the five *keys*. `mint` in the graphite theme is a vivid
 * spring green rather than an actual mint; it is still the "good path" slot, still the
 * primary accent, and reels.json needs no edit.
 */

export type PaletteTokens = {
  /** Base canvas. */
  bg: string;
  /** The soft off-center blob that keeps flat dark from reading as dead space. */
  bgGlow: string;
  /** Container / card fill, one step from bg. */
  surface: string;
  /** Code cards sit *below* the page, not above it. */
  surfaceSunken: string;
  border: string;
  /** Text, arrows, line-art. */
  ink: string;
  inkMute: string;
  inkFaint: string;
};

/** Two per frame, maximum. Keys are roles; see the note above. */
export type AccentTokens = {
  mint: string;
  cyan: string;
  violet: string;
  amber: string;
  rose: string;
};

export type Theme = {
  label: string;
  note: string;
  /** True when `ink` is dark on a light `bg` — a few components need to know. */
  light: boolean;
  palette: PaletteTokens;
  accent: AccentTokens;
};

export const themes = {
  /**
   * The channel look, chosen Aug 2026. Graphite with the green cast pulled out, against
   * one vivid spring green. Replaces the previous palette, which was sampled
   * programmatically from ByteByteGo's frames and therefore wore another channel's face.
   */
  graphite: {
    label: 'Handshake Graphite',
    note: 'Cool neutral graphite. Primary accent #00E5A0 is the ownable one — nothing else in the niche uses it.',
    light: false,
    palette: {
      bg: '#1E2124',
      bgGlow: '#24282C',
      surface: '#2F343A',
      surfaceSunken: '#131619',
      border: '#414850',
      ink: '#F7FAFC',
      inkMute: '#9BA4AE',
      inkFaint: '#646C75',
    },
    accent: {
      mint: '#00E5A0',
      cyan: '#38BDF8',
      violet: '#A78BFA',
      amber: '#FBBF24',
      rose: '#FB7185',
    },
  },

  /**
   * Light variant. Not the default — it exists so an occasional reel can be visually
   * unmistakable against the rest of the feed without inventing a second design system.
   * Accents are darkened from the graphite set to hold contrast on a light ground.
   */
  paper: {
    label: 'Paper',
    note: 'Light mode. A structural variety lever, not a replacement default.',
    light: true,
    palette: {
      bg: '#F4F1EA',
      bgGlow: '#EDE9E0',
      surface: '#FFFFFF',
      surfaceSunken: '#E4DFD5',
      border: '#D2CCC0',
      ink: '#1C1A17',
      inkMute: '#6B665D',
      inkFaint: '#9C968B',
    },
    accent: {
      mint: '#1F8A5F',
      cyan: '#1A7FA8',
      violet: '#6B4E9E',
      amber: '#B47512',
      rose: '#C0463F',
    },
  },

  /**
   * The original ByteByteGo-sampled tokens. Kept only so a render can be compared against
   * the old look; not for publication.
   */
  sampled: {
    label: 'Sampled (legacy)',
    note: 'Measured from ByteByteGo frames. Superseded — retained for comparison only.',
    light: false,
    palette: {
      bg: '#242623',
      bgGlow: '#282A27',
      surface: '#393B38',
      surfaceSunken: '#151714',
      border: '#4C4E4B',
      ink: '#FDFFFC',
      inkMute: '#A8AAA6',
      inkFaint: '#6E706C',
    },
    accent: {
      mint: '#3DD9A4',
      cyan: '#22D3EE',
      violet: '#7750BA',
      amber: '#F0B429',
      rose: '#F2555A',
    },
  },
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof themes;

/** The channel look. Changing this re-skins every composition. */
export const activeTheme: ThemeName = 'graphite';
