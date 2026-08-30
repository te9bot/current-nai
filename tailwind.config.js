/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#050505",
          900: "#0C0C0C",
          800: "#151515",
          700: "#1D1D1F",
          600: "#2A2A2C",
        },
        grey: {
          600: "#4B4B4B",
          500: "#6F6F6F",
          400: "#8E8E8E",
          300: "#CCCCCC",
        },
        leaf: {
          300: "#8FD3A2",
          400: "#6BC183",
          500: "#50AF6C",
          600: "#3F925A",
          700: "#2F7047",
        },
        rust: {
          300: "#F0958A",
          400: "#EB7C6C",
          500: "#E4573D",
          600: "#C43F28",
          700: "#9C3220",
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
        "pulse-halo": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.6)", opacity: "0" },
        },
        "map-pan": {
          "0%, 100%": { transform: "scale(1.1) translate3d(0, 0, 0)" },
          "50%": { transform: "scale(1.16) translate3d(-1.5%, 1.5%, 0)" },
        },
      },
      animation: {
        marquee: "marquee 28s linear infinite",
        "pulse-halo": "pulse-halo 2.4s cubic-bezier(.2,.8,.2,1) infinite",
        "map-pan": "map-pan 22s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
