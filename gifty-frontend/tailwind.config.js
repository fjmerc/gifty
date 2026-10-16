/** @type {import('tailwindcss').Config} */
// Colors map to the design tokens defined in src/index.css (see DESIGN.md).
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--color-border)",
        input: "var(--color-border-input)",
        ring: "var(--focus-ring-color)",
        background: "var(--color-surface)",
        foreground: "var(--color-ink)",
        primary: {
          DEFAULT: "var(--color-primary)",
          strong: "var(--color-primary-strong)",
          bright: "var(--color-primary-bright)",
          wash: "var(--color-primary-wash)",
          foreground: "var(--color-on-fill)",
        },
        destructive: {
          DEFAULT: "var(--color-danger)",
          strong: "var(--color-danger-strong)",
          wash: "var(--color-danger-wash)",
          foreground: "var(--color-on-fill)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          wash: "var(--color-success-wash)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          wash: "var(--color-warning-wash)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          ink: "var(--color-info-ink)",
          wash: "var(--color-info-wash)",
        },
        muted: {
          DEFAULT: "var(--color-surface-muted)",
          foreground: "var(--color-ink-muted)",
        },
        card: {
          DEFAULT: "var(--color-surface)",
          foreground: "var(--color-ink)",
        },
      },
      backgroundImage: {
        page: "var(--page-background)",
      },
    },
  },
  plugins: [],
}
