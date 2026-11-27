import type { Branch, Order, Timezone, Unit } from "../../domain/types";
import { getBusinessDate, getBusinessTime } from "../../lib/businessDate";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../orders/buildOrder";
import { formatOrderNumberShort } from "../orders/orderNumber";
import { owedIn, saleTime, salesIn, type ReportScope } from "../reports/branchScope";
import { findUnit, fromBase } from "../units/units";

/**
 * Ekspor laporan ke CSV, port dari Haoshii `features/export/csv.ts` dengan
 * kolom Cabang dan Satuan. Satu baris per item pesanan, jadi kolom Subtotal
 * bisa langsung dijumlah dan Jumlah bisa difilter per satuan.
 *
 * Format dari Haoshii: BOM supaya Excel membaca UTF-8, koma dan CRLF
 * (RFC 4180), uang dan jumlah sebagai angka polos, sel yang bisa dijalankan
 * spreadsheet sebagai rumus diberi apostrof.
 */
const BOM = "﻿";
const SEP = ",";
const EOL = "\r\n";

const PHONE_LIKE = /^[+-][\d\s().-]*$/;
const neutralizeFormula = (value: string): string =>
  /^[=@\t\r]/.test(value) || (/^[+-]/.test(value) && !PHONE_LIKE.test(value)) ? `'${value}` : value;

export const csvCell = (value: string | number): string => {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = neutralizeFormula(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const row = (cells: (string | number)[]): string => cells.map(csvCell).join(SEP) + EOL;

export const REPORT_CSV_HEADER = [
  "Tanggal",
  "Waktu",
  "Cabang",
  "Nomor",
  "Pelanggan",
  "Produk",
  "Pilihan",
  "Jumlah",
  "Satuan",
  "Harga (Rp)",
  "Subtotal (Rp)",
  "Status bayar",
  "Metode bayar",
  "Status pesanan",
];

/**
 * Penjualan (lunas, tidak batal, menurut tanggal bayar) dan pesanan belum
 * dibayar di rentang dan cabang ini. Pesanan batal tidak ikut.
 */
export const buildReportCsv = (
  orders: readonly Order[],
  scope: ReportScope,
  ctx: { branches: readonly Branch[]; units: readonly Unit[]; timezone: Timezone },
): string => {
  const rows = [...salesIn(orders, scope), ...owedIn(orders, scope)].sort((a, b) => saleTime(a).localeCompare(saleTime(b)));
  const branchName = (id: string) => ctx.branches.find((b) => b.id === id)?.name ?? id;
  let out = BOM + row(REPORT_CSV_HEADER);
  for (const o of rows) {
    const at = saleTime(o);
    for (const line of o.items) {
      const unit = findUnit(ctx.units, line.unit);
      out += row([
        getBusinessDate(ctx.timezone, at),
        getBusinessTime(ctx.timezone, at),
        branchName(o.branchId),
        formatOrderNumberShort(o.orderNumber, true),
        o.customerName ?? "",
        line.name,
        (line.choices ?? []).map((c) => (c.count > 1 ? `${c.count}× ${c.label}` : c.label)).join("; "),
        fromBase(line.quantity, unit),
        unit.label,
        line.price,
        line.total,
        o.paymentStatus === "paid" ? "Lunas" : "Belum bayar",
        o.paymentMethod ? PAYMENT_METHOD_LABEL[o.paymentMethod] : "",
        ORDER_STATUS_LABEL[o.orderStatus],
      ]);
    }
  }
  return out;
};
