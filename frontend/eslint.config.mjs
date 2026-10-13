import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.cjs",
      "*.mjs",
      "vite.config.ts",
      "playwright.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-unreachable": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    // 생산 코드 네트워크 격리 규칙: src/api 내부를 제외한 src 전체에서 fetch, window.fetch, globalThis.fetch, XMLHttpRequest 직접 호출을 전면 차단합니다.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "src/api 외부에서는 fetch를 직접 호출할 수 없습니다. src/api 모듈을 사용하세요.",
        },
        {
          name: "XMLHttpRequest",
          message:
            "src/api 외부에서는 XMLHttpRequest를 직접 생성할 수 없습니다. src/api 모듈을 사용하세요.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "src/api 외부에서는 fetch()를 직접 호출할 수 없습니다. src/api 모듈을 사용하세요.",
        },
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name='fetch']",
          message:
            "src/api 외부에서는 window.fetch()를 직접 호출할 수 없습니다. src/api 모듈을 사용하세요.",
        },
        {
          selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
          message:
            "src/api 외부에서는 globalThis.fetch()를 직접 호출할 수 없습니다. src/api 모듈을 사용하세요.",
        },
        {
          selector: "NewExpression[callee.name='XMLHttpRequest']",
          message:
            "src/api 외부에서는 new XMLHttpRequest()를 직접 호출할 수 없습니다. src/api 모듈을 사용하세요.",
        },
      ],
    },
  },
);
