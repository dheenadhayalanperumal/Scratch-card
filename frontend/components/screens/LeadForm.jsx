"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import TextField from "@/components/TextField";
import Checkbox from "@/components/Checkbox";
import Button from "@/components/Button";
import { api } from "@/lib/api";
import {
  NAME_MAX_LEN,
  MOBILE_LEN,
  normalizeName,
  cleanMobileInput,
  validateName,
  validateMobile,
} from "@/lib/validation";
import styles from "./SheetContent.module.css";

export default function LeadForm({ loading, error, onSubmit, brandName }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [optIn, setOptIn] = useState(true);
  // Field errors only appear once the field has been touched or submit attempted.
  const [touched, setTouched] = useState({});
  // Returning-customer lookup by mobile number: null = not checked yet,
  // "" = checked and new, non-empty = the name already on file for this number.
  const [knownName, setKnownName] = useState(null);

  const mobileError = validateMobile(mobile);
  const isReturning = Boolean(knownName);
  const nameError = isReturning ? null : validateName(name);

  // Once the mobile number is complete, ask the backend whether it's already
  // registered — a returning customer should never be asked for their name again.
  useEffect(() => {
    setKnownName(null);
    if (validateMobile(mobile)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .checkMobile(mobile)
        .then((d) => {
          if (!cancelled) setKnownName(d.known ? d.name : "");
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mobile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, mobile: true });
    if (mobileError) return;

    // If the lookup hasn't resolved yet (e.g. pasted + submitted immediately),
    // resolve it inline before deciding whether a name is required.
    let returning = isReturning;
    if (knownName === null) {
      try {
        const d = await api.checkMobile(mobile);
        setKnownName(d.known ? d.name : "");
        returning = Boolean(d.known);
      } catch {
        returning = false;
      }
    }

    if (returning) {
      onSubmit({ mobile, marketingOptIn: optIn });
    } else {
      if (validateName(name)) return;
      onSubmit({ name: normalizeName(name), mobile, marketingOptIn: optIn });
    }
  };

  return (
    <Sheet>
      {/* noValidate: our inline messages own validation, so the browser's own
          bubble doesn't preempt them for empty fields. */}
      <form onSubmit={handleSubmit} className={styles.body} noValidate>
        <h2 className={styles.title}>Almost there</h2>
        <p className={styles.sub}>
          Enter your details to unlock your scratch card. We&rsquo;ll text your reward
          straight to your phone.
        </p>

        <TextField
          label="Mobile number"
          prefix="+91"
          placeholder="00000 00000"
          inputMode="numeric"
          value={mobile}
          onChange={(e) => setMobile(cleanMobileInput(e.target.value))}
          onBlur={() => setTouched((t) => ({ ...t, mobile: true }))}
          error={touched.mobile ? mobileError : null}
          autoComplete="tel"
          required
        />

        {isReturning ? null : (
          <TextField
            label="Your name"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX_LEN))}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            error={touched.name ? nameError : null}
            maxLength={NAME_MAX_LEN}
            autoComplete="name"
            required
          />
        )}

        <Checkbox checked={optIn} onChange={setOptIn}>
          Send me offers &amp; rewards{brandName ? ` from ${brandName}` : ""}. You can opt out anytime.
        </Checkbox>

        {error && <p className={styles.error}>{error}</p>}

        <Button type="submit" loading={loading} icon="🪙" className={styles.cta}>
          Scratch &amp; Win Now
        </Button>
      </form>
    </Sheet>
  );
}
