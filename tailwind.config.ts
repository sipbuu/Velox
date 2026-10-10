import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          "Inter",
          '"Segoe UI Variable"',
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: ['"SF Mono"', "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        canvas: withAlpha("--v-canvas"),
        surface: withAlpha("--v-surface"),
        ink: {
          DEFAULT: withAlpha("--v-ink"),
          muted: withAlpha("--v-ink-muted"),
          faint: withAlpha("--v-ink-faint"),
        },
        accent: {
          DEFAULT: withAlpha("--v-accent"),
          soft: withAlpha("--v-accent-soft"),
          contrast: withAlpha("--v-accent-contrast"),
        },
        glass: {
          DEFAULT: withAlpha("--v-glass"),
          strong: withAlpha("--v-glass-strong"),
          edge: withAlpha("--v-glass-edge"),
          shine: withAlpha("--v-glass-shine"),
        },
        live: "#ff3b30",
        success: "#34c759",
        warning: "#ff9f0a",
      },
      borderRadius: {
        glass: "1.25rem",
        "glass-lg": "1.75rem",
        "glass-xl": "2.25rem",
      },
      backdropBlur: {
        xs: "2px",
        glass: "20px",
        "glass-heavy": "40px",
      },
      backdropSaturate: {
        glass: "1.8",
      },
      boxShadow: {
        glass:
          "inset 0 1px 0 0 rgb(var(--v-glass-shine) / 0.55), inset 0 0 0 0.5px rgb(var(--v-glass-edge) / 0.35), 0 8px 32px -8px rgb(0 0 0 / var(--v-shadow-alpha))",
        "glass-sm":
          "inset 0 1px 0 0 rgb(var(--v-glass-shine) / 0.45), inset 0 0 0 0.5px rgb(var(--v-glass-edge) / 0.3), 0 2px 10px -2px rgb(0 0 0 / var(--v-shadow-alpha))",
        "glass-lift":
          "inset 0 1px 0 0 rgb(var(--v-glass-shine) / 0.7), inset 0 0 0 0.5px rgb(var(--v-glass-edge) / 0.45), 0 24px 48px -12px rgb(0 0 0 / calc(var(--v-shadow-alpha) * 1.6))",
        poster: "0 10px 30px -10px rgb(0 0 0 / 0.55)",
        "accent-glow": "0 0 0 1px rgb(var(--v-accent) / 0.4), 0 8px 24px -6px rgb(var(--v-accent) / 0.55)",
      },
      backgroundImage: {
        "glass-sheen":
          "linear-gradient(180deg, rgb(var(--v-glass-shine) / 0.22) 0%, rgb(var(--v-glass-shine) / 0.04) 45%, transparent 100%)",
        "poster-fade": "linear-gradient(180deg, transparent 45%, rgb(0 0 0 / 0.85) 100%)",
        "velox-aurora":
          "radial-gradient(60rem 40rem at 10% -10%, rgb(var(--v-aurora-1) / 0.35), transparent 60%), radial-gradient(50rem 35rem at 110% 10%, rgb(var(--v-aurora-2) / 0.3), transparent 60%), radial-gradient(40rem 30rem at 50% 120%, rgb(var(--v-aurora-3) / 0.25), transparent 60%)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.32, 0.72, 0, 1)",
        snappy: "cubic-bezier(0.2, 0.9, 0.3, 1.2)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        "live-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.32, 0.72, 0, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
        "live-pulse": "live-pulse 1.4s ease-in-out infinite",
      },
      gridTemplateColumns: {
        posters: "repeat(auto-fill, minmax(clamp(7.5rem, 22vw, 11rem), 1fr))",
        channels: "repeat(auto-fill, minmax(clamp(9rem, 28vw, 13rem), 1fr))",
        bento: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
      },
      spacing: {
        "safe-t": "env(safe-area-inset-top)",
        "safe-b": "env(safe-area-inset-bottom)",
        "safe-l": "env(safe-area-inset-left)",
        "safe-r": "env(safe-area-inset-right)",
      },
    },
  },
  plugins: [
    plugin(({ addComponents, addUtilities }) => {
      addComponents({
        ".glass": {
          position: "relative",
          backgroundColor: "rgb(var(--v-glass) / var(--v-glass-alpha))",
          backgroundImage:
            "linear-gradient(180deg, rgb(var(--v-glass-shine) / 0.16) 0%, rgb(var(--v-glass-shine) / 0.03) 40%, transparent 100%)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "0.5px solid rgb(var(--v-glass-edge) / var(--v-glass-edge-alpha))",
          boxShadow:
            "inset 0 1px 0 0 rgb(var(--v-glass-shine) / 0.5), 0 8px 32px -8px rgb(0 0 0 / var(--v-shadow-alpha))",
        },
        ".glass-strong": {
          backgroundColor: "rgb(var(--v-glass-strong) / var(--v-glass-strong-alpha))",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "0.5px solid rgb(var(--v-glass-edge) / var(--v-glass-edge-alpha))",
          boxShadow:
            "inset 0 1px 0 0 rgb(var(--v-glass-shine) / 0.6), 0 16px 48px -12px rgb(0 0 0 / var(--v-shadow-alpha))",
        },
        ".glass-pill": {
          borderRadius: "9999px",
          backgroundColor: "rgb(var(--v-glass) / calc(var(--v-glass-alpha) + 0.1))",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          border: "0.5px solid rgb(var(--v-glass-edge) / var(--v-glass-edge-alpha))",
          boxShadow: "inset 0 1px 0 0 rgb(var(--v-glass-shine) / 0.45)",
        },
        ".glass-dark": {
          backgroundColor: "rgb(20 20 26 / 0.55)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "0.5px solid rgb(255 255 255 / 0.14)",
          boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.18)",
          color: "white",
        },
      });
      addUtilities({
        ".no-scrollbar": {
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
        ".tap-highlight-none": { WebkitTapHighlightColor: "transparent" },
        ".text-balance": { textWrap: "balance" },
        ".drag-region": { "-webkit-app-region": "drag" },
        ".no-drag": { "-webkit-app-region": "no-drag" },
      });
    }),
  ],
} satisfies Config;
