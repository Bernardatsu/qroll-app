import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import qrollLogo from "@/assets/qroll-logo.png";

let cachedLogoBase64: string | null = null;

export async function getLogoBase64(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 64;
          canvas.height = img.naturalHeight || 64;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            cachedLogoBase64 = canvas.toDataURL("image/png");
            resolve(cachedLogoBase64);
            return;
          }
        } catch {
          // fallback
        }
        resolve(qrollLogo);
      };
      img.onerror = () => resolve(qrollLogo);
      img.src = qrollLogo;
    } catch {
      resolve(qrollLogo);
    }
  });
}

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

export async function exportToPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const doc = new jsPDF();
  let startY = 28;

  try {
    const logoData = await getLogoBase64();
    if (logoData) {
      doc.addImage(logoData, "PNG", 14, 8, 14, 14);
      doc.setFontSize(14);
      doc.setTextColor(18, 41, 74);
      doc.text("QRoll — " + title, 32, 15);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Official Academic & Attendance Record · " + new Date().toLocaleString(), 32, 21);
      startY = 27;
    } else {
      doc.setFontSize(14);
      doc.setTextColor(18, 41, 74);
      doc.text("QRoll — " + title, 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(new Date().toLocaleString(), 14, 22);
    }
  } catch {
    doc.setFontSize(14);
    doc.setTextColor(18, 41, 74);
    doc.text("QRoll — " + title, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(new Date().toLocaleString(), 14, 22);
  }

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY,
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
