"use client";

import { useEffect, useState } from "react";
import { truncate, fullTitle } from "@/lib/format";
import styles from "./admin.module.css";

const fmt = (ms) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/**
 * Client-side pagination for the records tables: keeps the DOM small (and
 * scrolling fast) once a shop has hundreds of spins/users, without a server
 * round-trip per page. Resets to page 1 whenever resetKey changes (tab or
 * search text), and clamps if the list shrinks under the current page.
 */
const PAGE_SIZES = [10, 25, 50, 100];

function usePaged(items, resetKey) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => setPage(1), [resetKey]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    setPageSize: (n) => {
      setPageSize(n);
      setPage(1);
    },
    start,
    total: items.length,
  };
}

// Compact page list: 1 … 4 5 6 … 12 — never more than 7 entries.
function pageList(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const near = [page - 1, page, page + 1].filter((n) => n > 1 && n < pageCount);
  const out = [1];
  if (near.length && near[0] > 2) out.push("…");
  out.push(...near);
  if (near.length && near[near.length - 1] < pageCount - 1) out.push("…");
  if (!out.includes(pageCount)) out.push(pageCount);
  return out;
}

function Pager({ paged }) {
  const { page, setPage, pageCount, pageSize, setPageSize, start, total } = paged;
  if (total === 0) return null;
  return (
    <div className={styles.pager}>
      <span className={styles.pagerInfo}>
        Showing {total === 0 ? 0 : start + 1}–{start + paged.pageItems.length} of {total}
      </span>
      <label className={styles.pagerSize}>
        Per page
        <select
          className={styles.select}
          style={{ width: "auto", padding: "6px 8px" }}
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className={styles.pagerBtns}>
        <button type="button" className={styles.pagerBtn} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
          ← Prev
        </button>
        {pageList(page, pageCount).map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className={styles.pagerGap} aria-hidden="true">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={`${styles.pagerBtn} ${n === page ? styles.pagerBtnActive : ""}`}
              onClick={() => setPage(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
            >
              {n}
            </button>
          )
        )}
        <button type="button" className={styles.pagerBtn} disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">
          Next →
        </button>
      </div>
    </div>
  );
}

const WA_LABELS = {
  sent: "✅ Sent",
  simulated: "🧪 Simulated",
  pending: "⏳ Pending",
  failed: "⚠️ Failed",
  "opted-out": "🚫 Opted out",
  disabled: "Off",
  skipped: "—",
};
const waLabel = (s) => WA_LABELS[s] || s || "—";

export default function Records({ users, spins, onRefresh, onUpdateStatus }) {
  const [tab, setTab] = useState("spins");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");

  // Search by name, phone number, or coupon code.
  const matchSpin = (s) =>
    !q ||
    s.userName?.toLowerCase().includes(q) ||
    (digits && s.userMobile?.includes(digits)) ||
    s.code?.toLowerCase().includes(q) ||
    s.couponTitle?.toLowerCase().includes(q);

  const matchUser = (u) =>
    !q ||
    u.name?.toLowerCase().includes(q) ||
    (digits && u.mobile?.includes(digits)) ||
    u.lastSpin?.code?.toLowerCase().includes(q);

  const filteredSpins = spins.filter(matchSpin);
  const filteredUsers = users.filter(matchUser);
  const shown = tab === "spins" ? filteredSpins.length : filteredUsers.length;
  const total = tab === "spins" ? spins.length : users.length;

  return (
    <div className={styles.card}>
      <div className={styles.couponHead} style={{ marginBottom: 14 }}>
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${tab === "spins" ? "" : styles.btnGhost}`}
            onClick={() => setTab("spins")}
          >
            Plays &amp; coupons ({spins.length})
          </button>
          <button
            className={`${styles.btn} ${tab === "users" ? "" : styles.btnGhost}`}
            onClick={() => setTab("users")}
          >
            Registered users ({users.length})
          </button>
        </div>
        <button className={`${styles.btnGhost} ${styles.btn}`} onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>

      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden="true">🔍</span>
        <input
          className={styles.input}
          style={{ paddingLeft: 38 }}
          type="search"
          aria-label="Search by name, phone, or coupon code"
          placeholder="Search by name, phone, or coupon code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className={styles.searchClear} onClick={() => setQuery("")} aria-label="Clear search">
            ×
          </button>
        )}
      </div>
      {q && (
        <p className={styles.cardDesc} style={{ marginTop: 8 }}>
          Showing <strong>{shown}</strong> of {total} {tab === "spins" ? "plays" : "users"} matching
          &ldquo;{query}&rdquo;.
        </p>
      )}

      {tab === "spins" ? (
        <SpinsTable spins={filteredSpins} onUpdateStatus={onUpdateStatus} resetKey={`spins:${q}`} empty={q ? "No plays match your search." : undefined} />
      ) : (
        <UsersTable users={filteredUsers} resetKey={`users:${q}`} empty={q ? "No users match your search." : undefined} />
      )}
    </div>
  );
}

function SpinsTable({ spins, onUpdateStatus, empty, resetKey }) {
  const ordered = [...spins].reverse();
  const paged = usePaged(ordered, resetKey);
  if (spins.length === 0) return <div className={styles.empty}>{empty || "No plays recorded yet."}</div>;
  return (
    <>
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>User</th>
            <th>Mobile</th>
            <th>Scratched at</th>
            <th>Won coupon</th>
            <th>Code</th>
            <th>WhatsApp</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {paged.pageItems.map((s) => (
            <tr key={s.id}>
              <td title={fullTitle(s.userName)}>{truncate(s.userName)}</td>
              <td className={styles.muted}>+91 {s.userMobile}</td>
              <td className={styles.muted}>{fmt(s.spunAt)}</td>
              <td>{s.isWin ? s.couponTitle : "—"}</td>
              <td>{s.code ? <span className={styles.code}>{s.code}</span> : "—"}</td>
              <td className={styles.muted}>{s.isWin ? waLabel(s.waStatus) : "—"}</td>
              <td>
                {s.isWin ? (
                  <select
                    className={styles.select}
                    style={{ width: "auto", padding: "6px 10px" }}
                    value={s.status}
                    onChange={(e) => onUpdateStatus(s.id, e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="redeemed">Redeemed</option>
                    <option value="expired">Expired</option>
                  </select>
                ) : (
                  <span className={`${styles.status} ${styles.statusnowin}`}>No win</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pager paged={paged} />
    </>
  );
}

function UsersTable({ users, empty, resetKey }) {
  const ordered = [...users].reverse();
  const paged = usePaged(ordered, resetKey);
  if (users.length === 0) return <div className={styles.empty}>{empty || "No registered users yet."}</div>;
  return (
    <>
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Mobile</th>
            <th>Registered</th>
            <th>Plays</th>
            <th>Last reward</th>
            <th>Marketing</th>
          </tr>
        </thead>
        <tbody>
          {paged.pageItems.map((u) => (
            <tr key={u.id}>
              <td title={fullTitle(u.name)}>{truncate(u.name)}</td>
              <td className={styles.muted}>+91 {u.mobile}</td>
              <td className={styles.muted}>{fmt(u.createdAt)}</td>
              <td>{u.spinCount}</td>
              <td>
                {u.lastSpin?.isWin ? (
                  <>
                    {u.lastSpin.couponTitle}{" "}
                    <span className={`${styles.status} ${styles["status" + u.lastSpin.status]}`}>
                      {u.lastSpin.status}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={styles.muted}>{u.marketingOptIn ? "Opted in" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pager paged={paged} />
    </>
  );
}
