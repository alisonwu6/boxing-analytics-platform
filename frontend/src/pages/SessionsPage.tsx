import { useEffect, useState } from "react";
import AppShell from "../components/layout/AppShell";
import PageHeader from "../components/layout/PageHeader";
import StatusMessage from "../components/common/StatusMessage";
import { uploadSessionService } from "../services/uploadSessionService";
import { getErrorMessage } from "../utils/error";
import type { UploadSessionItem } from "../types/upload";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<UploadSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const data = await uploadSessionService.getUploadSessions();
        setSessions(data);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Sessions"
        subtitle="Select a saved boxing session for analysis"
        showBack
        backTo="/"
        showHome
      />

      <div className="px-4 pb-8 sm:px-6 md:px-8">
        {loading && <StatusMessage type="info" message="Loading sessions..." />}

        {!loading && errorMessage && (
          <StatusMessage type="error" message={errorMessage} />
        )}

        {!loading && !errorMessage && sessions.length === 0 && (
          <StatusMessage type="info" message="No sessions found yet." />
        )}

        {!loading && !errorMessage && sessions.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-[24px] bg-[#f8f8fb] p-5 shadow-sm transition hover:-translate-y-1"
              >
                <h2 className="mb-2 text-lg font-semibold text-[#6b46c1]">
                  Session {session.id.slice(0, 8)}
                </h2>

                <div className="space-y-1 text-sm text-gray-600">
                  <p>
                    <span className="font-medium">Status:</span>{" "}
                    {session.status || "Unknown"}
                  </p>
                  <p>
                    <span className="font-medium">CSV:</span>{" "}
                    {session.csvObjectKey ? "Uploaded" : "Not uploaded"}
                  </p>
                  <p>
                    <span className="font-medium">MOV:</span>{" "}
                    {session.movObjectKey ? "Uploaded" : "Not uploaded"}
                  </p>
                  <p>
                    <span className="font-medium">Created:</span>{" "}
                    {session.createdAt
                      ? new Date(session.createdAt).toLocaleString()
                      : "N/A"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}