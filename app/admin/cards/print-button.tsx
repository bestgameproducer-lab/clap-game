'use client';

export function PrintButton() {
  return <button className="print-cards-button" onClick={() => window.print()}>打印 / 保存为 PDF</button>;
}
