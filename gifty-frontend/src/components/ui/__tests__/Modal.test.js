import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal, { ModalActions } from '../Modal';

function Harness({ initialFocus = false, closeOnBackdrop = true }) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef(null);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <button type="button">Background action</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit gift"
        initialFocusRef={initialFocus ? nameRef : undefined}
        closeOnBackdrop={closeOnBackdrop}
        footer={(
          <>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button">Save</button>
          </>
        )}
      >
        <label htmlFor="gift-url">Link</label>
        <input id="gift-url" />
        <label htmlFor="gift-name">Name</label>
        <input id="gift-name" ref={nameRef} />
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  test('renders nothing while closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden"><p>Body</p></Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('is a modal dialog named by its title', () => {
    render(<Modal open onClose={() => {}} title="Edit gift"><p>Body</p></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Edit gift' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { name: 'Edit gift' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
  });

  test('moves focus to the first field when it opens', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.getByLabelText('Link')).toHaveFocus();
  });

  test('focuses initialFocusRef when given', async () => {
    const user = userEvent.setup();
    render(<Harness initialFocus />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  test('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test('returns focus to the opener when closed from a button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test('traps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });

    save.focus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(save).toHaveFocus();

    // Tabbing all the way round never reaches the page behind
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await user.tab();
      // eslint-disable-next-line testing-library/no-node-access
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement);
    }
    expect(screen.getByRole('button', { name: 'Background action', hidden: true })).not.toHaveFocus();
  });

  test('locks body scroll while open and restores it after', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'scroll';
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  test('closes on a backdrop click but not on a click inside the panel', async () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="Edit gift"><p>Body text</p></Modal>);

    fireEvent.mouseDown(screen.getByText('Body text'));
    fireEvent.click(screen.getByText('Body text'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('ignores backdrop clicks when closeOnBackdrop is false', () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="Edit gift" closeOnBackdrop={false}><p>Body</p></Modal>);
    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('only the topmost dialog reacts to Escape', async () => {
    const user = userEvent.setup();
    const outerClose = jest.fn();
    const innerClose = jest.fn();
    render(
      <>
        <Modal open onClose={outerClose} title="Outer"><button type="button">Outer field</button></Modal>
        <Modal open onClose={innerClose} title="Inner"><button type="button">Inner field</button></Modal>
      </>,
    );
    await user.keyboard('{Escape}');
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  test('renders the footer outside the scrolling body', () => {
    render(
      <Modal open onClose={() => {}} title="Edit gift" footer={<button type="button">Save</button>}>
        <p>Body</p>
      </Modal>,
    );
    const body = screen.getByTestId('modal-body');
    expect(body).toContainElement(screen.getByText('Body'));
    expect(body).not.toContainElement(screen.getByRole('button', { name: 'Save' }));
  });
});

// A form inside a dialog keeps its own buttons but shows them in the sticky
// footer, so Save stays on screen however long the form is.
describe('ModalActions', () => {
  function FormDialog({ onSubmit }) {
    return (
      <Modal open onClose={() => {}} title="Add gift">
        <form id="gift-form" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          <label htmlFor="n">Name</label>
          <input id="n" />
          <ModalActions className="inline-actions">
            <button type="button">Cancel</button>
            <button type="submit" form="gift-form">Save</button>
          </ModalActions>
        </form>
      </Modal>
    );
  }

  test('inside a dialog the actions render in the footer, outside the scrolling body', () => {
    render(<FormDialog onSubmit={() => {}} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(screen.getByTestId('modal-body')).not.toContainElement(save);
    expect(screen.getByTestId('modal-footer')).toContainElement(save);
    expect(screen.getByTestId('modal-footer')).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
  });

  test('the footer Save still submits its form through the form attribute', async () => {
    const onSubmit = jest.fn();
    const user = userEvent.setup();
    render(<FormDialog onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('outside a dialog the actions render in place', () => {
    const { container } = render(
      <form id="f"><ModalActions className="inline-actions"><button type="submit">Save</button></ModalActions></form>,
    );
    expect(container.querySelector('form .inline-actions')).toContainElement(screen.getByRole('button', { name: 'Save' }));
  });

  test('a dialog with no actions shows no footer', () => {
    render(<Modal open onClose={() => {}} title="Plain"><p>Body</p></Modal>);
    expect(screen.queryByTestId('modal-footer')).toBeNull();
  });
});
