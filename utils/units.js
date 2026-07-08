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
