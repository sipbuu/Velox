import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useUi } from "@/store/ui";
import { useFilters } from "@/store/filters";

export function PinPrompt() {
  const { pinRequest, settlePin } = useUi();
  const verifyPin = useFilters((s) => s.verifyPin);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pinRequest) {
      setPin("");
      setError(false);
      setTimeout(() => input.current?.focus(), 50);
    }
  }, [pinRequest]);

  if (!pinRequest) return null;

  const submit = async () => {
    if (await verifyPin(pin)) settlePin(true);
    else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-6 backdrop-blur-sm">
      <form
        className="glass-strong w-full max-w-xs rounded-glass-xl p-6 text-center animate-fade-up"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Lock size={22} />
        </div>
        <p className="font-semibold">Enter parental PIN</p>
        <p className="mt-1 text-sm text-ink-muted">{pinRequest.reason}</p>
        <input
          ref={input}
          className={`input mt-4 text-center text-2xl tracking-[0.5em] ${error ? "ring-2 ring-live" : ""}`}
          inputMode="numeric"
          type="password"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        {error && <p className="mt-2 text-xs text-live">Wrong PIN</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-glass flex-1" onClick={() => settlePin(false)}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={pin.length < 4}>
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
