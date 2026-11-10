import type { SaleDay } from "@/domain/batch4b";
function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function excelSales(rows: SaleDay[], labels: string[]) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const sheet = book.addWorksheet("Sales");
  sheet.addRow(labels);
  rows.forEach((r) => sheet.addRow([r.store, r.day, r.sales, r.total]));
  sheet.columns.forEach((c) => (c.width = 24));
  const data = await book.xlsx.writeBuffer();
  download(
    new Uint8Array(data),
    "phonehouse-sales.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
export async function pdfSales(rows: SaleDay[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("PHONE HOUSE — Ventes par magasin et jour", 14, 18);
  doc.setFontSize(10);
  doc.text("Magasin | Jour (Africa/Algiers) | Ventes | Total DZD", 14, 30);
  let y = 40;
  rows.forEach((r) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${r.store} | ${r.day} | ${r.sales} | ${r.total}`, 14, y);
    y += 8;
  });
  download(doc.output("arraybuffer"), "phonehouse-sales.pdf", "application/pdf");
}
