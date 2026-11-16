import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, DebtPaymentRecord, UserRole } from '../types/index.ts';

export const STORE_IDENTITY = {
  name: 'TOKO SUMBER SEWU',
  address: 'Ngarip, Ulubelu',
  phone: 'WA: 082281813460',
};

const INDONESIAN_MONTHS_FULL = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export interface ReportTransactionRow {
  no: number;
  invoiceNumber: string;
  effectiveTimestamp: string;
  saleCreatedTimestamp: string;
  customerName: string;
  customerPhone?: string;
  deliveryType: 'pickup' | 'delivery';
  paymentMethodLabel: string;
  paymentStatusLabel: string;
  paymentStatusKey: 'paid' | 'partial' | 'unpaid';
  isInstallmentFollowUp: boolean;
  itemsSummary: string[];
  itemsCsvText: string;
  nominalTrx: number;
  discount: number;
  deliveryFee: number;
  paidAmount: number;
  remainingDebt: number;
  feeAmount: number;
  marginPercent: string;
}

export interface FinancialReportDataset {
  fromDate: string;
  toDate: string;
  rows: ReportTransactionRow[];
  totalTransactions: number;
  totalNominalTrx: number;
  totalPaid: number;
  totalRemainingDebt: number;
  totalFee: number;
}

export interface FinancialReportMeta {
  recipientName: string;
  recipientRole: UserRole | string;
  printedAt?: Date;
}

export function extractLocalYMD(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10);
    }
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatRoleLabel(role: UserRole | string): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Kepala Toko';
    case 'cashier':
      return 'Kasir';
    case 'technician':
      return 'Teknisi';
    default:
      return String(role || 'Staff');
  }
}

export function formatIndonesianDateLong(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const monthName = INDONESIAN_MONTHS_FULL[monthIdx] || parts[1];
  return `${day} ${monthName} ${year}`;
}

