import { describe, expect, it } from "vitest";
import { businessRangeToUtc, getBusinessDate, getBusinessDateCompact, getBusinessTime } from "./businessDate";

describe("businessDate", () => {
  // 23:30 UTC tanggal 23 = 06:30 WIB / 07:30 WITA tanggal 24
  const lateUtc = "2026-11-23T23:30:00.000Z";
  // 16:30 UTC = 23:30 WIB tanggal 23, tapi 00:30 WITA tanggal 24
  const evening = "2026-11-23T16:30:00.000Z";

  it("tanggal sesuai zona waktu toko", () => {
    expect(getBusinessDate("Asia/Jakarta", lateUtc)).toBe("2026-11-24");
    expect(getBusinessDate("Asia/Jakarta", evening)).toBe("2026-11-23");
    expect(getBusinessDate("Asia/Makassar", evening)).toBe("2026-11-24");
    expect(getBusinessDateCompact("Asia/Makassar", evening)).toBe("20261124");
    expect(getBusinessTime("Asia/Makassar", evening)).toBe("00:30");
    expect(getBusinessDate("Asia/Jakarta", "bukan tanggal")).toBe("");
  });

  it("rentang hari ke UTC", () => {
    expect(businessRangeToUtc("Asia/Makassar", "2026-11-24", "2026-11-24")).toEqual({
      startIso: "2026-11-23T16:00:00.000Z",
      endIso: "2026-11-24T15:59:59.999Z",
    });
  });
});
