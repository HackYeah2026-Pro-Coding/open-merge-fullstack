import type { TokenAmount } from '@escrow/shared';
import { formatUnits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCountUp } from '@/lib/use-count-up';

type AmountProps = {
  value: TokenAmount;
  className?: string;
  /** Count up from zero on mount and between changes. */
  animate?: boolean;
  /** Hide the token symbol, e.g. when a column header already names it. */
  hideSymbol?: boolean;
  /** Set when rendered at 18px or more. Smaller amounts use the darker money-text shade for contrast. */
  large?: boolean;
};

/** A reward amount: amber, mono, tabular. Amber is reserved for money. */
export function Amount({ value, className, animate, hideSymbol, large }: AmountProps) {
  return (
    <span className={cn('data whitespace-nowrap', large ? 'text-money' : 'text-money-text', className)}>
      {animate ? <CountingUnits value={value} /> : formatUnits(value.amount, value.decimals)}
      {!hideSymbol && <span className="ml-[0.35em] text-[0.72em] font-medium tracking-wide opacity-80">{value.symbol}</span>}
    </span>
  );
}

const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CountingUnits({ value }: { value: TokenAmount }) {
  const exact = formatUnits(value.amount, value.decimals);
  // Floats are fine for the in-between frames; the resting value is exact.
  const target = Number(value.amount) / 10 ** value.decimals;
  const { value: current, done } = useCountUp(target, 900);
  return (
    <>
      <span aria-hidden>{done ? exact : TWO_DECIMALS.format(current)}</span>
      <span className="sr-only">{exact}</span>
    </>
  );
}
