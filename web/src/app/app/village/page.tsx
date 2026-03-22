'use client';

import dynamic from 'next/dynamic';

const VillageScene = dynamic(
  () => import('@/components/village/VillageScene'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-foreground-muted">Loading village...</span>
        </div>
      </div>
    ),
  }
);

export default function VillagePage() {
  return (
    <div className="h-full w-full">
      <VillageScene />
    </div>
  );
}
