'use client';

import { CasinoProvider } from './CasinoContext';

export default function CasinoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CasinoProvider>
      {children}
    </CasinoProvider>
  );
}
