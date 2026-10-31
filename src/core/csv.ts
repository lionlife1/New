const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const toCsv = (rows: string[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");
