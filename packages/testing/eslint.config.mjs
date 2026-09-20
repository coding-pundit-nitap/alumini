import config from "@nitap/eslint-config";

const eslintConfig = [
  ...config,
  // Node libraries have no Next.js pages directory.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
];

export default eslintConfig;
