import { Link } from "react-router-dom";
import {
  User,
  Upload,
  Download,
  Home,
  Layers3,
  ClipboardCheck,
} from "lucide-react";

function HomePage() {
  const token = localStorage.getItem("token");
  const isLoggedIn = Boolean(token);

  const actions = [
    {
      title: "Upload Data",
      icon: Upload,
      path: "/upload",
    },
    {
      title: "Sessions",
      icon: Layers3,
      path: "/sessions",
    },
    {
      title: "Export Data",
      icon: Download,
      path: "/reports",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f3f3f3] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-8 pt-8">
        <header className="pt-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="w-20" />

            <div className="flex h-16 w-16 items-center justify-center rounded-full">
              <img
                src="/logo-placeholder.svg"
                alt="Kivo Motion logo"
                className="h-14 w-14 object-contain"
              />
            </div>

            <div className="flex w-20 justify-end">
              <Link
                to={isLoggedIn ? "/profile" : "/login"}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-neutral-100"
              >
                {isLoggedIn ? "Profile" : "Login"}
              </Link>
            </div>
          </div>

          <h1 className="text-center text-3xl font-bold tracking-wide">
            DATA MANAGEMENT
          </h1>

          <p className="mx-auto mt-3 max-w-xs text-center text-sm text-neutral-500">
            Manage boxing session data and analysis files
          </p>
        </header>

        <main className="mt-10 flex-1">
          <div className="rounded-3xl bg-[#efefef] px-5 py-6 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-5">
              {actions.map((action) => {
                const Icon = action.icon;

                return (
                  <Link
                    key={action.title}
                    to={action.path}
                    className="flex min-h-[120px] items-center gap-5 rounded-3xl bg-[#1697f6] px-6 py-6 text-left text-white shadow-[0_8px_18px_rgba(0,0,0,0.15)] transition hover:translate-y-[-1px] hover:shadow-[0_10px_22px_rgba(0,0,0,0.18)]"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                      <Icon size={34} strokeWidth={2.2} />
                    </div>

                    <div>
                      <p className="text-2xl font-semibold leading-none">
                        {action.title}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </main>

        <nav className="mt-8 rounded-3xl bg-white px-6 py-4 shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between text-black">
            <Link
              to="/profile"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <User size={24} />
            </Link>

            <Link
              to="/upload"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <Upload size={24} />
            </Link>

            <Link
              to="/"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-md"
            >
              <Home size={24} />
            </Link>

            <Link
              to="/sessions"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <Layers3 size={24} />
            </Link>

            <Link
              to="/reports"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <ClipboardCheck size={24} />
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default HomePage;