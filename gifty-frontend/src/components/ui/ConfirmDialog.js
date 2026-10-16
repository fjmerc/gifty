import React, { useEffect, useId, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import styles from './ConfirmDialog.module.css';

/**
 * A confirmation built on Modal. Use it instead of window.confirm(); for a
 * promise-style call site use the useConfirm hook.
 *
 * - Focus starts on Cancel, the safe choice. Cancel comes first, the
 *   confirming action last (DESIGN.md > Dialogs).
 * - onConfirm may return a promise: the dialog shows it is busy, ignores
 *   Escape and Cancel until it settles, closes on success, and stays open
 *   with the error message on failure.
 * - variant="danger" makes the confirming button a Danger button.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onClose,
}) {
  const messageId = useId();
  const cancelRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const cancel = () => {
    if (!busy) onClose?.();
  };

  const confirm = async () => {
    setError(null);
    try {
      const result = onConfirm?.();
      if (result && typeof result.then === 'function') {
        setBusy(true);
        await result;
      }
      if (mounted.current) setBusy(false);
      onClose?.();
    } catch (err) {
      if (!mounted.current) return;
      setBusy(false);
      setError((err && err.message) || 'That did not work. Please try again.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={title}
      role="alertdialog"
      describedBy={messageId}
      initialFocusRef={cancelRef}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      showCloseButton={false}
      footer={(
        <>
          <Button ref={cancelRef} variant="secondary" onClick={cancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div id={messageId} className={styles.message}>{message}</div>
      {children}
      {error && (
        <p role="alert" className={styles.error}>{error}</p>
      )}
    </Modal>
  );
}
