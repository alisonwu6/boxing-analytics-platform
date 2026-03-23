import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Check,
  Home,
} from "lucide-react";

function InsightsPage() {
  const days = ["S", "M", "T", "W", "T", "F", "S"];

  const calendarRows = [
    [null, null, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11, 12],
    [13, 14, 15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24, 25, 26],
    [27, 28, 29, 30, 31, null, null],
  ];

  const trainingDays = new Set([1, 3, 8, 10, 12, 15, 17]);
  const matchDays = new Set([5, 12]);

  const selectedDay = 17;

  return (
    <div className="min-h-screen bg-[#f3f3f3] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-8 pt-8">
        <header className="flex flex-col items-center pt-6">
          <div className="mb-5 flex items-center justify-center">
            <img
              src="/logo-placeholder.svg"
              alt="Kivo Motion logo"
              className="h-14 object-contain"
            />
          </div>

          <h1 className="text-center text-[2.2rem] font-bold text-[#7A5AF8]">
            Insights
          </h1>
        </header>

        <main className="mt-8 flex-1">
          <section className="rounded-[2rem] bg-[#ece7f2] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="rounded-t-[2rem] bg-[#7A5AF8] px-6 py-5 text-center text-2xl font-semibold text-white">
              select session
            </div>

            <div className="px-6 py-6">
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[1.1rem] font-semibold text-[#4b4b4b]">
                  <span>August 2025</span>
                  <ChevronRight size={18} className="rotate-90" />
                </div>

                <div className="flex items-center gap-5 text-[#4b4b4b]">
                  <button className="rounded-full p-1 transition hover:bg-white/50">
                    <ChevronLeft size={24} />
                  </button>
                  <button className="rounded-full p-1 transition hover:bg-white/50">
                    <ChevronRight size={24} />
                  </button>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-7 gap-y-5 text-center">
                {days.map((day) => (
                  <div
                    key={day}
                    className="text-[1.05rem] font-medium text-[#2f2f2f]"
                  >
                    {day}
                  </div>
                ))}

                {calendarRows.flat().map((date, index) => {
                  const isSelected = date === selectedDay;
                  const hasTraining = date ? trainingDays.has(date) : false;
                  const hasMatch = date ? matchDays.has(date) : false;

                  return (
                    <div
                      key={`${date}-${index}`}
                      className="flex h-[62px] items-center justify-center"
                    >
                      {date ? (
                        <div className="relative flex h-12 w-12 items-center justify-center">
                          {isSelected ? (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7A5AF8] text-lg font-semibold text-white">
                              {date}
                            </div>
                          ) : (
                            <div className="text-lg font-medium text-[#2f2f2f]">
                              {date}
                            </div>
                          )}

                          {(hasTraining || hasMatch) && !isSelected && (
                            <div className="absolute bottom-0 flex items-center gap-1">
                              {hasTraining && (
                                <Circle
                                  size={8}
                                  fill="#2F5FD0"
                                  stroke="#2F5FD0"
                                />
                              )}
                              {hasMatch && (
                                <Circle
                                  size={8}
                                  fill="#F2A0A0"
                                  stroke="#F2A0A0"
                                />
                              )}
                            </div>
                          )}

                          {isSelected && (
                            <div className="absolute bottom-0 flex items-center gap-1">
                              {hasTraining && (
                                <Circle
                                  size={8}
                                  fill="#2F5FD0"
                                  stroke="#2F5FD0"
                                />
                              )}
                              {hasMatch && (
                                <Circle
                                  size={8}
                                  fill="#F2A0A0"
                                  stroke="#F2A0A0"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-2 rounded-lg bg-[#ddd2f2] px-3 py-1.5 text-sm font-medium text-[#6d5aa6]">
                  <Circle size={9} fill="#2F5FD0" stroke="#2F5FD0" />
                  <span>training</span>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-[#ddd2f2] px-3 py-1.5 text-sm font-medium text-[#6d5aa6]">
                  <Circle size={9} fill="#F2A0A0" stroke="#F2A0A0" />
                  <span>match</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-7 rounded-[2rem] bg-[#ece7f2] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="rounded-t-[2rem] bg-[#7A5AF8] px-6 py-5 text-center text-xl font-semibold text-white">
              Sessions: 17th August 2025
            </div>

            <div className="px-6 py-6">
              <div className="flex items-start justify-between">
                <div className="space-y-5 text-center w-full">
                  <p className="text-[1.05rem] font-semibold text-[#1f1f1f]">
                    Training: 6:30am - 7:30am
                  </p>
                  <p className="text-[1.05rem] font-semibold text-[#1f1f1f]">
                    Match: 9:30am - 11:30am
                  </p>
                </div>

                <div className="ml-3 pt-1 text-[#1f1f1f]">
                  <Check size={30} strokeWidth={2.5} />
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-10 flex items-center justify-center gap-12 pb-2 text-[#8d8d8d]">
          <button className="rounded-full p-2 transition hover:bg-white/70">
            <ChevronLeft size={28} />
          </button>

          <button className="flex h-16 w-16 items-center justify-center rounded-full text-[#7A5AF8] transition hover:bg-white/70">
            <Home size={42} strokeWidth={2.2} />
          </button>

          <button className="rounded-full p-2 transition hover:bg-white/70">
            <ChevronRight size={28} />
          </button>
        </footer>
      </div>
    </div>
  );
}

export default InsightsPage;