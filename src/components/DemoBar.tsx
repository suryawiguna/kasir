import { Check, ChevronDown, MessageCircle, Store } from "lucide-react";
import { useDemo } from "../features/demo/DemoContext";
import { useDevice } from "../features/device/DeviceContext";
import { useShop } from "../features/shop/ShopContext";
import { cn } from "../lib/cn";
import { ActionMenu } from "./ActionMenu";

/**
 * Bilah tipis di atas aplikasi, hanya di mode demo: penanda bahwa ini data
 * contoh, pindah cabang (prospek multi cabang ingin melihat cabang lain, dan
 * di demo tidak ada halaman setup perangkat), dan link kontak.
 */
export function DemoBar() {
  const demo = useDemo();
  const { branches } = useShop();
  const { setup, save } = useDevice();
  const active = branches.filter((b) => b.active);
  const current = active.find((b) => b.id === setup?.branchId);
  const contactUrl = demo.status === "ready" ? demo.contactUrl : "";

  return (
    <div className="shrink-0 bg-brand-50 border-b border-brand-100 text-brand-800 pt-safe">
      <div className="flex items-center gap-2 px-3 lg:px-4 min-h-10 py-1">
        <p className="min-w-0 flex-1 text-xs font-bold">
          <span className="sm:hidden">Demo</span>
          <span className="hidden sm:inline">
            Mode demo<span className="font-medium"> · data contoh, bebas dicoba</span>
          </span>
        </p>
        {active.length > 1 && setup && (
          <ActionMenu
            label="Pindah cabang"
            items={active.map((b) => ({
              label: b.name,
              icon: <Check size={18} className={cn(b.id !== setup.branchId && "invisible")} />,
              onSelect: () => b.id !== setup.branchId && save({ branchId: b.id, deviceLetter: setup.deviceLetter }),
            }))}
            trigger={
              <>
                <Store size={16} />
                <span className="max-w-24 sm:max-w-40 truncate">{current?.name ?? "Cabang"}</span>
                <ChevronDown size={14} />
              </>
            }
            triggerClassName={(open) => cn("btn-ghost btn-sm text-brand-800 hover:bg-brand-100", open && "bg-brand-100")}
          />
        )}
        {contactUrl && (
          <a className="btn-secondary btn-sm bg-white" href={contactUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={16} />
            <span className="sm:hidden">Pakai untuk toko?</span>
            <span className="hidden sm:inline">Mau pakai untuk toko kakak?</span>
          </a>
        )}
      </div>
    </div>
  );
}