export function formatIndonesianDateTimeWIB(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = INDONESIAN_MONTHS_FULL[d.getMonth()] || String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm} WIB`;
}

export function formatShortDateTime(val: string): string {
  const d = new Date(val);
  if (isNaN(d.getTime())) return val || '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('id-ID', { month: 'short' });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

export function formatRupiahPlain(val: number): string {
  const abs = Math.abs(Math.round(val || 0));
  const formatted = abs.toLocaleString('id-ID');
  return val < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

export function formatFeeSigned(val: number): string {
  const rounded = Math.round(val || 0);
  const absFormatted = Math.abs(rounded).toLocaleString('id-ID');
  if (rounded < 0) return `-Rp ${absFormatted}`;
  return `+Rp ${absFormatted}`;
}

export function buildReportFilename(
  fromDate: string,
  toDate: string,
  format: 'pdf' | 'csv'
): string {
  const base =
    fromDate === toDate
      ? `Laporan_Transaksi_Finansial_${fromDate}`
      : `Laporan_Transaksi_Finansial_${fromDate}_sd_${toDate}`;
  return `${base}.${format}`;
}

export function formatMethodLabel(method: string): string {
  const m = String(method || 'cash').toLowerCase();
  if (m === 'qris') return 'QRIS';
  if (m === 'transfer') return 'Transfer Bank';
  if (m === 'debt') return 'Hutang / Tempo';
  return 'Tunai (Cash)';
}

export function buildFinancialReportDataset(
  allSales: Sale[],
  fromDate: string,
  toDate: string
): FinancialReportDataset {
  if (!fromDate || !toDate || fromDate > toDate) {
    return {
      fromDate,
      toDate,
      rows: [],
      totalTransactions: 0,
      totalNominalTrx: 0,
      totalPaid: 0,
      totalRemainingDebt: 0,
      totalFee: 0,
    };
  }

  const matchedRows: Omit<ReportTransactionRow, 'no'>[] = [];

  for (const sale of allSales) {
    const saleYmd = extractLocalYMD(sale.createdAt);
    const isCreatedInRange = Boolean(saleYmd && saleYmd >= fromDate && saleYmd <= toDate);

    const isDebt = String(sale.paymentMethod || '').toLowerCase() === 'debt';
    let payments: DebtPaymentRecord[] = Array.isArray(sale.paymentHistory)
      ? sale.paymentHistory
      : [];

    if (!isDebt && payments.length === 0) {
      const m = String(sale.paymentMethod || 'cash').toLowerCase();
      const normMethod: 'cash' | 'transfer' | 'qris' =
        m === 'transfer' || m === 'qris' ? m : 'cash';
      payments = [
        {
          id: `full-${sale.invoiceNumber}`,
          amount: Number(sale.grandTotal || 0),
          method: normMethod,
          paidAt: sale.createdAt,
          receivedBy: sale.cashierUid || 'Kasir',
        },
      ];
    } else if (isDebt && payments.length === 0 && Number(sale.paidTotal || 0) > 0) {
      payments = [
        {
          id: `dp-${sale.invoiceNumber}`,
          amount: Number(sale.paidTotal || 0),
          method: sale.dpMethod || 'cash',
          paidAt: sale.createdAt,
          receivedBy: sale.cashierUid || 'Kasir',
        },
      ];
    }

    const paymentsInRange = payments.filter((p) => {
      const pYmd = extractLocalYMD(p.paidAt);
      return Boolean(pYmd && pYmd >= fromDate && pYmd <= toDate);
    });

    if (!isCreatedInRange && paymentsInRange.length === 0) {
      continue;
    }

    const grandTotal = Number(sale.grandTotal || 0);
    const totalCost = Number(sale.totalCost || 0);
    const rawTotalProfit =
      typeof sale.totalProfit === 'number' ? sale.totalProfit : grandTotal - totalCost;

    const paidInRange =
      paymentsInRange.length > 0
        ? paymentsInRange.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        : 0;

    const effectivePaid = Math.min(grandTotal, Math.max(0, paidInRange));
    const ratio = grandTotal > 0 ? Math.min(1, effectivePaid / grandTotal) : 1;
    const feeAmount = effectivePaid > 0 ? Math.round(rawTotalProfit * ratio) : 0;
    const remainingDebt = Math.max(0, Number(sale.remainingDebt || 0));

    let paymentStatusKey: 'paid' | 'partial' | 'unpaid' = 'paid';
    let paymentStatusLabel = 'LUNAS';
    if (remainingDebt > 0) {
      if (Number(sale.paidTotal || 0) > 0 || effectivePaid > 0) {
        paymentStatusKey = 'partial';
        paymentStatusLabel = 'CICILAN / DP';
      } else {
        paymentStatusKey = 'unpaid';
        paymentStatusLabel = 'BELUM LUNAS';
      }
    }

    const isInstallmentFollowUp = !isCreatedInRange && paymentsInRange.length > 0;
    const effectiveTimestamp =
      paymentsInRange.length > 0
        ? paymentsInRange[paymentsInRange.length - 1].paidAt
        : sale.createdAt;

    // Method label summarizing actual methods received in period
    let paymentMethodLabel = formatMethodLabel(sale.paymentMethod || 'cash');
    if (paymentsInRange.length > 0) {
      const uniqueMethods = Array.from(
        new Set(paymentsInRange.map((p) => formatMethodLabel(p.method)))
      );
      paymentMethodLabel = isDebt
        ? `Tempo (${uniqueMethods.join(', ')})`
        : uniqueMethods.join(', ');
    }

    const items = Array.isArray(sale.items) ? sale.items : [];
    const itemsSummary =
      items.length > 0
        ? items.slice(0, 3).map((it) => {
            const unitStr = it.unit ? ` ${it.unit}` : '';
            return `• ${it.productName} (${it.quantity}${unitStr})`;
          })
        : ['• Item penjualan'];
    if (items.length > 3) {
      itemsSummary.push(`  +${items.length - 3} item lainnya`);
    }

    const itemsCsvText =
      items.length > 0
        ? items
            .map((it) => {
              const unitStr = it.unit ? ` ${it.unit}` : '';
              return `${it.productName} (${it.quantity}${unitStr} x ${formatRupiahPlain(it.sellingPrice)})`;
            })
            .join('; ')
        : '-';

    const marginPercent =
      effectivePaid > 0 ? `${((feeAmount / effectivePaid) * 100).toFixed(1)}%` : '0.0%';

    matchedRows.push({
      invoiceNumber: sale.invoiceNumber,
      effectiveTimestamp,
      saleCreatedTimestamp: sale.createdAt,
      customerName: sale.customerName || 'Pelanggan Umum',
      customerPhone: sale.customerPhone,
      deliveryType: sale.deliveryType === 'delivery' ? 'delivery' : 'pickup',
      paymentMethodLabel,
      paymentStatusLabel,
      paymentStatusKey,
      isInstallmentFollowUp,
      itemsSummary,
      itemsCsvText,
      nominalTrx: grandTotal,
      discount: Number(sale.discount || 0),
      deliveryFee: Number(sale.deliveryFee || 0),
      paidAmount: effectivePaid,
      remainingDebt,
      feeAmount,
      marginPercent,
    });
  }

  // Sort chronologically (oldest to newest like a bank ledger)
  matchedRows.sort(
    (a, b) =>
      new Date(a.effectiveTimestamp).getTime() - new Date(b.effectiveTimestamp).getTime()
  );

  const rows: ReportTransactionRow[] = matchedRows.map((r, idx) => ({
    no: idx + 1,
    ...r,
  }));

  const totalNominalTrx = rows.reduce((s, r) => s + r.nominalTrx, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalRemainingDebt = rows.reduce((s, r) => s + r.remainingDebt, 0);
  const totalFee = rows.reduce((s, r) => s + r.feeAmount, 0);

  return {
    fromDate,
    toDate,
    rows,
    totalTransactions: rows.length,
    totalNominalTrx,
    totalPaid,
    totalRemainingDebt,
    totalFee,
  };
}

export function generateFinancialReportPDF(
  dataset: FinancialReportDataset,
  meta: FinancialReportMeta
): void {
  const printedDate = meta.printedAt || new Date();
  const printedWIB = formatIndonesianDateTimeWIB(printedDate);
  const periodText =
    dataset.fromDate === dataset.toDate
      ? formatIndonesianDateLong(dataset.fromDate)
      : `${formatIndonesianDateLong(dataset.fromDate)} s/d ${formatIndonesianDateLong(dataset.toDate)}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2; // 186mm

  // ==============================================================
  // B. KOTAK METADATA & RINGKASAN (Halaman 1, di bawah Header)
  // ==============================================================
  const boxY = 35;
  const boxH = 34;

  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, boxY, contentWidth, boxH, 2.2, 2.2, 'FD');

  // Vertical divider inside summary box
  const midX = marginX + 102;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(midX, boxY + 4, midX, boxY + boxH - 4);

  // Kolom Kiri (Metadata)
  const leftLabelX = marginX + 4.5;
  const leftColonX = marginX + 35.5;
  const leftValueX = marginX + 38;
  const metaRows = [
    ['Judul Laporan', 'Laporan Keuangan'],
    ['Kepada Yth', `${meta.recipientName} (${formatRoleLabel(meta.recipientRole)})`],
    ['Tanggal Laporan', printedWIB],
    ['Periode Transaksi', periodText],
  ];

  metaRows.forEach(([label, value], idx) => {
    const rowY = boxY + 7.5 + idx * 6.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(label, leftLabelX, rowY);
    doc.text(':', leftColonX, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    const maxValWidth = midX - leftValueX - 3;
    const fittedVal = doc.splitTextToSize(value, maxValWidth)[0] || value;
    doc.text(fittedVal, leftValueX, rowY);
  });

  // Kolom Kanan (Ringkasan Angka, rata kanan)
  const rightLabelX = midX + 5;
  const rightValueX = marginX + contentWidth - 4.5;

  const summaryItems: Array<{ label: string; value: string; color: [number, number, number] }> = [
    {
      label: 'Total Transaksi',
      value: `${dataset.totalTransactions} Transaksi`,
      color: [15, 23, 42],
    },
    {
      label: 'Total Nominal Trx',
      value: formatRupiahPlain(dataset.totalNominalTrx),
      color: [15, 23, 42],
    },
    {
      label: 'Total Bayar',
      value: formatRupiahPlain(dataset.totalPaid),
      color: [30, 58, 138],
    },
    {
      label: 'Total Fee',
      value: formatFeeSigned(dataset.totalFee),
      color: dataset.totalFee >= 0 ? [4, 120, 87] : [190, 18, 60], // Hijau jika >= 0, Merah jika < 0
    },
    {
      label: 'Total Piutang (Belum Lunas)',
      value: formatRupiahPlain(dataset.totalRemainingDebt),
      color: dataset.totalRemainingDebt > 0 ? [190, 18, 60] : [100, 116, 139],
    },
  ];

  summaryItems.forEach((item, idx) => {
    const rowY = boxY + 6.5 + idx * 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, rightLabelX, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.value, rightValueX, rowY, { align: 'right' });
  });

  // ==============================================================
  // D. SEKSI "RINCIAN MUTASI & RIWAYAT TRANSAKSI"
  // ==============================================================
  const sectionY = boxY + boxH + 7.5;
  doc.setFillColor(30, 58, 138); // Navy accent bar
  doc.rect(marginX, sectionY - 3.3, 2, 4.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('RINCIAN MUTASI & RIWAYAT TRANSAKSI', marginX + 4, sectionY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Menampilkan ${dataset.totalTransactions} transaksi`,
    marginX + contentWidth,
    sectionY,
    { align: 'right' }
  );

  // Prepare custom multi-line cell models
  interface StyledLine {
    text: string;
    bold?: boolean;
    fontSize?: number;
    color?: [number, number, number];
  }
  interface CustomRowMeta {
    cols: Record<number, { align: 'left' | 'right'; lines: StyledLine[] }>;
  }

  const rowMetas: CustomRowMeta[] = [];

  const bodyRows = dataset.rows.map((r) => {
    const fakturLines: StyledLine[] = [
      { text: r.invoiceNumber, bold: true, fontSize: 7.4, color: [30, 58, 138] },
      {
        text: `${formatShortDateTime(r.effectiveTimestamp)} WIB`,
        bold: false,
        fontSize: 6.6,
        color: [100, 116, 139],
      },
      {
        text: r.paymentMethodLabel,
        bold: true,
        fontSize: 6.5,
        color: [71, 85, 105],
      },
    ];
    if (r.isInstallmentFollowUp) {
      fakturLines.push({
        text: `Cicilan Faktur ${formatShortDateTime(r.saleCreatedTimestamp).split(',')[0]}`,
        bold: false,
        fontSize: 6.2,
        color: [180, 83, 9],
      });
    }

    const custHeader =
      r.deliveryType === 'delivery'
        ? `${r.customerName} [Armada]`
        : r.customerName;
    const fittedCustHeader = doc.splitTextToSize(custHeader, 52)[0] || custHeader;
    const itemStyledLines: StyledLine[] = [
      { text: fittedCustHeader, bold: true, fontSize: 7.5, color: [15, 23, 42] },
    ];
    r.itemsSummary.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, 52) as string[];
      wrapped.forEach((w) => {
        itemStyledLines.push({
          text: w,
          bold: false,
          fontSize: 6.6,
          color: [71, 85, 105],
        });
      });
    });

    const nominalLines: StyledLine[] = [
      { text: formatRupiahPlain(r.nominalTrx), bold: true, fontSize: 7.5, color: [15, 23, 42] },
    ];
    if (r.discount > 0) {
      nominalLines.push({
        text: `Disc: -${formatRupiahPlain(r.discount)}`,
        bold: false,
        fontSize: 6.3,
        color: [100, 116, 139],
      });
    }
    if (r.deliveryFee > 0) {
      nominalLines.push({
        text: `Ongkir: +${formatRupiahPlain(r.deliveryFee)}`,
        bold: false,
        fontSize: 6.3,
        color: [100, 116, 139],
      });
    }

    const bayarLines: StyledLine[] = [
      { text: formatRupiahPlain(r.paidAmount), bold: true, fontSize: 7.5, color: [15, 23, 42] },
      {
        text: r.paymentStatusLabel,
        bold: true,
        fontSize: 6.4,
        color:
          r.paymentStatusKey === 'paid'
            ? [4, 120, 87]
            : r.paymentStatusKey === 'partial'
            ? [180, 83, 9]
            : [190, 18, 60],
      },
    ];
    if (r.remainingDebt > 0) {
      bayarLines.push({
        text: `Sisa: ${formatRupiahPlain(r.remainingDebt)}`,
        bold: false,
        fontSize: 6.3,
        color: [190, 18, 60],
      });
    }

    const feeLines: StyledLine[] = [
      {
        text: formatFeeSigned(r.feeAmount),
        bold: true,
        fontSize: 7.5,
        color: r.feeAmount >= 0 ? [4, 120, 87] : [190, 18, 60],
      },
      {
        text: `Margin: ${r.marginPercent}`,
        bold: false,
        fontSize: 6.4,
        color: [100, 116, 139],
      },
    ];

    rowMetas.push({
      cols: {
        1: { align: 'left', lines: fakturLines },
        2: { align: 'left', lines: itemStyledLines },
        3: { align: 'right', lines: nominalLines },
        4: { align: 'right', lines: bayarLines },
        5: { align: 'right', lines: feeLines },
      },
    });

    // Return matching line count placeholders so autoTable measures exact height
    return [
      String(r.no),
      fakturLines.map((l) => l.text).join('\n'),
      itemStyledLines.map((l) => l.text).join('\n'),
      nominalLines.map((l) => l.text).join('\n'),
      bayarLines.map((l) => l.text).join('\n'),
      feeLines.map((l) => l.text).join('\n'),
    ];
  });

  if (bodyRows.length === 0) {
    autoTable(doc, {
      startY: sectionY + 3,
      margin: { top: 34, right: marginX, bottom: 18, left: marginX },
      head: [['No', 'Faktur & Waktu', 'Pelanggan & Item', 'Nominal Trx', 'Total Bayar', 'Fee / Margin']],
      body: [['-', 'Tidak ada transaksi pada rentang tanggal yang dipilih.', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [100, 116, 139],
        cellPadding: 4,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 38 },
        2: { cellWidth: 56 },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 26, halign: 'right' },
      },
    });
  } else {
    autoTable(doc, {
      startY: sectionY + 3,
      margin: { top: 34, right: marginX, bottom: 18, left: marginX },
      tableWidth: contentWidth,
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      theme: 'plain',
      head: [
        [
          { content: 'No', styles: { halign: 'center' } },
          { content: 'Faktur & Waktu', styles: { halign: 'left' } },
          { content: 'Pelanggan & Rincian Item', styles: { halign: 'left' } },
          { content: 'Nominal Trx', styles: { halign: 'right' } },
          { content: 'Total Bayar', styles: { halign: 'right' } },
          { content: 'Fee / Margin', styles: { halign: 'right' } },
        ],
      ],
      body: bodyRows,
      foot: [
        [
          {
            content: `TOTAL KESELURUHAN (${dataset.totalTransactions} Transaksi)`,
            colSpan: 3,
            styles: { halign: 'left', fontStyle: 'bold', textColor: [15, 23, 42] },
          },
          {
            content: formatRupiahPlain(dataset.totalNominalTrx),
            styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] },
          },
          {
            content: formatRupiahPlain(dataset.totalPaid),
            styles: { halign: 'right', fontStyle: 'bold', textColor: [30, 58, 138] },
          },
          {
            content: formatFeeSigned(dataset.totalFee),
            styles: {
              halign: 'right',
              fontStyle: 'bold',
              textColor: dataset.totalFee >= 0 ? [4, 120, 87] : [190, 18, 60],
            },
          },
        ],
        [
          {
            content: 'TOTAL PIUTANG (BELUM LUNAS PERIODE INI)',
            colSpan: 4,
            styles: {
              halign: 'left',
              fontStyle: 'bold',
              fontSize: 7.3,
              fillColor: dataset.totalRemainingDebt > 0 ? [255, 241, 242] : [248, 250, 252],
              textColor: dataset.totalRemainingDebt > 0 ? [159, 18, 57] : [100, 116, 139],
            },
          },
          {
            content: formatRupiahPlain(dataset.totalRemainingDebt),
            styles: {
              halign: 'right',
              fontStyle: 'bold',
              fontSize: 7.6,
              fillColor: dataset.totalRemainingDebt > 0 ? [255, 241, 242] : [248, 250, 252],
              textColor: dataset.totalRemainingDebt > 0 ? [190, 18, 60] : [100, 116, 139],
            },
          },
          {
            content: '-',
            styles: {
              halign: 'right',
              fontStyle: 'normal',
              fontSize: 7.3,
              fillColor: dataset.totalRemainingDebt > 0 ? [255, 241, 242] : [248, 250, 252],
              textColor: [148, 163, 184],
            },
          },
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 7.4,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: { top: 2.4, right: 2.2, bottom: 2.4, left: 2.2 },
        valign: 'top',
      },
      headStyles: {
        fillColor: [30, 58, 138], // Navy blue bank header
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: { top: 2.6, right: 2.2, bottom: 2.6, left: 2.2 },
      },
      footStyles: {
        fillColor: [241, 245, 249], // Slate-100
        fontSize: 7.8,
        fontStyle: 'bold',
        cellPadding: { top: 2.8, right: 2.2, bottom: 2.8, left: 2.2 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: [71, 85, 105] },
        1: { cellWidth: 38, halign: 'left' },
        2: { cellWidth: 56, halign: 'left' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 26, halign: 'right' },
      },
      willDrawCell: (data) => {
        if (data.section === 'body' && data.column.index >= 1) {
          // Clear default raw text; custom styled lines will be drawn in didDrawCell
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        // Draw subtle bottom border on body rows
        if (data.section === 'body') {
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.2);
          doc.line(
            data.cell.x,
            data.cell.y + data.cell.height,
            data.cell.x + data.cell.width,
            data.cell.y + data.cell.height
          );
        }

        // Draw top double-accent border on TOTAL KESELURUHAN footer row & subtle separator for Piutang row
        if (data.section === 'foot') {
          if (data.row.index === 0) {
            doc.setDrawColor(30, 58, 138);
            doc.setLineWidth(0.5);
            doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height
            );
          } else {
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.25);
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height
            );
          }
        }

        if (data.section !== 'body' || data.column.index < 1) return;

        const rowMeta = rowMetas[data.row.index];
        const colSpec = rowMeta?.cols[data.column.index];
        if (!colSpec) return;

        const padLeft = 2.2;
        const padRight = 2.2;
        const lineStep = 3.0;
        let cursorY = data.cell.y + 4.7;

        for (const line of colSpec.lines) {
          doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
          doc.setFontSize(line.fontSize ?? 7.2);
          const c = line.color ?? [15, 23, 42];
          doc.setTextColor(c[0], c[1], c[2]);

          if (colSpec.align === 'right') {
            doc.text(line.text, data.cell.x + data.cell.width - padRight, cursorY, {
              align: 'right',
            });
          } else {
            doc.text(line.text, data.cell.x + padLeft, cursorY);
          }
          cursorY += lineStep;
        }
      },
    });
  }

  // ==============================================================
  // A. HEADER RESMI & FOOTER (Diulang Otomatis di Setiap Halaman)
  // ==============================================================
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);

    // Kiri Header: Nama Toko (bold 12.5pt), Alamat Toko, Nomor WA/Telepon
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(15, 23, 42);
    doc.text(STORE_IDENTITY.name, marginX, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105);
    doc.text(STORE_IDENTITY.address, marginX, 19);
    doc.text(STORE_IDENTITY.phone, marginX, 23.5);

    // Kanan Header: Judul "LAPORAN KEUANGAN", "Halaman X dari Y", "Dokumen Resmi Laporan Keuangan"
    const rightEdge = pageWidth - marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(30, 58, 138); // Navy Blue
    doc.text('LAPORAN KEUANGAN', rightEdge, 14, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Halaman ${page} dari ${totalPages}`, rightEdge, 19, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Dokumen Resmi Laporan Keuangan', rightEdge, 23.5, { align: 'right' });

    // Pembatas Header: Garis ganda ala perbankan (biru tua tebal + abu-abu tipis)
    doc.setDrawColor(30, 58, 138); // Biru tua tebal
    doc.setLineWidth(0.85);
    doc.line(marginX, 27.5, rightEdge, 27.5);

    doc.setDrawColor(148, 163, 184); // Abu-abu tipis di bawahnya
    doc.setLineWidth(0.25);
    doc.line(marginX, 29, rightEdge, 29);

    // Footer: Garis pemisah tipis + info cetak kiri + Halaman X dari Y kanan
    const footerLineY = pageHeight - 13;
    const footerTextY = pageHeight - 8.5;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, footerLineY, rightEdge, footerLineY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(100, 116, 139);
    doc.text(`Dicetak pada ${printedWIB} • ${STORE_IDENTITY.name}`, marginX, footerTextY);
    doc.text(`Halaman ${page} dari ${totalPages}`, rightEdge, footerTextY, { align: 'right' });
  }

  const filename = buildReportFilename(dataset.fromDate, dataset.toDate, 'pdf');
  doc.save(filename);
}

