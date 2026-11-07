'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { signOut, useRequireRole } from '@/lib/auth';

const NAV = [
  ['/admin', 'Overview'], ['/admin/orders', 'Orders'], ['/admin/applications', 'Seller applications'], ['/admin/shops', 'Shops'], ['/admin/products', 'Products'],
  ['/admin/riders', 'Riders'], ['/admin/promotions', 'Promotions'], ['/admin/returns', 'Returns'],
  ['/admin/complaints', 'Complaints'], ['/admin/earnings', 'Earnings & payouts'], ['/admin/settings', 'Settings'],
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { profile, loading } = useRequireRole(['admin']);
  const path = usePathname();
  const router = useRouter();
  if (loading) return <div className="center-page"><p className="muted">Loading…</p></div>;
  return (
    <div className="shell">
      <aside className="sidebar">
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
