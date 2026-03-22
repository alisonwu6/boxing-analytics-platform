import { useState } from "react";
import {
  ArrowLeft,
  Upload,
  FileText,
  Film,
  X,
  CheckCircle2,
} from "lucide-react";

function UploadPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [movFile, setMovFile] = useState<File | null>(null);

  const handleCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setCsvFile(file);
  };

  const handleMovChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setMovFile(file);
  };

  const clearCsvFile = () => {
    setCsvFile(null);
  };

  const clearMovFile = () => {
    setMovFile(null);
  };

  const clearAllFiles = () => {
    setCsvFile(null);
    setMovFile(null);
  };

  const handleUpload = () => {
    if (!csvFile && !movFile) {
      alert("Please select at least one file to upload.");
      return;
    }

    alert("Upload action ready. Backend connection will be added next.");
  };

  return (
    <div className="min-h-screen bg-[#f3f3f3] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-8 pt-8">
        <header className="flex items-center gap-3 pt-4">
          <button className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-neutral-100">
            <ArrowLeft size={22} />
          </button>

          <div>
            <h1 className="text-2xl font-bold tracking-wide">UPLOAD DATA</h1>
            <p className="text-sm text-neutral-500">
              Add CSV and MOV files for analysis
            </p>
          </div>
        </header>

        <main className="mt-8 flex-1">
          <div className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="space-y-5">
              <section className="rounded-3xl bg-[#f8f8f8] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1697f6] text-white">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">CSV File</h2>
                    <p className="text-sm text-neutral-500">
                      Upload IMU or sensor dataset
                    </p>
                  </div>
                </div>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#1697f6] bg-[#edf7ff] px-4 py-8 text-center transition hover:bg-[#e4f3ff]">
                  <Upload className="mb-3 text-[#1697f6]" size={30} />
                  <span className="text-base font-medium text-[#1697f6]">
                    Choose CSV File
                  </span>
                  <span className="mt-1 text-sm text-neutral-500">
                    Supported format: .csv
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleCsvChange}
                  />
                </label>

                {csvFile && (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <CheckCircle2
                        size={20}
                        className="shrink-0 text-green-500"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {csvFile.name}
                        </p>
                        <p className="text-xs text-neutral-500">CSV selected</p>
                      </div>
                    </div>

                    <button
                      onClick={clearCsvFile}
                      className="ml-3 rounded-full p-2 transition hover:bg-neutral-100"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-3xl bg-[#f8f8f8] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1697f6] text-white">
                    <Film size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">MOV File</h2>
                    <p className="text-sm text-neutral-500">
                      Upload boxing session video
                    </p>
                  </div>
                </div>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#1697f6] bg-[#edf7ff] px-4 py-8 text-center transition hover:bg-[#e4f3ff]">
                  <Upload className="mb-3 text-[#1697f6]" size={30} />
                  <span className="text-base font-medium text-[#1697f6]">
                    Choose MOV File
                  </span>
                  <span className="mt-1 text-sm text-neutral-500">
                    Supported format: .mov
                  </span>
                  <input
                    type="file"
                    accept=".mov,video/quicktime"
                    className="hidden"
                    onChange={handleMovChange}
                  />
                </label>

                {movFile && (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <CheckCircle2
                        size={20}
                        className="shrink-0 text-green-500"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {movFile.name}
                        </p>
                        <p className="text-xs text-neutral-500">MOV selected</p>
                      </div>
                    </div>

                    <button
                      onClick={clearMovFile}
                      className="ml-3 rounded-full p-2 transition hover:bg-neutral-100"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>

        <footer className="mt-6 flex gap-3">
          <button
            onClick={clearAllFiles}
            className="flex-1 rounded-2xl bg-white px-4 py-4 text-base font-semibold text-black shadow-sm transition hover:bg-neutral-100"
          >
            Clear
          </button>

          <button
            onClick={handleUpload}
            className="flex-1 rounded-2xl bg-[#1697f6] px-4 py-4 text-base font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.15)] transition hover:opacity-95"
          >
            Upload
          </button>
        </footer>
      </div>
    </div>
  );
}

export default UploadPage;