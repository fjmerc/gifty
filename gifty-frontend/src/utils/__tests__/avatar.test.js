import { initialsAvatar } from '../avatar';

describe('initialsAvatar', () => {
  test('draws the initials locally, as an SVG data URI', () => {
    const src = initialsAvatar('Ann', 'Lee');
    expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(src)).toContain('>AL<');
  });

  test('gives the same person the same colour', () => {
    expect(initialsAvatar('Ann', 'Lee')).toBe(initialsAvatar('Ann', 'Lee'));
  });

  test('escapes characters that would break the SVG', () => {
    const svg = decodeURIComponent(initialsAvatar('<Zoë', '&co'));
    expect(svg).toContain('>&lt;&amp;<');
    expect(svg).not.toContain('<Z');
  });

  // White initials at avatar sizes are normal-size text: 4.5:1 on every fill
  test('every background keeps white initials at 4.5:1 or more', () => {
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const fills = new Set();
    for (let i = 0; i < 400; i += 1) {
      fills.add(decodeURIComponent(initialsAvatar(`Name${i}`, `X${i * 7}`)).match(/rect[^>]*fill="(#[0-9a-f]{6})"/)[1]);
    }
    expect(fills.size).toBe(8);
    const low = [...fills].filter((hex) => 1.05 / (lum(hex) + 0.05) < 4.5);
    expect(low).toEqual([]);
  });

  test('copes with missing names', () => {
    expect(decodeURIComponent(initialsAvatar(undefined, ''))).toContain('>?<');
  });
});
