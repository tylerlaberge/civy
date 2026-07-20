import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Counter } from "./Counter.tsx";

afterEach(cleanup);

test("increments on click", () => {
  render(<Counter />);

  const button = screen.getByRole("button");
  expect(button).toHaveTextContent("Clicked 0 times");

  fireEvent.click(button);
  expect(button).toHaveTextContent("Clicked 1 time");

  fireEvent.click(button);
  expect(button).toHaveTextContent("Clicked 2 times");
});
