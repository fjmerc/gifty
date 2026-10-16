import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render, createAuthenticatedUser } from '../../test-utils';
import Gifts from '../js/Gifts';
import axiosInstance from '../../axiosInstance';

jest.mock('../../axiosInstance');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => () => {}
}));
jest.mock('react-tooltip', () => ({ Tooltip: () => null }));
jest.mock('../../components/ui/GiftFeedback', () => () => <div />);
jest.mock('../../components/ui/SystemHealthIndicator', () => () => <div />);
jest.mock('../../components/ui/SourceBadge', () => () => <div />);
// Stand-ins that show what the page passes and let a test pick a value
jest.mock('../../components/ui/SuggestionModeSelector', () => ({ selectedMode, onModeChange }) => (
  <div>
    <span>mode: {selectedMode}</span>
    <button type="button" onClick={() => onModeChange('web')}>pick web</button>
  </div>
));
jest.mock('../../components/ui/AIProviderSelector', () => ({ activeProvider, activeModel, onChange }) => (
  <div>
    <span>active: {activeProvider} / {activeModel}</span>
    <button type="button" onClick={() => onChange({ provider: null, model: null })}>use default</button>
  </div>
));

// The AI mode and model choice survive a reload and the "Active" label is current
const setup = (prefs, post = () => Promise.resolve({ data: {} })) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/settings/user-preferences') return Promise.resolve({ data: prefs });
    if (url === '/gifts') return Promise.resolve({ data: { gifts: [] } });
    if (url === '/recipients' || url.startsWith('/events')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  axiosInstance.post.mockImplementation(post);
  render(<Gifts />, { authContextValue: createAuthenticatedUser() });
};

describe('Gifts — saved AI choices', () => {
  test('the saved suggestion mode is selected on load', async () => {
    setup({ suggestionMode: 'enhanced' });
    expect(await screen.findByText('mode: enhanced')).toBeInTheDocument();
  });

  test('an old document with only the legacy switches falls back to Basic', async () => {
    setup({ useHybridSuggestions: true });
    await screen.findByText('Gifts Dashboard');
    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith('/settings/user-preferences'));
    expect(screen.getByText('mode: basic')).toBeInTheDocument();
  });

  test('switching to the server default updates the Active label from the answer', async () => {
    setup(
      { aiProvider: 'openai', aiModel: 'gpt-4o-mini', activeProvider: 'openai', activeModel: 'gpt-4o-mini' },
      () => Promise.resolve({ data: { preferences: {}, activeProvider: 'openai', activeModel: 'gpt-4o' } })
    );
    await screen.findByText('active: openai / gpt-4o-mini');
    fireEvent.click(screen.getByRole('button', { name: 'use default' }));
    expect(await screen.findByText('active: openai / gpt-4o')).toBeInTheDocument();
  });

  test('a mode that could not be saved goes back to the previous one', async () => {
    setup({ suggestionMode: 'enhanced' }, () => Promise.reject(new Error('offline')));
    await screen.findByText('mode: enhanced');
    fireEvent.click(screen.getByRole('button', { name: 'pick web' }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
    expect(await screen.findByText('mode: enhanced')).toBeInTheDocument();
  });
});
