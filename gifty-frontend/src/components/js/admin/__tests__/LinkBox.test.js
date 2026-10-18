import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkBox from '../LinkBox';

it('copies the link and warns when it points elsewhere', async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.assign(navigator, { clipboard: { writeText } });
  render(<LinkBox link="http://localhost:3000/invite/abc" />);
  await userEvent.click(screen.getByRole('button', { name: /copy link/i }));
  expect(writeText).toHaveBeenCalledWith('http://localhost:3000/invite/abc');
  expect(screen.getByText(/set GIFTY_URL/)).toBeInTheDocument(); // jsdom's origin is http://localhost
});
