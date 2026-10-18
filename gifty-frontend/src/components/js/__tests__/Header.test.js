// The account menu (Favorites ... Settings, Logout) must work from the
// keyboard: it is the only way to reach those pages on desktop.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Header from '../Header';

const mockLogout = jest.fn();
let mockAuthLoading = false;
let mockUser = { firstName: 'Ana', role: 'member' };
jest.mock('../../../AuthContext', () => ({
  useAuth: () => ({
    logout: mockLogout,
    user: mockUser,
    isAuthenticated: !mockAuthLoading,
    isLoading: mockAuthLoading,
  }),
}));

afterEach(() => { mockAuthLoading = false; mockUser = { firstName: 'Ana', role: 'member' }; });
jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ unreadCount: 0 }),
}));

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/gifts']}>
      <Header />
      <Routes>
        <Route path="*" element={null} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/settings" element={<p>Settings page</p>} />
        <Route path="/purchase-history" element={<p>Purchase history page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('while sign-in is checked the header says so, in its own element (not the one that becomes the icon row)', () => {
  mockAuthLoading = true;
  const { container } = renderHeader();
  const status = screen.getByRole('status', { name: /checking sign-in/i });
  expect(status.tagName).toBe('SPAN');
  expect(container.querySelector('nav > div')).toBeNull();
});

test('home links use the lower-case address', () => {
  renderHeader();
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/userhome');
});

test('the account menu button is reachable with Tab and opens with Enter', async () => {
  const user = userEvent.setup();
  renderHeader();
  const trigger = screen.getByRole('button', { name: 'Account menu' });
  expect(trigger.tagName).toBe('BUTTON');
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');

  // Tab from the Notifications link lands on the trigger
  screen.getByRole('link', { name: 'Notifications' }).focus();
  await user.tab();
  expect(trigger).toHaveFocus();

  await user.keyboard('{Enter}');
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const items = screen.getAllByRole('menuitem');
  expect(items.map((i) => i.textContent.trim())).toEqual([
    'Favorites', 'Purchase history', 'Feedback analytics', 'Suggestions help', 'Profile', 'Settings', 'Logout',
  ]);
  expect(items[0]).toHaveFocus();
});

test('arrow keys move through the menu and wrap', async () => {
  const user = userEvent.setup();
  renderHeader();
  screen.getByRole('button', { name: 'Account menu' }).focus();
  await user.keyboard('{Enter}');
  const items = screen.getAllByRole('menuitem');
  await user.keyboard('{ArrowDown}');
  expect(items[1]).toHaveFocus();
  await user.keyboard('{ArrowUp}{ArrowUp}');
  expect(items[items.length - 1]).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(items[0]).toHaveFocus();
  await user.keyboard('{End}');
  expect(items[items.length - 1]).toHaveFocus();
  await user.keyboard('{Home}');
  expect(items[0]).toHaveFocus();
});

test('ArrowDown on the closed trigger opens the menu', async () => {
  const user = userEvent.setup();
  renderHeader();
  screen.getByRole('button', { name: 'Account menu' }).focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
});

test('Escape closes the menu and returns focus to the trigger', async () => {
  const user = userEvent.setup();
  renderHeader();
  const trigger = screen.getByRole('button', { name: 'Account menu' });
  trigger.focus();
  await user.keyboard('{Enter}');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

test('Tab out of the menu closes it', async () => {
  const user = userEvent.setup();
  renderHeader();
  screen.getByRole('button', { name: 'Account menu' }).focus();
  await user.keyboard('{Enter}');
  await user.tab();
  expect(screen.queryByRole('menu')).toBeNull();
});

test('Enter on a menu item follows it', async () => {
  const user = userEvent.setup();
  renderHeader();
  screen.getByRole('button', { name: 'Account menu' }).focus();
  await user.keyboard('{Enter}{End}{ArrowUp}{Enter}');
  expect(screen.getByText('Settings page')).toBeInTheDocument();
  expect(screen.queryByRole('menu')).toBeNull();
});

test('Logout is a real button and signs out', async () => {
  const user = userEvent.setup();
  renderHeader();
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  const logout = screen.getByRole('menuitem', { name: 'Logout' });
  expect(logout.tagName).toBe('BUTTON');
  await user.click(logout);
  expect(mockLogout).toHaveBeenCalled();
  expect(screen.getByText('Login page')).toBeInTheDocument();
});

test('a click outside closes the menu', async () => {
  const user = userEvent.setup();
  renderHeader();
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  await user.click(document.body);
  expect(screen.queryByRole('menu')).toBeNull();
});

// Phone navigation: the hamburger opens a labelled list that reaches every page.
describe('phone menu', () => {
  const DRAWER_LINKS = [
    ['Home', '/userhome'],
    ['Recipients', '/recipients'],
    ['Events', '/events'],
    ['Gifts', '/gifts'],
    ['Explore gifts', '/explore'],
    ['Favorites', '/favorites'],
    ['Budgets', '/budgets'],
    ['Purchase history', '/purchase-history'],
    ['Notifications', '/notifications'],
    ['Feedback analytics', '/feedback-analytics'],
    ['Suggestions help', '/suggestions-help'],
    ['Profile', '/user-profile'],
    ['Settings', '/settings'],
  ];

  test('the menu button says whether the menu is open and which element it controls', async () => {
    const user = userEvent.setup();
    renderHeader();
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('navigation', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-controls', drawer.id);
  });

  test('every page has a labelled row, in order, plus Logout', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const drawer = screen.getByRole('navigation', { name: 'Menu' });
    const links = within(drawer).getAllByRole('link');
    expect(links.map((l) => [l.textContent.trim(), l.getAttribute('href')])).toEqual(DRAWER_LINKS);
    expect(within(drawer).getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  test('opening moves focus to the first row; Escape closes and returns focus', async () => {
    const user = userEvent.setup();
    renderHeader();
    const button = screen.getByRole('button', { name: 'Menu' });
    await user.click(button);
    const drawer = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(drawer).getByRole('link', { name: 'Home' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  test('following a row closes the menu', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const drawer = screen.getByRole('navigation', { name: 'Menu' });
    await user.click(within(drawer).getByRole('link', { name: 'Purchase history' }));
    expect(screen.getByText('Purchase history page')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull();
  });

  test('a tap outside the menu closes it', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByTestId('menu-scrim'));
    expect(screen.queryByRole('navigation', { name: 'Menu' })).toBeNull();
  });

  test('Logout in the menu signs out', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', { name: 'Logout' }));
    expect(mockLogout).toHaveBeenCalled();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});

describe('fonts', () => {
  test('does not load a stylesheet from another origin (Quicksand is self-hosted)', () => {
    renderHeader();
    const external = [...document.head.querySelectorAll('link[rel="stylesheet"]')]
      .filter((link) => !link.href.startsWith(window.location.origin));
    expect(external).toEqual([]);
  });
});

describe('Admin entry', () => {
  it('is in the account menu for admins', async () => {
    mockUser = { firstName: 'Ana', role: 'admin' };
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitem', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('is not in the account menu for members', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).toBeNull();
  });
});
