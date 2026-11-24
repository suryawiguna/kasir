import type { Branch, Order, PaperWidth, ShopConfig } from "../../domain/types";
import { PAYMENT_METHOD_LABEL } from "../orders/buildOrder";
import { formatOrderNumberShort } from "../orders/orderNumber";
import { changeDue } from "../pos/cart";
import { formatAmount, formatRupiah } from "../pricing/money";
import { findUnit, formatQuantity } from "../units/units";
import { getBusinessDate, getBusinessTime } from "../../lib/businessDate";

/**
 * Struk, disusun sekali (port `escpos.ts` Haoshii). Printer thermal Bluetooth
 * menerima byte dari `buildReceiptBytes`; pratinjau di layar dan salinan cetak
 * browser (`ReceiptPaper`) menggambar `buildReceiptLines`: baris yang sama,
 * di grid kolom yang sama, ukuran yang sama. Ubah desain struk hanya di sini.
 *
 * Isi struk datang dari config toko (header, footer, nama pelanggan, lebar
 * kertas) dan header cabang; tidak ada nama toko atau teks promosi di kode.
 */

/**
 * Font A bawaan printer: lebar 12 dot. Jarak baris 26 dot (`ESC 3`) dikirim di
 * setiap job supaya semua printer mencetak tinggi yang sama dan pratinjau bisa
 * menirunya. Bawaan printer murah ±30 dot, dan struk sebagian besar baris, jadi
 * angka ini yang paling menentukan panjang kertas.
 */
export const CHAR_WIDTH_DOTS = 12;
export const LINE_SPACING_DOTS = 26;

// --- Model tata letak ------------------------------------------------------

export type ReceiptAlign = "left" | "center" | "right";
/** `tall` = tinggi ganda saja; `double` = lebar dan tinggi ganda. */
export type ReceiptSize = "normal" | "tall" | "double";

/** Potongan teks satu ketebalan. Tebal satu-satunya mode yang bisa berganti di tengah baris. */
export interface ReceiptSpan {
  /** Sudah ASCII: yang benar-benar bisa digambar printer. */
  text: string;
  bold: boolean;
}

export type ReceiptLine =
  | { kind: "text"; spans: ReceiptSpan[]; align: ReceiptAlign; size: ReceiptSize }
  /** Kertas kosong sebanyak `lines` baris. */
  | { kind: "feed"; lines: number }
  /** Kertas kosong kurang dari satu baris, dalam dot (`ESC J`). */
  | { kind: "space"; dots: number }
  | { kind: "cut" };

export interface Receipt {
  width: PaperWidth;
  lines: ReceiptLine[];
}

/** Berapa karakter ukuran ini muat di satu baris kertas. */
export const charsPerLine = (size: ReceiptSize, width: PaperWidth): number =>
  size === "double" ? width / 2 : width;

/**
 * Baris kertas yang dipakai satu baris teks. Printer memotong per karakter,
 * bukan per kata, begitu baris penuh; pratinjau harus memotong di tempat yang
 * sama.
 */
export const printerRows = (text: string, size: ReceiptSize, width: PaperWidth): string[] => {
  const max = charsPerLine(size, width);
  if (text.length <= max) return [text];
  const rows: string[] = [];
  for (let i = 0; i < text.length; i += max) rows.push(text.slice(i, i + max));
  return rows;
};

export const lineText = (line: { spans: ReceiptSpan[] }): string => line.spans.map((s) => s.text).join("");

/** `printerRows`, dengan ketebalan tiap karakter tetap. */
export const printerRowSpans = (spans: ReceiptSpan[], size: ReceiptSize, width: PaperWidth): ReceiptSpan[][] => {
  let offset = 0;
  return printerRows(lineText({ spans }), size, width).map((row) => {
    const start = offset;
    const end = (offset += row.length);
    const out: ReceiptSpan[] = [];
    let at = 0;
    for (const span of spans) {
      const from = Math.max(start, at);
      const to = Math.min(end, at + span.text.length);
      if (from < to) out.push({ text: span.text.slice(from - at, to - at), bold: span.bold });
      at += span.text.length;
    }
    return out;
  });
};

/**
 * Printer thermal memakai code page satu byte, bukan UTF-8: huruf di luar
 * ASCII (emoji di nama pelanggan) diganti `?`. Dilakukan saat baris disusun,
 * supaya pratinjau menampilkan `?` yang sama.
 */
export const toAscii = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7e]/g, "?");

/** Penyusun baris dengan mesin status seperti printer: rata, tebal, ukuran tetap sampai diganti. */
class ReceiptBuilder {
  private lines: ReceiptLine[] = [];
  private state = { align: "left" as ReceiptAlign, bold: false, size: "normal" as ReceiptSize };

  constructor(private readonly width: PaperWidth) {}

  align(align: ReceiptAlign) {
    this.state.align = align;
    return this;
  }

  bold(bold: boolean) {
    this.state.bold = bold;
    return this;
  }

  size(size: ReceiptSize) {
    this.state.size = size;
    return this;
  }

