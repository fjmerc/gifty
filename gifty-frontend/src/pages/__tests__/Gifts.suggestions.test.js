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
jest.mock('../../components/ui/SuggestionModeSelector', () => () => <div />);
jest.mock('../../components/ui/GiftFeedback', () => () => <div />);
jest.mock('../../components/ui/SystemHealthIndicator', () => () => <div />);
jest.mock('../../components/ui/SourceBadge', () => () => <div />);
jest.mock('../../components/ui/AIProviderSelector', () => () => <div />);

// Asking again within a few minutes reuses the server's last answer
const paul = { _id: 'paul', firstName: 'Paul', lastName: 'Becker' };
const anniversary = { _id: 'anniv', name: 'Anniversary', date: '2099-11-20T00:00:00.000Z', recipient: paul };
const idea = (id, name) => ({ _id: id, name, description: 'x', price: 30, status: 'suggestion', isAISuggested: true, recipient: paul, event: anniversary._id });

const setup = (answers) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/gifts') return Promise.resolve({ data: { gifts: [] } });
    if (url === '/recipients') return Promise.resolve({ data: [paul] });
    if (url.startsWith('/events')) return Promise.resolve({ data: [anniversary] });
    if (url === '/gift-library/system-health') return Promise.resolve({ data: { isHealthy: false } });
    return Promise.resolve({ data: {} });
  });
  const queue = [...answers];
  axiosInstance.post.mockImplementation((url) => (url === '/gifts/suggestions'
    ? Promise.resolve({ data: queue.shift() })
    : Promise.resolve({ data: {} })));
};

const generate = async () => {
  fireEvent.click(screen.getByRole('button', { name: /generate suggestions/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /generate suggestions/i })).not.toBeDisabled());
};

const choose = async () => {
  await screen.findByText('Gifts Dashboard');
  const [recipientSelect, eventSelect] = screen.getAllByRole('combobox');
  fireEvent.change(recipientSelect, { target: { value: 'paul' } });
  // The option list fills in later; there is no role query for "has an option"
  // eslint-disable-next-line testing-library/no-node-access
  await waitFor(() => expect(eventSelect.querySelector('option[value="anniv"]')).not.toBeNull());
  fireEvent.change(eventSelect, { target: { value: 'anniv' } });
};

describe('Gifts — asking for suggestions again', () => {
  test('a repeated answer adds no duplicate cards and says it is the last answer', async () => {
    setup([
      { suggestions: [idea('s1', 'Bike light'), idea('s2', 'Jersey')], webSearchInfo: null },
      { suggestions: [idea('s2', 'Jersey')], webSearchInfo: null, fromCache: true }
    ]);
    render(<Gifts />, { authContextValue: createAuthenticatedUser() });
    await choose();

    await generate();
    expect(await screen.findByText('Jersey')).toBeInTheDocument();
    await generate();

    expect(screen.getAllByText('Jersey')).toHaveLength(1);
    expect(screen.getAllByText('Bike light')).toHaveLength(1);
    expect(screen.getByText(/same suggestions as a moment ago/i)).toBeInTheDocument();
  });
});

// What the page says when generating fails, comes back empty, or takes long
describe('Gifts — generating suggestions', () => {
  const failWith = (status, data) => {
    setup([]);
    axiosInstance.post.mockImplementation(() => Promise.reject(Object.assign(new Error(`status ${status}`), {
      response: status ? { status, data } : undefined
    })));
  };
  const run = async () => {
    render(<Gifts />, { authContextValue: createAuthenticatedUser() });
    await choose();
    await generate();
  };

  test('a 429 says to wait, with the seconds from the server', async () => {
    failWith(429, { message: 'You are generating suggestions too quickly. Please wait a moment and try again.', retryAfter: 60 });
    await run();
    expect(screen.getByText(/too quickly/i)).toBeInTheDocument();
    expect(screen.getByText(/60 seconds/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to generate gift suggestions/)).toBeNull();
  });

  test("a 400 shows the server's own message", async () => {
    failWith(400, { message: 'AI provider Anthropic Claude is not configured on this server.' });
    await run();
    expect(screen.getByText('AI provider Anthropic Claude is not configured on this server.')).toBeInTheDocument();
  });

  // The server stops before saving once it timed out, but a save already
  // under way can finish: say where such suggestions would show up
  test('a 408 says it took too long and where any late suggestions show', async () => {
    failWith(408, { message: 'Request timeout' });
    await run();
    expect(screen.getByText(/took too long/i)).toBeInTheDocument();
    expect(screen.getByText(/after you reload/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing was saved/i)).toBeNull();
  });

  test("a 502 shows the server's honest AI message", async () => {
    failWith(502, { message: 'The AI service did not answer. Please try again in a moment.' });
    await run();
    expect(screen.getByText('The AI service did not answer. Please try again in a moment.')).toBeInTheDocument();
  });

  test('a 500 says the server failed, not the generic text', async () => {
    failWith(500, { message: 'Internal server error' });
    await run();
    expect(screen.getByText(/server ran into a problem/i)).toBeInTheDocument();
  });

  test('a lost connection says the server could not be reached', async () => {
    failWith(undefined);
    await run();
    expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
  });

  test('an empty answer says no new suggestions came back', async () => {
    setup([{ suggestions: [], webSearchInfo: null }]);
    await run();
    expect(screen.getByText(/no new suggestions/i)).toBeInTheDocument();
  });

  test('while generating, a live status line says it can take up to a minute', async () => {
    setup([]);
    let finish;
    axiosInstance.post.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Gifts />, { authContextValue: createAuthenticatedUser() });
    await choose();
    fireEvent.click(screen.getByRole('button', { name: /generate suggestions/i }));
    const status = await screen.findByText(/Generating.*up to a minute/i);
    expect(status).toHaveAttribute('role', 'status');
    finish({ data: { suggestions: [idea('s1', 'Bike light')], webSearchInfo: null } });
    await waitFor(() => expect(screen.queryByText(/Generating.*up to a minute/i)).toBeNull());
  });
});
