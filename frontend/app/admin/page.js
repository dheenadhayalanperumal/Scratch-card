"use client";

import { useRouter } from "next/navigation";
import Dashboard from "@/components/admin/Dashboard";
import { useAdmin } from "./adminContext";
import { TABS } from "./tabs";

export default function DashboardPage() {
  const { users, spins, coupons, segments } = useAdmin();
  const router = useRouter();

  const go = (id) => {
    const t = TABS.find((x) => x.id === id);
    if (t) router.push(t.path);
  };

  return <Dashboard users={users} spins={spins} coupons={coupons} segments={segments} onGo={go} />;
}
