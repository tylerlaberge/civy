import { useState } from "react";

// A minimal interactive island: proof the React runtime hydrates on the client.
// Real islands (feed filters, comment threads, auth forms) arrive in later epics.
export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button
      type="button"
      onClick={() => setCount((c) => c + 1)}
      className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
    >
      Clicked {count} {count === 1 ? "time" : "times"}
    </button>
  );
}
