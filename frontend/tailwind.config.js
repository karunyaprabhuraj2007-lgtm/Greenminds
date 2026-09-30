/**
 * GreenMinds design tokens.
 * - One brand colour (navy) + one accent (green). Everything else is slate.
 * - Health classes use reserved semantic colours (always paired with a label).
 * - Spacing follows Tailwind's 4px scale; layouts use even steps (8px grid).
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1F3A", 50: "#EEF2F7", 100: "#D6DFEA", 200: "#AEBFD4", 500: "#3A5578", 600: "#274872", 700: "#1B365D", 800: "#12294A", 900: "#0B1F3A" },
        accent: { DEFAULT: "#2E7D32", 50: "#EDF6EE", 100: "#D3E9D4", 200: "#A9D3AB", 500: "#3F9444", 600: "#2E7D32", 700: "#256628", 800: "#1B4D1E" },
        health: { healthy: "#1B8A2F", moderate: "#B7791F", severe: "#C53030" },
      },
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "6px", lg: "8px", xl: "12px" },
      boxShadow: {
        e1: "0 1px 2px rgba(11,31,58,0.06), 0 1px 1px rgba(11,31,58,0.04)",
        e2: "0 4px 12px rgba(11,31,58,0.08), 0 1px 3px rgba(11,31,58,0.06)",
        e3: "0 16px 40px rgba(11,31,58,0.16), 0 2px 6px rgba(11,31,58,0.08)",
      },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
        "fade-in": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
      },
      animation: { shimmer: "shimmer 1.4s linear infinite", "fade-in": "fade-in 160ms ease-out" },
    },
  },
  plugins: [],
};
