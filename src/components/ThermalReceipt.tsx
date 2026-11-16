import React, { useState } from 'react';
import { Printer, Copy, Check, X, Building2, Truck } from 'lucide-react';
import { Sale } from '../types/index.ts';
import { useBodyScrollLock } from '../utils/scrollLock.ts';

export type ReceiptType = 'sale' | 'digital' | 'service';

interface ThermalReceiptProps {
  type?: ReceiptType;
  saleData?: Sale | null;
  digitalData?: any;
  serviceData?: any;
  onClose: () => void;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  saleData,
  onClose,
  storeName = 'TOKO SUMBER SEWU',
  storeAddress = 'Ngarip, Ulubelu',
  storePhone = 'WA: 082281813460',
}) => {
  // Kunci scroll body saat modal receipt terbuka
  useBodyScrollLock(true);

  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm');
  const [copied, setCopied] = useState(false);

  const formatRupiah = (val: number) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const isPrintingRef = React.useRef(false);

  const handlePrint = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    try {
      window.print();
    } catch (err) {
      console.error('Print execution notice:', err);
    } finally {
      setTimeout(() => {
        isPrintingRef.current = false;
      }, 1000);
    }
  };

  const getPlainTextReceipt = (): string => {
    let text = `================================\n`;
    text += `${storeName}\n`;
    text += `Pusat Bahan Bangunan & Pupuk\n`;
    text += `${storeAddress}\n`;
    text += `${storePhone}\n`;
    text += `================================\n`;

    if (saleData) {
      const isDebtTx = saleData.paymentMethod === 'debt' || (saleData.remainingDebt ?? 0) > 0 || (saleData.paymentHistory?.length ?? 0) > 1;
      const remDebt = Math.max(0, Number(saleData.remainingDebt ?? 0));
      const paidTot = Number(saleData.paidTotal ?? saleData.amountPaid ?? 0);

      text += `NOTA PENJUALAN & PENGIRIMAN\n`;
      text += `No. Faktur : ${saleData.invoiceNumber}\n`;
      text += `Tanggal    : ${new Date(saleData.createdAt).toLocaleString('id-ID')}\n`;
      text += `Pelanggan  : ${saleData.customerName}\n`;
      if (saleData.customerPhone) {
        text += `No. HP/WA  : ${saleData.customerPhone}\n`;
      }
      if (saleData.customerAddress && saleData.deliveryType !== 'delivery') {
        text += `Alamat     : ${saleData.customerAddress}\n`;
      }
      if (isDebtTx) {
        text += `Status     : ${remDebt > 0 ? (paidTot > 0 ? 'CICILAN / DP (BELUM LUNAS)' : 'HUTANG (BELUM LUNAS)') : 'LUNAS'}\n`;
      }
      if (saleData.deliveryType === 'delivery' || saleData.deliveryAddress) {
        text += `--------------------------------\n`;
        text += `[PENGIRIMAN ARMADA TOKO]\n`;
        if (saleData.deliveryAddress) text += `Tujuan   : ${saleData.deliveryAddress}\n`;
        if (saleData.deliveryVehiclePlate) text += `Armada   : ${saleData.deliveryVehiclePlate}\n`;
        if (saleData.deliveryDriverName) text += `Supir    : ${saleData.deliveryDriverName}\n`;
      }
      text += `--------------------------------\n`;
      saleData.items?.forEach((item) => {
        text += `${item.productName}\n`;
        const unitLabel = item.unit ? ` ${item.unit}` : '';
        text += `  ${item.quantity}${unitLabel} x ${formatRupiah(item.sellingPrice)} = ${formatRupiah(item.subtotal)}\n`;
      });
      text += `--------------------------------\n`;
      text += `Subtotal   : ${formatRupiah(saleData.subtotal)}\n`;
      if (saleData.discount > 0) {
        text += `Diskon     : -${formatRupiah(saleData.discount)}\n`;
      }
      if (saleData.deliveryFee && saleData.deliveryFee > 0) {
        text += `Ongkir     : +${formatRupiah(saleData.deliveryFee)}\n`;
      }
      text += `TOTAL      : ${formatRupiah(saleData.grandTotal)}\n`;
      if (isDebtTx) {
        text += `Sudah Bayar: ${formatRupiah(paidTot)}\n`;
        text += `SISA HUTANG: ${formatRupiah(remDebt)}\n`;
      } else {
        const pMethod = (saleData.paymentMethod || 'cash').toUpperCase();
        text += `Bayar (${pMethod}): ${formatRupiah(saleData.amountPaid)}\n`;
        text += `Kembali    : ${formatRupiah(saleData.changeAmount)}\n`;
      }
      if (saleData.notes) {
        text += `Catatan    : ${saleData.notes}\n`;
      }
      text += `================================\n`;
      text += `* Periksa kembali barang material & pupuk yang diterima.\n`;
      text += `* Barang curah/semen yang sudah dibongkar tidak dapat dikembalikan.\n`;
      text += `Terima Kasih Atas Kunjungan Anda!\n`;
    }
    return text;
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(getPlainTextReceipt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const is58 = paperWidth === '58mm';

  return (
    <div
      data-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
        e.stopPropagation();
      }}
      onWheel={(e) => {
        if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-3 sm:p-4 no-print-bg receipt-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] receipt-modal-container"
      >
        {/* Modal Header */}
        <div className="px-3.5 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50 no-print shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-slate-800 truncate">Cetak Struk Thermal</h3>
              <p className="text-[10px] text-slate-500 font-medium truncate">Toko Sumber Sewu (Material & Pupuk)</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Paper Width Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  is58 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  !is58 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Receipt Paper Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center items-start">
          <div
            id="thermal-receipt-print-area"
            className={`bg-white text-black font-mono text-[11px] sm:text-xs leading-relaxed shadow-sm p-4 border border-slate-200 transition-all ${
              is58 ? 'w-[260px] max-w-full' : 'w-[340px] max-w-full'
            }`}
            style={{
              fontFamily: '"JetBrains Mono", "Courier New", Courier, monospace',
            }}
          >
            {/* Store Header */}
            <div className="text-center pb-2 border-b border-dashed border-black">
              <div className="font-black text-sm tracking-tight uppercase">{storeName}</div>
              <div className="text-[10px] uppercase font-semibold">Bahan Bangunan, Material & Pupuk</div>
              <div className="text-[9px] mt-0.5 leading-tight">{storeAddress}</div>
              <div className="text-[9px]">{storePhone}</div>
            </div>

            {/* Sale Meta */}
            {saleData && (
              <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
                <div className="text-center font-bold uppercase mb-1">
                  NOTA PENJUALAN & SURAT JALAN
                </div>
                <div className="flex justify-between">
                  <span>No. Faktur:</span>
                  <span className="font-bold">{saleData.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal:</span>
                  <span>{new Date(saleData.createdAt).toLocaleDateString('id-ID')} {new Date(saleData.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span className="font-bold truncate max-w-[150px]">{saleData.customerName}</span>
                </div>
                {saleData.customerPhone && (
                  <div className="flex justify-between">
                    <span>No. HP/WA:</span>
                    <span>{saleData.customerPhone}</span>
                  </div>
                )}
                {saleData.customerAddress && saleData.deliveryType !== 'delivery' && (
                  <div className="flex justify-between gap-2">
                    <span>Alamat:</span>
                    <span className="text-right">{saleData.customerAddress}</span>
                  </div>
                )}
                {(saleData.paymentMethod === 'debt' || (saleData.remainingDebt ?? 0) > 0) && (
                  <div className="mt-1.5 py-1 px-1.5 border border-black text-center font-black uppercase tracking-wide text-[10px]">
                    {(saleData.remainingDebt ?? 0) > 0
                      ? (saleData.paidTotal ?? 0) > 0
                        ? 'STATUS: CICILAN / DP (BELUM LUNAS)'
                        : 'STATUS: HUTANG (BELUM LUNAS)'
                      : 'STATUS: LUNAS'}
                  </div>
                )}
              </div>
            )}

            {/* Delivery Info */}
            {saleData && (saleData.deliveryType === 'delivery' || saleData.deliveryAddress) && (
              <div className="py-1.5 border-b border-dashed border-black text-[10px] bg-slate-50/50 p-1 rounded">
                <div className="font-bold flex items-center gap-1 uppercase text-slate-800">
                  <span>[KIRIM VIA ARMADA TOKO]</span>
                </div>
                {saleData.deliveryAddress && (
                  <div className="mt-0.5 leading-tight">
                    <span className="font-semibold">Tujuan:</span> {saleData.deliveryAddress}
                  </div>
                )}
                {saleData.deliveryVehiclePlate && (
                  <div>
                    <span className="font-semibold">Armada:</span> {saleData.deliveryVehiclePlate}
                  </div>
                )}
                {saleData.deliveryDriverName && (
                  <div>
                    <span className="font-semibold">Supir:</span> {saleData.deliveryDriverName}
                  </div>
                )}
              </div>
            )}

            {/* Items List */}
            {saleData && (
              <div className="py-2 border-b border-dashed border-black space-y-2 text-[10px]">
                {saleData.items && saleData.items.length > 0 ? (
                  saleData.items.map((item, idx) => {
                    const unitStr = item.unit ? ` ${item.unit}` : '';
                    return (
                      <div key={idx} className="leading-tight">
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        <div className="flex justify-between text-slate-700 pl-1 mt-0.5">
                          <span>
                            {item.quantity}{unitStr} x {formatRupiah(item.sellingPrice)}
                          </span>
                          <span className="font-semibold">{formatRupiah(item.subtotal)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-2 text-slate-400">Tidak ada rincian item</div>
                )}
              </div>
            )}

            {/* Totals */}
            {saleData && (
              <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatRupiah(saleData.subtotal)}</span>
                </div>
                {saleData.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Diskon:</span>
                    <span>-{formatRupiah(saleData.discount)}</span>
                  </div>
                )}
                {saleData.deliveryFee && saleData.deliveryFee > 0 ? (
                  <div className="flex justify-between">
                    <span>Ongkir Armada:</span>
                    <span>+{formatRupiah(saleData.deliveryFee)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-black text-xs pt-1 border-t border-dotted border-black">
                  <span>TOTAL:</span>
                  <span>{formatRupiah(saleData.grandTotal)}</span>
                </div>
                {saleData.paymentMethod === 'debt' || (saleData.remainingDebt ?? 0) > 0 || (saleData.paymentHistory?.length ?? 0) > 1 ? (
                  <>
                    <div className="flex justify-between pt-1">
                      <span>Sudah Dibayar:</span>
                      <span className="font-bold">{formatRupiah(saleData.paidTotal ?? saleData.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between font-black text-xs pt-0.5">
                      <span>SISA HUTANG:</span>
                      <span>{formatRupiah(saleData.remainingDebt ?? 0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between pt-1">
                      <span>Bayar ({(saleData.paymentMethod || 'cash').toUpperCase()}):</span>
                      <span>{formatRupiah(saleData.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>Kembali:</span>
                      <span>{formatRupiah(saleData.changeAmount)}</span>
                    </div>
                  </>
                )}
                {saleData.notes && (
                  <div className="pt-1 text-[9px] text-slate-600">
                    <span className="font-semibold">Catatan:</span> {saleData.notes}
                  </div>
                )}
              </div>
            )}

            {/* Paraf Penerima Barang saat Hutang / Kirim Armada */}
            {saleData && ((saleData.remainingDebt ?? 0) > 0 || saleData.deliveryType === 'delivery') && (
              <div className="py-2 border-b border-dashed border-black flex justify-between text-[9px] text-center">
                <div className="w-1/2 pr-1">
                  <div>Kasir / Pengirim</div>
                  <div className="h-7" />
                  <div>( ................ )</div>
                </div>
                <div className="w-1/2 pl-1">
                  <div>Penerima Barang</div>
                  <div className="h-7" />
                  <div>( ................ )</div>
                </div>
              </div>
            )}

            {/* Footer Message */}
            <div className="text-center pt-2 text-[9px] space-y-0.5 text-slate-700">
              <p>* Periksa kembali barang material & pupuk yang diterima.</p>
              <p>* Semen & barang curah yang telah dibongkar tidak dapat dikembalikan.</p>
              <p className="font-bold pt-1 uppercase">Terima Kasih Atas Kunjungan Anda!</p>
              <p className="text-[8px] text-slate-400 font-mono">Toko Sumber Sewu POS</p>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2 sm:gap-3 no-print shrink-0">
          <button
            type="button"
            onClick={handleCopyText}
            className="flex-1 py-2.5 px-2.5 sm:px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-emerald-600">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Salin Teks Nota</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Cetak Struk Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
};
