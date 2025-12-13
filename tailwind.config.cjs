module.exports = {
  content: ['./index.html', './script.js', './*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        bg: '#000000',
        panel: '#171717',
        element: '#262626',
        primary: '#ffffff',
        secondary: '#a3a3a3',
        muted: '#999999',
        accent: {
          blue: '#0d6efd',
          light: '#60a5fa',
        },
        danger: {
          bg: '#431819',
          text: '#ff6b6b',
        },
        border: '#2a2a2a',
        btnHover: '#e0e0e0',
        ai: '#8b5cf6',
      },
      keyframes: {
        floatUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '10%': { opacity: 1, transform: 'translateY(0)' },
          '90%': { opacity: 1, transform: 'translateY(0)' },
          '100%': { opacity: 0, transform: 'translateY(-20px)' },
        },
        pingFast: {
          '0%': { transform: 'scale(0.8)', opacity: 1 },
          '100%': { transform: 'scale(1.5)', opacity: 0 },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        typingBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'float-up': 'floatUp 5s ease-out forwards',
        'ping-fast': 'pingFast 0.5s cubic-bezier(0, 0, 0.2, 1) forwards',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        typing: 'typingBounce 1s infinite',
      },
    },
  },
  plugins: [],
};
