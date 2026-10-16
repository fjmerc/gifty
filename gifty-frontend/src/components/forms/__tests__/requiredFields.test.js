// Required fields are marked where you can see them: the label carries the
// `required` class (a CSS asterisk, not text, so labels keep their names),
// the control says aria-required, and each form explains the mark once.
import React from 'react';
import { render, screen } from '../../../test-utils';
import AddGiftForm from '../js/AddGiftForm';
import AddRecipientForm from '../js/AddRecipientForm';
import EventForm from '../js/EventForm';
import CustomEventTypeForm from '../js/CustomEventTypeForm';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance');

const noop = () => {};

const CASES = [
  ['Add gift', <AddGiftForm onSubmit={noop} onCancel={noop} recipients={[]} events={[]} budgets={[]} />,
    ['Gift Name', 'Description', 'Recipient', 'Event', 'Price', 'Status'], ['Category']],
  ['Add recipient', <AddRecipientForm onSubmit={noop} onCancel={noop} showTitle={false} />,
    ['First Name', 'Last Name', 'Relation', 'Birthdate'], []],
  ['Event', <EventForm onClose={noop} onSubmit={noop} isEditing={false} showTitle={false} />,
    ['Event Name', 'Recipient', 'Event Type', 'Date'], []],
  ['Custom event type', <CustomEventTypeForm onClose={noop} onSuccess={noop} showHeader={false} />,
    ['Name'], ['Description']],
];

beforeEach(() => {
  axiosInstance.get.mockResolvedValue({ data: [] });
});

test.each(CASES)('%s: required fields are marked and explained', async (title, form, required, optional) => {
  render(form);
  expect(await screen.findByText('Fields marked * are required.')).toBeInTheDocument();
  required.forEach((name) => {
    const control = screen.getByLabelText(name, { exact: true });
    const label = document.querySelector(`label[for="${control.id}"]`);
    expect(label).toHaveClass('required');
    expect(control.required || control.getAttribute('aria-required') === 'true').toBe(true);
  });
  optional.forEach((name) => {
    const control = screen.getByLabelText(name, { exact: true });
    expect(document.querySelector(`label[for="${control.id}"]`)).not.toHaveClass('required');
  });
});
