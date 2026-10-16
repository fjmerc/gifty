import React, { useState, useEffect, useRef, useId } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import styles from '../css/Header.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserCircle, faBell, faDollarSign, faGift, faCalendarAlt,
  faStar, faUser, faCog, faSignOutAlt, faHome, faUsers, faBars, faCompass,
  faXmark, faReceipt, faChartLine, faCircleQuestion
} from '@fortawesome/free-solid-svg-icons';
import NavbarLogo from '../../assets/navbar_icon.png'; 
import { useAuth } from '../../AuthContext';
import { useNotification } from '../../NotificationContext';
import { resolveAssetUrl } from '../../utils/apiBaseUrl';

// Pages reached from the account menu on desktop, beside the icon links
const MORE_PAGES = [
  { to: '/favorites', label: 'Favorites', icon: faStar },
  { to: '/purchase-history', label: 'Purchase history', icon: faReceipt },
  { to: '/feedback-analytics', label: 'Feedback analytics', icon: faChartLine },
  { to: '/suggestions-help', label: 'Suggestions help', icon: faCircleQuestion },
];
const ACCOUNT_PAGES = [
  { to: '/user-profile', label: 'Profile', icon: faUser },
  { to: '/settings', label: 'Settings', icon: faCog },
];
// Every page, in the order the phone menu lists them
const PHONE_PAGES = [
  { to: '/userhome', label: 'Home', icon: faHome },
  { to: '/recipients', label: 'Recipients', icon: faUsers },
  { to: '/events', label: 'Events', icon: faCalendarAlt },
  { to: '/gifts', label: 'Gifts', icon: faGift },
  { to: '/explore', label: 'Explore gifts', icon: faCompass },
  { to: '/favorites', label: 'Favorites', icon: faStar },
  { to: '/budgets', label: 'Budgets', icon: faDollarSign },
  { to: '/purchase-history', label: 'Purchase history', icon: faReceipt },
  { to: '/notifications', label: 'Notifications', icon: faBell, badge: true },
  { to: '/feedback-analytics', label: 'Feedback analytics', icon: faChartLine },
  { to: '/suggestions-help', label: 'Suggestions help', icon: faCircleQuestion },
  ...ACCOUNT_PAGES,
];

