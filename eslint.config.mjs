/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "haven-aol/**", "dist/**"],
  },
];

export default eslintConfig;
