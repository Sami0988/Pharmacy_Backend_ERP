export function arrayToCsv(
  data: Record<string, any>[],
  columns?: { key: string; header: string }[],
): string {
  if (data.length === 0) return '';

  const cols = columns ?? Object.keys(data[0]).map((k) => ({ key: k, header: k }));
  const headers = cols.map((c) => c.header);
  const rows = data.map((row) =>
    cols
      .map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

export function sendCsv(res: any, filename: string, csvContent: string) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
}
