import React, { forwardRef } from 'react';
import styles from './Button.module.css';

/**
 * The app's one button (DESIGN.md > Components > Buttons).
 *
 * variant: 'primary' (one per view region) | 'secondary' | 'danger' (only the
 *          confirming action of something destructive) | 'ghost' (low emphasis)
 * size:    'md' (44px, the default and the touch target) | 'sm' (36px, for
 *          dense rows and toolbars on pointer screens)
 * loading: keeps the label, shows a spinner, sets aria-busy and blocks clicks.
 * icon:    optional leading icon node.
 *
 * Defaults to type="button" so dropping it into a form never submits by
 * accident; pass type="submit" for the form's main action.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon = null,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const classes = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type={type} // eslint-disable-line react/button-has-type
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
});

export default Button;
