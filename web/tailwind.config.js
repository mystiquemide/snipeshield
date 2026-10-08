/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        violet: { DEFAULT: "#594FF4", tint: "#DAD6F7" },
        ink: "#1F1F1F",
        graphite: "#333333",
        slate: "#5D5D5D",
        smoke: "#888888",
        ash: "#B0B0B0",
        mist: "#E7E7E7",
        cloud: "#F6F6F6",
        porcelain: "#FFFFFF",
        obsidian: "#000000",
        danger: "#FF2D55",
        dangertext: "#D70F3C",
        caution: "#B26A00",
        safe: "#16794C",
      },
      fontFamily: {
        sans: ['"Inter Tight"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { panel: "36px", media: "24px", input: "16px", pill: "99px" },
      maxWidth: { page: "1224px" },
      boxShadow: { float: "0 0 60px -13px rgba(0,0,0,0.12)" },
    },
  },
  plugins: [],
};
