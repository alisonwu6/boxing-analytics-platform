interface StatusMessageProps {
  type?: "error" | "success" | "info";
  message: string;
}

export default function StatusMessage({
  type = "info",
  message,
}: StatusMessageProps) {
  const styles = {
    error: "bg-red-50 text-red-600 border-red-100",
    success: "bg-green-50 text-green-700 border-green-100",
    info: "bg-blue-50 text-blue-700 border-blue-100",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm sm:text-base ${styles[type]}`}>
      {message}
    </div>
  );
}