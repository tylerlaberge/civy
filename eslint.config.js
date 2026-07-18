// Single flat ESLint config for the whole workspace; projects inherit it.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/build/**", "**/.moon/cache/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Disables ESLint rules that would conflict with Prettier formatting.
  prettier,
);
