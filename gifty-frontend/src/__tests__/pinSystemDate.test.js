import { pinSystemDate } from '../test-utils';

describe('pinSystemDate', () => {
  it('makes "now" the pinned date while time keeps moving, then restores', async () => {
    const realYear = new Date().getFullYear();
    const restore = pinSystemDate('2025-06-10T12:00:00Z');

    expect(new Date().toISOString().slice(0, 10)).toBe('2025-06-10');
    expect(new Date(Date.now()).getUTCFullYear()).toBe(2025);
    // explicit dates are untouched
    expect(new Date('2030-01-01T00:00:00Z').getUTCFullYear()).toBe(2030);
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 20));
    expect(Date.now()).toBeGreaterThan(t0);

    restore();
    expect(new Date().getFullYear()).toBe(realYear);
  });
});
