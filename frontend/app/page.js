"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ScratchCard from "@/components/ScratchCard";
import Button from "@/components/Button";
import Lift from "@/components/Lift";
import LeadForm from "@/components/screens/LeadForm";
import OtpStep from "@/components/screens/OtpStep";
import WonModal from "@/components/screens/WonModal";
import LoseModal from "@/components/screens/LoseModal";
import CouponWallet from "@/components/screens/CouponWallet";
import AllSet from "@/components/screens/AllSet";
import { api } from "@/lib/api";
import { RENDER_MODE, now, onTick, renderParam } from "@/lib/clock";
import { REVEAL_DELAY } from "@/lib/motion";
import * as sound from "@/lib/sound";
import * as haptics from "@/lib/haptics";
import { onAccent } from "@/lib/color";
import { resolveThemeStyle, liveFestival, festivalStyle } from "@/lib/theme";
import SeasonalParticles from "@/components/SeasonalParticles";
import styles from "./page.module.css";

// Saved login for returning customers (skip form + OTP next time).
const TOKEN_KEY = "scratchToken";

export default function Page() {
  // landing | form | otp | scratching | revealed | won | allset
  const [state, setState] = useState("landing");
  const [segments, setSegments] = useState(undefined);
  const [settings, setSettings] = useState(null);
  const [session, setSession] = useState(null); // { sessionId, mobile, devOtp }
  const [loggedIn, setLoggedIn] = useState(false);
  const [reward, setReward] = useState(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configError, setConfigError] = useState(false);
  const [sceneAt, setSceneAt] = useState(0); // when the landing scene (re)started
  const [revealAt, setRevealAt] = useState(Infinity); // when the foil came off
  const [resetKey, setResetKey] = useState(0); // bump → fresh foil
  const [revealSignal, setRevealSignal] = useState(0); // bump → clear foil instantly
  const [soundOn, setSoundOn] = useState(true);
  const rewardRef = useRef(null);
  rewardRef.current = reward;

  const scratching = state === "scratching";
  const busy = state === "scratching" || state === "revealed";

  const loadConfig = () => {
    setConfigError(false);
    api
      .getConfig()
      .then((d) => {
        setSegments(d.segments);
        setSettings(d.settings);
      })
      .catch(() => setConfigError(true));
  };

  useEffect(loadConfig, []);

  useEffect(() => setSoundOn(!sound.isMuted()), []);

  // Static export bakes metadata.title at build time, so apply the admin's brand name here.
  useEffect(() => {
    if (settings?.brandName) document.title = `Scratch & Win — ${settings.brandName}`;
  }, [settings?.brandName]);

  // Returning customer: resume from saved token so they skip the form/OTP and can play directly.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    api
      .me(token)
      .then((d) => {
        setSession({ sessionId: d.sessionId, name: d.name, mobile: d.mobile });
        setLoggedIn(true);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY));
  }, []);

  const cardReady = Array.isArray(segments) && segments.length > 0;

  // settings.liveFestival is the server-resolved live skin (a festival in its
  // date window already wins over the admin's manual activation — see
  // /api/config). The legacy fixed-theme resolver stays as a fallback.
  const seasonalTheme =
    festivalStyle(liveFestival(settings)) ||
    resolveThemeStyle(settings?.theme, settings?.themeConfig);
  const accent = seasonalTheme?.accentColor || settings?.accentColor;
  const themeVars = settings?.accentColor
    ? {
        "--brand": seasonalTheme?.themeColor || settings.themeColor,
        "--accent": accent,
        "--on-accent": onAccent(accent),
        ...(seasonalTheme ? { "--device-bg": seasonalTheme.background } : {}),
      }
    : undefined;

  // The foil dissolves, the prize holds for a beat, then the result card opens.
  const wonAt = revealAt === Infinity ? Infinity : revealAt + REVEAL_DELAY;
  useEffect(() => {
    if (state !== "revealed" || wonAt === Infinity) return;
    return onTick((t) => {
      if (t >= wonAt) setState("won");
    });
  }, [state, wonAt]);

  // Render mode: `?render&scratch=3@1.5` shows prize 3 revealed at t=1.5 with
  // no API calls, so any frame of the reveal can be captured.
  useEffect(() => {
    if (!RENDER_MODE || !cardReady) return;
    const spec = renderParam("scratch");
    if (!spec) return;
    const [i, at] = spec.split("@").map(Number);
    const label = segments[i]?.label || "";
    const isWin = !/try again/i.test(label);
    setReward({ index: i, label, isWin, code: isWin ? "DHEE-7Q4K" : null });
    setRevealAt(at || 0);
    setState("revealed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardReady]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    sound.setMuted(!next);
    if (!next) haptics.cancel();
    if (next) sound.unlock();
  };

  const goForm = () => {
    setError("");
    setState("form");
  };

  const submitLead = async (payload) => {
    setError("");
    setLoading(true);
    try {
      const data = await api.submitLead(payload);
      setSession({ ...data, name: data.name });
      setState("otp");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const data = await api.resend(session.sessionId);
      setSession((s) => ({ ...s, devOtp: data.devOtp }));
    } catch (e) {
      setError(e.message);
    }
  };

  // The server draws the prize *before* the foil can be scratched, so the
  // outcome can't be guessed or forged client-side.
  const armCard = (result) => {
    setReward(result);
    setRevealAt(Infinity);
    setState("scratching");
  };

  const unlockFeedback = () => {
    if (soundOn) {
      sound.unlock();
      haptics.tap(); // inside the tap: the one moment iOS reliably allows a haptic
    }
  };

  const verifyAndPlay = async (code) => {
    unlockFeedback();
    setError("");
    setLoading(true);
    try {
      const { token } = await api.verify(session.sessionId, code);
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        setLoggedIn(true);
      }
      armCard(await api.spin(session.sessionId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Logged-in returning customer gets a card straight away — no form, no OTP.
  const playNow = async () => {
    unlockFeedback();
    setError("");
    setLoading(true);
    try {
      armCard(await api.spin(session.sessionId));
    } catch (e) {
      setError(e.message);
      setState("landing");
    } finally {
      setLoading(false);
    }
  };

  const onCardPlay = () => {
    if (state !== "landing" || loading) return;
    if (loggedIn) playNow();
    else goForm();
  };

  const onRevealed = () => {
    const r = rewardRef.current;
    const t = now();
    setRevealAt(t);
    setState("revealed");
    if (!RENDER_MODE && soundOn) {
      sound.scheduleReveal({ revealIn: REVEAL_DELAY, win: r?.isWin });
      haptics.reveal(r?.isWin);
    }
  };

  const reset = async () => {
    // Leave the "all set" screen first, then clear reward — otherwise an async
    // resume below would re-render AllSet with a null reward.
    setState("landing");
    setReward(null);
    setRevealAt(Infinity);
    setResetKey((k) => k + 1);
    setError("");
    haptics.cancel();
    setSceneAt(now());
    // Keep returning customers logged in — hand them a fresh session to play again.
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const d = await api.me(token);
        setSession({ sessionId: d.sessionId, name: d.name, mobile: d.mobile });
        setLoggedIn(true);
        setState("landing");
        return;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setSession(null);
    setLoggedIn(false);
    setState("landing");
  };

  // Forget the saved token; reset() then finds none and drops back to the
  // signed-out landing (form + OTP on the next card).
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setWalletOpen(false);
    reset();
  };

  const sheetOpen = state === "form" || state === "otp";
  const revealedNow = state === "revealed" || state === "won";

  const header = (
    <Header
      brandName={settings?.brandName}
      logoText={settings?.logoText}
      logoImage={settings?.logoImage}
      soundOn={soundOn}
      onToggleSound={toggleSound}
      onOpenCoupons={loggedIn && !busy ? () => setWalletOpen(true) : undefined}
    />
  );

  const wallet = walletOpen && (
    <CouponWallet
      token={typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null}
      segments={segments}
      brand={settings}
      onClose={() => setWalletOpen(false)}
      onLogout={logout}
    />
  );

  if (state === "allset" && reward) {
    return (
      <main className="stage">
        <div className="device" style={themeVars}>
          <SeasonalParticles effect={seasonalTheme?.particles} />
          <div className="screen">
            {header}
            <AllSet name={session?.name} reward={reward} image={segments?.[reward.index]?.image} onDone={reset} />
            {wallet}
          </div>
        </div>
      </main>
    );
  }

  let buttonLabel;
  let buttonAction;
  if (configError) {
    buttonLabel = "Try again";
    buttonAction = loadConfig;
  } else if (!cardReady) {
    buttonLabel = "Loading…";
  } else if (scratching) {
    buttonLabel = "Reveal Instantly";
    buttonAction = () => setRevealSignal((n) => n + 1);
  } else {
    buttonLabel = loggedIn ? "Scratch a New Card" : "Scratch & Win Now";
    buttonAction = loggedIn ? playNow : goForm;
  }
  const buttonBusy = state === "revealed" || loading || (!cardReady && !configError);

  return (
    <main className="stage">
      <div className="device" style={themeVars}>
        <SeasonalParticles effect={seasonalTheme?.particles} />
        <div className="screen">
          {header}

          <div className={`${styles.top} ${sheetOpen ? styles.dimmed : ""}`}>
            <Hero
              badge={settings?.tagline}
              segments={segments}
              sceneAt={sceneAt}
              scratching={scratching}
              result={revealedNow ? reward : null}
            />
          </div>

          <div className={`${styles.cardArea} ${sheetOpen ? styles.cardPushed : ""}`}>
            <ScratchCard
              segments={segments}
              reward={reward}
              armed={scratching}
              revealed={RENDER_MODE && revealedNow}
              revealSignal={revealSignal}
              resetKey={resetKey}
              size={settings?.wheelSize}
              brandName={settings?.brandName}
              logoImage={settings?.logoImage}
              disabled={loading || sheetOpen}
              loadError={configError}
              sounds={soundOn && !RENDER_MODE}
              onPlay={state === "landing" ? onCardPlay : undefined}
              onReveal={onRevealed}
            />
            <span className="srOnly" aria-live="polite">
              {configError
                ? "Could not load the scratch card"
                : !cardReady
                  ? "Loading scratch card"
                  : scratching
                    ? "Your card is ready. Scratch it, or use Reveal Instantly."
                    : "Scratch card ready"}
            </span>
          </div>

          {(state === "landing" || busy) && (
            <Lift at={sceneAt + 0.55} className={styles.footer}>
              {scratching ? (
                <p className={styles.tagline}>Scratch the silver panel with your finger to reveal your reward.</p>
              ) : (
                !loggedIn && (
                  <p className={styles.tagline}>
                    Enter your details and scratch your card — discount coupons and exciting rewards.
                  </p>
                )
              )}
              {error && state === "landing" && <p className={styles.error}>{error}</p>}
              {configError && state === "landing" && (
                <p className={styles.error}>Couldn’t load the card. Check your connection and try again.</p>
              )}
              <Button onClick={buttonAction} loading={buttonBusy} disabled={buttonBusy}>
                {buttonLabel}
              </Button>
            </Lift>
          )}

          {state === "form" && (
            <LeadForm loading={loading} error={error} onSubmit={submitLead} brandName={settings?.brandName} />
          )}

          {state === "otp" && (
            <OtpStep
              mobile={session?.mobile}
              devOtp={session?.devOtp}
              loading={loading}
              error={error}
              onVerify={verifyAndPlay}
              onResend={resend}
            />
          )}

          {state === "won" && reward && !reward.isWin && (
            <LoseModal startAt={wonAt} spinLimit={settings?.maxSpinsPer} onDone={reset} />
          )}
          {state === "won" && reward?.isWin && (
            <WonModal
              reward={reward}
              image={segments?.[reward.index]?.image}
              startAt={wonAt}
              onDone={() => setState("allset")}
              particleEffect={seasonalTheme?.particles || "confetti"}
            />
          )}
          {wallet}
        </div>
      </div>
    </main>
  );
}
