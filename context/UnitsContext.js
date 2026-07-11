import { createContext, useContext, useState } from "react";

// The measurement unit + fraction precision used to display every dimension in
// the app (wall size summary, measurement labels, etc.). `system` is one of
// "m" | "cm" | "ft" | "in"; `precision` is the fraction denominator used when
// displaying imperial values (1 = whole inches, 2 = 1/2", 4 = 1/4", ...).
export const DEFAULT_UNITS = { system: "ft", precision: 1 };

const UnitsContext = createContext({
    units: DEFAULT_UNITS,
    setUnits: () => {},
});

export const UnitsProvider = ({ children }) => {
    const [units, setUnits] = useState(DEFAULT_UNITS);
    return (
        <UnitsContext.Provider value={{ units, setUnits }}>
            {children}
        </UnitsContext.Provider>
    );
};

export const useUnits = () => useContext(UnitsContext);
