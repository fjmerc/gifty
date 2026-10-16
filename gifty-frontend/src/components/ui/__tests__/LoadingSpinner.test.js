import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('is a status region that announces the default message once', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^Loading…$/);
    expect(screen.getAllByText('Loading…')).toHaveLength(1);
  });

  it('announces a custom message', () => {
    render(<LoadingSpinner message="Loading feedback analytics..." />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading feedback analytics...');
  });

  it('still names the region when the message is empty or null', () => {
    const { rerender } = render(<LoadingSpinner message="" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading…');
    rerender(<LoadingSpinner message={null} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading…');
  });

  it('hides the spinning mark from assistive tech', () => {
    const { container } = render(<LoadingSpinner />);
    const mark = container.querySelector('[aria-hidden="true"]');
    expect(mark).toBeInTheDocument();
  });

  it('reserves the space it is given so the page does not jump', () => {
    const { rerender } = render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toHaveStyle({ minHeight: '200px' });
    rerender(<LoadingSpinner minHeight="60vh" />);
    expect(screen.getByRole('status')).toHaveStyle({ minHeight: '60vh' });
  });

  it('does not depend on react-bootstrap', () => {
    // Plain markup: no Bootstrap container/spinner classes (no Bootstrap CSS is loaded)
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.container, .spinner-border')).toBeNull();
  });
});
