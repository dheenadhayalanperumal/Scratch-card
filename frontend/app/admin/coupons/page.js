"use client";

import Coupons from "@/components/admin/Coupons";
import { useAdmin } from "../adminContext";

export default function CouponsPage() {
  const { coupons, segments, createCoupon, updateCoupon, deleteCoupon } = useAdmin();
  return (
    <Coupons
      coupons={coupons}
      segments={segments}
      onCreate={createCoupon}
      onUpdate={updateCoupon}
      onDelete={deleteCoupon}
    />
  );
}
