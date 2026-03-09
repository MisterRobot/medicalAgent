import React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number[];
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number[]) => void;
  className?: string;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, min, max, step = 1, value, onValueChange, ...props }, ref) => {
    const val = value[0] ?? min;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onValueChange([newValue]);
    };

    const percentage = ((val - min) / (max - min)) * 100;

    return (
      <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
        <input
          type="range"
          ref={ref}
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={handleChange}
          className="absolute h-full w-full opacity-0 cursor-pointer z-10"
          {...props}
        />
        <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-800">
          <div
            className="absolute h-full bg-teal-500 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div
          className="absolute h-5 w-5 rounded-full border-2 border-teal-500 bg-black ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          style={{ left: `calc(${percentage}% - 10px)` }}
        />
      </div>
    );
  }
);

Slider.displayName = "Slider";
