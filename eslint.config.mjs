import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    files: ["packages/*/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      complexity: ["error", { max: 5 }],
      "max-lines-per-function": ["error", { max: 50 }],
      "max-params": ["error", { max: 3 }],
      "max-depth": ["error", { max: 3 }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
