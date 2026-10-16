import React from 'react';
import { render, screen, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import EditRecipientProfileForm from '../js/EditRecipientProfileForm';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance');
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

const THIS_YEAR = new Date().getFullYear();

const recipient = {
  _id: 'recipient-123',
  firstName: 'John',
  lastName: 'Doe',
  relation: 'Brother',
  relationship: 'family',
  birthdate: '1990-05-15T00:00:00.000Z',
  tags: [{ name: 'sports' }],
  minimumPriceBudget: 50,
  maximumPriceBudget: 200,
  giftStatus: 'active',
  visibility: true,
  address: { street: '123 Main St', city: 'New York', state: 'NY', country: 'USA', zipCode: '10001' },
  interests: ['reading'],
  hobbies: ['guitar'],
  favoriteColors: ['blue'],
  favoriteBooks: ['1984'],
  favoriteMovies: ['Inception'],
  favoriteMusic: ['rock'],
  personalityTraits: ['creative'],
  occupation: 'Engineer',
  workSchedule: '9-5',
  relationshipLength: '25',
  relationshipCloseness: 'very close',
  giftPreferences: 'practical',
  dietaryRestrictions: ['vegetarian'],
  clothingSizes: { shirt: 'L', pants: '32', shoe: '10' },
  wishList: []
};

const overallExists = { exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD' };
const overallMissing = { exists: false, year: THIS_YEAR, amount: null, isLimited: false, currency: 'USD' };
const noRecipientBudget = {
  exists: false, year: THIS_YEAR, type: null, allocationType: null, isLimited: false, limit: null,
  currency: 'USD', spentAmount: 0, remainingAmount: null, budgetStatus: 'no_budget', spent: 0, left: null, status: 'no_budget'
};
const existingRecipientBudget = {
  exists: true, _id: 'b1', year: THIS_YEAR, type: 'fixed', allocationType: 'fixed', minimumAmount: 100, maximumAmount: 300,
  percentageAllocation: null, isLimited: true, isActive: true, notes: '', limit: 300, currency: 'USD',
  spentAmount: 40, remainingAmount: 260, budgetStatus: 'within', spent: 40, left: 260, status: 'within'
};

const fieldInput = (label) => screen.getByText(label).parentElement.querySelector('input');
const budgetCalls = () => axiosInstance.post.mock.calls.filter(([url]) => url.startsWith('/budgets'));

const mockApi = ({ overall, recipientBudget }) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url.startsWith('/budgets/overall/')) return Promise.resolve({ data: overall });
    if (url.startsWith('/budgets/recipient/')) return Promise.resolve({ data: recipientBudget });
    return Promise.resolve({ data: {} });
  });
  axiosInstance.put.mockResolvedValue({ data: {} });
  axiosInstance.post.mockResolvedValue({ data: {} });
};

describe('EditRecipientProfileForm — budget payload', () => {
  test('creates a recipient budget only from values the user entered (configuration only)', async () => {
    const user = userEvent.setup();
    mockApi({ overall: overallExists, recipientBudget: noRecipientBudget });
    render(<EditRecipientProfileForm recipient={recipient} />);

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`));
    await user.clear(fieldInput('Minimum Price Budget'));
    await user.type(fieldInput('Minimum Price Budget'), '20');
    await user.clear(fieldInput('Maximum Price Budget'));
    await user.type(fieldInput('Maximum Price Budget'), '80');
    await user.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith('/budgets/recipient', {
        recipientId: 'recipient-123',
        year: THIS_YEAR,
        allocationType: 'fixed',
        minimumAmount: 20,
        maximumAmount: 80,
        isActive: true,
        isLimited: true,
        frequency: 'yearly',
        category: 'gifts'
      });
    });
    expect(axiosInstance.post).not.toHaveBeenCalledWith('/budgets/overall', expect.anything());
  });

  test('updates an existing recipient budget with configuration only', async () => {
    const user = userEvent.setup();
    mockApi({ overall: overallExists, recipientBudget: existingRecipientBudget });
    render(<EditRecipientProfileForm recipient={recipient} />);

    await waitFor(() => expect(screen.getByDisplayValue('300')).toBeInTheDocument());
    await user.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`, {
        allocationType: 'fixed',
        isLimited: true,
        minimumAmount: 100,
        maximumAmount: 300,
        isActive: true
      });
    });
  });

  test('saving a profile with a percentage budget succeeds and sends percentageAllocation, not min/max', async () => {
    const user = userEvent.setup();
    mockApi({
      overall: overallExists,
      recipientBudget: { ...existingRecipientBudget, type: 'percentage', allocationType: 'percentage', percentageAllocation: 25, minimumAmount: null, maximumAmount: null, limit: 250 }
    });
    render(<EditRecipientProfileForm recipient={recipient} />);

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`));
    await user.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`, {
        allocationType: 'percentage',
        isLimited: true,
        percentageAllocation: 25,
        isActive: true
      });
    });
  });

  test('a birthdate-only edit of a recipient with no budget creates no budget at all', async () => {
    const user = userEvent.setup();
    mockApi({ overall: overallMissing, recipientBudget: noRecipientBudget });
    render(<EditRecipientProfileForm recipient={recipient} />);

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`));
    const birthdate = screen.getByDisplayValue('1990-05-15');
    await user.clear(birthdate);
    await user.type(birthdate, '1991-06-20');
    await user.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/recipients/recipient-123'));
    expect(axiosInstance.put).toHaveBeenCalledWith('/recipients/recipient-123', expect.objectContaining({ birthdate: '1991-06-20' }));
    expect(budgetCalls()).toEqual([]);
    expect(axiosInstance.put).not.toHaveBeenCalledWith(expect.stringMatching(/^\/budgets/), expect.anything());
  });

  test('budget fields are optional for an active recipient with no budget', async () => {
    const user = userEvent.setup();
    mockApi({ overall: overallExists, recipientBudget: noRecipientBudget });
    render(<EditRecipientProfileForm recipient={{ ...recipient, minimumPriceBudget: undefined, maximumPriceBudget: undefined }} />);

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`));
    await user.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/recipients/recipient-123'));
    expect(screen.queryByText(/price budget is required/i)).not.toBeInTheDocument();
    expect(budgetCalls()).toEqual([]);
  });

  test('never auto-creates an overall budget; a refused recipient budget explains why', async () => {
    const user = userEvent.setup();
    mockApi({ overall: overallMissing, recipientBudget: noRecipientBudget });
    axiosInstance.post.mockImplementation((url) => (url === '/budgets/recipient'
      ? Promise.reject({ response: { status: 400, data: { message: 'Overall budget must be set first' } } })
      : Promise.resolve({ data: {} })));
    render(<EditRecipientProfileForm recipient={recipient} />);

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/recipient/recipient-123/${THIS_YEAR}`));
    await user.clear(fieldInput('Maximum Price Budget'));
    await user.type(fieldInput('Maximum Price Budget'), '150');
    await user.click(screen.getByText('Save Changes'));

    expect(await screen.findByText(/An overall budget is required before setting recipient budgets/)).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalledWith('/budgets/overall', expect.anything());
    expect(screen.queryByText(/automatically/)).not.toBeInTheDocument();
  });
});
