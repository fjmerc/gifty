import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from '../Button';

describe('Button', () => {
  test('defaults to a primary, medium, type="button" button', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toMatch(/primary/);
    expect(button.className).toMatch(/md/);
  });

  test.each(['primary', 'secondary', 'danger', 'ghost'])('applies the %s variant', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).className).toMatch(new RegExp(variant));
  });

  test('applies the sm size', () => {
    render(<Button size="sm">Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).className).toMatch(/sm/);
  });

  test('calls onClick, but not while disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button onClick={onClick} disabled>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('loading keeps the label, marks it busy and blocks clicks', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('forwards its ref and extra props', () => {
    const ref = createRef();
    render(<Button ref={ref} type="submit" aria-describedby="hint">Send</Button>);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Send' }));
    expect(ref.current).toHaveAttribute('type', 'submit');
    expect(ref.current).toHaveAttribute('aria-describedby', 'hint');
  });
});
