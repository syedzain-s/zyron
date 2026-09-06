import type { Config } from 'tailwindcss';

/**
 * Palette: black and deep navy ground, metallic gold accent, warm white type.
 *
 * Gold is an accent, never a surface. It appears on hairlines, eyebrows, small
 * marks and single words — the restraint is what makes it read as expensive
 * rather than gaudy. There is no third accent colour on purpose: monochrome
 * plus one metal is the whole idea.
 *
 * Token names are unchanged from the previous palette so every existing
 * component keeps working; only the values moved.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ground
        ink: '#04060C',
        obsidian: '#080D18',
        slate2: '#0A1428',

        // The metal
        gold: {
          DEFAULT: '#C8A44D',
          soft: '#ECD79F',
          deep: '#8A6D22',
        },

        // Navy slate — a second, quieter tier marker. Deliberately not a new
        // hue: it is the ground colour, lifted.
        cocoa: {
          DEFAULT: '#2C3852',
          soft: '#5B6A8C',
          deep: '#0A1428',
        },

        // Type
        cream: '#EDEEF3',
        ash: '#8B94A9',

        signal: {
          ok: '#7FA88C',
          warn: '#C8A44D',
          risk: '#C0584A',
        },
      },

      fontFamily: {
        // Libre Baskerville for display, Inter for everything else. Both are
        // self-hosted from npm (wired up in app/layout.tsx) so nothing is
        // fetched at build time.
        sans: ['Inter Variable', 'var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        display: ['Libre Baskerville', 'Iowan Old Style', 'Georgia', 'serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        // A serif at display size needs tighter leading than a sans would.
        // Sized for Libre Baskerville, not for the geometric sans that was here
        // before. A serif carries more visual weight at the same measurement,
        // so the viewport step is gentler and the ceiling is lower — otherwise
        // a three-line headline runs off the side of a laptop screen.
        'display-xl': ['clamp(2.4rem, 4.6vw, 4.5rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(1.9rem, 3.4vw, 3.1rem)', { lineHeight: '1.1', letterSpacing: '-0.018em' }],
        'display-md': ['clamp(1.55rem, 2.6vw, 2.25rem)', { lineHeight: '1.18', letterSpacing: '-0.015em' }],
      },

      maxWidth: {
        shell: '84rem',
      },

      boxShadow: {
        lift: '0 30px 80px -30px rgb(0 0 0 / 0.85)',
        gold: '0 0 0 1px rgb(200 164 77 / 0.28), 0 20px 60px -30px rgb(200 164 77 / 0.35)',
        plasma: '0 0 0 1px rgb(200 164 77 / 0.16), 0 24px 70px -32px rgb(10 20 40 / 0.7)',
      },

      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, transparent, rgb(4 6 12 / 0.92)), linear-gradient(rgb(200 164 77 / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(200 164 77 / 0.07) 1px, transparent 1px)',
      },

      transitionTimingFunction: {
        lux: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        'sweep-x': {
          '0%': { translate: '-42vw 0', opacity: '0' },
          '14%': { opacity: '0.45' },
          '86%': { opacity: '0.45' },
          '100%': { translate: '42vw 0', opacity: '0' },
        },
        sheen: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'ray-breathe': {
          '0%, 100%': { scale: '1 1', translate: '0 0' },
          '50%': { scale: '1.4 1', translate: '3% 0' },
        },
        'cue-drop': {
          '0%': { translate: '0 -100%', opacity: '0' },
          '22%': { opacity: '1' },
          '100%': { translate: '0 220%', opacity: '0' },
        },
        'tick-up': {
          from: { translate: '0 0.4em', opacity: '0' },
          to: { translate: '0 0', opacity: '1' },
        },
      },

      animation: {
        'sweep-x': 'sweep-x 13s cubic-bezier(0.22,1,0.36,1) infinite',
        sheen: 'sheen 8s cubic-bezier(0.45,0,0.55,1) infinite',
        breathe: 'breathe 4s ease-in-out infinite',
        'ray-breathe': 'ray-breathe 16s ease-in-out infinite',
        'cue-drop': 'cue-drop 2.6s cubic-bezier(0.22,1,0.36,1) infinite',
        'tick-up': 'tick-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
