import config from "@nitap/eslint-config";

const uiConfig = [
  ...config,
  // The UI package has no Next.js pages directory.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
];

export default uiConfig;
