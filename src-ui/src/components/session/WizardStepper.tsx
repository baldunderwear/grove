import { Fragment } from 'react';
import { Check } from 'lucide-react';

const STEPS = ['Summary', 'Commits', 'Merge', 'Cleanup'] as const;

interface WizardStepperProps {
  currentStep: number;
}

export function WizardStepper({ currentStep }: WizardStepperProps) {
  return (
    <div className="flex items-center justify-between w-full">
      {STEPS.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && (
            <div
              className={`flex-1 h-px mx-2 ${
                i <= currentStep
                  ? 'bg-[var(--grove-leaf)]'
                  : 'border-t border-dashed border-[var(--grove-canopy)]'
              }`}
            />
          )}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                i < currentStep
                  ? 'bg-[var(--grove-leaf)] text-white'
                  : i === currentStep
                    ? 'bg-[var(--grove-leaf)] text-white font-semibold'
                    : 'border-2 border-[var(--grove-canopy)] text-[var(--grove-stone)]'
              }`}
            >
              {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={`font-mono text-xs ${
                i === currentStep
                  ? 'text-[var(--grove-fog)]'
                  : 'text-[var(--grove-stone)]'
              }`}
            >
              {label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
