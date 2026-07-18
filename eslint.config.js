import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", ".cache/**", ".wrangler/**", "dist/**", "demo-dist/**", "worker-dist/**", "worker-configuration.d.ts", "artifacts/**", "playwright-report/**", "test-results/**", "public/assets/maplibre-gl-csp-worker-*.js"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly", Buffer: "readonly", fetch: "readonly", URL: "readonly", structuredClone: "readonly" } },
  },
);
