/**
 * Calculator Logic
 *
 * % is a BINARY operator:
 *   100 % 40  →  40% of 100  =  40     (a × b / 100)
 *   100 %     →  100 / 100   =  1      (standalone, no second number)
 *
 * After pressing = the expression line stays visible so the user can
 * see the full calculation above the result.
 */

export interface CalculationRecord {
  expression: string;
  result: string;
}

export type CalculatorOperation = "+" | "-" | "×" | "÷" | "%" | null;

export interface CalculatorState {
  display: string;
  expression: string;
  waitingForOperand: boolean;
  operator: CalculatorOperation;
  previousValue: string | null;
  history: CalculationRecord[];
  secretBuffer: string;
}

export function createInitialState(): CalculatorState {
  return {
    display: "0",
    expression: "",
    waitingForOperand: false,
    operator: null,
    previousValue: null,
    history: [],
    secretBuffer: "",
  };
}

function parseDisplay(val: string): number {
  const num = parseFloat(val.replace(/,/g, ""));
  return isNaN(num) ? 0 : num;
}

function formatDisplay(num: number): string {
  if (!isFinite(num)) return "Error";
  if (Math.abs(num) >= 1e15) return "Error";
  const str = num.toString();
  if (str.includes(".")) {
    const [, dec] = str.split(".");
    if (dec.length > 9) return parseFloat(num.toFixed(9)).toString();
  }
  return str;
}

/**
 * Core arithmetic.
 * % operator: a × b / 100  (b% of a — e.g. 100 % 40 = 40)
 */
function calculate(a: number, b: number, op: CalculatorOperation): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
    case "%": return (a * b) / 100;
    default:  return b;
  }
}

/** Digit press */
export function inputDigit(state: CalculatorState, digit: string): CalculatorState {
  const { display, waitingForOperand, secretBuffer, operator, previousValue } = state;
  const newBuffer = (secretBuffer + digit).slice(-10);

  if (waitingForOperand) {
    return {
      ...state,
      display: digit,
      waitingForOperand: false,
      secretBuffer: newBuffer,
      // Keep expression if mid-chain (e.g. "100 %"), clear it if fresh start after =
      expression: previousValue !== null && operator
        ? `${previousValue} ${operator} ${digit}`
        : "",
    };
  }

  if (display === "0" && digit !== ".") {
    const newDisplay = digit;
    return {
      ...state,
      display: newDisplay,
      secretBuffer: newBuffer,
      expression: previousValue !== null && operator
        ? `${previousValue} ${operator} ${newDisplay}`
        : state.expression,
    };
  }

  if (digit === "." && display.includes(".")) {
    return { ...state, secretBuffer: newBuffer };
  }

  if (display.length >= 15) return { ...state, secretBuffer: newBuffer };

  const newDisplay = display + digit;
  return {
    ...state,
    display: newDisplay,
    secretBuffer: newBuffer,
    expression: previousValue !== null && operator
      ? `${previousValue} ${operator} ${newDisplay}`
      : state.expression,
  };
}

/** Operator press (+, −, ×, ÷) */
export function inputOperator(
  state: CalculatorState,
  nextOp: CalculatorOperation
): CalculatorState {
  const { display, operator, previousValue, waitingForOperand } = state;

  if (waitingForOperand) {
    if (previousValue !== null) {
      // Mid-chain: just swap the pending operator (e.g. pressed × then changed mind to +)
      return {
        ...state,
        operator: nextOp,
        expression: `${previousValue} ${nextOp}`,
      };
    } else {
      // After pressing = — result is in display, treat it as the new first operand
      return {
        ...state,
        previousValue: display,
        operator: nextOp,
        expression: `${display} ${nextOp}`,
      };
    }
  }

  const current = parseDisplay(display);

  if (previousValue !== null && operator) {
    // Chain: complete previous operation first
    const prev = parseDisplay(previousValue);
    const result = calculate(prev, current, operator);
    const resultStr = formatDisplay(result);
    return {
      ...state,
      display: resultStr,
      previousValue: resultStr,
      operator: nextOp,
      waitingForOperand: true,
      expression: `${resultStr} ${nextOp}`,
    };
  }

  return {
    ...state,
    previousValue: display,
    operator: nextOp,
    waitingForOperand: true,
    expression: `${display} ${nextOp}`,
  };
}

