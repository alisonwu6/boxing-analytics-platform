import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import PageHeader from "../components/layout/PageHeader";
import { authService } from "../services/authService";

export default function HomePage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    authService.logout();
    navigate("/login");
  };

  return (
    <AppShell>
      <PageHeader
        title="Boxing Analytics"
        subtitle="Upload your training data, manage saved sessions, and review analytics insights"
      />

      <div className="grid grid-cols-1 gap-4 px-4 pb-8 sm:px-6 md:grid-cols-2 md:px-8">
        <Link
          to="/upload"
          className="rounded-[28px] bg-[#f8f8fb] p-6 shadow-sm transition hover:-translate-y-1"
        >
          <h2 className="mb-2 text-2xl font-semibold text-[#6b46c1]">Upload Data</h2>
          <p className="text-sm text-gray-600 sm:text-base">
            Create a new upload session and submit your CSV and MOV files.
          </p>
        </Link>

        <Link
          to="/sessions"
          className="rounded-[28px] bg-[#f8f8fb] p-6 shadow-sm transition hover:-translate-y-1"
        >
          <h2 className="mb-2 text-2xl font-semibold text-[#6b46c1]">Sessions</h2>
          <p className="text-sm text-gray-600 sm:text-base">
            View saved sessions and continue your analysis workflow.
          </p>
        </Link>

        <button
          onClick={handleLogout}
          className="rounded-[28px] bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 md:col-span-2"
        >
          <h2 className="mb-2 text-2xl font-semibold text-[#6b46c1]">Logout</h2>
          <p className="text-sm text-gray-600 sm:text-base">
            Sign out of your account safely.
          </p>
        </button>
      </div>
    </AppShell>
  );
}