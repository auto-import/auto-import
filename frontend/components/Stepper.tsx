'use client';

import { Check } from 'lucide-react';

interface StepperProps {
  steps: string[];
  currentIndex: number;
}

export default function Stepper({ steps, currentIndex }: StepperProps) {
  return (
    <div className="flex items-center justify-between w-full py-4">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full border-2 shrink-0 transition-colors
                  ${isCompleted
                    ? 'bg-stepper-completed border-stepper-completed text-white'
                    : isCurrent
                      ? 'bg-stepper-current border-stepper-current text-white'
                      : 'bg-white border-stepper-future text-stepper-future'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" strokeWidth={3} />
                ) : isCurrent ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-stepper-future" />
                )}
              </div>
              <span
                className={`text-xs text-center leading-tight max-w-[80px] ${
                  isFuture ? 'text-stepper-future' : 'text-foreground font-medium'
                }`}
              >
                {step}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-2 mt-[-1.25rem] self-start transition-colors
                  ${index < currentIndex ? 'bg-stepper-completed' : 'bg-stepper-future'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
