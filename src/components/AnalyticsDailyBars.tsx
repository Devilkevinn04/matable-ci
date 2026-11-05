const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export function AnalyticsDailyBars<T extends { date: string }>({
  title,
  description,
  rows,
  valueFor,
  color,
  formatValue,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: T[];
  valueFor: (row: T) => number;
  color: string;
  formatValue: (value: number) => string;
  emptyMessage: string;
}) {
  const maxValue = Math.max(1, ...rows.map(valueFor));
  const tickIndexes = rows.length > 0
    ? Array.from(new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]))
    : [];

  return (
    <section className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5" aria-label={title}>
      <div>
        <h3 className="font-extrabold text-[#183b31]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {rows.length ? (
        <>
          <div className="mt-5 grid h-36 grid-cols-[36px_minmax(0,1fr)] gap-2 sm:h-44 sm:grid-cols-[48px_minmax(0,1fr)]">
            <div className="flex flex-col justify-between pb-1 text-right text-[10px] tabular-nums text-slate-400" aria-hidden="true">
              <span>{formatValue(maxValue)}</span>
              <span>{formatValue(Math.round(maxValue / 2))}</span>
              <span>0</span>
            </div>
            <div
              className="relative flex min-w-0 items-end gap-[3px] border-b border-l border-slate-200 px-1 pb-1"
              role="img"
              aria-label={`${title}: ${rows.map((row) => `${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${row.date}T12:00:00`))}, ${formatValue(valueFor(row))}`).join('; ')}`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col justify-between pb-1" aria-hidden="true">
                <span className="border-t border-dashed border-slate-100" />
                <span className="border-t border-dashed border-slate-100" />
                <span className="border-t border-slate-200" />
              </div>
              {rows.map((row) => {
                const value = valueFor(row);
                const height = value ? Math.max(4, (value / maxValue) * 100) : 0;
                return (
                  <div key={row.date} className="relative z-[1] flex h-full min-w-0 flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-3 rounded-t-[3px] transition-[height] duration-300 sm:max-w-4"
                      style={{ height: `${height}%`, backgroundColor: color, opacity: value ? 0.85 : 0.12 }}
                      title={`${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${row.date}T12:00:00`))} : ${formatValue(value)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="ml-10 mt-2 flex justify-between text-[10px] font-medium text-slate-400 sm:ml-14">
            {tickIndexes.map((index) => (
              <span key={rows[index].date}>{shortDateFormat.format(new Date(`${rows[index].date}T12:00:00`))}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 grid h-36 place-items-center rounded-xl bg-[#faf9f5] px-4 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}
