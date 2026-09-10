import React, { useEffect, useState, useRef } from 'react';

export interface AnimatedNumberProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  duration?: number; // ms, default 250
  formatValue?: (value: number) => string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 250,
  formatValue = (v) => Math.round(v).toString(),
  className = '',
  ...props
}) => {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousValueRef = useRef<number>(value);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion || duration <= 0) {
      previousValueRef.current = value;
      return;
    }

    const startValue = previousValueRef.current;
    const endValue = value;

    if (startValue === endValue) {
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: 1 - (1 - t)^3
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * easeProgress;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        previousValueRef.current = endValue;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      previousValueRef.current = value;
    };
  }, [value, duration, prefersReducedMotion]);

  const rendered = prefersReducedMotion ? value : displayValue;

  return (
    <span className={`font-mono-meta tabular-nums ${className}`} {...props}>
      {formatValue(rendered)}
    </span>
  );
};

export default AnimatedNumber;
