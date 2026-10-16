import React from 'react';
import { screen, within } from '@testing-library/react';
import { render, createAuthenticatedUser } from '../../test-utils';
import Gifts from '../js/Gifts';
import axiosInstance from '../../axiosInstance';

jest.mock('../../axiosInstance');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => () => {}
}));
jest.mock('react-tooltip', () => ({ Tooltip: () => null }));
jest.mock('../../components/ui/SuggestionModeSelector', () => () => <div />);
jest.mock('../../components/ui/GiftFeedback', () => () => <div data-testid="rating-panel" />);
jest.mock('../../components/ui/SystemHealthIndicator', () => () => <div />);
jest.mock('../../components/ui/SourceBadge', () => () => <div />);
jest.mock('../../components/ui/AIProviderSelector', () => () => <div />);

// How an AI suggestion card shows its price and its status
const paul = { _id: 'paul', firstName: 'Paul', lastName: 'Becker' };
const anniversary = { _id: 'anniv', name: 'Anniversary', date: '2099-11-20T00:00:00.000Z' };
const gift = (over) => ({
  _id: over.name, description: 'x', price: 30, status: 'suggestion', isAISuggested: true,
  recipient: paul, event: anniversary, ...over
});

const showGifts = async (gifts) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/gifts') return Promise.resolve({ data: { gifts } });
    if (url === '/recipients') return Promise.resolve({ data: [paul] });
    if (url.startsWith('/events')) return Promise.resolve({ data: [anniversary] });
    return Promise.resolve({ data: {} });
  });
  render(<Gifts />, { authContextValue: createAuthenticatedUser() });
  await screen.findByText('Gifts Dashboard');
};

// The card around a gift's title (cards have no role of their own)
// eslint-disable-next-line testing-library/no-node-access
const card = (name) => screen.getByRole('heading', { name }).closest('[class*="giftCard"]');

describe('Gifts — AI suggestion cards', () => {
  test('an AI price reads as an estimate; a gift the user added does not', async () => {
    await showGifts([
      gift({ name: 'Bike light', price: 90 }),
      gift({ name: 'Scarf', price: 25, isAISuggested: false })
    ]);
    expect(within(card('Bike light')).getByText(/≈\s*\$90\.00/)).toBeInTheDocument();
    expect(within(card('Scarf')).queryByText(/≈/)).toBeNull();
    expect(within(card('Scarf')).getByText(/\$25\.00/)).toBeInTheDocument();
  });

  test('a gift-library price reads as an estimate too, from the library rather than the AI', async () => {
    await showGifts([
      gift({ name: 'Knife set', price: 30, isDiscovered: true, sourceType: 'discovered' }),
      gift({ name: 'Bike light', price: 90 })
    ]);
    const libraryPrice = within(card('Knife set')).getByText(/≈\s*\$30\.00/);
    // eslint-disable-next-line testing-library/no-node-access
    expect(libraryPrice.closest('p')).toHaveAttribute('title', 'Estimated from the gift library');
    // eslint-disable-next-line testing-library/no-node-access
    expect(within(card('Bike light')).getByText(/≈\s*\$90\.00/).closest('p')).toHaveAttribute('title', 'Estimated by the AI');
  });

  test('a suggestion over what is left of the budget carries an "Over budget" tag', async () => {
    await showGifts([
      gift({ name: 'Wheel set', price: 200, overBudget: true }),
      gift({ name: 'Bike light', price: 30, overBudget: false })
    ]);
    expect(within(card('Wheel set')).getByText('Over budget')).toBeInTheDocument();
    expect(within(card('Bike light')).queryByText('Over budget')).toBeNull();
  });

  test('only an open suggestion asks to be rated, not a saved gift', async () => {
    await showGifts([
      gift({ name: 'Bike light', status: 'suggestion' }),
      gift({ name: 'Jersey', status: 'saved' })
    ]);
    expect(within(card('Bike light')).getByTestId('rating-panel')).toBeInTheDocument();
    expect(within(card('Jersey')).queryByTestId('rating-panel')).toBeNull();
  });

  test('a Web-Enhanced gift lists the pages it was found on, opening safely in a new tab', async () => {
    await showGifts([
      gift({ name: 'Bike light', webSources: [
        { title: 'Bike light review', url: 'https://blog.example/review', host: 'blog.example' },
        // eslint-disable-next-line no-script-url
        { title: 'Sneaky', url: 'javascript:alert(1)', host: 'evil.example' }
      ] }),
      gift({ name: 'Jersey', webSources: [] })
    ]);
    const light = within(card('Bike light'));
    expect(light.getByText(/related pages on the web/i)).toBeInTheDocument();
    const link = light.getByRole('link', { name: /Bike light review/ });
    expect(link).toHaveAttribute('href', 'https://blog.example/review');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(light.getByText('blog.example')).toBeInTheDocument();
    expect(light.queryByRole('link', { name: /Sneaky/ })).toBeNull();
    expect(within(card('Jersey')).queryByText(/related pages on the web/i)).toBeNull();
  });

  test('no "Buy Now" link from the removed product lookup, even on old gifts', async () => {
    await showGifts([gift({ name: 'Bike light', realProduct: { found: true, buyUrl: 'https://store.example/x', sourceStore: 'Store' } })]);
    expect(within(card('Bike light')).queryByRole('link', { name: /buy now/i })).toBeNull();
  });
});
