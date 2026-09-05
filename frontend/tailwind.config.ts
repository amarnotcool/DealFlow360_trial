import type { Config } from 'tailwindcss';

// Tokens come from DESIGN.md. Where its frontmatter and prose disagree on the
// primary colour, the prose wins: primary is Electric Lemon #E9F034 on dark
// slate #141517, not the frontmatter's olive.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Chromatic focal accents
        lemon: {
          DEFAULT: '#E9F034',
          dim: '#C8CF00',
          soft: '#E4EB2F',
        },
        tangerine: {
          DEFAULT: '#F58F54',
          dim: '#FFB68F',
        },
        obsidian: {
          DEFAULT: '#141517',
          muted: '#8E9199',
        },
        sky: {
          DEFAULT: '#1C8BFF',
        },
        // Canvas
        canvas: {
          from: '#EAE8E3',
          to: '#E5E3DD',
        },
        // Structural neutrals
        ink: {
          DEFAULT: '#141517', // high-emphasis headings
          body: '#2C2E33', // body and table data
          subtle: '#73757D', // labels and column headers
        },
        hairline: 'rgba(20, 21, 23, 0.06)',
        danger: '#BA1A1A',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['44px', { lineHeight: '52px', fontWeight: '700', letterSpacing: '-0.03em' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '600', letterSpacing: '-0.02em' }],
        'headline-lg-mobile': ['26px', { lineHeight: '34px', fontWeight: '600', letterSpacing: '-0.02em' }],
        'title-md': ['20px', { lineHeight: '28px', fontWeight: '600', letterSpacing: '-0.015em' }],
        'title-sm': ['16px', { lineHeight: '24px', fontWeight: '600', letterSpacing: '-0.01em' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400', letterSpacing: '0em' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400', letterSpacing: '0.005em' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.01em' }],
        'label-xs': ['11px', { lineHeight: '14px', fontWeight: '600', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        sm: '0.5rem',
        DEFAULT: '1rem',
        md: '1.5rem',
        lg: '2rem',
        xl: '3rem',
        vessel: '28px', // table and metric card curvature
        thumb: '18px', // product thumbnail frames
        full: '9999px',
      },
      spacing: {
        '2xs': '0.25rem',
        xs: '0.5rem',
        sm: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '2.5rem',
        '3xl': '3rem',
        gutter: '1.25rem',
        screen_margin: '2rem',
        rail: '72px',
      },
      boxShadow: {
        // Level 1 substrate
        substrate: '0 8px 32px -4px rgba(20, 21, 23, 0.04)',
        // Level 2 high-contrast blocks
        'glow-lemon': '0 12px 28px -6px rgba(233, 240, 52, 0.35)',
        'glow-tangerine': '0 12px 28px -6px rgba(245, 143, 84, 0.30)',
        'depth-obsidian': '0 16px 36px -8px rgba(20, 21, 23, 0.18)',
        // Level 3 floating pills
        floating: '0 4px 14px -2px rgba(20, 21, 23, 0.08), 0 1px 2px rgba(20, 21, 23, 0.04)',
        'glow-lemon-hover': '0 16px 34px -6px rgba(233, 240, 52, 0.50)',
      },
      backdropBlur: {
        frost: '20px',
      },
      backgroundImage: {
        canvas: 'linear-gradient(135deg, #EAE8E3 0%, #E5E3DD 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
