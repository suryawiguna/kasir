import { Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { Order } from "../domain/types";
import { formatOrderNumberShort } from "../features/orders/orderNumber";
import { isBluetoothPrintSupported, PrintCancelled, printViaBluetooth } from "../features/print/bluetoothPrinter";
import { printReceiptDocument, RECEIPT_PRINT_ID } from "../features/print/browserPrint";
import { buildReceiptBytes, SLIP_LABEL, type ReceiptContext, type ReceiptSlip } from "../features/print/receipt";
import { useShop } from "../features/shop/ShopContext";
import { useLingeringValue } from "../features/ui/useLingeringValue";
import { Drawer } from "./Drawer";
import { ReceiptPaper } from "./ReceiptPaper";
import { SegmentedControl } from "./ui";

/**
 * Pratinjau struk dan tombol cetak. Di Chrome/Edge (Android, desktop) struk
 * dikirim ke printer thermal Bluetooth; di tempat lain (iOS, Firefox) lewat
 * dialog cetak browser. Struk dapur muncul sebagai pilihan bila fiturnya
 * menyala.
 */
export function ReceiptSheet({ order, open, onClose }: { order: Order | null; open: boolean; onClose: () => void }) {
  const { config, branches, features } = useShop();
  const shown = useLingeringValue(order);
  const [slip, setSlip] = useState<ReceiptSlip>("customer");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) setSlip("customer");
  }, [open]);

  const branch = branches.find((b) => b.id === shown?.branchId);
  const ctx = useMemo<ReceiptContext>(() => ({ config, branch }), [config, branch]);
  const activeSlip: ReceiptSlip = features.kitchenTicket ? slip : "customer";
  const bluetooth = isBluetoothPrintSupported();

  const print = async () => {
    if (!shown || printing) return;
    if (!bluetooth) {
      // Nomor lengkap: judul dokumen menjadi nama file PDF.
      const outcome = printReceiptDocument(`${SLIP_LABEL[activeSlip]} ${shown.orderNumber}`);
      if (outcome === "blocked") toast.error("Browser memblokir jendela cetak. Izinkan pop-up lalu coba lagi.");
      if (outcome === "missing") toast.error("Struk belum siap dicetak. Tutup lalu buka lagi.");
      return;
    }
    setPrinting(true);
    try {
      await printViaBluetooth(buildReceiptBytes(shown, activeSlip, ctx));
      toast.success(`${SLIP_LABEL[activeSlip]} terkirim ke printer`);
    } catch (error) {
      if (!(error instanceof PrintCancelled)) {
        toast.error(error instanceof Error ? error.message : "Gagal mencetak. Coba lagi.");
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        size="sm"
        title={shown ? `Struk ${formatOrderNumberShort(shown.orderNumber)}` : "Struk"}
        bodyClassName="p-4 bg-zinc-50"
        footer={
          <div className="space-y-2">
            <button className="btn-primary w-full h-12 text-base" disabled={printing} onClick={() => void print()}>
              <Printer size={20} />
              {printing ? "Mengirim ke printer..." : `Cetak ${SLIP_LABEL[activeSlip].toLowerCase()}`}
            </button>
            <p className="text-center text-xs text-zinc-500">
              {bluetooth
                ? "Printer thermal Bluetooth. Perangkat baru dipilih saat cetak pertama."
                : "Lewat dialog cetak browser. Printer Bluetooth butuh Chrome di Android atau desktop."}
            </p>
          </div>
        }
      >
        {shown && (
          <div className="space-y-3">
            {features.kitchenTicket && (
              <SegmentedControl
                className="w-full"
                value={slip}
                onChange={setSlip}
                options={[
                  { value: "customer", label: "Pelanggan" },
                  { value: "kitchen", label: "Dapur" },
                ]}
              />
            )}
            <div className="overflow-x-auto">
              <ReceiptPaper order={shown} slip={activeSlip} ctx={ctx} paper className="text-[13px]" />
            </div>
          </div>
        )}
      </Drawer>
      {open &&
        shown &&
        createPortal(
          <div id={RECEIPT_PRINT_ID} className="print-only receipt-print-copy">
            <style>{`@page{size:${config.receipt.paperWidth === 48 ? 80 : 58}mm auto;margin:0}`}</style>
            <ReceiptPaper order={shown} slip={activeSlip} ctx={ctx} />
          </div>,
          document.body,
        )}
    </>
  );
}
