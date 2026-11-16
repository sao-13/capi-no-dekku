import { Outlet } from 'react-router-dom';
import { Toasts } from './Toasts';
import { StorageNotice } from './StorageNotice';
import { TimerHost } from './Pomodoro';
import { PopupHost } from './PopupHost';
import { Capi } from './Capi';
import { useRouteFocus } from '../lib/useRouteFocus';
import './Layout.css';

/** Study and quiz: the session over the wallpaper, with no sidebar, top bar or tab bar. */
export function FocusLayout() {
  const mainRef = useRouteFocus();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <main id="main" ref={mainRef} tabIndex={-1} className="stage is-solo is-focus">
        <div className="main-inner">
          <StorageNotice />
          <Outlet />
        </div>
      </main>

      <TimerHost />
      <PopupHost />
      <Capi />
      <Toasts />
    </>
  );
}
