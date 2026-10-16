import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../ConfirmDialog';
import useConfirm from '../useConfirm';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('ConfirmDialog', () => {
  test('is an alert dialog named by its title and described by its message', () => {
    render(
      <ConfirmDialog
        open
        title="Delete recipient"
        message="Maria and her events will be removed."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete recipient' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Maria and her events will be removed.');
  });

  test('starts with focus on Cancel, the safe choice', () => {
    render(<ConfirmDialog open title="Delete gift" message="Sure?" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  test('Cancel and Escape close without confirming', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(<ConfirmDialog open title="Delete gift" message="Sure?" onConfirm={onConfirm} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('confirming runs onConfirm, then closes', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(
      <ConfirmDialog open title="Delete gift" message="Sure?" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the danger variant styles the confirm button as danger', () => {
    render(
      <ConfirmDialog open variant="danger" title="Delete gift" message="Sure?" confirmLabel="Delete" onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(/danger/);
  });

  test('waits for an async confirm, showing it is busy', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onClose = jest.fn();
    render(
      <ConfirmDialog
        open
        title="Restore database"
        message="This replaces your data."
        confirmLabel="Restore"
        onConfirm={() => pending.promise}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const confirmButton = screen.getByRole('button', { name: /Restore/ });
    expect(confirmButton).toHaveAttribute('aria-busy', 'true');
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(); await pending.promise; });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('stays open and shows the error when an async confirm fails', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <ConfirmDialog
        open
        title="Delete account"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => Promise.reject(new Error('The server could not delete the account.'))}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not delete the account.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  });
});

describe('useConfirm', () => {
  function Caller({ onResult }) {
    const { confirm, confirmDialog } = useConfirm();
    const ask = async () => {
      const ok = await confirm({
        title: 'Delete gift',
        message: 'Remove "Book" from the list?',
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      onResult(ok);
    };
    return (
      <>
        <button type="button" onClick={ask}>Delete Book</button>
        {confirmDialog}
      </>
    );
  }

  test('resolves true when confirmed and closes the dialog', async () => {
    const user = userEvent.setup();
    const onResult = jest.fn();
    render(<Caller onResult={onResult} />);

    await user.click(screen.getByRole('button', { name: 'Delete Book' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete gift' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('resolves false when cancelled and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onResult = jest.fn();
    render(<Caller onResult={onResult} />);

    const trigger = screen.getByRole('button', { name: 'Delete Book' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(onResult).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
