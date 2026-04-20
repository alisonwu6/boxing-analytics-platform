import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import PageHeader from "../components/layout/PageHeader";
import StatusMessage from "../components/common/StatusMessage";
import { authService } from "../services/authService";
import { getErrorMessage } from "../utils/error";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      await authService.register({
        name,
        email,
        password,
      });
      navigate("/home");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell className="max-w-2xl">
      <PageHeader
        title="Register"
        subtitle="Create your account to start using the boxing analytics platform"
      />

      <div className="px-4 pb-8 sm:px-6 md:px-8">
        <form
          onSubmit={handleRegister}
          className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-[24px] bg-[#f8f8fb] p-5 shadow-sm sm:p-6"
        >
          {errorMessage && <StatusMessage type="error" message={errorMessage} />}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-[#6b46c1]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-[#6b46c1]"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-[#6b46c1]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-[#6b46c1] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Register"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-[#6b46c1] hover:underline">
              Login
            </Link>
          </p>
        </form>
      </div>
    </AppShell>
  );
}