import config from "@nitap/eslint-config/next-js";
import { layerRules } from "@nitap/eslint-config/boundaries";

const eslintConfig = [...config, ...layerRules];

export default eslintConfig;
