import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PurchaseHistory from '../js/PurchaseHistory';
import axiosInstance from '../../axiosInstance';

jest.mock('../../axiosInstance');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => () => {}
}));

const lateEvening = new Date(2025, 2, 10, 21, 30); // local time: 10 March, 21:30

const purchases = [
  { _id: 'p1', name: 'Mug', price: 9.99, status: 'purchased', purchaseDate: lateEvening.toISOString(), recipient: { _id: 'r1', firstName: 'Ann', lastName: 'Lee' }, event: { _id: 'e1', name: 'Birthday' } },
  { _id: 'p2', name: 'Scarf', price: 34.99, status: 'purchased', purchaseDate: new Date(2025, 1, 2, 12).toISOString(), recipient: { _id: 'r1', firstName: 'Ann', lastName: 'Lee' }, event: { _id: 'e1', name: 'Birthday' } },
  { _id: 'p3', name: 'Card', price: 5.02, status: 'purchased', purchaseDate: new Date(2025, 0, 5, 12).toISOString(), recipient: { _id: 'r2', firstName: 'Bo', lastName: 'Ng' }, event: { _id: 'e2', name: 'Christmas' } }
];

const mockApi = (overallView = { exists: true, amount: 1000, isLimited: true, currency: 'USD' }) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/gifts') return Promise.resolve({ data: { gifts: purchases } });
    if (url.startsWith('/budgets/overall/')) return Promise.resolve({ data: overallView });
    return Promise.resolve({ data: {} });
  });
  axiosInstance.put.mockResolvedValue({ data: { gift: {} } });
};

const renderPage = () => render(<MemoryRouter><PurchaseHistory /></MemoryRouter>);

describe('Purchase History — money and dates', () => {
  test('the total is summed in whole cents', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Mug');
    expect(document.querySelector('[class*="totalAmount"]')).toHaveTextContent('$50.00');
  });

  test('amounts use the overall budget currency, even when no budget exists yet', async () => {
    mockApi({ exists: false, year: 2025, amount: null, isLimited: false, currency: 'EUR' });
    const { container } = renderPage();

    await screen.findByText('Mug');
    expect(screen.getByText('€9.99')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('rows and the edit form show the local purchase day', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Mug');
    expect(screen.getByText(lateEvening.toLocaleDateString())).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mug').closest('tr').querySelector('button[aria-label="Edit purchase"]'));
    expect(await screen.findByLabelText(/purchase date/i)).toHaveValue('2025-03-10');
  });

  test('saving an edit is a plain gift edit: price, date-only purchaseDate and recipient', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Mug');
    fireEvent.click(screen.getByText('Mug').closest('tr').querySelector('button[aria-label="Edit purchase"]'));
    fireEvent.change(await screen.findByLabelText(/purchase date/i), { target: { value: '2024-12-31' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith('/gifts/p1', {
        price: 12.5,
        purchaseDate: '2024-12-31',
        recipientId: 'r1'
      });
    });
  });

  test('a price-only edit does not re-send the purchase date', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Mug');
    fireEvent.click(screen.getByText('Mug').closest('tr').querySelector('button[aria-label="Edit purchase"]'));
    await screen.findByLabelText(/purchase date/i);
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith('/gifts/p1', { price: 12.5, recipientId: 'r1' });
    });
  });

  test('a refused edit shows the server message in the modal and keeps it open', async () => {
    mockApi();
    axiosInstance.put.mockRejectedValue({ response: { status: 400, data: { message: 'Price cannot be negative' } } });
    renderPage();

    await screen.findByText('Mug');
    fireEvent.click(screen.getByText('Mug').closest('tr').querySelector('button[aria-label="Edit purchase"]'));
    await screen.findByLabelText(/purchase date/i);
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Price cannot be negative');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
  // A purchase recorded by mistake has to be undoable from its only home
  const openEdit = async (name) => {
    await screen.findByText(name);
    fireEvent.click(screen.getByText(name).closest('tr').querySelector('button[aria-label="Edit purchase"]'));
    await screen.findByLabelText(/purchase date/i);
  };

  test('a purchase can be marked not purchased: the gift goes back to saved', async () => {
    mockApi();
    axiosInstance.patch.mockResolvedValue({ data: {} });
    renderPage();

    await openEdit('Mug');
    fireEvent.click(screen.getByRole('button', { name: /mark as not purchased/i }));
    const ask = screen.getByRole('alertdialog', { name: 'Mark as not purchased' });
    expect(axiosInstance.patch).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Mark not purchased' }));

    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledWith('/gifts/p1/status', { status: 'saved' }));
    await waitFor(() => expect(screen.queryByLabelText(/purchase date/i)).not.toBeInTheDocument());
  });

  test('a purchase can be deleted after confirming', async () => {
    mockApi();
    axiosInstance.delete.mockResolvedValue({ data: {} });
    renderPage();

    await openEdit('Scarf');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete purchase' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/gifts/p2'));
    await waitFor(() => expect(screen.queryByLabelText(/purchase date/i)).not.toBeInTheDocument());
  });

  test('cancelling the confirm changes nothing', async () => {
    mockApi();
    renderPage();

    await openEdit('Mug');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /mark as not purchased/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    expect(axiosInstance.delete).not.toHaveBeenCalled();
    expect(axiosInstance.patch).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Edit Purchase' })).toBeInTheDocument();
    expect(screen.getByLabelText(/purchase date/i)).toBeInTheDocument();
  });

  test('edit dialog: actions sit in the footer and Delete is set apart from Save', async () => {
    mockApi();
    renderPage();
    await openEdit('Mug');
    const footer = screen.getByTestId('modal-footer');
    const save = within(footer).getByRole('button', { name: 'Save Changes' });
    const form = screen.getByTestId('modal-body').querySelector('form');
    expect(save).toHaveAttribute('form', form.id);
    expect(save.form).toBe(form);
    const del = within(footer).getByRole('button', { name: /delete/i });
    const unpurchase = within(footer).getByRole('button', { name: /mark as not purchased/i });
    // Destructive and secondary actions live in their own group, away from Cancel/Save
    expect(del.parentElement).toBe(unpurchase.parentElement);
    expect(del.parentElement).not.toContainElement(save);
  });
});
