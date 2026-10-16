// Deleting the email configuration asks in the shared confirmation dialog,
// never with window.confirm()
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import EmailConfig from '../EmailConfig';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance');
// What AuthContext really provides: no token (the session is an httpOnly cookie)
jest.mock('../../../AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false }) }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  ToastContainer: () => null,
}));

const existing = {
  service: 'gmail', host: '', port: 587, secure: true,
  username: 'me@example.com', fromName: 'Gifty Notifications', enabled: true,
};

beforeEach(() => {
  axiosInstance.get.mockResolvedValue({ data: existing });
  axiosInstance.delete.mockResolvedValue({ data: {} });
});

test('Cancel in the dialog keeps the configuration', async () => {
  render(<EmailConfig onSuccess={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Configuration' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Delete email configuration' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(axiosInstance.delete).not.toHaveBeenCalled();
});

test('confirming deletes the configuration', async () => {
  render(<EmailConfig onSuccess={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Configuration' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/email-config'));
});

test('in the dialog, the actions sit in the sticky footer, wired to the form', async () => {
  // eslint-disable-next-line global-require
  const Modal = require('../../ui/Modal').default;
  render(<Modal open onClose={() => {}} title="Email Configuration"><EmailConfig onSuccess={() => {}} /></Modal>);
  const save = await screen.findByRole('button', { name: 'Update Configuration' });
  const footer = screen.getByTestId('modal-footer');
  expect(footer).toContainElement(save);
  expect(footer).toContainElement(screen.getByRole('button', { name: 'Delete Configuration' }));
  const formEl = screen.getByTestId('modal-body').querySelector('form');
  expect(save).toHaveAttribute('form', formEl.id);
  expect(save.form).toBe(formEl);
});

// A backup restored on another server can't read the saved mail password
test('asks for the mail password again when the server can no longer read it', async () => {
  axiosInstance.get.mockResolvedValue({ data: { ...existing, passwordNeedsReentry: true } });
  render(<EmailConfig onSuccess={() => {}} />);

  const field = await screen.findByLabelText(/app password/i);
  const notice = await screen.findByText(/can't be read on this server/i);
  expect(field).toBeRequired();
  expect(field.getAttribute('aria-describedby')).toContain(notice.id);
});

test('says nothing about re-entering when the saved password is fine', async () => {
  axiosInstance.get.mockResolvedValue({ data: { ...existing, passwordNeedsReentry: false } });
  render(<EmailConfig onSuccess={() => {}} />);
  await screen.findByRole('button', { name: 'Update Configuration' });
  expect(screen.queryByText(/can't be read on this server/i)).not.toBeInTheDocument();
});

// Changing where mail goes needs the mail password in the same save
test('asks for the password again once the email address or server changes', async () => {
  render(<EmailConfig onSuccess={() => {}} />);
  await screen.findByRole('button', { name: 'Update Configuration' });
  const field = screen.getByLabelText(/app password/i);
  expect(field).not.toBeRequired();

  fireEvent.change(screen.getByLabelText('Email Address'), { target: { name: 'username', value: 'other@example.com' } });

  expect(field).toBeRequired();
  const notice = screen.getByText(/enter the mail password again to change the server or email address/i);
  expect(field.getAttribute('aria-describedby')).toContain(notice.id);
});

test('needs no password to change only the sender name', async () => {
  render(<EmailConfig onSuccess={() => {}} />);
  await screen.findByRole('button', { name: 'Update Configuration' });
  const field = screen.getByLabelText(/app password/i);
  fireEvent.change(screen.getByLabelText('Sender Name'), { target: { name: 'fromName', value: 'Family' } });
  expect(field).not.toBeRequired();
  expect(screen.queryByText(/enter the mail password again/i)).not.toBeInTheDocument();
});

// "Secure connection" means TLS from the first byte, which only port 465
// speaks; 587, 2525 and 25 upgrade with STARTTLS and fail with it on
describe('the secure-connection default follows the port', () => {
  const newCustom = async () => {
    axiosInstance.get.mockRejectedValue({ response: { status: 404 } });
    render(<EmailConfig onSuccess={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Email Service')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Email Service'), { target: { value: 'custom' } });
    return {
      port: screen.getByLabelText('SMTP Port'),
      secure: screen.getByRole('checkbox', { name: /secure connection/i })
    };
  };

  test('is off for the default port 587 and on for 465', async () => {
    const { port, secure } = await newCustom();
    expect(port).toHaveValue(587);
    expect(secure).not.toBeChecked();

    fireEvent.change(port, { target: { name: 'port', value: '465' } });
    expect(secure).toBeChecked();
    fireEvent.change(port, { target: { name: 'port', value: '2525' } });
    expect(secure).not.toBeChecked();
  });

  test('leaves a box the user ticked or cleared alone', async () => {
    const { port, secure } = await newCustom();
    fireEvent.click(secure); // on, by hand, for 587
    fireEvent.change(port, { target: { name: 'port', value: '2525' } });
    expect(secure).toBeChecked();
  });
});

// Port 587 must not fall back to sending the password in clear text
describe('Require encryption (STARTTLS)', () => {
  const newCustom = async () => {
    axiosInstance.get.mockRejectedValue({ response: { status: 404 } });
    render(<EmailConfig onSuccess={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Email Service')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Email Service'), { target: { value: 'custom' } });
    return {
      port: screen.getByLabelText('SMTP Port'),
      starttls: screen.getByRole('checkbox', { name: /require encryption \(starttls\)/i })
    };
  };

  test('is on for 587 and off for 25 and 2525 by default, unless set by hand', async () => {
    const { port, starttls } = await newCustom();
    expect(starttls).toBeChecked();
    fireEvent.change(port, { target: { name: 'port', value: '2525' } });
    expect(starttls).not.toBeChecked();
    fireEvent.change(port, { target: { name: 'port', value: '587' } });
    expect(starttls).toBeChecked();
    fireEvent.click(starttls);
    fireEvent.change(port, { target: { name: 'port', value: '25' } });
    fireEvent.change(port, { target: { name: 'port', value: '587' } });
    expect(starttls).not.toBeChecked();
  });

  test('is sent with the settings', async () => {
    axiosInstance.post.mockResolvedValue({ data: {} });
    const { starttls } = await newCustom();
    fireEvent.change(screen.getByLabelText('SMTP Host'), { target: { name: 'host', value: 'smtp.example.com' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { name: 'username', value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText(/app password/i), { target: { name: 'password', value: 'p-1234' } });
    expect(starttls).toBeChecked();
    fireEvent.submit(screen.getByLabelText('Email Service').closest('form'));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/email-config', expect.objectContaining({ requireTLS: true, port: 587 }), expect.anything()));
  });

  test('turning it off on saved settings asks for the password again', async () => {
    axiosInstance.get.mockResolvedValue({ data: { ...existing, service: 'custom', host: 'smtp.example.com', port: 587, secure: false, requireTLS: true } });
    render(<EmailConfig onSuccess={() => {}} />);
    await screen.findByRole('button', { name: 'Update Configuration' });
    const field = screen.getByLabelText(/app password/i);
    expect(field).not.toBeRequired();

    fireEvent.click(screen.getByRole('checkbox', { name: /require encryption \(starttls\)/i }));

    expect(field).toBeRequired();
    expect(screen.getByText(/enter the mail password again/i)).toBeInTheDocument();
  });
});
// The saved settings load for a signed-in user, and say a password is saved
describe('opening the saved settings', () => {
  test('loads them for a signed-in user and shows that a password is saved', async () => {
    render(<EmailConfig onSuccess={() => {}} />);

    expect(await screen.findByDisplayValue('me@example.com')).toBeInTheDocument();
    expect(axiosInstance.get).toHaveBeenCalledWith('/email-config');
    const field = screen.getByLabelText(/app password/i);
    const saved = screen.getByText(/a password is saved/i);
    expect(field).not.toBeRequired();
    expect(field.getAttribute('aria-describedby')).toContain(saved.id);
    expect(screen.getByRole('button', { name: /send test email/i })).toBeInTheDocument();
  });

  test('a new configuration says nothing about a saved password', async () => {
    axiosInstance.get.mockRejectedValue({ response: { status: 404 } });
    render(<EmailConfig onSuccess={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Email Service')).not.toBeDisabled());
    expect(screen.queryByText(/a password is saved/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/app password/i)).toBeRequired();
  });

  test("shows the server's request for the password next to the field", async () => {
    const message = 'Enter the mail password again to change the server or username';
    axiosInstance.post.mockRejectedValueOnce({ response: { status: 400, data: { message, errors: [{ field: 'password', message }] } } });
    render(<EmailConfig onSuccess={() => {}} />);
    await screen.findByDisplayValue('me@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Update Configuration' }));

    const field = screen.getByLabelText(/app password/i);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field.getAttribute('aria-describedby')).toContain('password-error');
    expect(document.getElementById('password-error')).toHaveTextContent(message);
  });
});

