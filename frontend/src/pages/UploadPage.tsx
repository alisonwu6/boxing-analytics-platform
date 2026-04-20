import { useState } from "react";
import AppShell from "../components/layout/AppShell";
import PageHeader from "../components/layout/PageHeader";
import StatusMessage from "../components/common/StatusMessage";
import { uploadSessionService } from "../services/uploadSessionService";
import { getErrorMessage } from "../utils/error";

export default function UploadPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [movFile, setMovFile] = useState<File | null>(null);

  const [csvUploaded, setCsvUploaded] = useState(false);
  const [movUploaded, setMovUploaded] = useState(false);

  const [loadingCsv, setLoadingCsv] = useState(false);
  const [loadingMov, setLoadingMov] = useState(false);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const resetMessages = () => {
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handleUploadCsv = async () => {
    resetMessages();

    if (!csvFile) {
      setErrorMessage("Please select one CSV file first.");
      return;
    }

    setLoadingCsv(true);

    try {
      let currentSessionId = sessionId;

      if (!currentSessionId) {
        const createdSession = await uploadSessionService.createUploadSession();
        currentSessionId = createdSession.id;
        setSessionId(currentSessionId);
      }

      const csvPresign = await uploadSessionService.createPresignedUrl(currentSessionId, {
        fileType: "csv",
        fileName: csvFile.name,
        contentType: csvFile.type || "text/csv",
      });

      await uploadSessionService.uploadFileToStorage(csvPresign.uploadUrl, csvFile);

      await uploadSessionService.completeUpload(currentSessionId, {
        fileType: "csv",
        objectKey: csvPresign.objectKey,
      });

      setCsvUploaded(true);
      setSuccessMessage("CSV uploaded successfully. You can now upload the MOV file.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingCsv(false);
    }
  };

  const handleUploadMov = async () => {
    resetMessages();

    if (!csvUploaded) {
      setErrorMessage("Please upload the CSV file first.");
      return;
    }

    if (!movFile) {
      setErrorMessage("Please select one MOV file first.");
      return;
    }

    if (!sessionId) {
      setErrorMessage("Session not found. Please upload the CSV file again.");
      return;
    }

    setLoadingMov(true);

    try {
      const movPresign = await uploadSessionService.createPresignedUrl(sessionId, {
        fileType: "mov",
        fileName: movFile.name,
        contentType: movFile.type || "video/quicktime",
      });

      await uploadSessionService.uploadFileToStorage(movPresign.uploadUrl, movFile);

      await uploadSessionService.completeUpload(sessionId, {
        fileType: "mov",
        objectKey: movPresign.objectKey,
      });

      setMovUploaded(true);
      setSuccessMessage("MOV uploaded successfully. Your session is ready.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingMov(false);
    }
  };

  const handleReset = () => {
    setSessionId(null);
    setCsvFile(null);
    setMovFile(null);
    setCsvUploaded(false);
    setMovUploaded(false);
    setSuccessMessage("");
    setErrorMessage("");
  };

  return (
    <AppShell>
      <PageHeader
        title="Upload"
        subtitle="Upload your CSV file first, then upload your MOV file."
        showBack
        backTo="/home"
        showHome
      />

      <div className="px-4 pb-8 sm:px-6 md:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-[28px] bg-[#f8f8fb] p-5 shadow-sm sm:p-6">
          {errorMessage && <StatusMessage type="error" message={errorMessage} />}
          {successMessage && <StatusMessage type="success" message={successMessage} />}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-xl font-semibold text-[#6b46c1]">CSV File</h2>
              <p className="mb-4 text-sm text-gray-600">
                Select and upload one CSV file to start a new boxing session.
              </p>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                disabled={csvUploaded || loadingCsv}
                className="mb-3 block w-full text-sm text-gray-600 disabled:opacity-60"
              />

              <p className="mb-4 text-sm text-gray-500">
                {csvFile ? csvFile.name : "No CSV file selected."}
              </p>

              <button
                type="button"
                onClick={handleUploadCsv}
                disabled={!csvFile || csvUploaded || loadingCsv}
                className="w-full rounded-xl bg-[#6b46c1] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingCsv
                  ? "Uploading CSV..."
                  : csvUploaded
                  ? "CSV Uploaded"
                  : "Upload CSV"}
              </button>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-xl font-semibold text-[#6b46c1]">MOV File</h2>
              <p className="mb-4 text-sm text-gray-600">
                After the CSV upload is complete, select and upload one MOV file.
              </p>

              <input
                type="file"
                accept=".mov,video/quicktime"
                onChange={(e) => setMovFile(e.target.files?.[0] || null)}
                disabled={!csvUploaded || movUploaded || loadingMov}
                className="mb-3 block w-full text-sm text-gray-600 disabled:opacity-60"
              />

              <p className="mb-4 text-sm text-gray-500">
                {movFile ? movFile.name : "No MOV file selected."}
              </p>

              <button
                type="button"
                onClick={handleUploadMov}
                disabled={!csvUploaded || !movFile || movUploaded || loadingMov}
                className="w-full rounded-xl bg-[#6b46c1] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMov
                  ? "Uploading MOV..."
                  : movUploaded
                  ? "MOV Uploaded"
                  : "Upload MOV"}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}