export function generateFinancialReportCSV(
  dataset: FinancialReportDataset,
  meta: FinancialReportMeta
): void {
  const printedDate = meta.printedAt || new Date();
  const printedWIB = formatIndonesianDateTimeWIB(printedDate);
  const periodText =
    dataset.fromDate === dataset.toDate
      ? formatIndonesianDateLong(dataset.fromDate)
      : `${formatIndonesianDateLong(dataset.fromDate)} s/d ${formatIndonesianDateLong(dataset.toDate)}`;

  const rows: string[][] = [
    // 1. Identitas Toko & Judul Laporan
    [STORE_IDENTITY.name],
    [STORE_IDENTITY.address],
    [STORE_IDENTITY.phone],
    ['LAPORAN KEUANGAN - DOKUMEN RESMI'],
    [],
    // 2. Metadata Laporan
    ['METADATA LAPORAN'],
    ['Judul Laporan', 'Laporan Keuangan'],
    ['Kepada Yth', `${meta.recipientName} (${formatRoleLabel(meta.recipientRole)})`],
    ['Tanggal Laporan', printedWIB],
    ['Periode Transaksi', periodText],
    ['Total Transaksi', `${dataset.totalTransactions} Transaksi`],
    ['Total Nominal Trx (Rp)', String(dataset.totalNominalTrx)],
    ['Total Bayar (Rp)', String(dataset.totalPaid)],
    ['Total Fee (Rp)', String(dataset.totalFee)],
    ['Total Piutang / Belum Lunas (Rp)', String(dataset.totalRemainingDebt)],
    [],
    // 3. Tabel Rincian Mutasi & Riwayat Transaksi
    ['RINCIAN MUTASI & RIWAYAT TRANSAKSI'],
    [
      'No',
      'No. Faktur',
      'Waktu Transaksi',
      'Pelanggan',
      'Pengiriman',
      'Rincian Item',
      'Metode Pembayaran',
      'Status Pembayaran',
      'Nominal Trx (Rp)',
      'Total Bayar (Rp)',
      'Sisa Hutang (Rp)',
      'Fee / Margin (Rp)',
    ],
  ];

  for (const r of dataset.rows) {
    rows.push([
      String(r.no),
      r.invoiceNumber,
      `${formatShortDateTime(r.effectiveTimestamp)} WIB`,
      r.customerName,
      r.deliveryType === 'delivery' ? 'Armada Toko' : 'Ambil Sendiri',
      r.itemsCsvText,
      r.paymentMethodLabel,
      r.paymentStatusLabel,
      String(r.nominalTrx),
      String(r.paidAmount),
      String(r.remainingDebt),
      String(r.feeAmount),
    ]);
  }

  // 4. Baris TOTAL KESELURUHAN
  rows.push([
    'TOTAL KESELURUHAN',
    `${dataset.totalTransactions} Transaksi`,
    '',
    '',
    '',
    '',
    '',
    '',
    String(dataset.totalNominalTrx),
    String(dataset.totalPaid),
    String(dataset.totalRemainingDebt),
    String(dataset.totalFee),
  ]);

  const csvBody = rows
    .map((cols) =>
      cols.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    )
    .join('\r\n');

  // Awali dengan UTF-8 BOM (\uFEFF) agar rapi di Excel
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', buildReportFilename(dataset.fromDate, dataset.toDate, 'csv'));
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
