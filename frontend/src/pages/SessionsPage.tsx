import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Home,
  Play,
  Activity,
  Upload,
  Layers3,
  ClipboardCheck,
} from "lucide-react";

type SessionType = "training" | "match";

type SessionRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  type: SessionType;
  startTime: string;
  endTime: string;
  csvAvailable: boolean;
  movAvailable: boolean;
  status: "saved" | "processing" | "complete";
};

const mockSessions: SessionRecord[] = [
  {
    id: "sess_001",
    date: "2025-08-05",
    type: "training",
    startTime: "6:30am",
    endTime: "7:30am",
    csvAvailable: true,
    movAvailable: true,
    status: "saved",
  },
  {
    id: "sess_002",
    date: "2025-08-05",
    type: "match",
    startTime: "9:30am",
    endTime: "11:30am",
    csvAvailable: true,
    movAvailable: true,
    status: "complete",
  },
  {
    id: "sess_003",
    date: "2025-08-12",
    type: "training",
    startTime: "5:00pm",
    endTime: "6:00pm",
    csvAvailable: true,
    movAvailable: false,
    status: "saved",
  },
  {
    id: "sess_004",
    date: "2025-08-17",
    type: "training",
    startTime: "6:30am",
    endTime: "7:30am",
    csvAvailable: true,
    movAvailable: true,
    status: "saved",
  },
  {
    id: "sess_005",
    date: "2025-08-17",
    type: "match",
    startTime: "9:30am",
    endTime: "11:30am",
    csvAvailable: true,
    movAvailable: true,
    status: "saved",
  },
  {
    id: "sess_006",
    date: "2025-08-22",
    type: "training",
    startTime: "4:00pm",
    endTime: "5:15pm",
    csvAvailable: true,
    movAvailable: true,
    status: "processing",
  },
];

function formatMonthYear(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
}

function formatSelectedDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDate();
  const monthYear = date.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
      ? "rd"
      : "th";

  return `${day}${suffix} ${monthYear}`;
}

function getDaysGrid(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const grid: (number | null)[] = [];

  for (let i = 0; i < firstDay; i += 1) {
    grid.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    grid.push(day);
  }

  while (grid.length % 7 !== 0) {
    grid.push(null);
  }

  return grid;
}

