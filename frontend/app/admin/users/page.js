"use client";

import Records from "@/components/admin/Records";
import { useAdmin } from "../adminContext";

export default function UsersPage() {
  const { users, spins, refreshRecords, updateSpinStatus } = useAdmin();
  return (
    <Records
      users={users}
      spins={spins}
      onRefresh={refreshRecords}
      onUpdateStatus={updateSpinStatus}
    />
  );
}
