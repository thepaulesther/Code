import type { ReactNode } from 'react';
import { hrefFor, type Route } from '../../lib/route';
import { BrandMark, Icon, type IconName } from '../ui/Icon';
import { Modal } from '../Modal';

interface NavEntry { route: Route; label: string; icon: IconName }

const PRIMARY: NavEntry[] = [
  { route: 'overview', label: 'Overview', icon: 'overview' },
  { route: 'transactions', label: 'Transactions', icon: 'transactions' },
  { route: 'budgets', label: 'Budgets', icon: 'budgets' },
  { route: 'savings', label: 'Savings', icon: 'savings' },
  { route: 'insights', label: 'Insights', icon: 'insights' },
];
const SECONDARY: NavEntry[] = [
  { route: 'plans', label: 'Plan', icon: 'plans' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];
/** Bottom tab bar on phones: four destinations plus "More". */
const TABS: Route[] = ['overview', 'transactions', 'budgets', 'savings'];

function NavLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <li>
      <a href={hrefFor(entry.route)} className={active ? 'nav-item is-active' : 'nav-item'} aria-current={active ? 'page' : undefined}>
        <Icon name={entry.icon} size={20} />
        <span className="nav-text">{entry.label}</span>
      </a>
    </li>
  );
}

/** Desktop sidebar; collapses to an icon rail on tablets and is hidden on phones. */
export function Sidebar({ route, online, onInstall }: { route: Route; online: boolean; onInstall: (() => void) | null }) {
  return (
    <aside className="sidebar" aria-label="Main">
      <a href={hrefFor('overview')} className="brand" aria-label="Elora, go to overview">
        <BrandMark />
        <span className="brand-name">Elora</span>
      </a>
      <nav className="nav" aria-label="Sections">
        <ul className="nav-group" aria-label="Money">
          {PRIMARY.map((e) => <NavLink key={e.route} entry={e} active={route === e.route} />)}
        </ul>
        <div>
          <div className="nav-label" aria-hidden>Planning</div>
          <ul className="nav-group" aria-label="Planning and settings">
            {SECONDARY.map((e) => <NavLink key={e.route} entry={e} active={route === e.route} />)}
          </ul>
        </div>
      </nav>
      <div className="sidebar-foot">
        {!online && <span className="pill offline" title="You’re offline. Everything still works; exchange rates update when you’re back.">Offline</span>}
        {onInstall && (
          <button type="button" className="btn-secondary sm" onClick={onInstall} title="Install Elora as an app" aria-label="Install app">
            <Icon name="download" size={18} />
            <span className="btn-label">Install app</span>
          </button>
        )}
        <p className="privacy-note">
          <Icon name="lock" size={14} />
          <span>Your data stays in this browser.</span>
        </p>
      </div>
    </aside>
  );
}

/** Phone header: brand on the left, status and settings on the right. */
export function MobileTopBar({ online }: { online: boolean }) {
  return (
    <header className="topbar-mobile">
      <a href={hrefFor('overview')} className="brand" aria-label="Elora, go to overview">
        <BrandMark />
        <span className="brand-name">Elora</span>
      </a>
      <div className="topbar-actions">
        {!online && <span className="pill offline">Offline</span>}
        <a href={hrefFor('settings')} className="icon-btn plain" aria-label="Settings">
          <Icon name="settings" size={20} />
        </a>
      </div>
    </header>
  );
}

export function TabBar({ route, moreOpen, onMore }: { route: Route; moreOpen: boolean; onMore: () => void }) {
  const inMore = !TABS.includes(route);
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((r) => {
        const e = PRIMARY.find((x) => x.route === r)!;
        const active = route === r;
        return (
          <a key={r} href={hrefFor(r)} className={active ? 'tab is-active' : 'tab'} aria-current={active ? 'page' : undefined}>
            <span className="tab-pill"><Icon name={e.icon} size={21} /></span>
            {e.label}
          </a>
        );
      })}
      <button
        type="button"
        className={inMore || moreOpen ? 'tab is-active' : 'tab'}
        onClick={onMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
      >
        <span className="tab-pill"><Icon name="more" size={21} /></span>
        More
      </button>
    </nav>
  );
}

function MenuLink({ route, current, icon, label, hint, onPick }: {
  route: Route; current: Route; icon: IconName; label: string; hint: string; onPick: () => void;
}) {
  const active = route === current;
  return (
    <li>
      <a href={hrefFor(route)} className={active ? 'menu-item is-active' : 'menu-item'} aria-current={active ? 'page' : undefined} onClick={onPick}>
        <span className="menu-icon"><Icon name={icon} size={20} /></span>
        <span className="menu-text">{label}<small>{hint}</small></span>
        <Icon name="chevron-right" size={18} className="chev" />
      </a>
    </li>
  );
}

function MenuButton({ icon, label, hint, onClick, disabled }: {
  icon: IconName; label: string; hint: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <li>
      <button type="button" className="menu-item" onClick={onClick} disabled={disabled}>
        <span className="menu-icon"><Icon name={icon} size={20} /></span>
        <span className="menu-text">{label}<small>{hint}</small></span>
      </button>
    </li>
  );
}

/** The phone's "More" sheet: secondary pages and actions. */
export function MoreSheet({ open, onClose, route, onImport, onExport, onInstall, canImport, canExport }: {
  open: boolean;
  onClose: () => void;
  route: Route;
  onImport: () => void;
  onExport: () => void;
  onInstall: (() => void) | null;
  canImport: boolean;
  canExport: boolean;
}) {
  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Modal open={open} onClose={onClose} title="More">
      <ul className="menu-list">
        <MenuLink route="insights" current={route} icon="insights" label="Financial insights" hint="Trends, categories and savings rate" onPick={onClose} />
        <MenuLink route="plans" current={route} icon="plans" label="Financial plan" hint="What you can spend while saving" onPick={onClose} />
        <MenuLink route="settings" current={route} icon="settings" label="Settings" hint="Currency, categories, alerts, theme" onPick={onClose} />
        <MenuButton icon="import" label="Import CSV" hint={canImport ? 'From your bank or card' : 'Choose your currency first'} onClick={then(onImport)} disabled={!canImport} />
        <MenuButton icon="export" label="Export CSV" hint={canExport ? 'Back up or move your data' : 'Nothing to export yet'} onClick={then(onExport)} disabled={!canExport} />
        {onInstall && <MenuButton icon="download" label="Install app" hint="Add Elora to your home screen" onClick={then(onInstall)} />}
      </ul>
    </Modal>
  );
}

/** The phone's floating "add transaction" button. */
export function AddFab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label="Add transaction">
      <Icon name="plus" size={26} />
    </button>
  );
}

export function Main({ children }: { children: ReactNode }) {
  return (
    <main className="main" id="main">
      <div className="page">{children}</div>
    </main>
  );
}
