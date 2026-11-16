import { StudioNav } from "./_components/nav";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <>
      <StudioNav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-8 sm:pt-14">{children}</main>
    </>
  );
}
