/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Light "control panel" surfaces. Ramp direction is unchanged from the
        // original dark theme (950 = page background, 900 = elevated cards,
        // descending toward smaller nested/hover surfaces) — only the actual
        // lightness values flipped bright. `onAccent` is new: the dark
        // text/icon color used on top of bright leaf/rust accent buttons,
        // where a real near-black is needed regardless of theme.
        ink: {
          950: "#F5F5F3",
          900: "#FFFFFF",
          800: "#EFEFEC",
          700: "#E3E3DF",
          600: "#D4D4D0",
          onAccent: "#141414",
        },
        // Secondary/muted text. NOTE: numbering intentionally keeps each
        // call site's *contrast role* stable across the dark→light flip
        // rather than following Tailwind's usual "higher number = darker"
        // convention — so here 300 is the darkest/most prominent tier and
        // 600 the lightest/most muted, the reverse of a typical scale.
        // 900 is new: the primary heading/value text color (was `text-white`).
        grey: {
          300: "#2E2E2E",
          400: "#54544F",
          500: "#6C6C68",
          // Was #868682 — too light to hit WCAG AA's 4.5:1 against any of
          // the app's backgrounds (max ~3.65:1), despite being used for
          // genuinely-read helper text/captions/disclaimers, not decorative
          // filler. Darkened just enough to clear 4.5:1 everywhere it's
          // used while staying the lightest/most muted of the four tiers.
          600: "#5E5E5A",
          900: "#151515",
        },
        // Status colors: power-on (green) and load-shedding (red) — kept
        // separate from the brand accent below so a report's state always
        // reads the same regardless of the app's brand color.
        leaf: {
          300: "#8FD3A2",
          // Was #6BC183 — only ~2:1 against any of the app's backgrounds,
          // used as actual text color (ticker, report cards, status
          // messages) rather than just backgrounds/borders, where it needs
          // WCAG AA's 4.5:1. Darkened to the lightest shade that clears it
          // with margin; 300/500+ (used for badge backgrounds/rings, not
          // text-on-light) are untouched.
          400: "#40744F",
          500: "#50AF6C",
          600: "#3F925A",
          700: "#2F7047",
        },
        rust: {
          300: "#F0958A",
          // Was #EB7C6C — same issue as leaf-400 above (~2.5:1 as text).
          400: "#995146",
          500: "#E4573D",
          600: "#C43F28",
          700: "#9C3220",
        },
        // Primary brand accent — logo, CTAs, active toggles. Shifted toward
        // yellow-gold (hue ~46°) rather than a redder orange (~38°).
        amber: {
          300: "#FDE68A",
          400: "#FBD34D",
          500: "#F2B705",
          600: "#D9A100",
          700: "#B48500",
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
        bn: ['"Hind Siliguri"', '"Noto Sans Bengali"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        DEFAULT: "10px",
        md: "12px",
        lg: "14px",
        xl: "20px",
        pill: "999px",
      },
      boxShadow: {
        callout: "0 10px 28px rgba(0,0,0,.55)",
        sheet: "0 -12px 32px rgba(0,0,0,.6)",
        fab: "0 8px 20px rgba(0,0,0,.5)",
        pin: "0 4px 10px rgba(0,0,0,.45)",
        "glow-leaf": "0 0 24px rgba(80,175,108,.45)",
        "glow-leaf-soft": "0 0 12px rgba(80,175,108,.28)",
        "glow-rust": "0 0 24px rgba(228,87,61,.45)",
        "glow-rust-soft": "0 0 12px rgba(228,87,61,.28)",
        "glow-amber": "0 0 24px rgba(242,183,5,.45)",
        "glow-amber-soft": "0 0 12px rgba(242,183,5,.28)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(.2,.8,.2,1)",
        exit: "cubic-bezier(.4,0,1,1)",
        sheet: "cubic-bezier(.16,1,.3,1)",
      },
      transitionDuration: {
        instant: "90ms",
        fast: "140ms",
        base: "220ms",
        slow: "320ms",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "map-pan": {
          "0%, 100%": { transform: "scale(1.1) translate3d(0, 0, 0)" },
          "50%": { transform: "scale(1.16) translate3d(-1.5%, 1.5%, 0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        marquee: "marquee 28s linear infinite",
        "map-pan": "map-pan 22s ease-in-out infinite",
        "fade-up": "fade-up 520ms cubic-bezier(.2,.8,.2,1) both",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
