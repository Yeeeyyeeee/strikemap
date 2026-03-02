/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        "bg-secondary": "#111111",
        panel: "#1a1a1a",
        border: "#2a2a2a",
        accent: "#ef4444",
        "accent-orange": "#f97316",
      },
    },
  },
  plugins: [],
};
