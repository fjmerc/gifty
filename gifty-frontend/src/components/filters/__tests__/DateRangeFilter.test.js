// The two date fields are named by their visible From / To captions
import React from 'react';
import { render, screen } from '@testing-library/react';
import DateRangeFilter from '../DateRangeFilter';

// The real picker: the shared mock in setupTests renders no input after mocks reset
jest.unmock('react-datepicker');

test('the From and To date fields are labelled', () => {
  render(
    <DateRangeFilter
      dateRange={{ startDate: new Date(2026, 0, 1), endDate: new Date(2026, 5, 1) }}
      onDateRangeChange={() => {}}
    />,
  );
  expect(screen.getByLabelText('From')).toHaveValue('Jan 1, 2026');
  expect(screen.getByLabelText('To')).toHaveValue('Jun 1, 2026');
});
