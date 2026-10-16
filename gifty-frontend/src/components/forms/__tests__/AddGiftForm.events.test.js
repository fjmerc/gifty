import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddGiftForm from '../js/AddGiftForm';
import { todayLocalISO } from '../../../utils/dates';

// The event picker lists the chosen recipient's own events and the holidays,
// each with its date, so two people's "Christmas" can't be confused.
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${todayLocalISO(d)}T00:00:00.000Z`;
};
const maria = { _id: 'maria', firstName: 'Maria', lastName: 'O' };
const paul = { _id: 'paul', firstName: 'Paul', lastName: 'B' };
const holidays = { _id: 'sys', firstName: 'Gifty', lastName: 'Holidays' };
const events = [
  { _id: 'xm-maria', name: 'Christmas', date: day(60), recipient: maria },
  { _id: 'xm-paul', name: 'Christmas', date: day(60), recipient: paul },
  { _id: 'anniv-paul', name: 'Anniversary', date: day(30), recipient: paul },
  { _id: 'bday-paul-past', name: "Paul's Birthday", date: day(-10), recipient: paul },
  { _id: 'old-paul', name: 'Retirement', date: day(-500), recipient: paul },
  { _id: 'thanks', name: 'Thanksgiving', date: day(40), recipient: holidays, isSystemGenerated: true },
  // The API may also return the recipient as a bare id
  { _id: 'club-paul', name: 'Club', date: day(5), recipient: 'paul' }
];

const renderForm = (props = {}) => render(
  <AddGiftForm onSubmit={jest.fn()} onCancel={() => {}} recipients={[maria, paul]} events={events} budgets={[]} {...props} />
);
const offered = () => [...screen.getByLabelText(/^event$/i).querySelectorAll('option')]
  .map((o) => o.value).filter(Boolean);

describe('AddGiftForm — event picker', () => {
  test('asks for a recipient before offering events', () => {
    renderForm();
    expect(offered()).toEqual([]);
    expect(screen.getByLabelText(/^event$/i)).toBeDisabled();
  });

  test("offers the recipient's events and the holidays, soonest first, then recent past ones", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'paul');
    expect(offered()).toEqual(['club-paul', 'anniv-paul', 'thanks', 'xm-paul', 'bday-paul-past']);
  });

  test("shows each event's date, so same-named events stay apart", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'paul');
    const option = screen.getByLabelText(/^event$/i).querySelector('option[value="xm-paul"]');
    expect(option.textContent).toMatch(/^Christmas — /);
    expect(option.textContent).not.toMatch(/Invalid/);
  });

  test('switching recipient clears an event that belongs to the other one', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'maria');
    await user.selectOptions(screen.getByLabelText(/^event$/i), 'xm-maria');
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'paul');
    expect(screen.getByLabelText(/^event$/i)).toHaveValue('');
  });

  test('switching recipient keeps a holiday', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'maria');
    await user.selectOptions(screen.getByLabelText(/^event$/i), 'thanks');
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'paul');
    expect(screen.getByLabelText(/^event$/i)).toHaveValue('thanks');
  });

  test("editing keeps the gift's own event even when it is long past", () => {
    renderForm({
      initialData: {
        _id: 'g1', name: 'Pen', description: 'x', price: 5, status: 'saved',
        recipient: paul, event: { _id: 'old-paul', name: 'Retirement', date: day(-500) }, tags: [], whereToBuy: []
      }
    });
    expect(offered()).toContain('old-paul');
    expect(screen.getByLabelText(/^event$/i)).toHaveValue('old-paul');
  });

  test("moving an edited gift to another recipient drops its old recipient's event", async () => {
    const user = userEvent.setup();
    renderForm({
      initialData: {
        _id: 'g1', name: 'Book', description: 'x', price: 25, status: 'purchased', purchaseDate: day(0),
        recipient: paul, event: { _id: 'anniv-paul', name: 'Anniversary', date: day(30) }, tags: [], whereToBuy: []
      }
    });
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'maria');
    expect(screen.getByLabelText(/^event$/i)).toHaveValue('');
    expect(offered()).not.toContain('anniv-paul');

    await user.selectOptions(screen.getByLabelText(/recipient/i), 'paul');
    expect(offered()).toContain('anniv-paul');
  });

  test('a repeating series offers its next and its latest past occurrence, not all of them', async () => {
    const user = userEvent.setup();
    const weekly = [-21, -14, -7, 7, 14, 21].map((offset) => ({
      _id: `ride${offset}`, name: 'Ride', date: day(offset), recipient: paul, series: 'ride-series'
    }));
    renderForm({ events: [...events, ...weekly] });
    await user.selectOptions(screen.getByLabelText(/recipient/i), 'paul');
    expect(offered().filter((id) => id.startsWith('ride'))).toEqual(['ride7', 'ride-7']);
  });
});