  line(text = "") {
    return this.spans([{ text, bold: this.state.bold }]);
  }

  private spans(spans: ReceiptSpan[]) {
    const { align, size } = this.state;
    this.lines.push({ kind: "text", spans: spans.map((s) => ({ ...s, text: toAscii(s.text) })), align, size });
    return this;
  }

  /** Teks kiri dan kanan di satu baris; kanan pindah ke baris sendiri bila tidak muat. */
  cols(left: string, right: string, { rightBold = this.state.bold } = {}) {
    const bold = this.state.bold;
    const l = toAscii(left);
    const r = toAscii(right);
    const gap = this.width - r.length;
    if (l.length >= gap) {
      this.spans([{ text: l, bold }]);
      this.spans([{ text: r.padStart(this.width), bold: rightBold }]);
    } else {
      this.spans([
        { text: l, bold },
        { text: r.padStart(this.width - l.length), bold: rightBold },
      ]);
    }
    return this;
  }

  divider(char = "-") {
    return this.line(char.repeat(this.width));
  }

  space(dots: number) {
    this.lines.push({ kind: "space", dots });
    return this;
  }

  cut() {
    this.lines.push({ kind: "cut" });
    return this;
  }

  build(): Receipt {
    return { width: this.width, lines: this.lines };
  }
}

// --- Isi struk ---------------------------------------------------------------

/** Struk pelanggan (harga, total, pembayaran) atau tiket dapur (tanpa uang). */
export type ReceiptSlip = "customer" | "kitchen";

export const SLIP_LABEL: Record<ReceiptSlip, string> = {
  customer: "Struk pelanggan",
  kitchen: "Struk dapur",
};

export interface ReceiptContext {
  config: Pick<ShopConfig, "name" | "receipt" | "units" | "timezone">;
  /** Cabang pesanan; header-nya menimpa header toko bila diisi. */
  branch?: Pick<Branch, "receiptHeader">;
}

/** Kertas sebelum baris pertama, dua baris (±6,5 mm). Tidak ada feed di bawah: printer memberi marginnya sendiri. */
const TOP_MARGIN_DOTS = LINE_SPACING_DOTS * 2;
/** Setengah baris, pemisah tanpa membuang satu baris kertas. */
const HALF_LINE_DOTS = 12;

/** "24/11/26 14:05" di zona toko: numerik supaya muat di 32 kolom. */
const stamp = (ctx: ReceiptContext, iso: string): string => {
  const [y, m, d] = getBusinessDate(ctx.config.timezone, iso).split("-");
  return `${d}/${m}/${y.slice(2)} ${getBusinessTime(ctx.config.timezone, iso)}`;
};

