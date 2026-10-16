import React, { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * Promise-style confirmation, the drop-in for window.confirm():
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: 'Delete gift', message: '...', confirmLabel: 'Delete', variant: 'danger' })) {
 *     await deleteGift(id);
 *   }
 *   ...
 *   return <>{page}{confirmDialog}</>;
 *
 * confirm() resolves true when confirmed and false when cancelled (Cancel,
 * Escape or a backdrop click). Pass onConfirm in the options to run the
 * action inside the dialog with its busy and error states; the promise then
 * resolves true once that action succeeds.
 */
export default function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);

  const settle = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    if (resolve) resolve(value);
  }, []);

  const confirm = useCallback((opts = {}) => {
    if (resolverRef.current) resolverRef.current(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const confirmedRef = useRef(false);

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(options)}
      title={options?.title}
      message={options?.message}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      onConfirm={() => {
        const result = options?.onConfirm?.();
        if (result && typeof result.then === 'function') {
          return result.then((value) => {
            confirmedRef.current = true;
            return value;
          });
        }
        confirmedRef.current = true;
        return result;
      }}
      onClose={() => {
        const confirmed = confirmedRef.current;
        confirmedRef.current = false;
        settle(confirmed);
      }}
    >
      {options?.details}
    </ConfirmDialog>
  );

  return { confirm, confirmDialog };
}
