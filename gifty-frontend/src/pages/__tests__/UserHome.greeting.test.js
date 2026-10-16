import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserHome from '../js/UserHome';
import axiosInstance from '../../axiosInstance';

jest.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="line-chart" /> }));
jest.mock('../../axiosInstance');
let mockAuthUser;
jest.mock('../../AuthContext', () => ({ useAuth: () => ({ user: mockAuthUser, isAuthenticated: true }) }));

const HOUR = 60 * 60 * 1000;
const createdAgo = (ms) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/events' || url === '/recipients') return Promise.resolve({ data: [] });
    if (url === '/gifts') return Promise.resolve({ data: { gifts: [] } });
    return Promise.resolve({ data: {} });
  });
});

const renderHome = () => render(<MemoryRouter><UserHome /></MemoryRouter>);

describe('Home greeting', () => {
  test('says "Welcome" to an account created within the last day', async () => {
    mockAuthUser = { firstName: 'Ann', lastName: 'Lee', createdAt: createdAgo(2 * HOUR) };

    renderHome();

    expect(await screen.findByRole('heading', { name: 'Welcome, Ann!' })).toBeInTheDocument();
  });

  test('says "Welcome back" once the account is older than a day', async () => {
    mockAuthUser = { firstName: 'Ann', lastName: 'Lee', createdAt: createdAgo(3 * 24 * HOUR) };

    renderHome();

    expect(await screen.findByRole('heading', { name: 'Welcome back, Ann!' })).toBeInTheDocument();
  });
});
