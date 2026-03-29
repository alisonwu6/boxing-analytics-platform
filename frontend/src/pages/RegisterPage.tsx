import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, UserPlus } from "lucide-react";
import { registerUser } from "../services/auth";

function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");

    if (!name || !email || !password) {
      setErrorMessage("Please complete all fields.");
      return;
    }

    try {
      setLoading(true);

      await registerUser({
        name,
        email,
        password,
      });

      navigate("/login");
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message ||
          "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

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

          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-wide">REGISTER</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Create your boxing analytics account
            </p>
          </div>

          <Link
            to="/"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-neutral-100"
          >
            <Home size={22} />
          </Link>
        </header>

        <main className="mt-8 flex-1">
          <div className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-neutral-700">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-2xl border border-neutral-200 bg-[#f8f8f8] px-4 py-4 text-sm outline-none transition focus:border-[#1697f6]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-neutral-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-2xl border border-neutral-200 bg-[#f8f8f8] px-4 py-4 text-sm outline-none transition focus:border-[#1697f6]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-neutral-700">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  className="w-full rounded-2xl border border-neutral-200 bg-[#f8f8f8] px-4 py-4 text-sm outline-none transition focus:border-[#1697f6]"
                />
              </div>

              {errorMessage && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1697f6] px-4 py-4 text-base font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.15)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserPlus size={18} />
                {loading ? "Registering..." : "Register"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-neutral-500">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-[#1697f6]">
                Login
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default RegisterPage;