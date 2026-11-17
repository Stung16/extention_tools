// ESLint: tìm lỗi trong code JavaScript/React (biến chưa dùng, sai quy tắc hook...). Chạy: npm run lint
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Quy tắc phụ thuộc giữa các thư mục (giống tầng trong backend): thư mục trong không được dùng thư mục ngoài.
//   app -> pages -> features -> catalog, api, shared
const forbid = (...folders) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: folders.map((f) => ({
        group: [`@/${f}/*`, `@/${f}`],
        message: `Thư mục này không được dùng src/${f} (xem web/README.md, mục "Quy tắc phụ thuộc").`,
      })),
    },
  ],
});

export default [
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "18.3" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off", // dự án viết JavaScript, không khai báo kiểu props
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { files: ["src/shared/**"], rules: forbid("app", "pages", "features", "catalog", "api") },
  { files: ["src/api/**"], rules: forbid("app", "pages", "features", "catalog") },
  { files: ["src/catalog/**"], rules: forbid("app", "pages", "features") },
  { files: ["src/features/**"], rules: forbid("app", "pages") },
  { files: ["src/pages/**"], rules: forbid("app") },
  // File cấu hình, script và test chạy trong Node.
  { files: ["*.config.js", "scripts/**", "tests/**"], languageOptions: { globals: { ...globals.node } } },
];
