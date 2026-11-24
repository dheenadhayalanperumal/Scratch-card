"use client";

import RedeemCoupon from "@/components/admin/RedeemCoupon";
import { useAdmin } from "../adminContext";

export default function RedeemPage() {
  const { refreshRecords, spins } = useAdmin();
  return <RedeemCoupon onChanged={refreshRecords} spins={spins} />;
}
