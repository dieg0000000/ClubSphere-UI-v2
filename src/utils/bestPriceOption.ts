export interface PriceOptionCandidate {
  id: string;
  label: string;
  seats: number;
  price: number;
}

export interface BestPriceResult {
  optionId: string;
  label: string;
  quantity: number;
  total: number;
  originalTotal: number;
  switched: boolean;
}

export function findBestPriceOption(
  allOptions: PriceOptionCandidate[],
  currentOptionId: string,
  currentQuantity: number
): BestPriceResult | null {
  const currentOption = allOptions.find((o) => o.id === currentOptionId);
  if (!currentOption || currentQuantity <= 0) return null;

  const totalSeats = currentOption.seats * currentQuantity;
  const currentTotal = currentOption.price * currentQuantity;

  let best: { option: PriceOptionCandidate; qty: number; cost: number } | null = null;

  for (const opt of allOptions) {
    if (opt.seats <= 0) continue;
    if (totalSeats % opt.seats !== 0) continue;
    const qty = totalSeats / opt.seats;
    const cost = opt.price * qty;
    if (
      !best ||
      cost < best.cost ||
      (cost === best.cost && opt.seats > best.option.seats)
    ) {
      best = { option: opt, qty, cost };
    }
  }

  if (!best) return null;

  const switched = best.option.id !== currentOptionId || best.qty !== currentQuantity;

  return {
    optionId: best.option.id,
    label: best.option.label,
    quantity: best.qty,
    total: best.cost,
    originalTotal: currentTotal,
    switched,
  };
}
