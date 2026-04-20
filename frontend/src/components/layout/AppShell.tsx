import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  className?: string;
}

export default function AppShell({
  children,
  className = "",
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#f5f6f8] px-4 py-6 sm:px-6 lg:px-8">
      <div
        className={`mx-auto w-full max-w-6xl rounded-[28px] bg-white/80 shadow-sm ${className}`}
      >
        {children}
      </div>
    </div>
  );
}