/**
 * Grove — Tailwind CSS Theme Extension
 * Add this to your tailwind.config.js under `theme.extend`
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        grove: {
          void:     '#080f0a',
          deep:     '#0c1810',
          forest:   '#112416',
          canopy:   '#1a3520',
          moss:     '#2d5a38',
          fern:     '#3d7a4e',
          leaf:     '#4fa362',
          sprout:   '#6dc280',
          bright:   '#8edc9f',
          mist:     '#b8f0c5',
          bark:     '#c47a3a',
          amber:    '#e89840',
          dusk:     '#f2b460',
          stone:    '#a0a89e',
          pebble:   '#d0d8ce',
          fog:      '#eaede8',
          white:    '#f5f7f4',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'monospace'],
        serif:   ['Instrument Serif', 'serif'],
      },
      borderRadius: {
        'grove-sm':  '4px',
        'grove-md':  '6px',
        'grove-lg':  '10px',
        'grove-xl':  '12px',
        'grove-2xl': '24px',
      },
      boxShadow: {
        'grove-sm':   '0 2px 8px rgba(0,0,0,0.3)',
        'grove-md':   '0 8px 24px rgba(0,0,0,0.5)',
        'grove-lg':   '0 32px 80px rgba(0,0,0,0.6)',
        'grove-glow': '0 0 24px rgba(77,163,98,0.15)',
      },
    },
  },
};