function SessionsPage() {
  const navigate = useNavigate();
  const days = ["S", "M", "T", "W", "T", "F", "S"];

  const [currentYear, setCurrentYear] = useState(2025);
  const [currentMonth, setCurrentMonth] = useState(7); // August = 7
  const [selectedDate, setSelectedDate] = useState("2025-08-17");

  const monthLabel = formatMonthYear(currentYear, currentMonth);
  const daysGrid = getDaysGrid(currentYear, currentMonth);

  const sessionsInCurrentMonth = useMemo(() => {
    return mockSessions.filter((session) => {
      const date = new Date(`${session.date}T00:00:00`);
      return (
        date.getFullYear() === currentYear &&
        date.getMonth() === currentMonth
      );
    });
  }, [currentYear, currentMonth]);

  const trainingDays = useMemo(() => {
    const set = new Set<number>();
    sessionsInCurrentMonth.forEach((session) => {
      if (session.type === "training") {
        set.add(new Date(`${session.date}T00:00:00`).getDate());
      }
    });
    return set;
  }, [sessionsInCurrentMonth]);

  const matchDays = useMemo(() => {
    const set = new Set<number>();
    sessionsInCurrentMonth.forEach((session) => {
      if (session.type === "match") {
        set.add(new Date(`${session.date}T00:00:00`).getDate());
      }
    });
    return set;
  }, [sessionsInCurrentMonth]);

  const sessionsForSelectedDate = useMemo(() => {
    return mockSessions.filter((session) => session.date === selectedDate);
  }, [selectedDate]);

  const goPrevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const goNextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  const handleSelectDate = (day: number) => {
    const month = String(currentMonth + 1).padStart(2, "0");
    const date = String(day).padStart(2, "0");
    setSelectedDate(`${currentYear}-${month}-${date}`);
  };

  const handleAnalyzeSession = () => {
    if (sessionsForSelectedDate.length === 0) return;
    navigate("/insights");
  };

  return (
    <div className="min-h-screen bg-[#f3f3f3] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-5 pt-5">
        <header className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-neutral-100"
          >
            <ChevronLeft size={22} />
          </button>

          <div className="text-center">
            <h1 className="text-[1.9rem] font-bold text-[#7A5AF8]">Sessions</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Select a saved boxing session for analysis
            </p>
          </div>

          <Link
            to="/"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-neutral-100"
          >
            <Home size={21} />
          </Link>
        </header>

        <main className="mt-4 flex-1">
          <section className="rounded-[1.8rem] bg-[#ece7f2] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <div className="rounded-t-[1.8rem] bg-[#7A5AF8] px-5 py-4 text-center text-xl font-semibold text-white">
              select session
            </div>

            <div className="px-5 py-4">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-base font-semibold text-[#4b4b4b]">
                  <span>{monthLabel}</span>
                </div>

                <div className="flex items-center gap-3 text-[#4b4b4b]">
                  <button
                    onClick={goPrevMonth}
                    className="rounded-full p-1 transition hover:bg-white/50"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={goNextMonth}
                    className="rounded-full p-1 transition hover:bg-white/50"
                  >
                    <ChevronRight size={22} />
                  </button>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-7 gap-y-3 text-center">
                {days.map((day) => (
                  <div
                    key={day}
                    className="text-sm font-medium text-[#2f2f2f]"
                  >
                    {day}
                  </div>
                ))}

                {daysGrid.map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="h-[52px]" />;
                  }

                  const dateKey = `${currentYear}-${String(
                    currentMonth + 1
                  ).padStart(2, "0")}-${String(date).padStart(2, "0")}`;

                  const isSelected = dateKey === selectedDate;
                  const hasTraining = trainingDays.has(date);
                  const hasMatch = matchDays.has(date);

                  return (
                    <div
                      key={dateKey}
                      className="flex h-[52px] items-center justify-center"
                    >
                      <button
                        onClick={() => handleSelectDate(date)}
                        className="relative flex h-10 w-10 items-center justify-center"
                      >
                        {isSelected ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7A5AF8] text-base font-semibold text-white">
                            {date}
                          </div>
                        ) : (
                          <div className="text-base font-medium text-[#2f2f2f]">
                            {date}
                          </div>
                        )}

                        {(hasTraining || hasMatch) && (
                          <div className="absolute bottom-0 flex items-center gap-1">
                            {hasTraining && (
                              <Circle
                                size={7}
                                fill="#2F5FD0"
                                stroke="#2F5FD0"
                              />
                            )}
                            {hasMatch && (
                              <Circle
                                size={7}
                                fill="#F2A0A0"
                                stroke="#F2A0A0"
                              />
                            )}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-[#ddd2f2] px-3 py-1 text-xs font-medium text-[#6d5aa6]">
                  <Circle size={8} fill="#2F5FD0" stroke="#2F5FD0" />
                  <span>training</span>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-[#ddd2f2] px-3 py-1 text-xs font-medium text-[#6d5aa6]">
                  <Circle size={8} fill="#F2A0A0" stroke="#F2A0A0" />
                  <span>match</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-[1.8rem] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1f1f1f]">
                {formatSelectedDate(selectedDate)}
              </h2>

              {sessionsForSelectedDate.length > 0 && (
                <span className="rounded-full bg-[#e9f3ff] px-3 py-1 text-xs font-semibold text-[#2F5FD0]">
                  saved session
                </span>
              )}
            </div>

            {sessionsForSelectedDate.length > 0 ? (
              <>
                <div className="space-y-3">
                  {sessionsForSelectedDate.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-2xl bg-[#f8f8f8] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold capitalize text-[#1f1f1f]">
                          {session.type} Session
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                            session.status === "complete"
                              ? "bg-green-100 text-green-700"
                              : session.status === "processing"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {session.status}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-neutral-500">
                        {session.startTime} - {session.endTime} ·
                        {session.csvAvailable ? " CSV" : ""}{" "}
                        {session.movAvailable ? "+ MOV" : ""}
                      </p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAnalyzeSession}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7A5AF8] px-4 py-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.15)] transition hover:opacity-95"
                >
                  <Play size={18} />
                  Analyze Session
                </button>

                <p className="mt-3 text-center text-xs text-neutral-500">
                  Saved files will be retrieved from cloud storage and sent to
                  the backend for analysis.
                </p>
              </>
            ) : (
              <div className="rounded-2xl bg-[#f8f8f8] px-4 py-6 text-center">
                <p className="text-sm font-medium text-neutral-700">
                  No saved sessions for this date.
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Choose another day or upload a new boxing session.
                </p>
              </div>
            )}
          </section>
        </main>

        <nav className="mt-5 rounded-3xl bg-white px-5 py-3 shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between text-black">
            <Link
              to="/sessions"
              className="rounded-full p-2 text-[#7A5AF8] transition hover:bg-neutral-100"
            >
              <Activity size={22} />
            </Link>

            <Link
              to="/upload"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <Upload size={22} />
            </Link>

            <Link
              to="/"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-md"
            >
              <Home size={22} />
            </Link>

            <Link
              to="/sessions"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <Layers3 size={22} />
            </Link>

            <Link
              to="/reports"
              className="rounded-full p-2 text-black transition hover:bg-neutral-100"
            >
              <ClipboardCheck size={22} />
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default SessionsPage;