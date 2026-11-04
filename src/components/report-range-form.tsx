export function ReportRangeForm({ from, to }: { from: string; to: string }) {
  return (
    <form method="get" className="card">
      <div className="section-head">
        <div>
          <h2>بازه گزارش</h2>
          <small>بازه موردنظر را انتخاب کنید؛ پیش‌فرض از ابتدای هفته جاری تا امروز است.</small>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="report-from">از تاریخ</label>
          <input id="report-from" name="from" type="date" defaultValue={from} required />
        </div>
        <div className="field">
          <label htmlFor="report-to">تا تاریخ</label>
          <input id="report-to" name="to" type="date" defaultValue={to} required />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn btn-secondary" type="submit">
            نمایش گزارش
          </button>
        </div>
      </div>
    </form>
  );
}
