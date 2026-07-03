import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FDFBF2",
        rule: "#CFE0EE",
        margin: "#E8A9A9",
        ink: "#1C1A17",
        inkSoft: "#6D675C",
        marker: "#D6231F",
        spared: "#2E7D46",
        swap: "#B47F0E",
        hilite: "#FFE45C",
        hallway: "#20140F",
      },
      fontFamily: {
        marker: ["var(--font-marker)", "Permanent Marker", "cursive"],
        body: ["var(--font-body)", "Space Grotesk", "system-ui", "sans-serif"],
      },
      boxShadow: {
        stamp: "3px 3px 0 0 #1C1A17",
        stampSm: "2px 2px 0 0 #1C1A17",
        note: "2px 3px 6px rgba(0,0,0,0.15)",
      },
      keyframes: {
        scrawlIn: {
          "0%": { transform: "scale(1.8) rotate(-4deg)", opacity: "0" },
          "60%": { transform: "scale(0.94) rotate(-4deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(-4deg)", opacity: "1" },
        },
        wobble: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
      },
      animation: {
        scrawlIn: "scrawlIn 380ms cubic-bezier(.34,1.56,.64,1)",
        wobble: "wobble 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
