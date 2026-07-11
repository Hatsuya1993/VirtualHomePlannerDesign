// Feet/inches formatting helpers for wall dimensions.
export const inchesToFeet = (totalInches) => {
    const rounded = Math.round(totalInches);
    const feet = Math.floor(rounded / 12);
    const inches = rounded % 12;
    return { feet, inches };
};

export const feetInchesToInches = (feet, inches) => feet * 12 + inches;

export const formatFeetInches = (totalInches) => {
    const { feet, inches } = inchesToFeet(totalInches);
    return `${feet}' ${inches}"`;
};

export const formatInches = (totalInches) => `${Math.round(totalInches)}"`;

const IN_PER_METER = 39.3700787;

// The "Decimals" setting is a fraction denominator (1,2,4,8,16) for imperial.
// For metric it maps to a number of decimal places: 1->0, 2->1, 4->2, 8->3,
// 16->4 (i.e. log2 of the denominator), so the same control is meaningful for
// both unit families.
export const metricDecimals = (precision) => {
    const d = Math.round(Math.log2(precision || 1));
    return Math.max(0, Math.min(4, d));
};

// Format a length (given in inches) in the user-selected unit system.
// `units` is { system: "m"|"cm"|"ft"|"in", precision: 1|2|4|8|16 }.
export const formatLength = (totalInches, units) => {
    const system = units?.system ?? "ft";
    const precision = units?.precision ?? 1;

    if (system === "m")
        return `${(totalInches / IN_PER_METER).toFixed(metricDecimals(precision))} m`;
    if (system === "cm")
        return `${(totalInches * 2.54).toFixed(metricDecimals(precision))} cm`;

    // Imperial: round to the nearest 1/precision inch, then reduce the fraction.
    const denom = precision || 1;
    const ticks = Math.round(totalInches * denom); // count of 1/denom inches
    const wholeInches = Math.floor(ticks / denom);
    let num = ticks - wholeInches * denom;
    let d = denom;
    while (num !== 0 && num % 2 === 0 && d % 2 === 0) {
        num /= 2;
        d /= 2;
    }
    const frac = num === 0 ? "" : ` ${num}/${d}`;

    if (system === "in") return `${wholeInches}${frac}"`;

    const feet = Math.floor(wholeInches / 12);
    const inches = wholeInches % 12;
    return `${feet}' ${inches}${frac}"`;
};

// Format an area (given in square feet) in the user-selected unit system.
export const formatArea = (areaSqFt, units) => {
    const system = units?.system ?? "ft";
    const precision = units?.precision ?? 1;
    if (system === "m") return `${(areaSqFt * 0.09290304).toFixed(metricDecimals(precision))} m²`;
    if (system === "cm") return `${(areaSqFt * 929.0304).toFixed(0)} cm²`;
    if (system === "in") return `${Math.round(areaSqFt * 144)} in²`;
    return `${areaSqFt.toFixed(1)} ft²`;
};

// Wall thickness is a small value, so imperial systems show it in plain inches
// (no feet), while metric systems use the same formatter as any other length.
export const formatThickness = (totalInches, units) => {
    const system = units?.system ?? "ft";
    if (system === "ft") return formatLength(totalInches, { ...units, system: "in" });
    return formatLength(totalInches, units);
};
