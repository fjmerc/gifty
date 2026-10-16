// Every form dialog shows its actions in the dialog's sticky footer, so the
// main button stays on screen on a phone however long the form is. The submit
// button sits outside the <form> and reaches it through form="<form id>".
import React from 'react';
import { render, screen, waitFor } from '../../../test-utils';
import Modal from '../../ui/Modal';
import AddGiftForm from '../js/AddGiftForm';
import AddRecipientForm from '../js/AddRecipientForm';
import EditRecipientForm from '../js/EditRecipientForm';
import EventForm from '../js/EventForm';
import CustomEventTypeForm from '../js/CustomEventTypeForm';
import OverallBudgetForm from '../js/OverallBudgetForm';
import RecipientBudgetForm from '../js/RecipientBudgetForm';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance');

const noop = () => {};
const recipient = {
  _id: 'r1', id: 'r1', firstName: 'Ana', lastName: 'Lee', relation: 'Friend',
  budget: { allocationType: 'fixed', minimumAmount: 0, maximumAmount: 100 },
};

const CASES = [
  ['Add gift', <AddGiftForm onSubmit={noop} onCancel={noop} recipients={[]} events={[]} budgets={[]} />, 'Add Gift'],
  ['Add recipient', <AddRecipientForm onSubmit={noop} onCancel={noop} showTitle={false} />, 'Add Recipient'],
  ['Edit recipient', <EditRecipientForm recipient={recipient} closeForm={noop} onSubmit={noop} />, 'Save'],
  ['Event', <EventForm onClose={noop} onSubmit={noop} isEditing={false} showTitle={false} />, 'Save Event'],
  ['Custom event type', <CustomEventTypeForm onClose={noop} onSuccess={noop} showHeader={false} />, 'Create'],
  ['Overall budget', <OverallBudgetForm onClose={noop} onSubmit={noop} year={2026} showTitle={false} />, 'Save Budget'],
  ['Recipient budget', <RecipientBudgetForm recipient={recipient} onClose={noop} onSubmit={noop} year={2026} embedded />, 'Save Budget'],
];

beforeEach(() => {
  axiosInstance.get.mockResolvedValue({ data: [] });
});

test.each(CASES)('%s: Cancel and the submit button are in the footer, wired to the form', async (title, form, submitName) => {
  render(<Modal open onClose={noop} title={title}>{form}</Modal>);
  const submit = await screen.findByRole('button', { name: submitName });
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  const footer = screen.getByTestId('modal-footer');
  expect(footer).toContainElement(submit);
  expect(footer).toContainElement(cancel);
  expect(screen.getByTestId('modal-body')).not.toContainElement(submit);

  const formEl = screen.getByTestId('modal-body').querySelector('form');
  expect(formEl.id).toBeTruthy();
  expect(submit).toHaveAttribute('type', 'submit');
  expect(submit).toHaveAttribute('form', formEl.id);
  expect(submit.form).toBe(formEl);
  // The dismissive action comes first, the main one last (DESIGN.md > Dialogs)
  await waitFor(() => expect(cancel.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
});
