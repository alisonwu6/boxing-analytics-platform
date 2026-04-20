import { Link } from "react-router-dom";
import { ChevronLeft, Home } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  showHome?: boolean;
}

export default function PageHeader({
  title,
  subtitle,
  showBack = false,
  backTo = "/home",
  showHome = false,
}: PageHeaderProps) {
  return (
    <div className="relative flex flex-col items-center gap-3 px-4 pt-8 pb-6 sm:px-6 md:pt-10 md:pb-8">
      {showBack && (
        <Link
          to={backTo}
          className="absolute left-4 top-8 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:scale-105 sm:left-6 md:top-10"
        >
          <ChevronLeft className="h-5 w-5 text-[#6b46c1]" />
        </Link>
      )}

      {showHome && (
        <Link
          to="/home"
          className="absolute right-4 top-8 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:scale-105 sm:right-6 md:top-10"
        >
          <Home className="h-5 w-5 text-[#6b46c1]" />
        </Link>
      )}

      <h1 className="text-center text-3xl font-bold tracking-tight text-[#6b46c1] sm:text-4xl md:text-5xl">
        {title}
      </h1>

      {subtitle && (
        <p className="max-w-2xl text-center text-sm text-gray-500 sm:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}