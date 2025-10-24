import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Industrial palette: slate/stone + safety accent
        base: {
          50:  "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
          950: "#0b1220",
        },
        accent: {
          300: "#fdba74",   // orange-300
          400: "#fb923c",   // orange-400
          500: "#f97316",   // orange-500
          600: "#ea580c",   // orange-600 (buttons)
          700: "#c2410c",
        },
        info:   "#60a5fa",  // blue-400
        okay:   "#34d399",  // emerald-400
        warn:   "#f59e0b",  // amber-500
        danger: "#ef4444",  // red-500
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 12px rgba(0,0,0,0.25)",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "Apple Color Emoji", "Segoe UI Emoji"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};

export default config;

