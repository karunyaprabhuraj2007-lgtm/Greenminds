/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0B1F3A", 50: "#EEF2F7", 100: "#D5DEEA", 700: "#16345C", 800: "#0F2748", 900: "#0B1F3A" },
        leaf: { DEFAULT: "#2E7D32", 50: "#EDF6EE", 100: "#D3E9D4", 600: "#2E7D32", 700: "#256628" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
