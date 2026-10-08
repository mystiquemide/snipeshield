import { useEffect } from "react";

/** Rolls each digit into place like an odometer. Non-digits (commas, dots, units) render as-is. */
export function Odometer({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`odo ${className}`} aria-label={value}>
      {[...value].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="odo-col" aria-hidden="true">
            <span className="odo-strip" style={{ transform: `translateY(-${Number(ch) * 1.15}em)` }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">{ch}</span>
        )
      )}
    </span>
  );
}

/** Fades sections up as they scroll into view. Only hides content once JS is running. */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js-reveal");
    const els = [...document.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)")];
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-visible")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
