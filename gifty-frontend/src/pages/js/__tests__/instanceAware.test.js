import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import About from '../About';
import Gifts from '../Gifts';
import { useInstanceInfo } from '../../../utils/instanceInfo';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../utils/instanceInfo', () => ({ useInstanceInfo: jest.fn() }));
jest.mock('../../../axiosInstance', () => ({
  get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn()
}));

const store = configureStore({ reducer: { dummy: (s = {}) => s } });
const renderPage = (ui) => render(<Provider store={store}><MemoryRouter>{ui}</MemoryRouter></Provider>);

describe('instance-aware pages', () => {
  // CRA resets mock implementations before each test
  beforeEach(() => {
    axiosInstance.get.mockResolvedValue({ data: [] });
    ['post', 'put', 'patch', 'delete'].forEach((m) => axiosInstance[m].mockResolvedValue({ data: {} }));
  });

  it('About shows the running version', () => {
    useInstanceInfo.mockReturnValue({ version: '0.9.0', features: { ai: true, email: false, webSearch: false } });
    renderPage(<About />);
    expect(screen.getByText('Gifty v0.9.0')).toBeInTheDocument();
  });

  it('Gifts disables generation and explains why when AI is not configured', async () => {
    useInstanceInfo.mockReturnValue({ version: '0.9.0', features: { ai: false, email: false, webSearch: false } });
    renderPage(<Gifts />);
    expect(await screen.findByText(/AI suggestions aren't configured on this server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Suggestions/i })).toBeDisabled();
  });

  it('Gifts shows no notice when AI is configured', async () => {
    useInstanceInfo.mockReturnValue({ version: '0.9.0', features: { ai: true, email: false, webSearch: false } });
    renderPage(<Gifts />);
    await screen.findByRole('button', { name: /Generate Suggestions/i });
    expect(screen.queryByText(/AI suggestions aren't configured/i)).not.toBeInTheDocument();
  });
});
