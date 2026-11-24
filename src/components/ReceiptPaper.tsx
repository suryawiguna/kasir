import { useMemo } from "react";
import type { Order } from "../domain/types";
import {
  buildReceiptLines,
  CHAR_WIDTH_DOTS,
  LINE_SPACING_DOTS,
  printerRowSpans,
  type ReceiptContext,
  type ReceiptLine,
  type ReceiptSlip,
  type ReceiptSpan,
} from "../features/print/receipt";
import { cn } from "../lib/cn";

/**
 * Struk seperti yang dicetak printer thermal, digambar dari baris yang sama
 * dengan `buildReceiptBytes` (port Haoshii), jadi pratinjau tidak bisa
 * menampilkan tata letak yang tidak dibuat printer. Satu karakter = `1ch`
 * font monospace, satu baris = lebar kertas dalam karakter.
 *
 * `paper` = pratinjau di layar (kertas putih bergaris). Tanpa itu: salinan
 * cetak browser, di mana halamannya sendiri adalah kertas.
 */

/** Jarak baris dalam `em`, dari jarak baris printer dibagi lebar karakter, × ±0,6em per `ch`. */
const LINE_HEIGHT = (LINE_SPACING_DOTS / CHAR_WIDTH_DOTS) * 0.6;

const Row = ({ line, row }: { line: Extract<ReceiptLine, { kind: "text" }>; row: ReceiptSpan[] }) => {
  const style = { textAlign: line.align } as const;
  // Spasi, bukan "": baris kosong di `pre` tidak punya tinggi, padahal printer tetap memakan satu baris.
  const text =
    row.length === 0
      ? " "
      : row.map((span, i) => (
          <span key={i} className={cn(span.bold && "font-bold")}>
            {span.text}
          </span>
        ));
  if (line.size === "double") {
    return (
      <div className="text-[2em]" style={style}>
        {text}
      </div>
    );
  }
  if (line.size === "tall") {
    return (
      <div style={{ height: `${LINE_HEIGHT * 2}em` }}>
        <div style={{ ...style, transform: "scaleY(2)", transformOrigin: "top" }}>{text}</div>
      </div>
    );
  }
  return <div style={style}>{text}</div>;
};

export function ReceiptPaper({
  order,
  slip,
  ctx,
  paper = false,
  className,
}: {
  order: Order;
  slip: ReceiptSlip;
  ctx: ReceiptContext;
  paper?: boolean;
  className?: string;
}) {
  const receipt = useMemo(() => buildReceiptLines(order, slip, ctx), [order, slip, ctx]);
  return (
    <div
      className={cn(
        "receipt-paper font-mono text-zinc-900 whitespace-pre",
        paper && "bg-white border border-zinc-200 shadow-sm px-[2ch] py-[1.5em] w-fit mx-auto",
        className,
      )}
      style={{ lineHeight: LINE_HEIGHT }}
    >
      <div style={{ width: `${receipt.width}ch` }} className="mx-auto">
        {receipt.lines.map((line, i) => {
          if (line.kind === "cut") return null;
          if (line.kind === "space") {
            return <div key={i} style={{ height: `${(line.dots / CHAR_WIDTH_DOTS) * 0.6}em` }} />;
          }
          if (line.kind === "feed") return <div key={i} style={{ height: `${line.lines * LINE_HEIGHT}em` }} />;
          return printerRowSpans(line.spans, line.size, receipt.width).map((row, j) => (
            <Row key={`${i}-${j}`} line={line} row={row} />
          ));
        })}
      </div>
    </div>
  );
}