/**
 * % press — acts as a BINARY operator so the user can enter a second number.
 *
 *   Flow 1:  100  →  %  →  40  →  =   gives  40   (40% of 100)
 *   Flow 2:  100  →  %  →         =   gives   1   (100 ÷ 100 = 1)
 *   Flow 3:  100  →  +  →  20   →  %  →  =
 *            converts the pending 20 to "20% of 100" (= 20) then adds → 120
 */
export function inputPercent(state: CalculatorState): CalculatorState {
  const { display, waitingForOperand, operator, previousValue } = state;

  // Case 3: % pressed after entering second number in a +/- chain
  // e.g. 100 + 20 → press % → convert 20 → 20% of 100 = 20, keep operator
  if (previousValue !== null && operator && operator !== "%" && !waitingForOperand) {
    const prev = parseDisplay(previousValue);
    const current = parseDisplay(display);
    let percentVal: number;
    if (operator === "+" || operator === "-") {
      percentVal = (prev * current) / 100;
    } else {
      percentVal = current / 100;
    }
    const percentStr = formatDisplay(percentVal);
    return {
      ...state,
      display: percentStr,
      expression: `${previousValue} ${operator} ${percentStr}`,
      waitingForOperand: false,
    };
  }

  // Case 1 & 2: % becomes a binary operator waiting for the second number
  return {
    ...state,
    previousValue: display,
    operator: "%",
    waitingForOperand: true,
    expression: `${display} %`,
  };
}

/** Toggle sign */
export function toggleSign(state: CalculatorState): CalculatorState {
  const current = parseDisplay(state.display);
  return { ...state, display: formatDisplay(-current) };
}

/** Equals — expression stays visible above the result */
export function inputEquals(
  state: CalculatorState
): CalculatorState & { triggeredVault: boolean } {
  const { display, operator, previousValue, history } = state;
  const triggeredVault = false;

  if (!operator || previousValue === null) {
    return { ...state, triggeredVault };
  }

  const prev = parseDisplay(previousValue);
  const current = parseDisplay(display);

  let result: number;
  let exprLabel: string;

  if (operator === "%" && state.waitingForOperand) {
    // Standalone %: 100 % (no second number) → 100 / 100 = 1
    result = prev / 100;
    exprLabel = `${previousValue} %`;
  } else {
    result = calculate(prev, current, operator);
    exprLabel = `${previousValue} ${operator} ${display}`;
  }

  const resultStr = formatDisplay(result);
  const record: CalculationRecord = { expression: exprLabel, result: resultStr };
  const newHistory = [record, ...history].slice(0, 5);

  return {
    display: resultStr,
    // Keep the full expression visible above the result
    expression: `${exprLabel} =`,
    waitingForOperand: true,
    operator: null,
    previousValue: null,
    history: newHistory,
    secretBuffer: "",
    triggeredVault,
  };
}

/** AC — clear everything (keep history) */
export function clearAll(state: CalculatorState): CalculatorState {
  return { ...createInitialState(), history: state.history };
}

/** C — clear only current number, keep operator chain */
export function clearDisplay(state: CalculatorState): CalculatorState {
  return { ...state, display: "0", waitingForOperand: false };
}

/** Clear last entry */
export function clearEntry(state: CalculatorState): CalculatorState {
  if (state.display.length > 1) return { ...state, display: state.display.slice(0, -1) };
  return { ...state, display: "0" };
}

/** Backspace — delete last typed digit */
export function backspace(state: CalculatorState): CalculatorState {
  if (state.waitingForOperand) return state;
  if (state.display.length > 1) return { ...state, display: state.display.slice(0, -1) };
  return { ...state, display: "0" };
}
