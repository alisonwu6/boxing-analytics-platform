import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Home,
  User,
  Upload,
  Layers3,
  ClipboardCheck,
} from "lucide-react";
import { getCurrentUser } from "../services/authService";

type CurrentUser = {
  id?: string;
  name?: string;
  email?: string;
};

function ProfilePage() {
  const navigate = useNavigate();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const data = await getCurrentUser();
        setUser(data);
      } catch (error: any) {
        setErrorMessage(
          error?.response?.data?.message ||
            "Unable to load profile information."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const displayName = user?.name || "Unknown User";
  const displayEmail = user?.email || "No email available";

  return (
    <div className="min-h-screen bg-[#f3f3f3] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-8 pt-8">
        <header className="flex items-center justify-between pt-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-neutral-100"
          >
            <ArrowLeft size={22} />
          </button>

          <div className="flex items-center justify-center">
            <img
              src="/logo-placeholder.svg"
              alt="Kivo Motion logo"
              className="h-12 object-contain"
            />
          </div>

          <Link
            to="/"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-neutral-100"
          >
            <Home size={22} />
          </Link>
        </header>

        <main className="mt-8 flex-1">
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-[#1f1f1f]">Profile</h1>
              <p className="mt-2 text-sm text-neutral-500">
                View your boxing analytics account details
              </p>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-[#f8f8f8] px-4 py-6 text-center text-sm text-neutral-500">
                Loading profile...
              </div>
            ) : errorMessage ? (
              <div className="rounded-2xl bg-red-50 px-4 py-4 text-sm text-red-600">
                {errorMessage}
              </div>
            ) : (
              <>
                <div className="space-y-6">
                  <div>
                    <p className="text-3xl font-bold text-[#4a4a4a]">
                      {displayName}
                    </p>
                    <p className="mt-1 text-xl text-[#5a5a5a]">
                      {displayEmail}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#4a4a4a]">
                      Sport
                    </p>
                    <p className="mt-1 text-xl text-[#5a5a5a]">Boxing</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#4a4a4a]">Club</p>
                    <p className="mt-1 text-xl text-[#5a5a5a]">Not set</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#4a4a4a]">
                      Specialty
                    </p>
                    <p className="mt-1 text-xl text-[#5a5a5a]">Not set</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#4a4a4a]">Role</p>
                    <p className="mt-1 text-xl text-[#5a5a5a]">Athlete</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#4a4a4a]">
                      Account Status
                    </p>
                    <p className="mt-1 text-xl text-[#5a5a5a]">Active</p>
                  </div>
                </div>

                <button className="mt-10 w-full rounded-2xl bg-[#1697f6] px-4 py-4 text-lg font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.15)] transition hover:opacity-95">
                  Edit Profile
                </button>
              </>
            )}
          </div>
        </main>

        <nav className="mt-8 rounded-3xl bg-white px-6 py-4 shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between text-black">
            <Link
              to="/profile"
              className="rounded-full p-2 text-[#1697f6] transition hover:bg-neutral-100"
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

export default ProfilePage;