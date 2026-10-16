import { buildEventTooltip } from '../eventTooltip';

const event = (overrides = {}) => ({
  title: 'Party',
  start: new Date(2026, 11, 20),
  extendedProps: { recipientDetails: { firstName: 'Ann', lastName: 'Lee' } },
  ...overrides
});

describe('buildEventTooltip', () => {
  it('shows the event name, recipient, date and reminder as text', () => {
    const el = buildEventTooltip(event());
    expect(el.querySelector('strong').textContent).toBe('Party');
    expect(el.textContent).toContain('Recipient: Ann Lee');
    expect(el.textContent).toContain(`Date: ${new Date(2026, 11, 20).toLocaleDateString()}`);
    expect(el.textContent).toContain('No reminder set');
  });

  it('never turns names into markup', () => {
    const el = buildEventTooltip(event({
      title: '<img src=x onerror="window.__xss=1">',
      extendedProps: { recipientDetails: { firstName: '<b onmouseover=alert(1)>Bo</b>', lastName: "O'Neil" } }
    }));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('strong').textContent).toBe('<img src=x onerror="window.__xss=1">');
    expect(el.textContent).toContain("Recipient: <b onmouseover=alert(1)>Bo</b> O'Neil");
  });

  it('shows text that looks like an entity exactly as typed', () => {
    expect(buildEventTooltip(event({ title: 'I &lt;3 you' })).querySelector('strong').textContent).toBe('I &lt;3 you');
  });

  it('labels holidays and events without a recipient', () => {
    expect(buildEventTooltip(event({ extendedProps: { recipientDetails: { isSystemAccount: true } } })).textContent).toContain('Holiday');
    expect(buildEventTooltip(event({ extendedProps: {} })).textContent).toContain('No recipient');
  });
});
