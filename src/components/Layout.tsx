import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartLine, House, Layers, Palette, PenLine, Users, type LucideIcon } from 'lucide-react';
import { Toasts } from './Toasts';
import { StorageNotice } from './StorageNotice';
import { StreakChip } from './StreakChip';
import { Pomodoro, TimerHost } from './Pomodoro';
import { PopupHost } from './PopupHost';
import { XpBadge } from './XpBadge';
import { Capi } from './Capi';
import './Layout.css';

const NAV: { to: string; label: string; short: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', short: 'Home', icon: House, end: true },
  { to: '/decks', label: 'Card repository', short: 'Decks', icon: Layers },
  { to: '/studio', label: 'Card studio', short: 'Studio', icon: PenLine },
  { to: '/progress', label: 'Progress', short: 'Progress', icon: ChartLine },
  { to: '/friends', label: 'Friends', short: 'Friends', icon: Users },
];

export function Layout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  // Home lays out its own floating panels; the studio has its own panes; other pages sit on one sheet.
  const frame = pathname === '/' ? 'bare' : pathname.startsWith('/studio') ? 'wide' : 'sheet';
  // While studying, the wallpaper steps back a little further.
  const focus = /\/(study|quiz)$/.test(pathname) || pathname === '/study';

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar">
        <Link to="/" className="wordmark" aria-label="Capi’s Deck, go home">
          Capi’s Deck <span className="wordmark-ja" lang="ja">カピのデッキ</span>
        </Link>
        <XpBadge />
        <nav aria-label="Main">
          <ul className="side-nav">
            {NAV.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="side-link">
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="side-foot">
          <StreakChip />
          <Pomodoro variant="sidebar" />
          <NavLink to="/customize" className="side-link side-customize">
            Customizations
          </NavLink>
        </div>
      </aside>

      <header className="topbar">
        <Link to="/" className="wordmark" aria-label="Capi’s Deck, go home">
          Capi’s Deck <span className="wordmark-ja" lang="ja">カピのデッキ</span>
        </Link>
        <div className="topbar-actions">
          <XpBadge compact />
          <StreakChip compact />
          <Pomodoro />
          <NavLink to="/customize" className="icon-btn" aria-label="Customizations" title="Customizations">
            <Palette size={18} aria-hidden="true" />
          </NavLink>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className={`stage is-${frame}${focus ? ' is-focus' : ''}`}>
        <div className="main-inner">
          <StorageNotice />
          {frame === 'sheet' ? (
            <div className="sheet">
              <Outlet />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>

      <nav className="tabbar" aria-label="Main">
        <ul>
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className="tab-link">
                <Icon size={20} aria-hidden="true" />
                <span>{short}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <TimerHost />
      <PopupHost />
      <Capi />
      <Toasts />
    </>
  );
}
