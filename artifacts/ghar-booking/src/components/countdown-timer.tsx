import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface CountdownTimerProps {
  expiresAt: string | null;
  onExpire?: () => void;
  amount: number;
}

export function CountdownTimer({ expiresAt, onExpire, amount }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    if (!expiresAt) return;

    const targetDate = new Date(expiresAt).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        onExpire?.();
      } else {
        setTimeLeft(difference);
        setIsExpired(false);
      }
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [expiresAt, onExpire]);

  if (!expiresAt) return null;

  if (isExpired) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center animate-in fade-in duration-500">
        <h3 className="text-lg font-bold text-red-700 mb-1">Offer Has Expired</h3>
        <p className="text-sm text-red-600/80">Scroll down to request a new offer from the owner.</p>
      </div>
    );
  }

  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  const totalSeconds = timeLeft / 1000;

  const isUrgent = totalSeconds < 120; // < 2 min
  const isWarning = totalSeconds < 300; // < 5 min

  const bgClass = isUrgent
    ? "bg-red-50 border-red-300"
    : isWarning
    ? "bg-amber-50 border-amber-300"
    : "bg-primary/10 border-primary/20";

  const textClass = isUrgent
    ? "text-red-700"
    : isWarning
    ? "text-amber-700"
    : "text-primary";

  const digitBg = isUrgent
    ? "border-red-200 bg-white"
    : isWarning
    ? "border-amber-200 bg-white"
    : "border-primary/10 bg-white";

  return (
    <div className={`border rounded-xl p-5 text-center shadow-sm relative overflow-hidden transition-colors duration-1000 ${bgClass}`}>
      {isUrgent && (
        <div className="absolute inset-0 bg-red-100/40 animate-pulse pointer-events-none" />
      )}
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-center gap-2">
          {isWarning && <AlertTriangle className={`w-4 h-4 ${textClass}`} />}
          <h3 className={`text-sm font-semibold uppercase tracking-wider ${textClass}`}>
            {isUrgent ? "Hurry! Offer expiring very soon" : isWarning ? "Almost out of time" : "Offer reserved exclusively for you"}
          </h3>
        </div>
        <p className={`text-xs ${textClass} opacity-80`}>
          Pay <strong>{formatCurrency(amount)}</strong> to lock this room before the offer disappears
        </p>
        <div className="flex justify-center items-center gap-3">
          <div className={`px-5 py-3 rounded-lg shadow-sm border w-20 ${digitBg}`}>
            <span className={`text-3xl font-bold block tabular-nums ${textClass}`}>{minutes.toString().padStart(2, '0')}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5 block">Min</span>
          </div>
          <span className={`text-2xl font-bold opacity-50 mb-5 ${textClass}`}>:</span>
          <div className={`px-5 py-3 rounded-lg shadow-sm border w-20 ${digitBg}`}>
            <span className={`text-3xl font-bold block tabular-nums ${textClass}`}>{seconds.toString().padStart(2, '0')}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5 block">Sec</span>
          </div>
        </div>
        {isUrgent && (
          <p className="text-xs text-red-600 font-medium animate-pulse">
            Room will be released to other applicants when timer hits zero
          </p>
        )}
      </div>
    </div>
  );
}
