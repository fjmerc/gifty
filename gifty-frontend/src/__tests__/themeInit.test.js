// public/index.html applies the remembered theme (public/theme-init.js) before React loads, so a
// dark-theme visitor does not see a white flash on every page load.
import fs from 'fs';
import path from 'path';
import { THEME_STORAGE_KEY } from '../utils/theme';

// The script is a file the head loads (not inline: the CSP allows script files only)
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const inline = fs.readFileSync(path.join(__dirname, '../../public/theme-init.js'), 'utf8');

const run = ({ stored = null, systemDark = false, storageThrows = false } = {}) => {
  document.documentElement.removeAttribute('data-theme');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => {
        if (storageThrows) throw new Error('blocked');
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    },
  });
  window.matchMedia = jest.fn(() => ({ matches: systemDark }));
  // eslint-disable-next-line no-new-func
  new Function(inline)();
  return document.documentElement.getAttribute('data-theme');
};

test('the head loads the theme script, which reads the same storage key as the app', () => {
  expect(head).toContain('<script src="%PUBLIC_URL%/theme-init.js"></script>');
  expect(inline).toContain(`'${THEME_STORAGE_KEY}'`);
});

test('a remembered light or dark choice wins over the system', () => {
  expect(run({ stored: 'dark', systemDark: false })).toBe('dark');
  expect(run({ stored: 'light', systemDark: true })).toBe('light');
});

test('System or nothing remembered follows prefers-color-scheme', () => {
  expect(run({ stored: 'system', systemDark: true })).toBe('dark');
  expect(run({ stored: null, systemDark: true })).toBe('dark');
  expect(run({ stored: null, systemDark: false })).toBe('light');
});

test('blocked storage still gives a theme', () => {
  expect(run({ storageThrows: true, systemDark: true })).toBe('dark');
});
