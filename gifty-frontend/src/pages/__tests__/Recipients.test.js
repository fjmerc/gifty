import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Recipients from '../js/Recipients';
import axiosInstance from '../../axiosInstance';

/*
 * Notes on setup
 * - The page is queried the way a user perceives it: roles, accessible names,
 *   visible text and alt text. No CSS classes or DOM structure, so restyling
 *   the Tailwind markup should not break these tests.
 * - Each recipient card is a role="button" whose accessible name starts with
 *   "<First> <Last>, <Relation>, born ...". The helper `getCard` finds it and
 *   `within(card)` scopes the queries to that one recipient.
 * - FontAwesome is NOT mocked: icons render as aria-hidden SVGs and are
 *   invisible to role/text queries.
 * - CRA runs Jest with resetMocks: true, so every mock implementation is set in
 *   beforeEach or inside the test, never at module level.
 * - The add/edit forms are replaced by tiny stand-ins (they have their own
 *   test suites); the page-level wiring (props, close, submit) is what is
 *   under test here.
 */

jest.mock('../../components/forms/js/AddRecipientForm', () => {
  return function MockAddRecipientForm({ onSubmit, onCancel }) {
    return (
      <div data-testid="add-recipient-form">
        <button
          onClick={() =>
            onSubmit({
              firstName: 'Test',
              lastName: 'Recipient',
              relation: 'Friend',
              birthdate: '1990-01-01',
              tags: [],
            })
          }
        >
          Submit
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  };
});

jest.mock('../../components/forms/js/EditRecipientForm', () => {
  // Mirror the real form: it PUTs, surfaces its own error on failure, and only
  // hands the server response to onSubmit on success.
  const React = require('react');
  const axiosModule = require('../../axiosInstance');
  const axios = axiosModule.default || axiosModule;
  return function MockEditRecipientForm({ recipient, onSubmit, closeForm }) {
    const [error, setError] = React.useState('');
    const handleUpdate = async () => {
      const updated = { ...recipient, firstName: 'Updated', lastName: 'Recipient' };
      try {
        const response = await axios.put(`/recipients/${recipient._id}`, updated);
        onSubmit(response?.data && Object.keys(response.data).length ? response.data : updated);
      } catch (e) {
        setError('Failed to update recipient. Please try again.');
      }
    };
    return (
      <div data-testid="edit-recipient-form">
        {error && <p role="alert">{error}</p>}
        <button onClick={handleUpdate}>Update</button>
        <button onClick={closeForm}>Cancel</button>
      </div>
    );
  };
});

jest.mock('../../axiosInstance');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Backend-informed mock data. Default (name) sort order is Alice, Bob, John.
const mockRecipients = [
  {
    _id: 'recipient-1',
    firstName: 'John',
    lastName: 'Doe',
    relation: 'Brother',
    birthdate: '1990-05-15T12:00:00.000Z',
    profilePicture: 'https://example.com/john.jpg',
    tags: [
      { _id: 'tag-1', name: 'Tech Lover' },
      { _id: 'tag-2', name: 'Sports Fan' },
    ],
  },
  {
    _id: 'recipient-2',
    firstName: 'Alice',
    lastName: 'Smith',
    relation: 'Sister',
    birthdate: '1985-12-10T12:00:00.000Z',
    profilePicture: '',
    tags: [],
  },
  {
    _id: 'recipient-3',
    firstName: 'Bob',
    lastName: 'Johnson',
    relation: 'Friend',
    birthdate: '1992-08-20T12:00:00.000Z',
    profilePicture: 'https://example.com/bob.jpg',
    tags: [{ _id: 'tag-3', name: 'Book Lover' }],
  },
];

// GET /recipients answers with the active list, ?archived=true with the archived one
const mockLists = (active = mockRecipients, archived = []) =>
  axiosInstance.get.mockImplementation((url, config) =>
    Promise.resolve({ data: config?.params?.archived ? archived : active })
  );

const renderWithRouter = (initialEntries = ['/recipients']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Recipients />
    </MemoryRouter>
  );

// Renders and waits until the list has loaded.
const renderLoaded = async (data = mockRecipients, archived = []) => {
  mockLists(data, archived);
  const utils = renderWithRouter();
  await screen.findByRole('heading', { level: 1, name: 'Recipients' });
  // findBy resolves as soon as the DOM updates, but React schedules the passive
  // effects of that render as a separate task. Until they run, the page's
  // document keydown listener is still the one from the loading render and an
  // avatar's mount effect would reset a just-fired image error. Let that task
  // run so tests don't race stale listeners/state.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return utils;
};

// The recipient card (role="button") for "First Last".
const getCard = (fullName) => screen.getByRole('button', { name: new RegExp(`^${fullName},`) });

// Names of the recipient cards in the order they are displayed.
const displayedNames = () =>
  screen
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

const getSearchBox = () => screen.getByRole('textbox', { name: 'Search recipients' });
const getAddFab = () => screen.getByRole('button', { name: 'Add new recipient' });

// ISO date (noon local time, so no timezone day-shift) whose month/day falls
// `days` from today. Keeps the birthday tests independent of the real date.
const birthdateInDays = (days) => {
  const d = new Date();
  return new Date(d.getFullYear() - 30, d.getMonth(), d.getDate() + days, 12).toISOString();
};

describe('Recipients', () => {
  beforeEach(() => {
    mockLists();
    // The component logs deletes/failures; keep test output readable.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Loading, data fetching and basic rendering', () => {
    test('shows a loading placeholder (no page content) until recipients load', async () => {
      let resolveGet;
      axiosInstance.get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));

      renderWithRouter();

      // Skeleton has no text: the real page chrome must not be there yet.
      expect(screen.queryByRole('heading', { level: 1, name: 'Recipients' })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Search recipients' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add new recipient' })).not.toBeInTheDocument();

      resolveGet({ data: mockRecipients });

      expect(await screen.findByRole('heading', { level: 1, name: 'Recipients' })).toBeInTheDocument();
      expect(screen.getByText('Alice Smith', { selector: 'h3' })).toBeInTheDocument();
    });

    test('renders the page header, search box and add button after loading', async () => {
      await renderLoaded();

      expect(screen.getByText(/manage your gift recipients/i)).toHaveTextContent('3 total');
      expect(getSearchBox()).toBeInTheDocument();
      expect(getAddFab()).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox', { name: /^Select / })).toHaveLength(3);
    });

    test('fetches /recipients on mount and displays every recipient', async () => {
      await renderLoaded();

      expect(axiosInstance.get).toHaveBeenCalledWith('/recipients');
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Alice Smith' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Bob Johnson' })).toBeInTheDocument();
    });

    test('sorts recipients alphabetically by first name', async () => {
      await renderLoaded();

      expect(displayedNames()).toEqual(['Alice Smith', 'Bob Johnson', 'John Doe']);
    });

    test('shows each recipient relation and exposes birth date in the card name', async () => {
      await renderLoaded();

      const card = getCard('Alice Smith');
      expect(within(card).getByText('Sister')).toBeInTheDocument();
      expect(card).toHaveAccessibleName(/^Alice Smith, Sister, born .+/);
    });

    test('shows an error message when loading fails', async () => {
      axiosInstance.get.mockRejectedValue(new Error('Network error'));

      renderWithRouter();

      expect(await screen.findByText('Failed to load recipients. Please try again later.')).toBeInTheDocument();
      // With nothing loaded the page falls back to the empty state.
      expect(screen.getByText('No recipients yet')).toBeInTheDocument();
    });

    test('shows the empty state when there are no recipients', async () => {
      await renderLoaded([]);

      expect(screen.getByRole('status')).toHaveTextContent('No recipients yet');
      expect(screen.getByText(/add your first recipient to get started/i)).toBeInTheDocument();
      expect(screen.queryByText(/\d+ recipients?$/)).not.toBeInTheDocument();
    });

    test('the empty-state button opens the add form', async () => {
      await renderLoaded([]);

      await userEvent.click(screen.getByRole('button', { name: /add your first recipient/i }));

      expect(screen.getByTestId('add-recipient-form')).toBeInTheDocument();
    });

    test('fetches data when accessed from a different route history', async () => {
      renderWithRouter(['/other-page', '/recipients']);

      await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith('/recipients'));
      expect(await screen.findByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    test('renders a large list', async () => {
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        _id: `recipient-${i}`,
        firstName: `User${i}`,
        lastName: 'Test',
        relation: 'Friend',
        birthdate: '1990-01-01T12:00:00.000Z',
        profilePicture: '',
        tags: [{ _id: `tag-${i}`, name: `Tag${i}` }],
      }));

      await renderLoaded(largeDataset);

      expect(screen.getByText('100 recipients')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'User0 Test' })).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox', { name: /^Select / })).toHaveLength(100);
    });

    test('does not crash on a malformed birth date', async () => {
      await renderLoaded([{ ...mockRecipients[0], birthdate: 'invalid-date' }]);

      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
      expect(screen.queryByText(/\d+ upcoming birthdays? in the next/i)).not.toBeInTheDocument();
    });
  });

  describe('Avatars and profile pictures', () => {
    test('uses the profile picture when available', async () => {
      await renderLoaded();

      expect(screen.getByAltText('John Doe')).toHaveAttribute('src', 'https://example.com/john.jpg');
    });

    test('falls back to a generated avatar when there is no profile picture', async () => {
      await renderLoaded();

      // Drawn in the browser: a recipient's name never goes to an outside service
      const src = screen.getByAltText('Alice Smith').getAttribute('src');
      expect(src).toMatch(/^data:image\/svg\+xml/);
      expect(decodeURIComponent(src)).toContain('>AS<');
    });

    test('switches to the generated avatar when the picture fails to load', async () => {
      await renderLoaded();

      const img = screen.getByAltText('John Doe');
      fireEvent.error(img);

      expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
      expect(decodeURIComponent(img.getAttribute('src'))).toContain('>JD<');
      // The page keeps working.
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });
  });

  describe('Tags', () => {
    test('displays recipient tags', async () => {
      await renderLoaded();

      const card = getCard('John Doe');
      expect(within(card).getByText('Tech Lover')).toBeInTheDocument();
      expect(within(card).getByText('Sports Fan')).toBeInTheDocument();
      expect(within(card).queryByText('No tags')).not.toBeInTheDocument();
    });

    test('labels the tag group for assistive tech', async () => {
      await renderLoaded();

      expect(screen.getByLabelText('Tags: Tech Lover, Sports Fan')).toBeInTheDocument();
      expect(screen.getByLabelText('Tags: No tags')).toBeInTheDocument();
    });

    test('shows "No tags" only for recipients without tags', async () => {
      await renderLoaded();

      expect(screen.getAllByText('No tags')).toHaveLength(1);
      expect(within(getCard('Alice Smith')).getByText('No tags')).toBeInTheDocument();
      expect(within(getCard('Bob Johnson')).queryByText('No tags')).not.toBeInTheDocument();
    });

    test('handles tags with special characters and long names', async () => {
      await renderLoaded([
        {
          ...mockRecipients[0],
          tags: [
            { _id: 'tag-special-1', name: 'Tech & Gaming' },
            { _id: 'tag-special-2', name: 'Very Long Tag Name That Should Not Break Layout' },
          ],
        },
      ]);

      expect(screen.getByText('Tech & Gaming')).toBeInTheDocument();
      expect(screen.getByText('Very Long Tag Name That Should Not Break Layout')).toBeInTheDocument();
    });

    test('collapses extra tags into a "+N" badge (3 shown in grid view, 5 in list view)', async () => {
      const tags = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ _id: `t-${name}`, name: `Tag ${name}` }));
      await renderLoaded([{ ...mockRecipients[0], tags }]);

      expect(screen.getByText('Tag C')).toBeInTheDocument();
      expect(screen.queryByText('Tag D')).not.toBeInTheDocument();
      expect(screen.getByText('+3')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Switch to list view' }));

      expect(screen.getByText('Tag E')).toBeInTheDocument();
      expect(screen.queryByText('Tag F')).not.toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    test('navigates to the profile when the avatar is clicked', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByAltText('John Doe'));

      expect(mockNavigate).toHaveBeenCalledWith('/recipients/recipient-1');
    });

    test('navigates to the profile from the "View profile" action, exactly once', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: "View John Doe's profile" }));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/recipients/recipient-1');
    });

    test('navigates when a card is activated with Enter or Space', async () => {
      await renderLoaded();

      fireEvent.keyDown(getCard('Bob Johnson'), { key: 'Enter' });
      fireEvent.keyDown(getCard('Alice Smith'), { key: ' ' });

      expect(mockNavigate).toHaveBeenNthCalledWith(1, '/recipients/recipient-3');
      expect(mockNavigate).toHaveBeenNthCalledWith(2, '/recipients/recipient-2');
    });

    test('Enter and Space on a button inside a card press that button, not the card', async () => {
      await renderLoaded();

      const edit = screen.getByRole('button', { name: 'Edit Alice Smith' });
      edit.focus();
      await userEvent.keyboard('{Enter}');
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Edit Alice Smith' })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });

      const del = screen.getByRole('button', { name: 'Delete Bob Johnson' });
      del.focus();
      await userEvent.keyboard(' ');
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Delete Recipient' })).toBeInTheDocument();
    });

    test('grid card actions sit in a corner, not over the card body, and stay visible without hover', async () => {
      await renderLoaded();

      const actions = screen.getAllByRole('group', { name: 'Recipient actions' })[0];
      const classes = actions.className.split(/\s+/);
      // An invisible overlay over the whole card caught clicks meant for the card
      expect(classes).not.toContain('inset-0');
      expect(classes).toEqual(expect.arrayContaining(['absolute', 'top-3', 'right-3']));
      // Hidden only where the device can hover; shown on keyboard focus
      expect(classes).not.toContain('opacity-0');
      expect(classes).toEqual(expect.arrayContaining(['[@media(hover:hover)]:opacity-0', 'group-focus-within:opacity-100']));
    });

    test('provides navigation hints', async () => {
      await renderLoaded();

      expect(screen.getByRole('button', { name: "View John Doe's profile" })).toHaveAttribute('title', 'View Profile');
      expect(screen.getAllByText('Click to view profile')).toHaveLength(3);
      expect(getCard('John Doe')).toHaveAccessibleName(/Press Enter to view profile/);
    });

    test('keeps working across several navigations', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByAltText('John Doe'));
      await userEvent.click(screen.getByAltText('Alice Smith'));
      await userEvent.click(screen.getByAltText('Bob Johnson'));

      expect(mockNavigate).toHaveBeenCalledTimes(3);
      expect(mockNavigate).toHaveBeenNthCalledWith(1, '/recipients/recipient-1');
      expect(mockNavigate).toHaveBeenNthCalledWith(2, '/recipients/recipient-2');
      expect(mockNavigate).toHaveBeenNthCalledWith(3, '/recipients/recipient-3');
      expect(displayedNames()).toHaveLength(3);
    });
  });

  describe('Adding a recipient', () => {
    test('opens and closes the add form', async () => {
      await renderLoaded();

      await userEvent.click(getAddFab());
      expect(screen.getByRole('heading', { name: 'Add New Recipient' })).toBeInTheDocument();
      expect(screen.getByTestId('add-recipient-form')).toBeInTheDocument();

      await userEvent.click(within(screen.getByTestId('add-recipient-form')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument();
    });

    test('submits a new recipient to the API and closes the form', async () => {
      axiosInstance.post.mockResolvedValue({
        data: {
          _id: 'new-recipient',
          firstName: 'Test',
          lastName: 'Recipient',
          relation: 'Friend',
          birthdate: '1990-01-01T12:00:00.000Z',
          tags: [],
        },
      });
      await renderLoaded();

      await userEvent.click(getAddFab());
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/recipients', {
          firstName: 'Test',
          lastName: 'Recipient',
          relation: 'Friend',
          birthdate: '1990-01-01',
          tags: [],
        });
      });
      await waitFor(() => expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument());
      expect(screen.getByRole('heading', { name: 'Test Recipient' })).toBeInTheDocument();
      expect(screen.getByText(/4 total/)).toBeInTheDocument();
    });

    test('keeps the form open until a slow request finishes', async () => {
      let resolvePost;
      axiosInstance.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
      await renderLoaded();

      await userEvent.click(getAddFab());
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('add-recipient-form')).toBeInTheDocument();

      resolvePost({ data: { ...mockRecipients[0], _id: 'slow', firstName: 'Slow', lastName: 'Add', tags: [] } });

      await waitFor(() => expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument());
      expect(screen.getByRole('heading', { name: 'Slow Add' })).toBeInTheDocument();
    });

    test('inserts the new recipient in alphabetical order', async () => {
      axiosInstance.post.mockResolvedValue({
        data: {
          _id: 'new-id',
          firstName: 'Aaron',
          lastName: 'Apple',
          relation: 'Friend',
          birthdate: '1990-01-01T12:00:00.000Z',
          tags: [],
        },
      });
      await renderLoaded();

      await userEvent.click(getAddFab());
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => expect(displayedNames()).toHaveLength(4));
      expect(displayedNames()).toEqual(['Aaron Apple', 'Alice Smith', 'Bob Johnson', 'John Doe']);
    });

    test('shows an error and keeps the form open when adding fails', async () => {
      axiosInstance.post.mockRejectedValue(new Error('Server error'));
      await renderLoaded();

      await userEvent.click(getAddFab());
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(await screen.findByText('Failed to add recipient. Please try again.')).toBeInTheDocument();
      expect(screen.getByTestId('add-recipient-form')).toBeInTheDocument();
      expect(displayedNames()).toHaveLength(3);
    });

    test('the add button toggles the form, so rapid clicking leaves the page stable', async () => {
      await renderLoaded();

      for (let i = 0; i < 5; i++) {
        await userEvent.click(getAddFab()); // open
        await userEvent.click(getAddFab()); // close
      }

      expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument();
      expect(displayedNames()).toEqual(['Alice Smith', 'Bob Johnson', 'John Doe']);
    });
  });

  describe('Editing a recipient', () => {
    test('opens the edit form for the chosen recipient and cancels it', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Edit Alice Smith' }));

      expect(screen.getByRole('heading', { name: 'Edit Alice Smith' })).toBeInTheDocument();
      expect(screen.getByTestId('edit-recipient-form')).toBeInTheDocument();

      await userEvent.click(within(screen.getByTestId('edit-recipient-form')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByTestId('edit-recipient-form')).not.toBeInTheDocument();
    });

    test('saves an edit, closes the form and re-sorts the list', async () => {
      axiosInstance.put.mockResolvedValue({ data: {} });
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Edit Alice Smith' }));
      await userEvent.click(screen.getByRole('button', { name: 'Update' }));

      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith(
          '/recipients/recipient-2',
          expect.objectContaining({ _id: 'recipient-2', firstName: 'Updated', lastName: 'Recipient' })
        );
      });
      await waitFor(() => expect(screen.queryByTestId('edit-recipient-form')).not.toBeInTheDocument());
      // "Updated Recipient" now sorts last.
      expect(displayedNames()).toEqual(['Bob Johnson', 'John Doe', 'Updated Recipient']);
      expect(screen.queryByRole('heading', { name: 'Alice Smith' })).not.toBeInTheDocument();
      // The page does not issue a second PUT on top of the form's own.
      expect(axiosInstance.put).toHaveBeenCalledTimes(1);
    });

    test('keeps the form open and shows its error when the update fails', async () => {
      axiosInstance.put.mockRejectedValue(new Error('Server error'));
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Edit Alice Smith' }));
      await userEvent.click(screen.getByRole('button', { name: 'Update' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update recipient. Please try again.');
      expect(screen.getByTestId('edit-recipient-form')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Alice Smith' })).toBeInTheDocument();
    });
  });

  describe('Deleting a recipient', () => {
    test('asks for confirmation, then deletes and removes the recipient', async () => {
      axiosInstance.delete.mockResolvedValue({ data: {} });
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Delete Alice Smith' }));

      expect(screen.getByRole('heading', { name: 'Delete Recipient' })).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to delete/i)).toHaveTextContent('Alice Smith');
      expect(axiosInstance.delete).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Delete Recipient' }));

      await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/recipients/recipient-2'));
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Alice Smith' })).not.toBeInTheDocument());
      expect(screen.queryByRole('heading', { name: 'Delete Recipient' })).not.toBeInTheDocument();
      expect(displayedNames()).toEqual(['Bob Johnson', 'John Doe']);
    });

    test('cancelling the confirmation deletes nothing', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Delete John Doe' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('heading', { name: 'Delete Recipient' })).not.toBeInTheDocument();
      expect(axiosInstance.delete).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument();
    });

    test('shows an error and reloads the list when the delete fails', async () => {
      axiosInstance.delete.mockRejectedValue(new Error('Server error'));
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Delete Alice Smith' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete Recipient' }));

      expect(await screen.findByText('Failed to delete recipient. Please try again.')).toBeInTheDocument();
      // On failure the component refetches to restore the true server state.
      const activeListFetches = () => axiosInstance.get.mock.calls.filter(([url, config]) => url === '/recipients' && !config).length;
      await waitFor(() => expect(activeListFetches()).toBe(2));
      expect(await screen.findByRole('heading', { name: 'Alice Smith' })).toBeInTheDocument();
    });

    test('prefers the server-provided error message when the delete fails', async () => {
      axiosInstance.delete.mockRejectedValue({ response: { status: 409, data: { message: 'Recipient has active events' } } });
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Delete John Doe' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete Recipient' }));

      expect(await screen.findByText('Recipient has active events')).toBeInTheDocument();
    });
  });

  describe('Search, filter and sort', () => {
    test('filters by name', async () => {
      await renderLoaded();

      await userEvent.type(getSearchBox(), 'alice');

      expect(displayedNames()).toEqual(['Alice Smith']);
      expect(screen.getByText('1 recipient matching "alice"')).toBeInTheDocument();
    });

    test('filters by relation', async () => {
      await renderLoaded();

      await userEvent.type(getSearchBox(), 'brother');

      expect(displayedNames()).toEqual(['John Doe']);
    });

    test('filters by tag', async () => {
      await renderLoaded();

      await userEvent.type(getSearchBox(), 'book lover');

      expect(displayedNames()).toEqual(['Bob Johnson']);
    });

    test('shows a "no match" state (without the add-first button) when nothing matches', async () => {
      await renderLoaded();

      await userEvent.type(getSearchBox(), 'zzzz');

      expect(screen.getByRole('status')).toHaveTextContent('No recipients match your search');
      expect(screen.getByText(/try adjusting your search terms or filters/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add your first recipient/i })).not.toBeInTheDocument();
    });

    test('restores the full list when the search is cleared', async () => {
      await renderLoaded();

      await userEvent.type(getSearchBox(), 'alice');
      await userEvent.clear(getSearchBox());

      expect(displayedNames()).toHaveLength(3);
    });

    test('shows the number of displayed recipients', async () => {
      await renderLoaded();

      expect(screen.getByText('3 recipients')).toBeInTheDocument();
    });

    // The search "clear" button is an icon-only <button> with no aria-label or
    // title, so it cannot be found by a user of assistive tech (and therefore
    // not by role/name). Same for the close (x) buttons on the add/edit modals.
    // Needs an aria-label in Recipients.js (gifty-react-architect).
    it.todo('search clear button has an accessible name and empties the search box');
    it.todo('add/edit modal close buttons have an accessible name');

    test('filters by relation using the relation dropdown', async () => {
      await renderLoaded();

      await userEvent.selectOptions(screen.getByDisplayValue('All Relations'), 'Sister');

      expect(displayedNames()).toEqual(['Alice Smith']);
      // Filter with no results keeps the "no match" wording, not "get started".
      await userEvent.type(getSearchBox(), 'zzzz');
      expect(screen.getByText('No recipients match your search')).toBeInTheDocument();
    });

    test('offers one filter option per distinct relation', async () => {
      await renderLoaded();

      const filter = screen.getByDisplayValue('All Relations');
      const options = within(filter).getAllByRole('option').map((o) => o.textContent);

      expect(options).toEqual([
        'All Relations',
        'Recently Updated (30 days)',
        'Brother',
        'Friend',
        'Sister',
      ]);
    });

    test('"Recently Updated" keeps only recipients changed in the last 30 days', async () => {
      const dayMs = 24 * 60 * 60 * 1000;
      await renderLoaded([
        { ...mockRecipients[0], updatedAt: new Date(Date.now() - 2 * dayMs).toISOString() },
        { ...mockRecipients[1], updatedAt: new Date(Date.now() - 90 * dayMs).toISOString() },
        { ...mockRecipients[2], createdAt: new Date(Date.now() - 5 * dayMs).toISOString() },
      ]);

      await userEvent.selectOptions(screen.getByDisplayValue('All Relations'), 'recent');

      expect(displayedNames()).toEqual(['Bob Johnson', 'John Doe']);
    });

    test('sorts by relation', async () => {
      await renderLoaded();

      await userEvent.selectOptions(screen.getByDisplayValue('Sort by Name'), 'relation');

      // Brother, Friend, Sister
      expect(displayedNames()).toEqual(['John Doe', 'Bob Johnson', 'Alice Smith']);
    });

    test('sorts by recent activity (newest first)', async () => {
      await renderLoaded([
        { ...mockRecipients[0], updatedAt: '2024-01-01T00:00:00.000Z' },
        { ...mockRecipients[1], updatedAt: '2024-03-01T00:00:00.000Z' },
        { ...mockRecipients[2], updatedAt: '2024-02-01T00:00:00.000Z' },
      ]);

      await userEvent.selectOptions(screen.getByDisplayValue('Sort by Name'), 'recent');

      expect(displayedNames()).toEqual(['Alice Smith', 'Bob Johnson', 'John Doe']);
    });

    test('sorts by the next upcoming birthday', async () => {
      await renderLoaded([
        { ...mockRecipients[0], birthdate: birthdateInDays(40) },
        { ...mockRecipients[1], birthdate: birthdateInDays(3) },
        { ...mockRecipients[2], birthdate: birthdateInDays(20) },
      ]);

      await userEvent.selectOptions(screen.getByDisplayValue('Sort by Name'), 'birthday');

      expect(displayedNames()).toEqual(['Alice Smith', 'Bob Johnson', 'John Doe']);
    });
  });

  describe('View mode', () => {
    test('toggles between grid and list view', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Switch to list view' }));

      expect(screen.getByRole('button', { name: 'Switch to grid view' })).toBeInTheDocument();
      // The grid-only hint is gone in list view; the data is unchanged.
      expect(screen.queryByText('Click to view profile')).not.toBeInTheDocument();
      expect(displayedNames()).toEqual(['Alice Smith', 'Bob Johnson', 'John Doe']);

      await userEvent.click(screen.getByRole('button', { name: 'Switch to grid view' }));

      expect(screen.getAllByText('Click to view profile')).toHaveLength(3);
    });
  });

  describe('Upcoming birthdays', () => {
    test('announces recipients with a birthday in the next 30 days', async () => {
      await renderLoaded([
        { ...mockRecipients[0], birthdate: birthdateInDays(5) },
        { ...mockRecipients[1], birthdate: birthdateInDays(120) },
      ]);

      expect(screen.getByText('1 upcoming birthday in the next 30 days')).toBeInTheDocument();
      expect(within(getCard('John Doe')).getByTitle('Birthday coming up!')).toBeInTheDocument();
      expect(within(getCard('Alice Smith')).queryByTitle('Birthday coming up!')).not.toBeInTheDocument();
    });

    // How the server stores a birthdate: the calendar day at UTC midnight
    const storedBirthdateInDays = (days) => {
      const d = new Date();
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
      const pad = (n) => String(n).padStart(2, '0');
      return `${day.getFullYear() - 30}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T00:00:00.000Z`;
    };

    test("counts a birthday that is today", async () => {
      await renderLoaded([{ ...mockRecipients[0], birthdate: storedBirthdateInDays(0) }]);
      expect(screen.getByText('1 upcoming birthday in the next 30 days')).toBeInTheDocument();
    });

    test('reads a stored birthdate as its calendar day (31 days away is not within 30)', async () => {
      await renderLoaded([{ ...mockRecipients[0], birthdate: storedBirthdateInDays(31) }]);
      expect(screen.queryByText(/\d+ upcoming birthdays? in the next/i)).not.toBeInTheDocument();
    });

    test('shows the stored birthdate day on the card', async () => {
      await renderLoaded([{ ...mockRecipients[0], birthdate: '1990-11-02T00:00:00.000Z' }]);
      expect(within(getCard('John Doe')).getByText('11/2/1990')).toBeInTheDocument();
    });

    test('pluralises the upcoming birthday count', async () => {
      await renderLoaded([
        { ...mockRecipients[0], birthdate: birthdateInDays(5) },
        { ...mockRecipients[1], birthdate: birthdateInDays(10) },
      ]);

      expect(screen.getByText('2 upcoming birthdays in the next 30 days')).toBeInTheDocument();
    });

    test('shows no banner when nobody has a birthday soon', async () => {
      await renderLoaded([
        { ...mockRecipients[0], birthdate: birthdateInDays(120) },
        { ...mockRecipients[1], birthdate: birthdateInDays(200) },
      ]);

      expect(screen.queryByText(/\d+ upcoming birthdays? in the next/i)).not.toBeInTheDocument();
    });
  });

  describe('Bulk selection and delete', () => {
    test('selecting a recipient shows the selection count and a bulk delete button', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select John Doe' }));

      expect(screen.getByRole('checkbox', { name: 'Select John Doe' })).toBeChecked();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete (1)' })).toBeInTheDocument();
      // Ticking the checkbox must not navigate to the profile.
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('"Select All" / "Deselect All" toggles every visible recipient', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Select All' }));

      expect(screen.getByText('3 selected')).toBeInTheDocument();
      screen.getAllByRole('checkbox', { name: /^Select / }).forEach((box) => expect(box).toBeChecked());

      await userEvent.click(screen.getByRole('button', { name: 'Deselect All' }));

      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete \(/ })).not.toBeInTheDocument();
    });

    test('deletes the selected recipients after confirmation', async () => {
      axiosInstance.delete.mockResolvedValue({ data: {} });
      await renderLoaded();

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select John Doe' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice Smith' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));

      const dialog = screen.getByRole('alertdialog', { name: 'Delete recipients' });
      expect(dialog).toHaveTextContent('John Doe');
      expect(axiosInstance.delete).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(displayedNames()).toEqual(['Bob Johnson']));
      expect(axiosInstance.delete).toHaveBeenCalledWith('/recipients/recipient-1');
      expect(axiosInstance.delete).toHaveBeenCalledWith('/recipients/recipient-2');
      expect(screen.queryByRole('button', { name: /^Delete \(/ })).not.toBeInTheDocument();
    });

    test('does nothing when the bulk delete confirmation is declined', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select John Doe' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete (1)' }));
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      expect(axiosInstance.delete).not.toHaveBeenCalled();
      expect(displayedNames()).toHaveLength(3);
    });

    test('removes only the recipients that were deleted and reports the failures', async () => {
      axiosInstance.delete.mockImplementation((url) =>
        url.endsWith('recipient-1') ? Promise.reject(new Error('boom')) : Promise.resolve({ data: {} })
      );
      await renderLoaded();

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select John Doe' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice Smith' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

      expect(await screen.findByText('Failed to delete 1 recipient(s). Please try again.')).toBeInTheDocument();
      expect(displayedNames()).toEqual(['Bob Johnson', 'John Doe']);
      // The failed one stays selected so it can be retried.
      expect(screen.getByRole('checkbox', { name: 'Select John Doe' })).toBeChecked();
    });
  });

  describe('Keyboard shortcuts', () => {
    // Ctrl+N, Ctrl+F and Ctrl+A belong to the browser (new window, find,
    // select text): the page leaves them alone and does not advertise them.
    test('Ctrl+N, Ctrl+F and Ctrl+A are left to the browser', async () => {
      await renderLoaded();

      const n = fireEvent.keyDown(document, { key: 'n', ctrlKey: true });
      const f = fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
      const a = fireEvent.keyDown(document, { key: 'a', ctrlKey: true });

      // fireEvent returns false when the page called preventDefault()
      expect([n, f, a]).toEqual([true, true, true]);
      expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument();
      expect(getSearchBox()).not.toHaveFocus();
      expect(screen.queryByText('3 selected')).not.toBeInTheDocument();
      expect(screen.queryByText(/Ctrl\+N|Ctrl\+F|Ctrl\+A/)).not.toBeInTheDocument();
      expect(getSearchBox().getAttribute('aria-describedby') || '').not.toMatch(/./);
    });

    test('Ctrl+Delete on a card opens the delete confirmation; Escape dismisses it', async () => {
      await renderLoaded();

      fireEvent.keyDown(getCard('Bob Johnson'), { key: 'Delete', ctrlKey: true });

      expect(screen.getByRole('heading', { name: 'Delete Recipient' })).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to delete/i)).toHaveTextContent('Bob Johnson');

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('heading', { name: 'Delete Recipient' })).not.toBeInTheDocument();
      expect(axiosInstance.delete).not.toHaveBeenCalled();
    });

    test('Ctrl+E on a card opens the edit form', async () => {
      await renderLoaded();

      fireEvent.keyDown(getCard('Alice Smith'), { key: 'e', ctrlKey: true });

      expect(screen.getByRole('heading', { name: 'Edit Alice Smith' })).toBeInTheDocument();
    });

    test('plain keys without Ctrl do not trigger shortcuts', async () => {
      await renderLoaded();

      fireEvent.keyDown(document, { key: 'n' });
      fireEvent.keyDown(getCard('Alice Smith'), { key: 'e' });
      fireEvent.keyDown(getCard('Alice Smith'), { key: 'Delete' });

      expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-recipient-form')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Delete Recipient' })).not.toBeInTheDocument();
    });
  });

  describe('Archiving recipients you bought gifts for', () => {
    const withPurchases = mockRecipients.map((r) =>
      r._id === 'recipient-2' ? { ...r, purchasedGiftCount: 2 } : { ...r, purchasedGiftCount: 0 }
    );
    const carol = {
      _id: 'archived-1', firstName: 'Carol', lastName: 'Lee', relation: 'Aunt',
      birthdate: '1960-02-02T12:00:00.000Z', tags: [], archived: true, purchasedGiftCount: 3,
    };

    test('says the recipient will be archived, then archives them', async () => {
      axiosInstance.delete.mockResolvedValue({ data: { archived: true, purchasedGifts: 2 } });
      await renderLoaded(withPurchases);

      await userEvent.click(screen.getByRole('button', { name: 'Delete Alice Smith' }));

      const dialog = screen.getByRole('alertdialog', { name: 'Delete Recipient' });
      expect(dialog).toHaveTextContent('Alice Smith has 2 purchased gifts');
      expect(dialog).toHaveTextContent(/archived so your spending history stays accurate/);

      mockLists(withPurchases.filter((r) => r._id !== 'recipient-2'), [{ ...withPurchases[1], archived: true }]);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Archive Recipient' }));

      await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/recipients/recipient-2'));
      expect(await screen.findByRole('status')).toHaveTextContent('Alice Smith was archived');
      expect(displayedNames()).toEqual(['Bob Johnson', 'John Doe']);
      expect(await screen.findByRole('button', { name: 'Show archived (1)' })).toBeInTheDocument();
    });

    test('keeps the plain delete wording for someone with no purchases', async () => {
      await renderLoaded(withPurchases);

      await userEvent.click(screen.getByRole('button', { name: 'Delete John Doe' }));

      const dialog = screen.getByRole('alertdialog', { name: 'Delete Recipient' });
      expect(dialog).not.toHaveTextContent(/archived/);
      expect(within(dialog).getByRole('button', { name: 'Delete Recipient' })).toBeInTheDocument();
    });

    test('lists archived recipients on request and restores one', async () => {
      axiosInstance.post.mockResolvedValue({ data: { ...carol, archived: false } });
      await renderLoaded(mockRecipients, [carol]);

      expect(screen.queryByText('Carol Lee')).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: 'Show archived (1)' }));
      expect(screen.getByText('Carol Lee')).toBeInTheDocument();
      expect(screen.getByText('3 purchased gifts')).toBeInTheDocument();

      mockLists([...mockRecipients, { ...carol, archived: false }], []);
      await userEvent.click(screen.getByRole('button', { name: 'Restore Carol Lee' }));

      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/recipients/archived-1/restore'));
      await waitFor(() => expect(displayedNames()).toContain('Carol Lee'));
      expect(screen.queryByRole('button', { name: /Show archived/ })).not.toBeInTheDocument();
    });

    test('deletes an archived recipient permanently after a stronger warning', async () => {
      axiosInstance.delete.mockResolvedValue({ data: { archived: false } });
      await renderLoaded(mockRecipients, [carol]);

      await userEvent.click(await screen.findByRole('button', { name: 'Show archived (1)' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete Carol Lee permanently' }));

      const dialog = screen.getByRole('alertdialog', { name: 'Delete Permanently' });
      expect(dialog).toHaveTextContent('also deletes their 3 purchased gifts');

      mockLists(mockRecipients, []);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Permanently' }));

      await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/recipients/archived-1?permanent=true'));
      await waitFor(() => expect(screen.queryByText('Carol Lee')).not.toBeInTheDocument());
    });

    test('bulk delete says which selected recipients will be archived', async () => {
      axiosInstance.delete.mockImplementation((url) =>
        Promise.resolve({ data: { archived: url.endsWith('recipient-2') } })
      );
      await renderLoaded(withPurchases);

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select John Doe' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice Smith' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete (2)' }));

      const dialog = screen.getByRole('alertdialog', { name: 'Delete recipients' });
      expect(dialog).toHaveTextContent('Alice Smith has purchased gifts and will be archived');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(displayedNames()).toEqual(['Bob Johnson']));
      expect(await screen.findByRole('status')).toHaveTextContent('1 recipient archived');
    });
  });

  describe('Dialogs', () => {
    test('the add form is a named dialog that the Close button and Escape dismiss', async () => {
      await renderLoaded();

      await userEvent.click(screen.getByRole('button', { name: 'Add new recipient' }));
      const dialog = screen.getByRole('dialog', { name: 'Add New Recipient' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Add new recipient' }));
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('the filter and sort selects and the view switch have names', async () => {
      await renderLoaded();
      expect(screen.getByRole('combobox', { name: 'Filter by relation' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Sort recipients' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Switch to (list|grid) view/ })).toBeInTheDocument();
    });
  });
});