const Header = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { logout, user, isAuthenticated, isLoading } = useAuth();
  const { unreadCount } = useNotification();
  const accountRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  // Which item gets focus when the menu opens: 'first', 'last' or null (mouse)
  const focusOnOpenRef = useRef(null);
  const menuId = useId();
  const drawerId = useId();
  const hamburgerRef = useRef(null);
  const drawerRef = useRef(null);

  const closeDropdown = (e) => {
    if (accountRef.current && accountRef.current.contains(e.target)) {
      return;
    }
    setDropdownOpen(false);
  };

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);

  useEffect(() => {
    if (!dropdownOpen || !focusOnOpenRef.current) return;
    const items = menuItems();
    const target = focusOnOpenRef.current === 'last' ? items[items.length - 1] : items[0];
    focusOnOpenRef.current = null;
    if (target) target.focus();
  }, [dropdownOpen]);

  useEffect(() => {
    if (menuOpen) drawerRef.current?.querySelector('a, button')?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (dropdownOpen) {
      document.addEventListener('click', closeDropdown);
    } else {
      document.removeEventListener('click', closeDropdown);
    }
    return () => {
      document.removeEventListener('click', closeDropdown);
    };
  }, [dropdownOpen]);

  // Add a simple loading state while checking authentication
  if (isLoading) {
    return (
      <header className={styles.header}>
        <nav className={styles.nav}>
          <Link to="/userhome" className={styles['home-link']}>
            <img src={NavbarLogo} alt="Gifty Logo" />
            <span>Gifty</span>
          </Link>
          {/* A span, not a div: React would otherwise reuse this node as the
              icon row once sign-in resolves, which the browser counts as a
              layout shift */}
          <span className={styles.loadingSpinner} role="status" aria-label="Checking sign-in" />
        </nav>
      </header>
    );
  }

  const toggleDropdown = (event) => {
    // A keyboard press (Enter/Space) reports detail 0: move focus into the menu
    if (!dropdownOpen && event && event.detail === 0) focusOnOpenRef.current = 'first';
    setDropdownOpen(!dropdownOpen);
  };

  const closeMenu = ({ returnFocus = false } = {}) => {
    setDropdownOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOnOpenRef.current = event.key === 'ArrowUp' ? 'last' : 'first';
      if (dropdownOpen) {
        const items = menuItems();
        const target = event.key === 'ArrowUp' ? items[items.length - 1] : items[0];
        focusOnOpenRef.current = null;
        target?.focus();
      } else {
        setDropdownOpen(true);
      }
    } else if (event.key === 'Escape' && dropdownOpen) {
      event.preventDefault();
      closeMenu({ returnFocus: true });
    }
  };

  const onMenuKeyDown = (event) => {
    const items = menuItems();
    const index = items.indexOf(document.activeElement);
    const focusAt = (i) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu({ returnFocus: true });
        break;
      case 'Tab':
        // Let focus move on naturally, and close behind it
        closeMenu();
        break;
      default:
    }
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeDrawer = ({ returnFocus = false } = {}) => {
    setMenuOpen(false);
    if (returnFocus) hamburgerRef.current?.focus();
  };

  const onDrawerKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer({ returnFocus: true });
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // Tabbing past the last row leaves the menu: close it behind the focus
      const rows = drawerRef.current?.querySelectorAll('a, button') || [];
      if (document.activeElement === rows[rows.length - 1]) closeDrawer();
    }
  };

  const onHamburgerKeyDown = (event) => {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      closeDrawer();
    }
  };

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    setMenuOpen(false);
    navigate('/login');
  };

  const menuLink = ({ to, label, icon }) => (
    <Link key={to} to={to} className={styles['dropdown-item']} role="menuitem" tabIndex={-1} onClick={() => closeMenu()}>
      <FontAwesomeIcon icon={icon} />{label}
    </Link>
  );

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link to="/userhome" className={styles['home-link']}>
          <img src={NavbarLogo} alt="Gifty Logo" />
          <span>Gifty</span>
        </Link>
        
        {isAuthenticated && (
          <div className={styles['icon-group']}>
            <Link to="/userhome" className={`${styles.tooltip} ${styles['icon-home']}`} aria-label="Home">
              <FontAwesomeIcon icon={faHome} size="lg" />
              <span className={styles.tooltiptext}>Home</span>
            </Link>
            <Link to="/recipients" className={`${styles.tooltip} ${styles['icon-recipients']}`} aria-label="Recipients">
              <FontAwesomeIcon icon={faUsers} size="lg" />
              <span className={styles.tooltiptext}>Recipients</span>
            </Link>
            <Link to="/events" className={`${styles.tooltip} ${styles['icon-event']}`} aria-label="Events">
              <FontAwesomeIcon icon={faCalendarAlt} size="lg" />
              <span className={styles.tooltiptext}>Events</span>
            </Link>
            <Link to="/gifts" className={`${styles.tooltip} ${styles['icon-gift']}`} aria-label="Gifts">
              <FontAwesomeIcon icon={faGift} size="lg" />
              <span className={styles.tooltiptext}>Gifts</span>
            </Link>
            <Link to="/explore" className={`${styles.tooltip} ${styles['icon-explore']}`} aria-label="Explore gifts">
              <FontAwesomeIcon icon={faCompass} size="lg" />
              <span className={styles.tooltiptext}>Explore Gifts</span>
            </Link>
            <Link to="/budgets" className={`${styles.tooltip} ${styles['icon-budget']}`} aria-label="Budgets">
              <FontAwesomeIcon icon={faDollarSign} size="lg" />
              <span className={styles.tooltiptext}>Budget</span>
            </Link>
            <Link to="/notifications" className={`${styles.tooltip} ${styles['icon-notification']}`} aria-label="Notifications">
              <div className={styles.notificationIcon}>
                <FontAwesomeIcon icon={faBell} size="lg" />
                {unreadCount > 0 && (
                  <span className={styles.notificationBadge} aria-label={`${unreadCount} unread notifications`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={styles.tooltiptext}>Notifications</span>
            </Link>
            <div className={styles.account} ref={accountRef}>
              <button
                type="button"
                ref={triggerRef}
                className={`${styles['profile-icon']} ${dropdownOpen ? styles.active : ''}`}
                onClick={toggleDropdown}
                onKeyDown={onTriggerKeyDown}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                aria-controls={dropdownOpen ? menuId : undefined}
                aria-label="Account menu"
              >
                {user?.profilePicture ? (
                  <img
                    src={resolveAssetUrl(user.profilePicture)}
                    alt=""
                    className={styles.profilePicture}
                  />
                ) : (
                  <FontAwesomeIcon icon={faUserCircle} size="2x" />
                )}
              </button>
              {dropdownOpen && (
                <div
                  id={menuId}
                  ref={menuRef}
                  className={styles['dropdown-menu']}
                  role="menu"
                  aria-label="Account"
                  onKeyDown={onMenuKeyDown}
                >
                  {MORE_PAGES.map(menuLink)}
                  <div role="separator" className={styles['dropdown-separator']} />
                  {ACCOUNT_PAGES.map(menuLink)}
                  <div role="separator" className={styles['dropdown-separator']} />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={styles['dropdown-item']}
                    role="menuitem"
                    tabIndex={-1}
                  >
                    <FontAwesomeIcon icon={faSignOutAlt} />Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {isAuthenticated && (
          <button
            type="button"
            ref={hamburgerRef}
            className={styles.hamburger}
            onClick={toggleMenu}
            onKeyDown={onHamburgerKeyDown}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? drawerId : undefined}
          >
            <FontAwesomeIcon icon={menuOpen ? faXmark : faBars} size="lg" />
          </button>
        )}
      </nav>

      {isAuthenticated && menuOpen && (
        <>
          <div className={styles.scrim} data-testid="menu-scrim" onClick={() => closeDrawer()} />
          <nav id={drawerId} ref={drawerRef} className={styles.drawer} aria-label="Menu" onKeyDown={onDrawerKeyDown}>
            <ul className={styles.drawerList}>
              {PHONE_PAGES.map(({ to, label, icon, badge }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) => `${styles.drawerItem} ${isActive ? styles.drawerItemCurrent : ''}`}
                    onClick={() => closeDrawer()}
                  >
                    <FontAwesomeIcon icon={icon} fixedWidth />
                    {label}
                    {badge && unreadCount > 0 && (
                      <span className={styles.drawerBadge}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
              <li className={styles.drawerDivider}>
                <button type="button" className={styles.drawerItem} onClick={handleLogout}>
                  <FontAwesomeIcon icon={faSignOutAlt} fixedWidth />
                  Logout
                </button>
              </li>
            </ul>
          </nav>
        </>
      )}
    </header>
  );
};

export default Header;
