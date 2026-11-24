import { getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Field } from "../components/ui";
import { shopCol } from "../data/paths";
import type { Order } from "../domain/types";
import { useAuth } from "../features/auth/AuthContext";
import { saveBranch, slugId } from "../features/catalog/catalogActions";
import { useDevice } from "../features/device/DeviceContext";
import { DEVICE_LETTERS, suggestDeviceLetter } from "../features/device/deviceSetup";
import { BRANCH_CODE_PATTERN, formatOrderNumberShort } from "../features/orders/orderNumber";
import { useShop } from "../features/shop/ShopContext";

/**
 * Setup perangkat sekali: cabang + huruf perangkat. Staf terkunci ke cabang
 * di akunnya. Huruf yang sudah dipakai perangkat lain di cabang itu
 * ditandai, karena dua perangkat aktif dengan huruf sama bisa memberi nomor
 * pesanan yang sama.
 */
export function DeviceSetupPage({ firstBranch }: { firstBranch?: boolean }) {
  const { claims, user } = useAuth();
  const { branches } = useShop();
  const { save } = useDevice();
  const isOwner = claims?.role === "owner";
  const active = branches.filter((b) => b.active);
  const [branchId, setBranchId] = useState(() => (isOwner ? active[0]?.id : claims?.branchId) ?? "");
  const [letter, setLetter] = useState("");
  const [used, setUsed] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    // Satu kali saat setup: 100 pesanan terakhir cabang ini, untuk melihat huruf yang dipakai.
    getDocs(query(shopCol("orders"), where("branchId", "==", branchId), orderBy("createdAt", "desc"), limit(100)))
      .then((snap) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const d of snap.docs) {
          const o = d.data() as Order;
          if (o.deviceLetter && !map.has(o.deviceLetter)) map.set(o.deviceLetter, formatOrderNumberShort(o.orderNumber));
        }
        setUsed(map);
        setLetter((prev) => prev || suggestDeviceLetter(map.keys()));
      })
      .catch(() => setLetter((prev) => prev || "A"));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const staffBranch = useMemo(() => branches.find((b) => b.id === claims?.branchId), [branches, claims]);

  if (firstBranch) return <FirstBranchForm by={user?.email ?? ""} />;

  if (!isOwner && !staffBranch) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="card space-y-2 p-5">
          <h1 className="text-lg font-semibold">Cabang tidak ditemukan</h1>
          <p className="text-sm text-zinc-600">Akun ini ditempatkan di cabang yang tidak ada atau sudah diarsip. Hubungi pemilik.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="card space-y-4 p-5">
        <div>
          <h1 className="text-lg font-semibold">Setup perangkat</h1>
          <p className="text-sm text-zinc-500">Sekali saja untuk HP/tablet ini.</p>
        </div>
        {isOwner ? (
          <Field label="Cabang">
            <select className="field" value={branchId} onChange={(e) => {
              setBranchId(e.target.value);
              setLetter("");
            }}>
              {active.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Cabang">
            <p className="field flex items-center bg-zinc-50">{staffBranch?.name}</p>
          </Field>
        )}
        <Field
          label="Huruf perangkat"
          hint="Setiap perangkat kasir di cabang yang sama memakai huruf berbeda. Huruf masuk ke nomor pesanan (A0001)."
        >
          <div className="mt-1 grid grid-cols-7 gap-1">
            {DEVICE_LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLetter(l)}
                className={
                  letter === l
                    ? "h-10 rounded-lg bg-brand-600 font-semibold text-brand-fg"
                    : used.has(l)
                      ? "h-10 rounded-lg bg-amber-50 font-semibold text-amber-800"
                      : "h-10 rounded-lg bg-zinc-100 font-semibold"
                }
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
        {used.has(letter) && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Huruf {letter} sudah dipakai perangkat lain di cabang ini (terakhir {used.get(letter)}). Pakai hanya bila
            perangkat ini menggantikan perangkat itu.
          </p>
        )}
        <button
          className="btn-primary w-full"
          disabled={!branchId || !letter}
          onClick={() => save({ branchId: isOwner ? branchId : claims!.branchId!, deviceLetter: letter })}
        >
          Simpan
        </button>
      </div>
    </div>
  );
}

function FirstBranchForm({ by }: { by: string }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const valid = name.trim() && BRANCH_CODE_PATTERN.test(code);
  return (
    <div className="space-y-3">
      <Field label="Nama cabang">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lapak Tikala" />
      </Field>
      <Field label="Kode cabang" hint="2–6 huruf besar/angka, masuk ke nomor pesanan. Tidak bisa diganti.">
        <input
          className="field uppercase"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="TKL"
        />
      </Field>
      <button
        className="btn-primary w-full"
        disabled={!valid}
        onClick={() => {
          saveBranch({ id: slugId(name), name: name.trim(), code, active: true, order: 0 }, true, by);
          toast.success("Cabang dibuat");
        }}
      >
        Buat cabang
      </button>
    </div>
  );
}
