import React, {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import styles from './Modal.module.css';

/**
 * The app's one dialog (DESIGN.md > Components > Dialogs).
 *
 * - role="dialog" (or "alertdialog"), aria-modal, named by its title.
 * - On open, focus goes to initialFocusRef, else the first control in the
 *   body, else the first control in the footer, else the panel.
 * - Tab and Shift+Tab stay inside; Escape closes (only the topmost dialog
 *   reacts when dialogs stack); focus returns to whatever opened it.
 * - The page behind does not scroll while it is open.
 * - The body scrolls inside a panel capped at the viewport height; the footer
 *   (actions) stays visible below it.
 * - A form in the body can put its own buttons in that footer with
 *   <ModalActions>; its submit button then needs form="<the form's id>".
 */

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  );
}

// Where <ModalActions> inside an open dialog sends its buttons
const FooterContext = createContext(null);

/**
 * A form's action buttons. Inside a Modal they render in the dialog's sticky
 * footer (give the submit button form="<form id>", since it is no longer
 * inside the <form>); anywhere else they render in place, in a div with
 * className.
 */
export function ModalActions({ children, className = '' }) {
  const footer = useContext(FooterContext);
  const claim = footer?.claim;
  useLayoutEffect(() => (claim ? claim() : undefined), [claim]);
  if (!footer) return <div className={className}>{children}</div>;
  return footer.slot ? createPortal(children, footer.slot) : null;
}

// Open dialogs, innermost last. Only the last one handles keys.
const stack = [];
let savedBodyOverflow = null;

function lockScroll() {
  if (stack.length === 1) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}
function unlockScroll() {
  if (stack.length === 0) {
    document.body.style.overflow = savedBodyOverflow ?? '';
    savedBodyOverflow = null;
  }
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer = null,
  role = 'dialog',
  size = 'md',
  initialFocusRef,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const footerRef = useRef(null);
  const backdropPressRef = useRef(false);
  const tokenRef = useRef({});
  const [actionSlot, setActionSlot] = useState(null);
  const [actionCount, setActionCount] = useState(0);
  const claim = useCallback(() => {
    setActionCount((n) => n + 1);
    return () => setActionCount((n) => n - 1);
  }, []);
  const footerContext = useMemo(() => ({ slot: actionSlot, claim }), [actionSlot, claim]);

  // Keep the latest callbacks without re-running the open/close effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;

  useEffect(() => {
    if (!open) return undefined;
    const token = tokenRef.current;
    const opener = document.activeElement;
    stack.push(token);
    lockScroll();

    const target = (initialFocusRef && initialFocusRef.current)
      || focusables(bodyRef.current)[0]
      || focusables(footerRef.current)[0]
      || panelRef.current;
    if (target && typeof target.focus === 'function') target.focus();

    const onKeyDown = (event) => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        if (!closeOnEscapeRef.current) return;
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active);
      if (event.shiftKey && (active === first || !inside || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.lastIndexOf(token);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
    };
    // initialFocusRef is read once on open by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onBackdropMouseDown = (event) => {
    backdropPressRef.current = event.target === event.currentTarget;
  };
  const onBackdropClick = (event) => {
    const startedOnBackdrop = backdropPressRef.current;
    backdropPressRef.current = false;
    if (closeOnBackdrop && startedOnBackdrop && event.target === event.currentTarget) {
      onCloseRef.current?.();
    }
  };

  return createPortal(
    <div
      className={styles.backdrop}
      data-testid="modal-backdrop"
      onMouseDown={onBackdropMouseDown}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={[styles.panel, styles[size], className].filter(Boolean).join(' ')}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          {showCloseButton && (
            <button type="button" className={styles.close} aria-label="Close" onClick={() => onCloseRef.current?.()}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
        <div ref={bodyRef} className={styles.body} data-testid="modal-body">
          <FooterContext.Provider value={footerContext}>
            {children}
          </FooterContext.Provider>
        </div>
        {(footer || actionCount > 0) && (
          <div ref={footerRef} className={styles.footer} data-testid="modal-footer">
            {footer}
            {actionCount > 0 && <div ref={setActionSlot} className={styles.actions} />}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
