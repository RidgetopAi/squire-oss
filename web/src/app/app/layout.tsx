import { AppLayout } from '@/components/layout';

export default function AppRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