/** `pickupTime` disimpan "YYYY-MM-DDTHH:mm" waktu toko. */
const pickupStamp = (pickup: string): string => {
  const [date, time = ""] = pickup.split("T");
  const [y, m, d] = date.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)} ${time}`.trim() : pickup;
};

const choiceText = (line: Order["items"][number]): string =>
  (line.choices ?? []).map((c) => `${c.count > 1 ? `${c.count}x ` : ""}${c.label}`).join(", ");

const headerLines = (ctx: ReceiptContext): string[] => {
  const branchHeader = (ctx.branch?.receiptHeader ?? []).filter((l) => l.trim());
  const header = branchHeader.length ? branchHeader : ctx.config.receipt.header.filter((l) => l.trim());
  return header.length ? header : [ctx.config.name];
};

const buildCustomerReceipt = (order: Order, ctx: ReceiptContext): Receipt => {
  const b = new ReceiptBuilder(ctx.config.receipt.paperWidth).space(TOP_MARGIN_DOTS);

  // Header di tengah, baris pertama tebal (biasanya nama toko).
  b.align("center");
  headerLines(ctx).forEach((text, i) => b.bold(i === 0).line(text));
  b.bold(false).space(HALF_LINE_DOTS).line(stamp(ctx, order.createdAt));

  // Hanya nomor pesanan yang besar: itu yang dibaca dari seberang meja.
  b.space(HALF_LINE_DOTS).bold(true).size("double").line(formatOrderNumberShort(order.orderNumber)).size("normal");
  if (order.orderStatus === "cancelled") b.line("DIBATALKAN");
  b.bold(false).align("left");

  if (ctx.config.receipt.showCustomerName && order.customerName) b.cols("Pelanggan", order.customerName);
  if (order.pickupTime) b.cols("Ambil", pickupStamp(order.pickupTime));

  b.divider();
  for (const item of order.items) {
    const unit = findUnit(ctx.config.units, item.unit);
    b.line(item.name);
    const choices = choiceText(item);
    if (choices) b.line(`  ${choices}`);
    for (const free of item.freeItems ?? []) b.line(`  + Bonus ${free.qty}x ${free.name}`);
    b.cols(`  ${formatQuantity(item.quantity, unit)} x ${formatAmount(item.price)}`, formatRupiah(item.total));
  }

  b.divider().bold(true).cols("TOTAL", formatRupiah(order.totalAmount)).bold(false);
  if (order.paymentMethod) b.cols("Metode bayar", PAYMENT_METHOD_LABEL[order.paymentMethod]);
  if (order.paymentStatus === "unpaid" && order.orderStatus !== "cancelled") b.cols("Status bayar", "BELUM LUNAS");
  if (order.paymentMethod === "cash" && order.cashReceived !== undefined) {
    b.cols("Tunai", formatRupiah(order.cashReceived)).cols(
      "Kembalian",
      formatRupiah(changeDue(order.cashReceived, order.totalAmount)),
    );
  }

  const footer = ctx.config.receipt.footer.filter((l) => l.trim());
  if (footer.length) {
    b.space(HALF_LINE_DOTS).align("center");
    footer.forEach((text) => b.line(text));
    b.align("left");
  }
  return b.cut().build();
};

/**
 * Tiket dapur: apa yang disiapkan, tanpa uang. Nomor pertama dan terbesar
 * (yang dipanggil dapur), lalu milik siapa, karena itu yang ditanyakan saat
 * serah terima. Nama pelanggan selalu tampil: tiket ini tidak dibawa pulang.
 */
const buildKitchenTicket = (order: Order, ctx: ReceiptContext): Receipt => {
  const b = new ReceiptBuilder(ctx.config.receipt.paperWidth).space(TOP_MARGIN_DOTS);
  b.align("center").bold(true).size("double").line(formatOrderNumberShort(order.orderNumber)).size("normal");
  if (order.orderStatus === "cancelled") b.line("DIBATALKAN");
  if (order.customerName) b.line(order.customerName);
  b.bold(false).line(stamp(ctx, order.createdAt));
  if (order.pickupTime) b.line(`Ambil ${pickupStamp(order.pickupTime)}`);
  b.align("left").divider();
  for (const item of order.items) {
    const unit = findUnit(ctx.config.units, item.unit);
    b.bold(true).line(`${formatQuantity(item.quantity, unit)} ${item.name}`).bold(false);
    const choices = choiceText(item);
    if (choices) b.line(`  ${choices}`);
    for (const free of item.freeItems ?? []) b.line(`  + BONUS ${free.qty}x ${free.name.toUpperCase()}`);
  }
  return b.cut().build();
};

export const buildReceiptLines = (order: Order, slip: ReceiptSlip, ctx: ReceiptContext): Receipt =>
  slip === "customer" ? buildCustomerReceipt(order, ctx) : buildKitchenTicket(order, ctx);

// --- Encoding ESC/POS ----------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

const INIT = [ESC, 0x40];
const LINE_SPACING = [ESC, 0x33, LINE_SPACING_DOTS];
const ALIGN: Record<ReceiptAlign, number[]> = {
  left: [ESC, 0x61, 0],
  center: [ESC, 0x61, 1],
  right: [ESC, 0x61, 2],
};
const BOLD = (on: boolean) => [ESC, 0x45, on ? 1 : 0];
const SIZE: Record<ReceiptSize, number[]> = {
  normal: [GS, 0x21, 0x00],
  tall: [GS, 0x21, 0x01],
  double: [GS, 0x21, 0x11],
};
/** Diabaikan printer tanpa pemotong; aman di model 58 mm murah. */
const CUT_PARTIAL = [GS, 0x56, 66, 0];
const FEED = (lines: number) => [ESC, 0x64, lines];
const FEED_DOTS = (dots: number) => [ESC, 0x4a, dots];

/**
 * Baris menjadi aliran perintah printer. Perintah mode dikirim hanya saat
 * berubah (printer menyimpannya, sama seperti builder), dan teks dikirim apa
 * adanya: pemotongan baris milik printer, yang ditiru `printerRows`.
 */
export const encodeReceipt = (receipt: Receipt): Uint8Array => {
  const bytes: number[] = [...INIT, ...LINE_SPACING];
  let align: ReceiptAlign = "left";
  let bold = false;
  let size: ReceiptSize = "normal";
  for (const line of receipt.lines) {
    if (line.kind === "feed") bytes.push(...FEED(line.lines));
    else if (line.kind === "space") bytes.push(...FEED_DOTS(line.dots));
    else if (line.kind === "cut") bytes.push(...CUT_PARTIAL);
    else {
      if (line.align !== align) bytes.push(...ALIGN[(align = line.align)]);
      if (line.size !== size) bytes.push(...SIZE[(size = line.size)]);
      for (const span of line.spans) {
        if (span.bold !== bold) bytes.push(...BOLD((bold = span.bold)));
        for (const ch of span.text) bytes.push(ch.charCodeAt(0));
      }
      bytes.push(0x0a);
    }
  }
  return new Uint8Array(bytes);
};

/** Yang dikirim ke printer Bluetooth untuk satu slip. */
export const buildReceiptBytes = (order: Order, slip: ReceiptSlip, ctx: ReceiptContext): Uint8Array =>
  encodeReceipt(buildReceiptLines(order, slip, ctx));
