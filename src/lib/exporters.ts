import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportToExcel(rows: Record<string, unknown>[], filename: string, sheet = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

export function exportToPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.setTextColor(18, 41, 74);
  doc.text("QRoll — " + title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(new Date().toLocaleString(), 14, 22);
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [18, 41, 74], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [237, 244, 252] },
  });

  doc.save(`${filename}.pdf`);
}

export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
}
