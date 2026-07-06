/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#171717',
        muted: '#66625d',
        paper: '#f7f5ef',
        panel: '#ffffff',
        line: '#dfdcd3',
        action: '#1c5d5f',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

