import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axiosInstance from '../../../axiosInstance';
import { toast } from 'react-toastify';
import HolidaySettings from '../HolidaySettings';
import Modal from '../../ui/Modal';

jest.mock('../../../axiosInstance');
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const saved = { enabled: true, countryCode: 'DE', categories: ['national', 'religious'], defaultRemindDaysBefore: 3 };

// GET /settings/user-preferences answers with the preferences at the top level
const preferencesResponse = (holidaySettings) => ({ data: { theme: 'light', holidaySettings } });

describe('HolidaySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    axiosInstance.get.mockResolvedValue(preferencesResponse(saved));
    axiosInstance.put.mockResolvedValue({
      data: { preferences: { holidaySettings: saved }, holidays: { success: true, created: 2, removed: 1, keptWithGifts: 0 } }
    });
  });

  test('shows the saved settings, not the defaults', async () => {
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    expect(screen.getByLabelText(/religious observances/i)).toBeChecked();
    expect(screen.getByLabelText(/cultural celebrations/i)).not.toBeChecked();
    expect(screen.getByLabelText(/reminder days before/i)).toHaveValue(3);
  });

  test('shows reminders switched off when they were saved off', async () => {
    axiosInstance.get.mockResolvedValue(preferencesResponse({ ...saved, enabled: false }));
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/enable holiday reminders/i)).not.toBeChecked());
  });

  test('saving an unchanged country sends the saved country back', async () => {
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
    expect(axiosInstance.put.mock.calls[0][1].preferences.holidaySettings).toEqual(saved);
  });

  test('cannot save when the saved settings could not be loaded', async () => {
    axiosInstance.get.mockRejectedValue(new Error('offline'));
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByText(/could not load your holiday settings/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('reports what changed in one message, without a blocking alert', async () => {
    const onSettingsChange = jest.fn();
    render(<HolidaySettings onSettingsChange={onSettingsChange} />);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success.mock.calls[0][0]).toMatch(/2 holidays added, 1 removed/i);
    expect(window.alert).not.toHaveBeenCalled();
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ holidaySettings: saved }));
  });

  test('says when holiday events kept because they have gifts', async () => {
    axiosInstance.put.mockResolvedValue({
      data: { preferences: { holidaySettings: saved }, holidays: { success: true, created: 0, removed: 0, keptWithGifts: 2 } }
    });
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success.mock.calls[0][0]).toMatch(/2 kept because they have gifts/i);
  });

  test('a failed holiday update is reported as a failure', async () => {
    axiosInstance.put.mockResolvedValue({
      data: { preferences: { holidaySettings: saved }, holidays: { success: false, error: 'boom' } }
    });
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('shows the server message when the settings are rejected', async () => {
    axiosInstance.put.mockRejectedValue({ response: { data: { message: 'Holidays are not available for that country' } } });
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Holidays are not available for that country'));
  });

  test('the reminder-days steppers are named buttons that do not submit', async () => {
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/reminder days before/i)).toHaveValue(3));
    const up = screen.getByRole('button', { name: /increase reminder days/i });
    const down = screen.getByRole('button', { name: /decrease reminder days/i });
    expect(up).toHaveAttribute('type', 'button');
    expect(down).toHaveAttribute('type', 'button');

    up.focus();
    expect(up).toHaveFocus();
    fireEvent.click(up);
    expect(screen.getByLabelText(/reminder days before/i)).toHaveValue(4);
    fireEvent.click(down);
    fireEvent.click(down);
    expect(screen.getByLabelText(/reminder days before/i)).toHaveValue(2);
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('an empty reminder-days box is not saved', async () => {
    render(<HolidaySettings />);
    await waitFor(() => expect(screen.getByLabelText(/reminder days before/i)).toHaveValue(3));
    fireEvent.change(screen.getByLabelText(/reminder days before/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/between 1 and 30/i)));
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('in the dialog, Save Settings sits in the footer and still saves', async () => {
    render(<Modal open onClose={() => {}} title="Holiday Reminders"><HolidaySettings /></Modal>);
    await waitFor(() => expect(screen.getByLabelText(/country for holidays/i)).toHaveValue('DE'));
    const save = screen.getByRole('button', { name: 'Save Settings' });
    expect(screen.getByTestId('modal-footer')).toContainElement(save);
    fireEvent.click(save);
    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
  });
});
