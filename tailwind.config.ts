import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1cc29f",
          dark: "#17a589",
          light: "#e6f7f3",
        },
      },
    },
  },
  plugins: [],
};

export default config;
