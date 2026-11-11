'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { signOut, useRequireRole } from '@/lib/auth';

const NAV = [
  ['/admin', 'Overview'], ['/admin/orders', 'Orders'], ['/admin/applications', 'Seller applications'], ['/admin/shops', 'Shops'], ['/admin/products', 'Products'],
  ['/admin/delivery', 'Delivery options'], ['/admin/riders', 'Riders'], ['/admin/promotions', 'Promotions'], ['/admin/returns', 'Returns'],
  ['/admin/complaints', 'Complaints'], ['/admin/earnings', 'Earnings & payouts'], ['/admin/settings', 'Settings'],
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { profile, loading } = useRequireRole(['admin']);
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);   // slide-out menu on small screens

  // close the menu after choosing a page, and on Escape
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // stop the page behind the menu from scrolling while it is open
  useEffect(() => {
    document.body.classList.toggle('no-scroll', open);
    return () => document.body.classList.remove('no-scroll');
  }, [open]);

  const current = NAV.filter(([h]) => path === h || (h !== '/admin' && path.startsWith(h))).sort((a, b) => b[0].length - a[0].length)[0];
  if (loading) return <div className="center-page"><p className="muted">Loading…</p></div>;
  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        <b className="topbar-title">{current?.[1] ?? 'Ebenoba GH'}</b>
      </header>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main menu">
        <button className="close-btn" aria-label="Close menu" onClick={() => setOpen(false)}>✕</button>
        <img src="/logo.jpg" alt="Ebenoba GH" />
        <nav>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={path === href || (href !== '/admin' && path.startsWith(href)) ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="me">
          <div><b>{profile?.full_name || 'Admin'}</b></div><div className="muted">{profile?.email}</div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => signOut(router)}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
